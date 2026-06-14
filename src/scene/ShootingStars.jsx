import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

// v1.7 — occasional shooting stars. Honestly a "lie" (meteors are debris
// burning up in EARTH'S ATMOSPHERE — impossible in the airless void), but a
// forgivable, beloved bit of ambiance. Rendered as a tapered trail of
// additive POINT SPRITES (a bright soft head fading to a thin tail) — a 1px
// LineBasicMaterial was too thin for the GPU to draw visibly. Rare, fast,
// one at a time, and only out in the void so the planet view stays pristine.
const TRAIL_RADIUS = 1500;        // sits in front of the star backdrop
const TRAIL_POINTS = 16;          // head -> tail sprites
const TRAIL_STEP = 0.0065;        // angular spacing between sprites (rad)
const SWEEP = 0.7;                // total arc the head travels (rad) — slower, watchable
const HEAD_SIZE = 28.0;           // head sprite size (px) — clearly visible
const TAIL_SIZE = 2.0;
const VOID_GATE = 360;            // fire once the galaxy is meaningfully visible
const MIN_GAP = 4;                // seconds between streaks (min)
const MAX_GAP = 9;                // seconds between streaks (max)
const DUR_MIN = 1.4;              // streak lifetime (s) — lingers, not blink-and-gone
const DUR_MAX = 2.4;
const VIEW_CONE = 0.62;           // spawn jitter around camera forward (keeps them on-screen)

const TMP = new THREE.Vector3();
const Q = new THREE.Quaternion();

const VERT = /* glsl */ `
  attribute float aT;            // 0 at head .. 1 at tail
  uniform float uHead;
  uniform float uTail;
  varying float vHead;           // 1 head .. 0 tail
  void main() {
    vHead = 1.0 - aT;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = mix(uTail, uHead, vHead * vHead);
  }
`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform float uFade;           // 0..1 streak in/out envelope
  varying float vHead;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float soft = smoothstep(0.5, 0.0, r);          // soft round sprite
    float intensity = (0.25 + 1.5 * vHead) * soft * uFade;
    vec3 col = vec3(1.0, 0.97, 0.88);              // warm white
    gl_FragColor = vec4(col, intensity);           // additive
  }
`;

export function ShootingStars() {
  const groupRef = useRef();
  const { camera } = useThree();

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    const aT = new Float32Array(TRAIL_POINTS);
    for (let i = 0; i < TRAIL_POINTS; i++) aT[i] = i / (TRAIL_POINTS - 1);
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    return g;
  }, []);

  const pts = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uFade: { value: 0 },
        uHead: { value: HEAD_SIZE },
        uTail: { value: TAIL_SIZE },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const o = new THREE.Points(geom, mat);
    o.frustumCulled = false;
    o.visible = false;
    o.renderOrder = -900;
    return o;
  }, [geom]);

  const st = useRef({
    active: false,
    timer: 2.5,
    age: 0,
    dur: 1,
    axis: new THREE.Vector3(0, 1, 0),
    dir: new THREE.Vector3(1, 0, 0),
    start: 0,
  });

  const rand = (a, b) => a + Math.random() * (b - a);

  function spawn() {
    const s = st.current;
    // Aim into the part of the sky the camera is actually looking at (forward
    // + a cone of jitter), so streaks land on-screen instead of mostly behind
    // the viewer. Random directions over the whole sphere = blink-and-miss.
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const dir = fwd.clone().add(new THREE.Vector3(
      rand(-VIEW_CONE, VIEW_CONE),
      rand(-VIEW_CONE, VIEW_CONE),
      rand(-VIEW_CONE, VIEW_CONE),
    ));
    if (dir.lengthSq() < 0.01) dir.copy(fwd);
    dir.normalize();
    const t = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, t).normalize();
    s.dir.copy(dir);
    s.axis.copy(axis);
    s.start = rand(-0.3, -0.1);
    s.dur = rand(DUR_MIN, DUR_MAX);
    s.age = 0;
    s.active = true;
  }

  useFrame((state, delta) => {
    const grp = groupRef.current;
    if (!grp) return;
    grp.position.copy(camera.position);          // sit at infinity

    const dist = useStore.getState().cameraDist;
    const inVoid = dist > VOID_GATE;
    const s = st.current;
    const dt = Math.min(delta, 0.05);

    if (!s.active) {
      pts.visible = false;
      s.timer -= dt;
      if (s.timer <= 0) {
        if (inVoid) spawn();
        else s.timer = 1;
      }
      return;
    }

    s.age += dt;
    const p = s.age / s.dur;
    if (p >= 1 || !inVoid) {
      s.active = false;
      s.timer = rand(MIN_GAP, MAX_GAP);
      pts.visible = false;
      return;
    }

    const headAngle = s.start + SWEEP * p;
    const pos = geom.attributes.position.array;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const ang = headAngle - i * TRAIL_STEP;
      Q.setFromAxisAngle(s.axis, ang);
      TMP.copy(s.dir).applyQuaternion(Q).multiplyScalar(TRAIL_RADIUS);
      pos[i * 3] = TMP.x; pos[i * 3 + 1] = TMP.y; pos[i * 3 + 2] = TMP.z;
    }
    geom.attributes.position.needsUpdate = true;

    const fadeIn = Math.min(1, p / 0.12);
    const fadeOut = 1 - Math.max(0, (p - 0.55) / 0.45);
    pts.material.uniforms.uFade.value = fadeIn * fadeOut;
    pts.visible = true;
  });

  return (
    <group ref={groupRef}>
      <primitive object={pts} />
    </group>
  );
}
