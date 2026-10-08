import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../state/useStore.js';
import { SUN_R, sunBodyMatrix, makeLightAdditive } from '../../sun/sunFrame.js';
import { sunActivity, MAX_REGIONS, flareIntensity } from '../../sun/activity.js';
import { traceRegionLoops } from '../../sun/fieldLines.js';

// Coronal loops as continuous glowing tubes (camera-facing ribbons) along
// traced magnetic field lines, the way they look in extreme ultraviolet
// (warm gold, like SDO's 171 A channel). Replaces the old sprite particles,
// which could only ever read as scattered sand.
//
// Each loop is optically thin hot plasma: brightest along the tube axis,
// dimmer at the footpoints (where it drops into the cooler transition region),
// brightening as its region grows and flaring loops glow after a flare.
// Plasma flows along loops (siphon flows / coronal rain) at ~50 km/s, which in
// sim time is far too fast to see at 1x; the flow pattern is only shown when
// the sim is slow enough for it to be resolvable, otherwise it would alias
// into noise.
//
// LOD: invisible (and not retraced) unless the camera is near the Sun.

const FADE_FAR = 70;
const FADE_NEAR = 26;
const WIDTH_R = 0.007;      // loop half-thickness in solar radii (~5 Mm)
const MIN_PX = 2.0;         // never thinner than this on screen
const RETRACE_MIN_MS = 400; // throttle (wall clock) for geometry rebuilds

const VERT = /* glsl */ `
  attribute vec3 aTan;
  attribute float aSide;
  attribute float aU;
  attribute float aSlot;
  attribute float aOpen;
  attribute float aSeed;
  uniform float uWidth;      // view-space half width
  uniform float uProj;       // pixels per unit at distance 1
  uniform float uMinPx;
  uniform vec4 uRegB[${MAX_REGIONS}];   // x = brightness
  varying float vSide;
  varying float vU;
  varying float vB;
  varying float vSeed;
  varying float vThin;
  varying float vOpen;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 t = normalize((modelViewMatrix * vec4(aTan, 0.0)).xyz);
    vec3 side = normalize(cross(t, normalize(-mv.xyz)));
    float wMin = uMinPx * (-mv.z) / uProj;
    float w = max(uWidth, wMin);
    mv.xyz += side * aSide * w;
    gl_Position = projectionMatrix * mv;
    vSide = aSide;
    vU = aU;
    vB = uRegB[int(aSlot + 0.5)].x;
    vSeed = aSeed;
    vThin = clamp(uWidth / w, 0.25, 1.0);
    vOpen = aOpen;
  }
`;

const FRAG = /* glsl */ `
  uniform float uFlowPhase;
  uniform float uFlowAmp;
  uniform float uIntensity;
  varying float vSide;
  varying float vU;
  varying float vB;
  varying float vSeed;
  varying float vThin;
  varying float vOpen;
  void main() {
    float core = exp(-vSide * vSide * 2.2) - 0.11;
    float foot = vOpen > 0.5
      ? smoothstep(0.0, 0.08, vU) * (1.0 - smoothstep(0.3, 1.0, vU))
      : smoothstep(0.0, 0.10, vU) * smoothstep(1.0, 0.90, vU);
    float flow = 1.0 + uFlowAmp * 0.45 * sin(6.2831 * (vU * 5.0 - uFlowPhase + vSeed * 3.0));
    // Real loop bundles vary a lot strand to strand; a few dominate.
    float strand = 0.25 + 1.2 * pow(fract(sin(vSeed * 91.7) * 4375.85), 2.0);
    float b = vB * max(core, 0.0) * foot * flow * strand * vThin * uIntensity * 1.7;
    vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.92, 0.70), clamp(vB - 0.6, 0.0, 1.0));
    gl_FragColor = vec4(col * b, 1.0);
  }
`;

