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

  #define CME_PERIOD     12.0   // seconds between CMEs on a single track
  #define CME_PEAK_T      1.6   // ramp-up duration to peak brightness
  #define CME_FADE_T      6.0   // fade duration after peak
  #define CME_FALLOFF    11.0   // larger = tighter blob; 11 gives each burst
                                // ~15% of the sphere — visible as a specific
                                // eruption, not a wraparound glow

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

  // CME contribution: a pseudo-random burst point ramps up over CME_PEAK_T
  // and fades over CME_FADE_T. Position is deterministic from the cycle
  // start time so the same cycle always paints the same spot — keeps GPU
  // and JS in sync without uniforms.
  float cmePulse(vec2 uv, float cycleStart) {
    float t = uTime - cycleStart;
    if (t < 0.0 || t > CME_PEAK_T + CME_FADE_T) return 0.0;

    // Pseudo-random burst location, latitude biased toward equator
    // (most real CMEs originate from active regions in low/mid latitudes).
    vec2 cmePos = vec2(
      hash(vec2(cycleStart, 1.7)),
      0.30 + 0.40 * hash(vec2(cycleStart, 5.3))
    );

    // Pulse: sharp attack, slower decay
    float pulse = t < CME_PEAK_T
      ? t / CME_PEAK_T
      : 1.0 - (t - CME_PEAK_T) / CME_FADE_T;
    pulse = pow(max(0.0, pulse), 1.4);

    // Spatial falloff. Wrap U-distance so a burst near the seam doesn't
    // hard-cut on one side. V doesn't wrap (poles).
    vec2 d = uv - cmePos;
    d.x = d.x - floor(d.x + 0.5);
    float dist = length(d);
    return pulse * exp(-dist * CME_FALLOFF);
  }

  void main() {
    // View direction in view space (camera at origin, looking down -Z)
    vec3 viewDir = normalize(-vPosView);
    float grazing = 1.0 - abs(dot(vNormalView, viewDir));
    // Strong Fresnel for the wisps — they hug the limb tightly.
    float fresnelWisp = pow(grazing, 3.0);
    // SOFTER Fresnel for CMEs — they bloom across more of the visible
    // hemisphere, not just the razor-thin limb edge. Without this, a
    // burst's UV center almost always lands somewhere Fresnel kills.
    float fresnelCme  = pow(grazing, 1.4);

    // Two octaves of drifting fbm — filaments writhe and crawl around the
    // limb over a few seconds.
    float n  = fbm(vUv * vec2(28.0, 14.0) + vec2(uTime * 0.18,  0.0));
    float n2 = fbm(vUv * vec2(60.0, 30.0) + vec2(0.0, uTime * 0.32));
    float wisp = smoothstep(0.42, 0.85, n * 0.6 + n2 * 0.4);

    float wispAlpha = fresnelWisp * wisp * 0.95;
    vec3  wispCol   = mix(vec3(1.0, 0.30, 0.10), vec3(1.0, 0.55, 0.20), wisp);

    // Two CME tracks staggered by half-period. Each track fires for ~7.6s
    // out of every 12s, so usually 1 active, sometimes 2 briefly overlap,
    // sometimes brief quiet between. Reads as discrete eruptions instead
    // of a continuous halo (which 3 tracks + wider falloff was producing).
    float cycleA = floor(uTime / CME_PERIOD) * CME_PERIOD;
    float cycleB = floor((uTime + CME_PERIOD * 0.5) / CME_PERIOD) * CME_PERIOD
                   - CME_PERIOD * 0.5;
    float cme = cmePulse(vUv, cycleA) + cmePulse(vUv, cycleB);
    cme = min(cme, 1.2);

    // ×1.6 on the INNER sphere — the burst foot. The brighter outer
    // shells (SunCMETrails) carry most of the visual now, so the inner
    // contribution can stay subtle: a small bright base where the
    // eruption foots onto the chromosphere, while the trails do the
    // outward extension.
    float cmeAlpha = fresnelCme * cme * 1.6;
    vec3  cmeCol   = vec3(1.00, 0.96, 0.78);  // near-white, hotter than wisps

    // Pre-multiply for additive blending — each layer contributes
    // color * alpha to the framebuffer independently.
    vec3 outColor = wispCol * wispAlpha + cmeCol * cmeAlpha;
    gl_FragColor  = vec4(outColor, 1.0);
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

// CME trail shells — concentric transparent spheres OUTSIDE the prominence
// sphere that render ONLY the CME pulse term. Each shell's Fresnel ring
// paints the burst at its own radius, so a CME that fires at UV (u,v)
// shows bright at the limb of every shell at the same azimuth. From the
// camera's view, these stack as a radial bright streak extending outward
// from the photosphere — the actual "lift-off" arc you see in LASCO
// coronagraph footage. Without these, the burst only blooms INWARD
// because the fresnel falloff bleeds into the prominence-sphere body
// (which is what MJ spotted 2026-06-12).
const CME_TRAIL_FRAGMENT = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPosView;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uBrightness;

  #define CME_PERIOD     12.0
  #define CME_PEAK_T      1.6
  #define CME_FADE_T      6.0
  // Sharp falloff — at dist 0.10 the contribution is ~5%, at 0.20 it's
  // ~0.2%, at 0.30 it's vanishing. Was 11.0, which left enough at the
  // antipodal limb that fresnel painted the whole silhouette as faint
  // continuous rings instead of a localized burst.
  #define CME_FALLOFF    30.0

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float cmePulse(vec2 uv, float cycleStart) {
    float t = uTime - cycleStart;
    if (t < 0.0 || t > CME_PEAK_T + CME_FADE_T) return 0.0;
    vec2 cmePos = vec2(
      hash(vec2(cycleStart, 1.7)),
      0.30 + 0.40 * hash(vec2(cycleStart, 5.3))
    );
    float pulse = t < CME_PEAK_T
      ? t / CME_PEAK_T
      : 1.0 - (t - CME_PEAK_T) / CME_FADE_T;
    pulse = pow(max(0.0, pulse), 1.4);
    vec2 d = uv - cmePos;
    d.x = d.x - floor(d.x + 0.5);
    float dist = length(d);
    return pulse * exp(-dist * CME_FALLOFF);
  }

  void main() {
    vec3 viewDir = normalize(-vPosView);
    float grazing = 1.0 - abs(dot(vNormalView, viewDir));
    // Slightly tighter fresnel (^1.7) than the inner sphere so the trail
    // hugs the limb-azimuth instead of smearing across the visible face.
    float fresnel = pow(grazing, 1.7);

    float cycleA = floor(uTime / CME_PERIOD) * CME_PERIOD;
    float cycleB = floor((uTime + CME_PERIOD * 0.5) / CME_PERIOD) * CME_PERIOD
                   - CME_PERIOD * 0.5;
    float cme = cmePulse(vUv, cycleA) + cmePulse(vUv, cycleB);
    cme = min(cme, 1.2);

    float alpha = fresnel * cme * uBrightness;
    // Discard near-zero contributions so the trail shells contribute
    // EXACTLY nothing when no burst is locally active — guarantees the
    // shells are invisible between firings instead of leaking faint rings.
    if (alpha < 0.01) discard;
    vec3 col = vec3(0.98, 0.94, 0.82);
    gl_FragColor = vec4(col * alpha, 1.0);
  }
`;

function CMETrailShell({ radius, brightness }) {
  const materialRef = useRef();
  // Each shell holds its own uTime, but they're all initialised at 0 and
  // advance by the same dt every frame, so they stay phase-locked with
  // each other AND with the inner prominence sphere — guarantees every
  // shell paints the SAME CME at the SAME moment, which is what makes the
  // stacked-limbs read as a single radial streak.
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uBrightness: { value: brightness } }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    uniforms.uBrightness.value = brightness;
  }, [brightness, uniforms]);

  useFrame((_, dt) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += dt;
    }
  });

  return (
    <mesh>
      <sphereGeometry args={[radius, 80, 80]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={PROMINENCE_VERTEX}
        fragmentShader={CME_TRAIL_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function SunCMETrails() {
  // Three shells at increasing radii, decreasing brightness — the burst
  // appears strongest right above the photosphere and fades into space.
  // Real CMEs follow a similar density profile: dense at the foot, thin
  // at the leading edge as plasma expands.
  return (
    <>
      <CMETrailShell radius={4.4} brightness={1.8} />
      <CMETrailShell radius={5.2} brightness={1.1} />
      <CMETrailShell radius={6.4} brightness={0.55} />
    </>
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
      {/* Larger than the photosphere (3.4) so the prominences AND the
          CME bursts have room to read as "outside" the surface. Fresnel
          term clips the central area; the limb is where everything fires.
          Bumped 3.65 → 3.9 to give CMEs a bit more radial breathing room. */}
      <sphereGeometry args={[3.9, 80, 80]} />
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
      <SunCMETrails />
      <SunCorona />
      <pointLight
        position={[0, 0, 0]}
        intensity={naturalLight ? NATURAL_INTENSITY : ARTIFICIAL_INTENSITY}
        decay={naturalLight ? 2 : 0}
      />
    </group>
  );
}
