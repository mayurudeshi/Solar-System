import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BODIES } from '../data/bodies.js';
import { useStore } from '../state/useStore.js';

// Kuiper belt. ~7000 icy bodies, each on its own real Keplerian orbit,
// propagated on the GPU (Kepler solve in the vertex shader) so the whole
// belt moves with sim time at zero CPU cost. Same log AU->scene compression
// as the planets (orbital.js auToSceneUnits) so it sits outside Neptune.
//
// Populations (rough real-world mix):
//   cold classical  42.5-47 AU, near-circular, flat, reddish  (the "kernel")
//   hot classical   40-47.5 AU, stirred up, inclined, greyer
//   plutinos        3:2 with Neptune (39.4 AU), phase-locked like Pluto
//   twotinos        2:1 with Neptune (47.7 AU), the "Kuiper cliff" edge
//   scattered disk  50-150 AU, perihelion pinned 30-40 AU, sparse halo
//
// Resonant bodies get Neptune's exact mean-motion ratio and a resonant
// angle that librates around its stable centre, so they keep avoiding
// Neptune as time runs (same trick that keeps Pluto safe).

const DEG = Math.PI / 180;
const COUNT = 7000;
const NEP = BODIES.Neptune.elements;
const NEP_A = NEP.a;
const NEP_L0 = NEP.L * DEG;                        // mean longitude at J2000
const NEP_N = (NEP.L_dot / 36525) * DEG;           // rad/day
const GAUSS_N = 0.9856076686 * DEG;                // rad/day at 1 AU

// Seeded RNG so the belt looks the same every load.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBelt() {
  const rnd = mulberry32(0x6b75697065);
  const range = (lo, hi) => lo + rnd() * (hi - lo);
  const rayleigh = (sigma) => sigma * Math.sqrt(-2 * Math.log(1 - rnd()));
  const wrap = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  const orb1 = new Float32Array(COUNT * 4); // a, e, inc, raan
  const orb2 = new Float32Array(COUNT * 4); // argp, M0, n, size
  const color = new Float32Array(COUNT * 3);

  const RED = [0.80, 0.55, 0.42];
  const GREY = [0.66, 0.66, 0.70];
  const ICE = [0.62, 0.70, 0.80];

  for (let i = 0; i < COUNT; i++) {
    const p = rnd();
    let a, e, inc, raan, peri, lambda, n, tint;
    raan = rnd() * 2 * Math.PI;
    peri = rnd() * 2 * Math.PI; // longitude of perihelion

    if (p < 0.40) {
      // cold classical
      a = range(42.5, 47.0);
      e = Math.min(rayleigh(0.035), 0.1);
      inc = Math.min(rayleigh(2.0), 6) * DEG;
      lambda = rnd() * 2 * Math.PI;
      n = GAUSS_N / Math.pow(a, 1.5);
      tint = RED;
    } else if (p < 0.65) {
      // hot classical
      a = range(40.0, 47.5);
      e = Math.min(rayleigh(0.08), 0.2);
      inc = Math.min(rayleigh(12), 35) * DEG;
      lambda = rnd() * 2 * Math.PI;
      n = GAUSS_N / Math.pow(a, 1.5);
      tint = GREY;
    } else if (p < 0.80) {
      // plutinos: phi = 3*lambda - 2*lambdaN - peri librates about 180 deg
      a = NEP_A * Math.pow(1.5, 2 / 3);
      e = range(0.08, 0.30);
      inc = Math.min(rayleigh(10), 30) * DEG;
      const phi = Math.PI + Math.sin(rnd() * 2 * Math.PI) * range(0, 80) * DEG;
      const k = Math.floor(rnd() * 3);
      lambda = (phi + 2 * NEP_L0 + peri) / 3 + k * (2 * Math.PI / 3);
      n = NEP_N * (2 / 3);
      tint = GREY;
    } else if (p < 0.84) {
      // twotinos: phi = 2*lambda - lambdaN - peri, asymmetric islands near +/-75 deg
      a = NEP_A * Math.pow(2, 2 / 3);
      e = range(0.10, 0.30);
      inc = Math.min(rayleigh(8), 25) * DEG;
      const centre = (rnd() < 0.5 ? 1 : -1) * 75 * DEG;
      const phi = centre + Math.sin(rnd() * 2 * Math.PI) * range(0, 25) * DEG;
      const k = Math.floor(rnd() * 2);
      lambda = (phi + NEP_L0 + peri) / 2 + k * Math.PI;
      n = NEP_N * 0.5;
      tint = GREY;
    } else {
      // scattered disk: perihelion near Neptune, long stretched orbits
      a = 50 + Math.pow(rnd(), 2) * 100;
      const q = range(30, 40);
      e = 1 - q / a;
      inc = Math.min(rayleigh(15), 45) * DEG;
      lambda = rnd() * 2 * Math.PI;
      n = GAUSS_N / Math.pow(a, 1.5);
      tint = ICE;
    }

    orb1[i * 4 + 0] = a;
    orb1[i * 4 + 1] = e;
    orb1[i * 4 + 2] = inc;
    orb1[i * 4 + 3] = raan;
    orb2[i * 4 + 0] = wrap(peri - raan);   // argument of perihelion
    orb2[i * 4 + 1] = wrap(lambda - peri); // mean anomaly at J2000
    orb2[i * 4 + 2] = n;
    // Size: mostly dust-mote small, a rare few bright big ones (power law).
    orb2[i * 4 + 3] = 1.0 + Math.pow(rnd(), 6) * 3.0;

    const jitter = 0.85 + rnd() * 0.3;
    color[i * 3 + 0] = tint[0] * jitter;
    color[i * 3 + 1] = tint[1] * jitter;
    color[i * 3 + 2] = tint[2] * jitter;
  }

  const g = new THREE.BufferGeometry();
  // Dummy positions: the vertex shader computes the real ones.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  g.setAttribute('aOrb1', new THREE.BufferAttribute(orb1, 4));
  g.setAttribute('aOrb2', new THREE.BufferAttribute(orb2, 4));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  return g;
}