function buildGeometry(lines) {
  let nv = 0, ni = 0;
  for (const l of lines) { nv += l.pts.length * 2; ni += (l.pts.length - 1) * 6; }
  const pos = new Float32Array(nv * 3), tan = new Float32Array(nv * 3);
  const side = new Float32Array(nv), u = new Float32Array(nv), slot = new Float32Array(nv);
  const open = new Float32Array(nv), seed = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let v = 0, k = 0;
  for (const l of lines) {
    const n = l.pts.length;
    const s = Math.random();
    // arc length for a uniform U parameter
    const len = [0];
    for (let i = 1; i < n; i++) {
      const a = l.pts[i - 1], b = l.pts[i];
      len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const total = len[n - 1] || 1;
    const base = v;
    for (let i = 0; i < n; i++) {
      const p = l.pts[i];
      const a = l.pts[Math.max(0, i - 1)], b = l.pts[Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      for (const sd of [-1, 1]) {
        pos.set(p, v * 3);
        tan.set([tx, ty, tz], v * 3);
        side[v] = sd; u[v] = len[i] / total; slot[v] = l.slot; open[v] = l.open ? 1 : 0; seed[v] = s;
        v++;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k);
      k += 6;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
  g.setAttribute('aOpen', new THREE.BufferAttribute(open, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export function CoronalLoops() {
  const { camera, size } = useThree();
  const meshRef = useRef();
  const state = useRef({ version: -1, lastBuild: 0 });
  const material = useMemo(
    () =>
      makeLightAdditive(new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uWidth: { value: WIDTH_R * SUN_R },
          uProj: { value: 500 },
          uMinPx: { value: MIN_PX },
          uRegB: { value: Array.from({ length: MAX_REGIONS }, () => new THREE.Vector4()) },
          uFlowPhase: { value: 0 },
          uFlowAmp: { value: 0 },
          uIntensity: { value: 0 },
        },
        side: THREE.DoubleSide,
      })),
    []
  );
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);
  useEffect(() => () => { meshRef.current?.geometry?.dispose(); material.dispose(); }, [material]);

  const _m = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const st = useStore.getState();
    const dist = camera.position.length();
    const k = THREE.MathUtils.clamp((FADE_FAR - dist) / (FADE_FAR - FADE_NEAR), 0, 1);
    mesh.visible = k > 0.001;
    if (!mesh.visible) return;

    // Rebuild when the field changed (throttled).
    const now = performance.now();
    if (sunActivity.fieldVersion !== state.current.version && now - state.current.lastBuild > RETRACE_MIN_MS) {
      state.current.version = sunActivity.fieldVersion;
      state.current.lastBuild = now;
      const regs = sunActivity.regions();
      const lines = traceRegionLoops(regs, sunActivity.cycle.parity);
      for (const r of regs) if (r) r.tracedS = r.s;
      const g = buildGeometry(lines);
      mesh.geometry.dispose();
      mesh.geometry = g;
    }

    // Loops ride the rotating surface.
    sunBodyMatrix(_m, st);
    mesh.matrix.copy(_m).scale(new THREE.Vector3(SUN_R, SUN_R, SUN_R));
    mesh.matrixWorldNeedsUpdate = true;

    const u = material.uniforms;
    const fov = (camera.fov ?? 50) * Math.PI / 180;
    u.uProj.value = size.height / (2 * Math.tan(fov / 2));
    u.uIntensity.value = k * (st.config.loopBrightness ?? 1);
    const t = sunActivity.t ?? 0;
    const regs = sunActivity.regions();
    for (let i = 0; i < MAX_REGIONS; i++) {
      const r = regs[i];
      u.uRegB.value[i].x = r ? 0.2 + 0.7 * r.s + 1.6 * sunActivity.regionGlow(r) + 0.8 * flareIntensity(r.flare, t) : 0;
    }
    // Flow: ~50 km/s along ~20 Mm blobs => ~216 cycles per sim day. Only
    // shown when one cycle lasts at least ~0.4 real seconds.
    const cyclesPerDay = 216;
    const speed = st.paused ? 0 : st.speed;
    const realPeriod = speed > 0 ? 1 / (cyclesPerDay * speed) : Infinity;
    u.uFlowAmp.value = THREE.MathUtils.clamp((realPeriod - 0.4) / 0.6, 0, 1);
    u.uFlowPhase.value = (t * cyclesPerDay) % 1000;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      matrixAutoUpdate={false}
      frustumCulled={false}
      renderOrder={6}
      raycast={() => null}
    />
  );
}
