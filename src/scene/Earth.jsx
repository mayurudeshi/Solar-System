// v1.8 Earth — a custom-shader surface that does what meshStandardMaterial
// can't: a real day/night terminator with city lights glowing on the dark
// side, ocean specular sun-glint, surface normal relief, and a separate
// Fresnel atmosphere shell for the blue rim.
//
// Lighting model: the Sun is a point at the world origin, so at any surface
// fragment the sun direction is normalize(-worldPos). dot(N, sunDir) gives
// the day/night factor; we cross-blend the day map (lit) into the night
// lights map (emissive cities) across a soft terminator band.
//
// Uniforms are driven via the material ref (R3F clones the `uniforms` prop,
// per the MilkyWaySkybox lesson) — we set texture + time uniforms in useFrame
// off matRef.current, never via JSX props.
import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { spinAtEpoch } from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Load a texture with an explicit colorspace. Color/night maps are sRGB;
// normal/specular are linear data and must NOT be gamma-decoded.
function useTex(url, { srgb }) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(url, (t) => {
      if (cancelled) { t.dispose(); return; }
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      setTex(t);
    }, undefined, () => {});
    return () => { cancelled = true; setTex((t) => { if (t) t.dispose(); return null; }); };
  }, [url, srgb]);
  return tex;
}

const EARTH_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uNormal;
  uniform sampler2D uSpecular;
  uniform vec3  uSunPos;      // world-space sun position (origin)
  uniform vec3  uCamPos;
  uniform float uHasNormal;
  uniform float uHasSpec;
  uniform float uNightBoost;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  // Perturb the world normal by the tangent-space normal map using
  // screen-space derivatives to build the cotangent frame (no precomputed
  // tangents needed). Standard Mikkelsen-style perturbNormal.
  vec3 perturbNormal(vec3 N, vec3 V, vec2 uv) {
    vec3 mapN = texture2D(uNormal, uv).xyz * 2.0 - 1.0;
    mapN.xy *= 0.85; // soften relief at planet scale
    vec3 dp1 = dFdx(-V); vec3 dp2 = dFdy(-V);
    vec2 duv1 = dFdx(uv); vec2 duv2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
    mat3 TBN = mat3(T * invmax, B * invmax, N);
    return normalize(TBN * mapN);
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 L = normalize(uSunPos - vWorldPos);

    vec3 Nlit = (uHasNormal > 0.5) ? perturbNormal(N, V, vUv) : N;

    float diff = dot(Nlit, L);
    // Soft terminator: 0 = full night, 1 = full day, blended across the band.
    float dayAmt = smoothstep(-0.12, 0.18, dot(N, L)); // geometric (smooth) terminator
    float lambert = max(diff, 0.0);

    vec3 dayCol   = texture2D(uDay, vUv).rgb;
    vec3 nightCol = texture2D(uNight, vUv).rgb;

    // Day side: ambient fill + diffuse. Night side: emissive city lights,
    // only where it's actually dark, boosted so they read against black.
    vec3 dayShaded = dayCol * (0.06 + 0.94 * lambert);
    float nightMask = 1.0 - dayAmt;
    vec3 lights = nightCol * uNightBoost * nightMask;

    // Ocean specular glint — only on water (spec map), only day side.
    float spec = 0.0;
    if (uHasSpec > 0.5) {
      float ocean = texture2D(uSpecular, vUv).r;
      vec3 H = normalize(L + V);
      spec = pow(max(dot(Nlit, H), 0.0), 60.0) * ocean * dayAmt;
    }
    vec3 specCol = vec3(1.0, 0.95, 0.82) * spec * 0.9;

    vec3 color = mix(lights, dayShaded, dayAmt) + specCol;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function EarthSurface({ radius, spinRef }) {
  const matRef = useRef();
  const day  = useTex('/textures/2k_earth_daymap.jpg',   { srgb: true });
  const night = useTex('/textures/2k_earth_nightmap.jpg', { srgb: true });
  const normal = useTex('/textures/2k_earth_normal.jpg',  { srgb: false });
  const spec = useTex('/textures/2k_earth_specular.jpg',  { srgb: false });

  const uniforms = useMemo(() => ({
    uDay: { value: null },
    uNight: { value: null },
    uNormal: { value: null },
    uSpecular: { value: null },
    uSunPos: { value: new THREE.Vector3(0, 0, 0) },
    uCamPos: { value: new THREE.Vector3() },
    uHasNormal: { value: 0 },
    uHasSpec: { value: 0 },
    uNightBoost: { value: 1.35 },
  }), []);

  useFrame((state) => {
    const mat = matRef.current;
    if (!mat) return;
    if (day && mat.uniforms.uDay.value !== day) mat.uniforms.uDay.value = day;
    if (night && mat.uniforms.uNight.value !== night) mat.uniforms.uNight.value = night;
    if (normal && mat.uniforms.uNormal.value !== normal) { mat.uniforms.uNormal.value = normal; mat.uniforms.uHasNormal.value = 1; }
    if (spec && mat.uniforms.uSpecular.value !== spec) { mat.uniforms.uSpecular.value = spec; mat.uniforms.uHasSpec.value = 1; }
    mat.uniforms.uCamPos.value.copy(state.camera.position);
    // Sun sits at the world origin in this scene.
    mat.uniforms.uSunPos.value.set(0, 0, 0);
  });

  // Earth surface is the spinning mesh (carries the planet's rotation ref).
  if (!day) return null; // hold until at least the day map is in
  return (
    <mesh ref={spinRef}>
      <sphereGeometry args={[radius, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={EARTH_VERT}
        fragmentShader={EARTH_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  );
}

// Atmospheric rim — a slightly larger back-side shell whose Fresnel term
// lights up the limb in sky-blue, brightest where it faces the Sun, fading
// on the night side. Additive so it reads as scattered light, not a solid
// shell. Pairs with bloom for the soft glow.
const ATMO_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uCamPos;
  uniform vec3 uColor;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 L = normalize(-vWorldPos); // toward sun at origin
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);   // limb glow
    float sun = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0); // brighter sun-side
    float a = fres * (0.25 + 0.75 * sun);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function EarthAtmosphere({ radius }) {
  const matRef = useRef();
  const uniforms = useMemo(() => ({
    uCamPos: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color('#5fa8ff') },
  }), []);
  useFrame((state) => {
    if (matRef.current) matRef.current.uniforms.uCamPos.value.copy(state.camera.position);
  });
  return (
    <mesh>
      <sphereGeometry args={[radius * 1.025, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={ATMO_VERT}
        fragmentShader={ATMO_FRAG}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