const vertexShader = /* glsl */ `
  attribute vec4 aOrb1;
  attribute vec4 aOrb2;
  attribute vec3 aColor;
  uniform float uDays;
  uniform float uIncl;
  uniform float uPx;
  varying vec3 vColor;

  void main() {
    float a = aOrb1.x, e = aOrb1.y, inc = aOrb1.z * uIncl, raan = aOrb1.w;
    float argp = aOrb2.x, n = aOrb2.z;
    float M = mod(aOrb2.y + n * uDays, 6.28318530718);

    float E = M + e * sin(M);
    for (int k = 0; k < 6; k++) {
      E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
    }
    float xp = a * (cos(E) - e);
    float yp = a * sqrt(1.0 - e * e) * sin(E);
    float r = length(vec2(xp, yp));
    float u = argp + atan(yp, xp);

    float cO = cos(raan), sO = sin(raan), cU = cos(u), sU = sin(u);
    float cI = cos(inc), sI = sin(inc);
    vec3 ecl = vec3(cO * cU - sO * sU * cI, sO * cU + cO * sU * cI, sU * sI);

    // Log AU -> scene compression, identical to orbital.js auToSceneUnits.
    float scene = log(r * 9.0 + 1.0) / log(10.0) * 26.0;
    vec3 p = ecl * scene;
    vec4 mv = modelViewMatrix * vec4(p.x, p.z, -p.y, 1.0);

    gl_Position = projectionMatrix * mv;
    gl_PointSize = aOrb2.w * uPx * clamp(140.0 / -mv.z, 0.6, 3.0);
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, d) * uOpacity;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86400000;

export function KuiperBelt() {
  const show = useStore((s) => s.showKuiper);
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(buildBelt, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uDays: { value: 0 },
          uIncl: { value: 1 },
          uPx: { value: 1 },
          uOpacity: { value: 0.85 },
        },
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  const ref = useRef();

  useFrame(() => {
    if (!show) return;
    const { epochMs, trueInclination } = useStore.getState();
    const u = material.uniforms;
    u.uDays.value = (epochMs - J2000_MS) / MS_PER_DAY;
    u.uIncl.value = trueInclination ? 1 : 0;
    u.uPx.value = gl.getPixelRatio();
  });

  return (
    <points
      ref={ref}
      geometry={geometry}
      material={material}
      visible={show}
      frustumCulled={false}
      // Never eat clicks meant for Neptune / Pluto.
      raycast={() => null}
    />
  );
}
