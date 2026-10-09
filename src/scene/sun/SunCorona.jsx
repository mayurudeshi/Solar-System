import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../state/useStore.js';
import { SUN_R, SUN_POLE_WORLD, sunBodyMatrix, makeLightAdditive, LIGHT_OUT_GLSL } from '../../sun/sunFrame.js';
import { sunActivity, MAX_REGIONS } from '../../sun/activity.js';

// The corona as a camera-facing billboard, shaded per pixel by the ray's
// impact parameter rho (closest approach to the Sun's centre, in solar radii).
// This replaces the old stack of transparent spheres, whose fresnel edges drew
// a hard "glass bubble" with a dark gap at a fixed radius. The real corona has
// no edge.
//
// Radial brightness: Baumbach's empirical K-corona profile (Allen's
// Astrophysical Quantities)
//     I(rho) ~ 0.0532 rho^-2.5 + 1.425 rho^-7 + 2.565 rho^-17
// It falls ~1000x between 1 and 3 radii, so it is displayed through a
// power-law tone curve, the same trick eclipse photographers and coronagraph
// radial filters use to show the structure.
//
// Shape follows the solar cycle: helmet streamers rise over active regions
// (projected onto the sky, brightest when the region sits at the limb), a
// streamer belt hugs the equator near minimum, and the polar coronal holes
// darken the poles near minimum. A thin H-alpha chromosphere rim with
// spicule texture hugs the limb.

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */ `
  uniform float uR;            // solar radius, scene units
  uniform float uMaxRho;       // fade-out extent, solar radii
  uniform float uBright;
  uniform float uActivity;     // 0 minimum .. 1 maximum
  uniform vec3 uPole;          // world solar north
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec4 uReg[${MAX_REGIONS}];   // world dir xyz, strength
  varying vec3 vWorld;
  ${LIGHT_OUT_GLSL}

  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }

  float baumbach(float r) {
    return 0.0532 * pow(r, -2.5) + 1.425 * pow(r, -7.0) + 2.565 * pow(r, -17.0);
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float tc = -dot(cameraPosition, dir);
    vec3 pc = cameraPosition + dir * tc;          // closest approach to the centre
    float rho = length(pc) / uR;
    if (rho < 1.0 || tc < 0.0) discard;
    vec3 u = pc / length(pc);

    // K-corona, tone mapped. I(1) = 4.0432.
    float I = pow(baumbach(rho) / 4.0432, 0.30);

    // Streamers over active regions: narrow with height (helmet shape).
    float st = 0.0;
    float w = 0.015 + 0.05 / (rho * rho);
    for (int i = 0; i < ${MAX_REGIONS}; i++) {
      vec4 R = uReg[i];
      if (R.w <= 0.0) continue;
      st += R.w * exp(-(1.0 - dot(u, R.xyz)) / w);
    }
    float pz = dot(u, uPole);
    float belt = (1.0 - uActivity) * exp(-pz * pz / 0.06);
    float holes = 1.0 - 0.65 * (1.0 - uActivity) * smoothstep(0.70, 0.95, abs(pz));
    float psi = atan(dot(u, uCamUp), dot(u, uCamRight));
    float rays = 0.91 + 0.18 * n1(psi * 38.0) * (0.6 + 0.4 * n1(psi * 9.0 + 3.0));
    float shape = (0.55 + 1.1 * st + 0.9 * belt) * holes * rays;

    float fade = 1.0 - smoothstep(uMaxRho * 0.55, uMaxRho, rho);
    vec3 warm = vec3(1.0, 0.55, 0.25);
    vec3 pale = vec3(1.0, 0.86, 0.70);
    vec3 col = mix(warm, pale, clamp(st, 0.0, 1.0)) * I * shape * fade * 0.55;

    // Chromosphere: a thin H-alpha rim with spicule texture.
    float chrom = exp(-(rho - 1.0) / 0.012) * (0.6 + 0.6 * n1(psi * 420.0));
    col += vec3(1.0, 0.28, 0.12) * chrom * 0.9;

    gl_FragColor = lightOut(col * uBright);
  }
`;

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export function SunCorona() {
  const camera = useThree((s) => s.camera);
  const meshRef = useRef();
  const material = useMemo(
    () =>
      makeLightAdditive(new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uR: { value: SUN_R },
          uMaxRho: { value: 4.4 },
          uBright: { value: 1 },
          uActivity: { value: 0.5 },
          uPole: { value: SUN_POLE_WORLD.clone() },
          uCamRight: { value: new THREE.Vector3(1, 0, 0) },
          uCamUp: { value: new THREE.Vector3(0, 1, 0) },
          uReg: { value: Array.from({ length: MAX_REGIONS }, () => new THREE.Vector4()) },
        },
      })),
    []
  );

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const st = useStore.getState();
    const u = material.uniforms;
    // coronaScale (legacy knob, 12..60) was the old sprite's full width in
    // scene units; keep its meaning: extent = coronaScale / 2 scene units.
    const maxRho = Math.max(1.5, (st.config.coronaScale ?? 30) / 2 / SUN_R);
    u.uMaxRho.value = maxRho;
    u.uBright.value = st.config.coronaBrightness ?? 1;
    u.uActivity.value = Math.min(1, (sunActivity.cycle.ssn * (st.config.sunCycleScale ?? 1)) / 150);
    // Billboard through the Sun's centre, big enough to catch every ray that
    // passes within maxRho even when the camera is close.
    mesh.quaternion.copy(camera.quaternion);
    const dist = Math.max(camera.position.length(), SUN_R * 1.05);
    const reach = maxRho * SUN_R;
    const half = reach * dist / Math.sqrt(Math.max(dist * dist - reach * reach, 1e-3 * dist * dist));
    mesh.scale.setScalar(Math.min(half, reach * 6) * 1.05);
    u.uCamRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
    u.uCamUp.value.set(0, 1, 0).applyQuaternion(camera.quaternion);
    sunBodyMatrix(_m, st);
    const regs = sunActivity.regions();
    for (let i = 0; i < MAX_REGIONS; i++) {
      const r = regs[i];
      const R = u.uReg.value[i];
      if (!r || r.s <= 0.05) { R.w = 0; continue; }
      _v.set(r.c[0], r.c[1], r.c[2]).applyMatrix4(_m).normalize();
      R.set(_v.x, _v.y, _v.z, r.s);
    }
  });

  return (
    <mesh ref={meshRef} material={material} renderOrder={5} frustumCulled={false} raycast={() => null}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
