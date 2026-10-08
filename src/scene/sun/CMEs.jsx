import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../state/useStore.js';
import { SCENE_OF_R_GLSL, AU_KM, R_SUN_KM, makeLightAdditive } from '../../sun/sunFrame.js';
import { sunActivity, MAX_CMES, cmeFrontR } from '../../sun/activity.js';

// Coronal mass ejections, rendered on the GPU from the shared activity model.
//
// Shape: the classic three-part CME seen in white-light coronagraphs.
//   - a bright leading front (a rounded shell of compressed plasma)
//   - a dark cavity behind it (the flux rope's low-density core)
//   - a bright compact core (the erupted prominence; drawn H-alpha pink)
//   - two legs tracing the flux rope back to the Sun
// The whole structure expands self-similarly inside a cone of fixed angular
// width, so it widens as it travels. Seen head-on (Earth-directed) the
// shell projects into an expanding ring around the disk: a "halo CME".
//
// Motion: each particle sits at a fixed fraction of the front distance; the
// front distance itself comes from cmeFrontR (impulsive acceleration, then
// the drag-based model) on sim time. Heliocentric distance is mapped to the
// scene with the same compression as the planets, so a CME crosses Earth's
// drawn orbit exactly when it reaches 1 AU.

const PER = 4000;
const N = PER * MAX_CMES;
const FADE_START_R = 1.6 * AU_KM / R_SUN_KM;
const FADE_END_R = 2.2 * AU_KM / R_SUN_KM;

const VERT = /* glsl */ `
  attribute float aSlot;
  attribute float aQ;       // angular fraction of the half-width (0 axis .. 1 edge)
  attribute float aPhi;     // azimuth around the axis
  attribute float aF;       // radial fraction of the front distance
  attribute float aType;    // 0 front, 1 cavity, 2 core, 3 leg
  attribute float aSeed;
  uniform vec3 uAxis[${MAX_CMES}];
  uniform vec3 uBx[${MAX_CMES}];
  uniform vec3 uBy[${MAX_CMES}];
  uniform vec4 uP[${MAX_CMES}];     // halfWidth, frontR, alpha, -
  uniform float uProj;
  uniform float uPx;
  varying float vA;
  varying float vType;
  ${SCENE_OF_R_GLSL}
  void main() {
    int s = int(aSlot + 0.5);
    vec4 P = uP[s];
    if (P.z <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
    float hw = P.x;
    float q = aQ;
    float phi = aPhi;
    if (aType > 1.5 && aType < 2.5) { q *= 0.38; phi += aF * 4.0; }   // twisted core
    float th = q * hw;
    vec3 dl = vec3(sin(th) * cos(phi), sin(th) * sin(phi), cos(th));
    vec3 dir = normalize(uBx[s] * dl.x + uBy[s] * dl.y + uAxis[s] * dl.z);
    // Rounded front: edges lag the nose, like a bubble rather than a flat cap.
    float d = P.y * aF * (1.0 - 0.22 * q * q);
    float sc = sceneOfR(d);
    vec4 mv = modelViewMatrix * vec4(dir * sc, 1.0);
    gl_Position = projectionMatrix * mv;
    // Sprite size tracks the CME's lateral extent so neighbours overlap into a
    // continuous cloud instead of reading as dots.
    float lateral = max(sc - 3.0, 0.9) * hw;
    float k = aType < 0.5 ? 0.20 : (aType < 1.5 ? 0.30 : (aType < 2.5 ? 0.22 : 0.10));
    float world = lateral * k + 0.06;
    float px = clamp(world * uProj / max(-mv.z, 0.1), 1.0, 48.0);
    // Fill-rate control: big overlapping sprites need far fewer particles to
    // read as a continuous cloud. Thin the population as sprites grow and
    // brighten the survivors so total light is unchanged.
    float keep = clamp(14.0 / px, 0.12, 1.0);
    if (aSeed > keep) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
    gl_PointSize = px * uPx;
    float a = aType < 0.5 ? 0.7 : (aType < 1.5 ? 0.10 : (aType < 2.5 ? 0.75 : 0.45));
    // No hard cone edge: the sheath thins out toward the flanks.
    a *= 1.0 - 0.85 * smoothstep(0.82, 1.0, q);
    // Front is densest at the leading edge, diffuse behind it.
    if (aType < 0.5) a *= smoothstep(0.76, 0.97, aF);
    // Born at the surface: hide material that hasn't lifted off yet.
    a *= smoothstep(1.0, 1.25, d);
    vA = a * P.z * (0.75 + 0.5 * fract(aSeed * 7.31)) / keep;
    vType = aType;
  }
`;

