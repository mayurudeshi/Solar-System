// v1.8.1 Saturn — a custom-shader surface that casts the rings' shadow onto
// the planet (the iconic dark band across the disc). Pure analytic shadow,
// no shadow maps: for each lit surface fragment we trace a ray toward the
// Sun, find where it crosses the ring plane, and if that crossing falls
// within the ring annulus we darken the fragment by the ring's opacity at
// that radius (so the Cassini Division lets light through — a bright gap in
// the shadow band, just like the real thing).
//
// All math is in world space. The Sun is a point at the world origin, so the
// sun direction at a fragment is normalize(-worldPos). The ring plane is the
// planet's equatorial plane: it passes through the planet centre with normal
// = the spin axis. We read both from the mesh's own world matrix each frame
// (centre = world position; axis = the matrix's Y basis — stable under spin
// since the planet rotates ABOUT that axis).
//
// Uniforms driven via the material ref (R3F clones the `uniforms` prop).
import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

function useTex(url, { srgb }) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!url) { setTex(null); return; }
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

const SAT_VERT = /* glsl */ `
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

const SAT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform sampler2D uRing;   // ring strip — radial opacity (alpha), Cassini gap
  uniform float uHasRing;
  uniform vec3  uCenter;     // planet centre (world)
  uniform vec3  uAxis;       // ring-plane normal = spin axis (world, normalized)
  uniform float uInner;      // ring inner radius (world units)
  uniform float uOuter;      // ring outer radius (world units)
  uniform float uRingShadow; // shadow darkness (⚙ Settings)
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(-vWorldPos);          // toward Sun (at origin)
    float lambert = max(dot(N, L), 0.0);
    vec3 base = texture2D(uMap, vUv).rgb;

    float shadow = 0.0;
    if (uHasRing > 0.5 && lambert > 0.0) {
      float denom = dot(L, uAxis);
      // Skip when the Sun is nearly in the ring plane (grazing → no cast).
      if (abs(denom) > 0.02) {
        float t = dot(uCenter - vWorldPos, uAxis) / denom;
        if (t > 0.0) {                       // ring plane is toward the Sun
          vec3 hit = vWorldPos + t * L;
          float r = length(hit - uCenter);
          if (r >= uInner && r <= uOuter) {
            float f = (r - uInner) / (uOuter - uInner);   // 0=inner .. 1=outer
            // Ring strip stores radial opacity; sample its alpha (fallback to
            // luminance if the texture has no alpha channel).
            vec4 rs = texture2D(uRing, vec2(f, 0.5));
            float opacity = rs.a < 0.999 ? rs.a : max(max(rs.r, rs.g), rs.b);
            shadow = clamp(opacity, 0.0, 1.0) * uRingShadow;
          }
        }
      }
    }

    vec3 color = base * (0.06 + 0.94 * lambert) * (1.0 - shadow);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function SaturnSurface({ radius, spinRef, mapUrl, ringUrl }) {
  const matRef = useRef();
  const meshRef = useRef();
  const map = useTex(mapUrl, { srgb: true });
  const ring = useTex(ringUrl, { srgb: true });

  const uniforms = useMemo(() => ({
    uMap: { value: null },
    uRing: { value: null },
    uHasRing: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uAxis: { value: new THREE.Vector3(0, 1, 0) },
    uInner: { value: radius * 1.25 },
    uOuter: { value: radius * 2.30 },
    uRingShadow: { value: 0.8 },
  }), [radius]);

  // Let the shared Planet spin useFrame drive rotation: expose the mesh via
  // BOTH our local ref (for the world-matrix read) and the passed spinRef.
  const attach = (m) => {
    meshRef.current = m;
    if (typeof spinRef === 'function') spinRef(m);
    else if (spinRef) spinRef.current = m;
  };

  useFrame(() => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    if (map && mat.uniforms.uMap.value !== map) mat.uniforms.uMap.value = map;
    if (ring && mat.uniforms.uRing.value !== ring) { mat.uniforms.uRing.value = ring; mat.uniforms.uHasRing.value = 1; }
    // Planet centre (world) + spin axis (world Y basis of the matrix). The
    // matrix must be current — it is, since useFrame runs after the shared
    // position/rotation update for the frame.
    mesh.updateWorldMatrix(true, false);
    const e = mesh.matrixWorld.elements;
    mat.uniforms.uCenter.value.set(e[12], e[13], e[14]);
    mat.uniforms.uAxis.value.set(e[4], e[5], e[6]).normalize();
    mat.uniforms.uRingShadow.value = useStore.getState().config.ringShadow;
  });

  if (!map) return null;
  return (
    <mesh ref={attach}>
      <sphereGeometry args={[radius, 64, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SAT_VERT}
        fragmentShader={SAT_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  );
}
