import { useState, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

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
      <mesh
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        <sphereGeometry args={[3.4, 64, 64]} />
        {/* The 2k_sun.jpg from Solar System Scope is ALREADY an H-alpha /
            chromosphere-style equirectangular projection (deep red-orange
            with granulation + prominence patterns). Render it as-is.

            `key={texture ? 'loaded' : 'loading'}` forces React to remount
            the material when the texture finishes loading — otherwise the
            shader was compiled without map support (texture was null at
            first render) and never re-compiles when map is set. That's
            why the sphere was rendering as a flat white dot. */}
        <meshBasicMaterial
          key={texture ? 'loaded' : 'loading'}
          map={texture}
          color={hovered ? '#fff0e0' : '#ffffff'}
        />
      </mesh>
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
