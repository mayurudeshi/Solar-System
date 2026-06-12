import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Wisp-only limb prominences. NO CMEs here — those are now particles
// (see ParticleCMEs.jsx). This is just the gently writhing chromosphere
// glow that hugs the sphere edge, painted via Fresnel-on-sphere.
//
// Why we still need this even with procedural photosphere: the photosphere
// is opaque and Fresnel-shaded; without the wisps, the limb is a sharp
// disc edge. The wisps soften it with shimmering plasma filaments at the
// grazing angle, which is what actual H-alpha solar imagery looks like.

const WISP_VERT = /* glsl */ `
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

const WISP_FRAG = /* glsl */ `
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
      mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
      u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float amp = 0.5;
    for (int i = 0; i < 4; i++) { v += amp * noise(p); p *= 2.0; amp *= 0.5; }
    return v;
  }

  void main() {
    vec3 viewDir = normalize(-vPosView);
    float grazing = 1.0 - abs(dot(vNormalView, viewDir));
    float fresnel = pow(grazing, 3.0);

    float n  = fbm(vUv * vec2(28.0, 14.0) + vec2(uTime * 0.18,  0.0));
    float n2 = fbm(vUv * vec2(60.0, 30.0) + vec2(0.0, uTime * 0.32));
    float wisp = smoothstep(0.42, 0.85, n * 0.6 + n2 * 0.4);

    float alpha = fresnel * wisp * 0.95;
    vec3 color = mix(vec3(1.0, 0.30, 0.10), vec3(1.0, 0.55, 0.20), wisp);
    gl_FragColor = vec4(color * alpha, 1.0);
  }
`;

export function WispLimb({ radius = 3.9 }) {
  const matRef = useRef();
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += dt;
  });

  return (
    <mesh>
      <sphereGeometry args={[radius, 80, 80]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={WISP_VERT}
        fragmentShader={WISP_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
