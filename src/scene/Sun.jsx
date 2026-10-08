import { useState, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';
import { DEG } from '../lib/orbital.js';
import { SUN_R, sunSpinRotations } from '../sun/sunFrame.js';
import { sunActivity, MAX_REGIONS, flareIntensity, flareRibbonProgress } from '../sun/activity.js';
import { SunCorona } from './sun/SunCorona.jsx';

// Sun: photosphere + corona + point light. The Sun is its own light source
// (planets get lit by the point light), so the photosphere is unlit.
//
// v2 (sun rebuild): the surface no longer invents its own flares. Sunspots,
// bright plage and flare ribbons are all drawn from the shared active-region
// model (src/sun/activity.js), the same regions that own the coronal loops
// and launch the CMEs.

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

const PHOTOSPHERE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PHOTOSPHERE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uRot;             // body-frame spin, fractional rotations
  uniform float uSimDays;         // sim time (days, wrapped) for surface shimmer
  uniform float uFlareBright;
  uniform vec3 uTint;
  // Active regions, body frame. Strength 0 = empty slot.
  uniform vec4 uRegC[${MAX_REGIONS}];   // centre xyz, half-separation of the spots (rad)
  uniform vec4 uRegA[${MAX_REGIONS}];   // axis following->leading spot xyz, strength
  uniform vec4 uRegF[${MAX_REGIONS}];   // flare intensity, ribbon separation 0..1, seed, -
  varying vec2 vUv;

  float hashP(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noiseP(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hashP(i), hashP(i + vec2(1.0, 0.0)), u.x),
               mix(hashP(i + vec2(0.0, 1.0)), hashP(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbmP(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noiseP(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    // Solid-body rotation: uniform U offset, so latitudes never shear/band.
    vec2 sampleUv = vec2(fract(vUv.x - uRot), vUv.y);
    vec4 col = texture2D(uMap, sampleUv);

    // Body-frame surface normal of this texel (matches sunFrame.latLonToBody).
    float lon = sampleUv.x * 6.28318530718;
    float th = 3.14159265359 * (1.0 - sampleUv.y);
    vec3 n = vec3(-cos(lon) * sin(th), cos(th), sin(lon) * sin(th));

    vec2 noiseUv = vec2(sampleUv.x * 8.0, sampleUv.y * 5.0) + vec2(uSimDays * 0.10, uSimDays * 0.03);
    vec3 surf = col.rgb * uTint * mix(0.94, 1.06, fbmP(noiseUv));

    float darken = 1.0;
    vec3 add = vec3(0.0);
    for (int i = 0; i < ${MAX_REGIONS}; i++) {
      vec4 C = uRegC[i];
      vec4 A = uRegA[i];
      float s = A.w;
      if (s <= 0.0) continue;
      float h = C.w;
      if (dot(n, C.xyz) < cos(h * 4.0)) continue;
      float sh = sin(h);
      vec3 P = cross(C.xyz, A.xyz);
      // Local coords in units of the spot half-separation: leading spot at
      // X=+1, following spot at X=-1, polarity inversion line at X=0.
      float X = dot(n, A.xyz) / sh;
      float Y = dot(n, P) / sh;
      vec4 F = uRegF[i];
      float nf = fbmP(vec2(X, Y) * 5.0 + F.z * 40.0);

      // Sunspots: compact round leader, larger fragmented follower.
      float rad = 0.20 + 0.28 * s;
      float dL = length(vec2(X - 1.0, Y)) / rad;
      float dF = length(vec2((X + 1.0) * 0.85, Y)) / (rad * 1.1) + (nf - 0.5) * 0.9;
      float pen = max(1.0 - smoothstep(0.80, 1.05, dL), 1.0 - smoothstep(0.80, 1.05, dF));
      float umb = max(1.0 - smoothstep(0.32, 0.48, dL), 1.0 - smoothstep(0.30, 0.46, dF));
      darken *= (1.0 - 0.45 * pen) * (1.0 - 0.55 * umb);

      // Plage: bright mottled field around the spots (strong in H-alpha).
      float pl = exp(-(X * X / 3.5 + Y * Y / 1.6)) * s * (0.4 + 0.9 * nf);
      add += vec3(1.0, 0.72, 0.42) * pl * 0.32 * (1.0 - pen);

      // Flare ribbons: two bright strands parallel to the inversion line that
      // separate as reconnection proceeds, plus a short-lived kernel glow.
      float fi = F.x;
      if (fi > 0.002) {
        float xr = 0.10 + 0.60 * F.y;
        float wr = 0.06 + 0.05 * F.y;
        float rib = exp(-pow((abs(X) - xr) / wr, 2.0)) * (1.0 - smoothstep(0.45, 1.05, abs(Y)));
        float kern = 0.45 + 1.1 * fbmP(vec2(X * 3.0, Y * 10.0) + F.z * 17.0);
        float glow = exp(-(X * X + Y * Y) / 0.8) * 0.35;
        add += vec3(1.0, 0.95, 0.84) * fi * (rib * kern + glow) * uFlareBright;
      }
    }
    gl_FragColor = vec4(surf * darken + add, col.a);
  }
`;

function Photosphere({ texture, hovered, eventHandlers }) {
  const matRef = useRef();

  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.needsUpdate = true;
    }
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uRot: { value: 0 },
      uSimDays: { value: 0 },
      uFlareBright: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uRegC: { value: Array.from({ length: MAX_REGIONS }, () => new THREE.Vector4()) },
      uRegA: { value: Array.from({ length: MAX_REGIONS }, () => new THREE.Vector4()) },
      uRegF: { value: Array.from({ length: MAX_REGIONS }, () => new THREE.Vector4()) },
    }),
    [] // create once; uMap re-bound below
  );

  useEffect(() => {
    uniforms.uMap.value = texture;
  }, [texture, uniforms]);

  useFrame(() => {
    if (!matRef.current) return;
    const st = useStore.getState();
    const rot = sunSpinRotations(st);
    uniforms.uRot.value = rot - Math.floor(rot);
    const t = sunActivity.t ?? 0;
    uniforms.uSimDays.value = t % 1000;
    uniforms.uFlareBright.value = st.config.flareBrightness ?? 1;
    uniforms.uTint.value.set(hovered ? '#fff0e0' : '#ffffff');
    const regs = sunActivity.regions();
    for (let i = 0; i < MAX_REGIONS; i++) {
      const r = regs[i];
      if (!r || r.s <= 0.01) { uniforms.uRegA.value[i].w = 0; continue; }
      uniforms.uRegC.value[i].set(r.c[0], r.c[1], r.c[2], r.halfSep);
      uniforms.uRegA.value[i].set(r.axis[0], r.axis[1], r.axis[2], r.s);
      uniforms.uRegF.value[i].set(flareIntensity(r.flare, t), flareRibbonProgress(r.flare, t), r.seed, 0);
    }
  });

  return (
    <mesh {...eventHandlers}>
      <sphereGeometry args={[SUN_R, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={PHOTOSPHERE_VERTEX}
        fragmentShader={PHOTOSPHERE_FRAGMENT}
      />
    </mesh>
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
      {/* Axial tilt (7.25° to ecliptic); the shader does the spin. */}
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
            <sphereGeometry args={[SUN_R, 32, 32]} />
            <meshBasicMaterial color="#ff5530" />
          </mesh>
        )}
      </group>
      <SunCorona />
      <pointLight
        position={[0, 0, 0]}
        intensity={naturalLight ? NATURAL_INTENSITY : ARTIFICIAL_INTENSITY}
        decay={naturalLight ? 2 : 0}
      />
    </group>
  );
}
