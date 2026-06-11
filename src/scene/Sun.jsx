import { useState, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';
import { DEG } from '../lib/orbital.js';

// Sun: textured sphere + corona glow + point light. The Sun is its own
// light source (planets get lit by the point light), so we use
// meshBasicMaterial — unlit — for the sphere itself.

function useSunTexture() {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/textures/2k_sun.jpg', (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 4;
      setTex(loaded);
    });
  }, []);
  return tex;
}

// Radial-gradient canvas used as a sprite texture. Bright at the center,
// fades to transparent at the edge. Additive blending paints light onto
// the dark scene background — gives the Sun a proper corona instead of
// the previous "pale yellow dot" effect.
function makeGlowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Animated wispy filaments at the limb — real solar prominences are
// plasma loops following magnetic field lines, glowing red-orange at
// the chromospheric Hα wavelength. We approximate them as a slightly
// larger transparent sphere whose alpha is driven by a Fresnel term
// (grazing-angle visibility only) times an animated noise field, then
// additive-blended over the photosphere.
const PROMINENCE_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPosView;
  varying vec2 vUv;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vec4 pv = modelViewMatrix * vec4(position, 1.0);
    vPosView = pv.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * pv;
  }
`;

const PROMINENCE_FRAGMENT = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPosView;
  varying vec2 vUv;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // View direction in view space (camera at origin, looking down -Z)
    vec3 viewDir = normalize(-vPosView);
    // Fresnel: ~1 at grazing angle, ~0 head-on
    float fresnel = 1.0 - abs(dot(vNormalView, viewDir));
    fresnel = pow(fresnel, 3.0);

    // Two octaves of slowly-drifting fbm — filaments writhe over time.
    // u scrolled slowly with time; v gets independent shimmer.
    float n = fbm(vUv * vec2(28.0, 14.0) + vec2(uTime * 0.015, 0.0));
    float n2 = fbm(vUv * vec2(60.0, 30.0) + vec2(0.0, uTime * 0.025));
    float wisp = smoothstep(0.42, 0.85, n * 0.6 + n2 * 0.4);

    float alpha = fresnel * wisp * 0.95;
    // Warm chromospheric red-orange. Brighter in the densest filaments.
    vec3 color = mix(vec3(1.0, 0.30, 0.10), vec3(1.0, 0.55, 0.20), wisp);
    gl_FragColor = vec4(color, alpha);
  }
`;

// ── Differential rotation shader ─────────────────────────────────────────
// Real Sun rotates faster at the equator (~24.5 days) than at the poles
// (~35 days) because it's a plasma, not a solid. We render the photosphere
// with a custom shader that samples the texture with a U-offset that
// depends on LATITUDE — so equatorial features visibly outpace polar
// features as time advances. Period at latitude φ interpolates between
// the equatorial and polar rates by sin²(φ), which is the standard
// approximation of the Snodgrass-Ulrich profile to first order.
const PHOTOSPHERE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PHOTOSPHERE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTimeDays;
  uniform vec3 uTint;
  varying vec2 vUv;

  #define PI 3.14159265358979
  #define EQ_PERIOD_DAYS 24.47
  #define POLE_PERIOD_DAYS 34.4

  void main() {
    // UV.v: 0 at south pole, 0.5 at equator, 1 at north pole.
    float lat = (vUv.y - 0.5) * PI;
    float sinLat2 = sin(lat) * sin(lat);

    // Period at this latitude (linear interp in sin²(lat))
    float periodDays = mix(EQ_PERIOD_DAYS, POLE_PERIOD_DAYS, sinLat2);

    // Fractional rotations completed since reference. U is east-west;
    // negative offset makes features drift to +U (eastward) over time.
    float uOffset = -uTimeDays / periodDays;
    vec2 sampleUv = vec2(fract(vUv.x + uOffset), vUv.y);

    vec4 col = texture2D(uMap, sampleUv);
    gl_FragColor = vec4(col.rgb * uTint, col.a);
  }
