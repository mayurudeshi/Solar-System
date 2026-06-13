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
    float envelope = exp(-dist * CME_FALLOFF);

    // Subtle anisotropic strand — see CME_TRAIL_FRAGMENT rationale.
    vec2 strandUv = (uv - cmePos) * vec2(65.0, 20.0)
                  + vec2(uTime * 0.6, hash(vec2(cycleStart, 7.3)) * 17.0);
    float strand = fbm(strandUv);
    strand = smoothstep(0.40, 0.75, strand);

    return pulse * envelope * (0.55 + 0.55 * strand);
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
  // SOLID-BODY rotation period. The previous differential-rotation model
  // (equator 24.47d, poles 34.4d) sheared the static equirectangular
  // texture latitude-by-latitude; that shear accumulates UNBOUNDED over a
  // session and inevitably exceeds a full texture width between adjacent
  // latitudes, painting the surface as severe horizontal bands (MJ's
  // "wind effect", reproduced + confirmed 2026-06-13 via headless render
  // at 100x soak). Differential rotation on a STATIC texture always bands
  // eventually — it's mathematically unavoidable. Since the texture isn't
  // mapped to real solar features, differential rotation has zero
  // perceptible upside; uniform rotation eliminates inter-latitude shear
  // entirely, so the surface can NEVER band regardless of session length.
  #define ROT_PERIOD_DAYS 25.38   // Carrington sidereal mean

  // Light animated noise overlay — adds subtle surface life (shimmer).
  // No longer needs to "mask banding" since solid-body rotation can't band.
  float hashP(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noiseP(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hashP(i + vec2(0.0, 0.0)), hashP(i + vec2(1.0, 0.0)), u.x),
      mix(hashP(i + vec2(0.0, 1.0)), hashP(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbmP(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noiseP(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // SOLID-BODY rotation: SAME u-offset at every latitude. Because the
    // offset no longer varies with vUv.y, adjacent latitudes always stay
    // perfectly aligned — zero shear — so no banding can ever form.
    // Wrap with mod() into [0,1) period space to keep the float small and
    // precise even after very long sessions (mod is invisible here because
    // the offset is uniform across latitudes, so the wrap produces no
    // discontinuity between rows).
    float rotations = uTimeDays / ROT_PERIOD_DAYS;
    float uOffset = -fract(rotations);
    vec2 sampleUv = vec2(fract(vUv.x + uOffset), vUv.y);

    vec4 col = texture2D(uMap, sampleUv);

    // Subtle animated noise shimmer (8%) for a touch of surface life.
    vec2 noiseUv = vec2(vUv.x * 8.0, vUv.y * 5.0)
                 + vec2(uTimeDays * 0.10, uTimeDays * 0.03);
    float overlay = mix(0.94, 1.06, fbmP(noiseUv));

    gl_FragColor = vec4(col.rgb * uTint * overlay, col.a);
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
// ── Particle-based CMEs ──────────────────────────────────────────────────
// Replaces the old concentric "trail shell" approach (MJ 2026-06-13: the
// 3 stacked spheres read as "too perfect" concentric rings, not realistic).
// Real CMEs are streams of plasma erupting outward along magnetic field
// lines — genuinely volumetric, wispy, asymmetric. A particle system is the
// only honest way to render that; surface shaders on spheres can't.
//
// Design for realism (avoiding the v1.5 "white blob" failure):
//   - Eruptions fire periodically from a random surface point near the limb
//   - Each eruption EMITS OVER TIME (a stream), not all-at-once (a ball)
//   - Particles travel radially outward + small cone spread + speed variance
//     → forms an elongated tendril, not a sphere
//   - Small points, additive blend, hot-white→orange→transparent by age
//   - Curl-ish lateral drift so the stream isn't a straight line
const CME_MAX = 900;          // particle pool size
const CME_BURST_PERIOD = 9.0; // seconds between eruptions
const CME_EMIT_WINDOW = 2.2;  // seconds an eruption keeps emitting
const CME_LIFETIME = 4.0;     // shorter (was 6.5) so plasma fades before
                              // reaching planet orbits — MJ saw one reach Earth
const SUN_SURFACE_R = 3.4;

function SunCMEParticles() {
  const pointsRef = useRef();
  const sim = useRef(null);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(CME_MAX * 3);
    const ages = new Float32Array(CME_MAX);      // 0..1 normalized
    const seeds = new Float32Array(CME_MAX);     // per-particle random
    for (let i = 0; i < CME_MAX; i++) { ages[i] = 1.0; seeds[i] = Math.random(); }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aAge', new THREE.BufferAttribute(ages, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelScale: { value: 130 } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        attribute float aSeed;
        uniform float uPixelScale;
        varying float vAge;
        varying float vSeed;
        void main() {
          vAge = aAge;
          vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // Small particles. Grow gently as they age (plasma expands).
          float grow = 1.0 + 1.1 * aAge;
          float base = 1.6 + 2.6 * aSeed;
          gl_PointSize = base * grow * uPixelScale / max(0.001, -mv.z);
          if (aAge >= 1.0) gl_PointSize = 0.0; // dead → invisible
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAge;
        varying float vSeed;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float soft = smoothstep(0.5, 0.0, r);
          // Brightness peaks LATER in life (0.35) so the initial foot burst
          // is dim — MJ wanted the white-hot initial flash reduced further.
          // Particle brightens as it rises off the surface, then fades.
          float life = vAge < 0.35 ? vAge / 0.35 : 1.0 - (vAge - 0.35) / 0.65;
          life = clamp(life, 0.0, 1.0);
          float alpha = soft * life * 0.32;
          // NO white-hot kernel — MJ disliked the bright birth ("sun shitting
          // a piece"). Erupt directly in the warm faded orange he liked from
          // the trailing edge, and continue fading to deep red.
          vec3 birth = vec3(1.0, 0.50, 0.16);  // warm orange (the liked color)
          vec3 old   = vec3(0.80, 0.20, 0.07); // deep red
          vec3 col = mix(birth, old, vAge);
          gl_FragColor = vec4(col * alpha, alpha);
        }
      `,
    });
    return { geometry: g, material: m };
  }, []);

  // CPU sim state
  useEffect(() => {
    sim.current = {
      vel: new Float32Array(CME_MAX * 3),
      born: new Float32Array(CME_MAX),
      alive: new Uint8Array(CME_MAX),
      cursor: 0,
      t: 0,
      lastBurst: -999,
      burst: null, // {origin:Vec3, tangentA, tangentB, until}
    };
  }, []);

  const tmp = useRef(new THREE.Vector3());

  useFrame((_, dtRaw) => {
    const s = sim.current;
    if (!s || !pointsRef.current) return;
    const dt = Math.min(dtRaw, 0.05); // clamp huge frames
    s.t += dt;

    const pos = geometry.attributes.position.array;
    const age = geometry.attributes.aAge.array;

    // Start a new eruption?
    if (s.t - s.lastBurst >= CME_BURST_PERIOD) {
      s.lastBurst = s.t;
      // random surface direction
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(1 - u * u);
      const origin = new THREE.Vector3(rr * Math.cos(th), u, rr * Math.sin(th));
      // two tangents for lateral spread
      const up = Math.abs(origin.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tA = new THREE.Vector3().crossVectors(up, origin).normalize();
      const tB = new THREE.Vector3().crossVectors(origin, tA).normalize();
      s.burst = { origin, tA, tB, until: s.t + CME_EMIT_WINDOW };
    }

    // Emit particles while burst is active (stream, not ball)
    if (s.burst && s.t <= s.burst.until) {
      const emitN = 6; // per frame during emission window
      for (let k = 0; k < emitN; k++) {
        const i = s.cursor;
        s.cursor = (s.cursor + 1) % CME_MAX;
        const { origin, tA, tB } = s.burst;
        // spawn just above surface, tiny lateral jitter at the foot
        const jitter = 0.06;
        const fx = origin.x * SUN_SURFACE_R + (Math.random() - 0.5) * jitter * (tA.x + tB.x);
        const fy = origin.y * SUN_SURFACE_R + (Math.random() - 0.5) * jitter * (tA.y + tB.y);
        const fz = origin.z * SUN_SURFACE_R + (Math.random() - 0.5) * jitter * (tA.z + tB.z);
        pos[i * 3] = fx; pos[i * 3 + 1] = fy; pos[i * 3 + 2] = fz;
        // Two classes (MJ 2026-06-13): most particles are LOCAL EXPLOSIONS
        // that barely escape the surface (he likes these as constant surface
        // activity); ~30% are PLUMES that travel a tad further out. Same
        // lifetime, so distance is driven purely by speed:
        //   explosion: 0.14-0.30 × 4s ≈ 0.6-1.2 units (hugs surface)
        //   plume:     0.62-0.92 × 4s ≈ 2.5-3.7 units (escapes, stays < orbits)
        const isPlume = Math.random() > 0.68;
        const speed = isPlume
          ? 0.62 + Math.random() * 0.30
          : 0.14 + Math.random() * 0.16;
        const spread = 0.18;
        const a = (Math.random() - 0.5) * spread;
        const b = (Math.random() - 0.5) * spread;
        const vx = (origin.x + tA.x * a + tB.x * b) * speed;
        const vy = (origin.y + tA.y * a + tB.y * b) * speed;
        const vz = (origin.z + tA.z * a + tB.z * b) * speed;
        s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
        s.born[i] = s.t;
        s.alive[i] = 1;
        age[i] = 0.0001;
      }
    }

    // Integrate
    for (let i = 0; i < CME_MAX; i++) {
      if (!s.alive[i]) continue;
      const a = (s.t - s.born[i]) / CME_LIFETIME;
      if (a >= 1.0) { s.alive[i] = 0; age[i] = 1.0; continue; }
      pos[i * 3] += s.vel[i * 3] * dt;
      pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
      age[i] = a;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAge.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
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
      <SunCMEParticles />
      <SunCorona />
      <pointLight
        position={[0, 0, 0]}
        intensity={naturalLight ? NATURAL_INTENSITY : ARTIFICIAL_INTENSITY}
        decay={naturalLight ? 2 : 0}
      />
    </group>
  );
}
