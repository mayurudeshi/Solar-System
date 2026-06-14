import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

// v1.7 — occasional shooting stars. Honestly a "lie" (meteors are debris
// burning up in EARTH'S ATMOSPHERE — they can't happen in the airless void),
// but a forgivable, beloved bit of ambiance. Kept RARE + fast + faint so it
// reads as a "did I just see that?" moment, not a fireworks show. Only fires
// out in the void (so the pristine planet-study view stays clean), and only
// one streak at a time.
const TRAIL_RADIUS = 1500;        // sits in front of the star backdrop
const TRAIL_POINTS = 12;          // head -> tail polyline
const TRAIL_STEP = 0.009;         // angular spacing between trail points (rad)
const SWEEP = 1.05;               // total arc the head travels (rad, ~60°)
const VOID_GATE = 700;            // only when zoomed this far out
const MIN_GAP = 9;                // seconds between streaks (min)
const MAX_GAP = 26;               // seconds between streaks (max)
const DUR_MIN = 0.7;              // streak lifetime (s)
const DUR_MAX = 1.3;

const TMP = new THREE.Vector3();
const Q = new THREE.Quaternion();

export function ShootingStars() {
  const groupRef = useRef();
  const { camera } = useThree();

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const col = new Float32Array(TRAIL_POINTS * 3);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = 1 - i / (TRAIL_POINTS - 1);        // 1 at head -> 0 at tail
      const b = 0.1 + 1.7 * f * f;                 // bright head, quick falloff to faint tail
      col[i * 3] = b;                              // warm-white
      col[i * 3 + 1] = b * 0.96;
      col[i * 3 + 2] = b * 0.85;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);

  // Build the THREE.Line directly — R3F's <line> element attaches geometry/
  // material unreliably; a <primitive object> is the robust path.
  const lineObj = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const l = new THREE.Line(geom, mat);
    l.frustumCulled = false;
    l.visible = false;
    l.renderOrder = -900;
    return l;
  }, [geom]);

  // Per-streak motion state.
  const st = useRef({
    active: false,
    timer: 3,                  // seconds until first streak
    age: 0,
    dur: 1,
    axis: new THREE.Vector3(0, 1, 0),  // rotation axis (great-circle normal)
    dir: new THREE.Vector3(1, 0, 0),   // starting head direction
    start: 0,
  });

  const rand = (a, b) => a + Math.random() * (b - a);

  function spawn() {
    const s = st.current;
    // Random head direction on the sphere, biased toward the upper hemisphere
    // so streaks tend to arc across the visible sky.
    const dir = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1));
    if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
    dir.normalize();
    // A random axis roughly perpendicular to dir → great-circle sweep.
    const t = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, t).normalize();
    s.dir.copy(dir);
    s.axis.copy(axis);
    s.start = rand(-0.3, -0.1);   // begin slightly "behind" so it eases in
    s.dur = rand(DUR_MIN, DUR_MAX);
    s.age = 0;
    s.active = true;
  }

  useFrame((state, delta) => {
    const grp = groupRef.current;
    const line = lineObj;
    if (!grp) return;
    grp.position.copy(camera.position);          // sit at infinity

    const dist = useStore.getState().cameraDist;
    const inVoid = dist > VOID_GATE;
    const s = st.current;
    const dt = Math.min(delta, 0.05);            // clamp tab-restore jumps

    if (!s.active) {
      line.visible = false;
      s.timer -= dt;
      if (s.timer <= 0) {
        if (inVoid) spawn();
        else s.timer = 1;                         // re-check soon, don't spawn inside
      }
      return;
    }

    // Active streak.
    s.age += dt;
    const p = s.age / s.dur;
    if (p >= 1 || !inVoid) {
      s.active = false;
      s.timer = rand(MIN_GAP, MAX_GAP);
      line.visible = false;
      return;
    }

    // Head sweeps along the great circle; trail points lag behind.
    const headAngle = s.start + SWEEP * p;
    const pos = geom.attributes.position.array;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const ang = headAngle - i * TRAIL_STEP;
      Q.setFromAxisAngle(s.axis, ang);
      TMP.copy(s.dir).applyQuaternion(Q).multiplyScalar(TRAIL_RADIUS);
      pos[i * 3] = TMP.x; pos[i * 3 + 1] = TMP.y; pos[i * 3 + 2] = TMP.z;
    }
    geom.attributes.position.needsUpdate = true;

    // Fade in fast, out slower; overall faint.
    const fadeIn = Math.min(1, p / 0.12);
    const fadeOut = 1 - Math.max(0, (p - 0.55) / 0.45);
    line.material.opacity = 0.85 * fadeIn * fadeOut;
    line.visible = true;
  });

  return (
    <group ref={groupRef}>
      <primitive object={lineObj} />
    </group>
  );
}