`;

function Photosphere({ texture, hovered, eventHandlers }) {
  const matRef = useRef();
  // Snapshot time at first render so we subtract a stable base — keeps
  // the float32 uniform value small even after the simulation has been
  // running for a while. Without this, spinEpochMs ≈ 1.7e12 quickly
  // loses precision in the shader and rotation goes choppy.
  const refMs = useMemo(() => Date.now(), []);

  // Equirectangular textures need to wrap horizontally so the fract()
  // U-offset doesn't reveal a seam.
  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.needsUpdate = true;
    }
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uTimeDays: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    }),
    [] // create once; we re-bind uMap below if texture changes
  );

  useEffect(() => {
    uniforms.uMap.value = texture;
  }, [texture, uniforms]);

  useFrame(() => {
    if (!matRef.current) return;
    const { spinEpochMs, showRotation, slowRotation } = useStore.getState();
    let deltaMs = showRotation ? spinEpochMs - refMs : 0;
    if (slowRotation) deltaMs *= 0.1;
    matRef.current.uniforms.uTimeDays.value = deltaMs / 86400000;
    matRef.current.uniforms.uTint.value.set(hovered ? '#fff0e0' : '#ffffff');
  });

  return (
    <mesh {...eventHandlers}>
      <sphereGeometry args={[3.4, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={PHOTOSPHERE_VERTEX}
        fragmentShader={PHOTOSPHERE_FRAGMENT}
      />
    </mesh>
  );
}

function SunProminences() {
  const materialRef = useRef();
  // Stable uniforms object — re-creating per frame would lose GPU state.
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, dt) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += dt;
    }
  });

  return (
    <mesh>
      {/* Slightly larger than the photosphere (3.4) so the prominences
          ring it without z-fighting; the fresnel term clips out the
          central area automatically. */}
      <sphereGeometry args={[3.65, 80, 80]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={PROMINENCE_VERTEX}
        fragmentShader={PROMINENCE_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function SunCorona() {
  // SINGLE smooth-ramp sprite — replaces the previous two-layer stack
  // that created visible "Saturn-ring" bands and a dark gap in between.
  // No alpha jumps; every adjacent gradient stop is within ~0.1 alpha of
  // its neighbor. Sprite is sized so the sphere edge (radius 3.4) sits
  // at fraction ~0.227 of the sprite half-width (scale 30 → 15 unit
  // radius), and the bright ramp peaks just outside that.
  // H-alpha palette — red-orange dominated to match the chromosphere look
  // (656 nm hydrogen emission). Peak alpha just past the sphere limb, smooth
  // taper to zero.
  const glowTex = useMemo(
    () =>
      makeGlowTexture([
        [0.00, 'rgba(255, 200, 150, 0.00)'],
        [0.15, 'rgba(255, 180, 120, 0.03)'],
        [0.20, 'rgba(255, 130,  70, 0.12)'],
        [0.25, 'rgba(255,  90,  40, 0.32)'], // peak red-orange just past limb
        [0.32, 'rgba(255,  70,  30, 0.22)'],
        [0.45, 'rgba(220,  50,  20, 0.10)'],
        [0.65, 'rgba(180,  40,  15, 0.04)'],
        [1.00, 'rgba(150,  30,  10, 0.00)'],
      ]),
    []
  );

  return (
    <sprite scale={[30, 30, 1]}>
      <spriteMaterial
        map={glowTex}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
}

// Light tuning for the two modes:
//   artificial (decay=0): intensity is a uniform multiplier — every body
//     receives the same illumination. Easy on the eyes; outer planets visible.
//   natural (decay=2): physical inverse-square falloff. We boost intensity
//     to compensate so Earth at ~26 scene-units looks comparable to before.
//     Result: Mercury overlit, Jupiter dim, Pluto a faint twilight — same
//     qualitative pattern as the real solar system (compressed by our log
//     AU scale, not literally 1/r² of true AU).
const ARTIFICIAL_INTENSITY = 2.8;
const NATURAL_INTENSITY = 2000; // ≈ ARTIFICIAL × Earth_r² (26²) so Earth matches

export function Sun() {
  const setSelected = useStore((s) => s.setSelected);
  const naturalLight = useStore((s) => s.naturalLight);
  const [hovered, setHovered] = useState(false);
  const texture = useSunTexture();

  const onClick = (e) => {
    e.stopPropagation();
    setSelected('Sun');
  };
  const onPointerOver = (e) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };
  const onPointerOut = () => {
    setHovered(false);
    document.body.style.cursor = '';
  };

  return (
    <group>
      {/* Axial tilt (7.25° to ecliptic) nested as its own group so the
          differential rotation happens around the Sun's tilted local Y axis.
          The shader inside Photosphere handles the actual rotation —
          there's no mesh.rotation.y to set, because each latitude rotates
          at a different rate. */}
      <group rotation={[0, 0, BODIES.Sun.axial * DEG]}>
        {texture ? (
          <Photosphere
            texture={texture}
            hovered={hovered}
            eventHandlers={{ onClick, onPointerOver, onPointerOut }}
          />
        ) : (
          /* Fallback while the H-alpha texture loads. Flat orange disc with
             the same click handlers so the Sun is selectable immediately. */
          <mesh
            onClick={onClick}
            onPointerOver={onPointerOver}
            onPointerOut={onPointerOut}
          >
            <sphereGeometry args={[3.4, 32, 32]} />
            <meshBasicMaterial color="#ff5530" />
          </mesh>
        )}
      </group>
      <SunProminences />
      <SunCorona />
      <pointLight
        position={[0, 0, 0]}
        intensity={naturalLight ? NATURAL_INTENSITY : ARTIFICIAL_INTENSITY}
        decay={naturalLight ? 2 : 0}
      />
    </group>
  );
}