const FRAG = /* glsl */ `
  varying float vA;
  varying float vType;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 3.0);
    vec3 col = vType > 1.5 && vType < 2.5 ? vec3(1.0, 0.42, 0.36)
             : vType > 2.5 ? vec3(1.0, 0.78, 0.55)
             : vec3(1.0, 0.92, 0.80);
    gl_FragColor = vec4(col * g * vA * 0.075, 1.0);
  }
`;

function buildGeometry() {
  const slot = new Float32Array(N), q = new Float32Array(N), phi = new Float32Array(N);
  const f = new Float32Array(N), type = new Float32Array(N), seed = new Float32Array(N);
  for (let s = 0; s < MAX_CMES; s++) {
    for (let j = 0; j < PER; j++) {
      const i = s * PER + j;
      slot[i] = s;
      seed[i] = Math.random();
      const u = Math.random();
      let t, qq, ff, pp = Math.random() * Math.PI * 2;
      if (u < 0.58) {            // front shell, denser toward the rim (limb brightening)
        t = 0; qq = Math.sqrt(Math.random()) ** 0.6; ff = 1 - 0.24 * Math.random() ** 1.5;
      } else if (u < 0.68) {     // faint cavity fill
        t = 1; qq = Math.sqrt(Math.random()) * 0.9; ff = 0.5 + 0.38 * Math.random();
      } else if (u < 0.90) {     // prominence core
        t = 2; qq = Math.sqrt(Math.random()); ff = 0.28 + 0.24 * Math.random();
      } else {                   // two legs back to the Sun
        t = 3; qq = 0.75 + 0.15 * Math.random(); ff = 0.05 + 0.83 * Math.random();
        pp = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.35;
      }
      type[i] = t; q[i] = qq; f[i] = ff; phi[i] = pp;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
  g.setAttribute('aQ', new THREE.BufferAttribute(q, 1));
  g.setAttribute('aPhi', new THREE.BufferAttribute(phi, 1));
  g.setAttribute('aF', new THREE.BufferAttribute(f, 1));
  g.setAttribute('aType', new THREE.BufferAttribute(type, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}

export function CMEs() {
  const { camera, size, gl } = useThree();
  const geometry = useMemo(() => buildGeometry(), []);
  const material = useMemo(
    () =>
      makeLightAdditive(new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uAxis: { value: Array.from({ length: MAX_CMES }, () => new THREE.Vector3(0, 1, 0)) },
          uBx: { value: Array.from({ length: MAX_CMES }, () => new THREE.Vector3(1, 0, 0)) },
          uBy: { value: Array.from({ length: MAX_CMES }, () => new THREE.Vector3(0, 0, 1)) },
          uP: { value: Array.from({ length: MAX_CMES }, () => new THREE.Vector4()) },
          uProj: { value: 500 },
          uPx: { value: 1 },
        },
      })),
    []
  );

  useFrame(() => {
    const u = material.uniforms;
    const fov = (camera.fov ?? 50) * Math.PI / 180;
    u.uProj.value = size.height / (2 * Math.tan(fov / 2));
    u.uPx.value = gl.getPixelRatio();
    const bright = useStore.getState().config.cmeBrightness ?? 1;
    const t = sunActivity.t ?? 0;
    for (let i = 0; i < MAX_CMES; i++) {
      const c = sunActivity.cmes[i];
      const P = u.uP.value[i];
      if (!c || t < c.t0) { P.z = 0; continue; }
      const r = cmeFrontR(c, t);
      u.uAxis.value[i].fromArray(c.axis);
      u.uBx.value[i].fromArray(c.bx);
      u.uBy.value[i].fromArray(c.by);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(r, FADE_START_R, FADE_END_R);
      // Expanding plasma thins out (density ~ r^-2, scattered brightness falls
      // faster still): a CME is vivid in the low corona and only a faint ghost
      // by 1 AU, where spacecraft heliospheric imagers need heavy processing
      // to see it at all. Keep a small floor so you can still follow one to
      // Earth.
      const expo = Math.max(0.07, Math.min(1, Math.pow(Math.max(r, 1) / 4, -0.8)));
      P.set(c.halfWidth, r, bright * fadeOut * expo, 0);
    }
  });

  return (
    <points geometry={geometry} material={material} frustumCulled={false} renderOrder={7} raycast={() => null} />
  );
}
