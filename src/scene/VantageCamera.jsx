import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  bodyPositionAU,
  auVecToSceneUnits,
  eclipticToThreePosition,
} from '../lib/orbital.js';
import { BODIES } from '../data/bodies.js';
import { useStore } from '../state/useStore.js';

// FOLLOW-CAM (v1.6.1). The old version hard-snapped the OrbitControls target
// to the followed body's CENTER every frame, which yanked back any pan/zoom
// framing the user set — so you "couldn't scroll" when zoomed in, and at
// high speed a fast body (e.g. Pluto at 100×) was impossible to study.
//
// Now we track the body's MOVEMENT each frame and add that delta to BOTH the
// camera and the target. The body stays followed (rides along at any speed)
// while the user's framing — zoom, PAN, rotate — is fully preserved. Panning
// (right-drag on desktop, two-finger drag on touch) now works as the 3D
// equivalent of "scrolling around" a zoomed-in view (MJ ask 2026-06-14).
const TMP = new THREE.Vector3();

function bodyWorldPos(v, epochMs, useInclination, out) {
  if (v === 'sun') return out.set(0, 0, 0);
  const body = BODIES[v];
  if (!body) return null;
  const auPos = bodyPositionAU(body, epochMs, { useInclination });
  const scenePos = auVecToSceneUnits(auPos);
  const [tx, ty, tz] = eclipticToThreePosition(scenePos);
  return out.set(tx, ty, tz);
}

export function VantageCamera() {
  const controlsRef = useRef();
  const { camera } = useThree();
  const distFrame = useRef(0);
  const lastDist = useRef(0);
  const prevTarget = useRef(new THREE.Vector3());
  const prevVantage = useRef(null);

  const vantage = useStore((s) => s.vantage);

  // On vantage CHANGE: re-center on the new body, preserving the current
  // viewing offset (same zoom/angle, just recentered). Resets the follow
  // baseline so the first follow-delta isn't a huge jump.
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    if (vantage === 'free') { prevVantage.current = 'free'; return; }
    const { epochMs, trueInclination } = useStore.getState();
    const newT = bodyWorldPos(vantage, epochMs, trueInclination, TMP);
    if (!newT) return;
    // keep the camera's offset relative to the old target → same framing
    const offset = camera.position.clone().sub(c.target);
    c.target.copy(newT);
    camera.position.copy(newT).add(offset);
    prevTarget.current.copy(newT);
    prevVantage.current = vantage;
    c.update();
  }, [vantage, camera]);

  // Dev hooks for the headless render harness (harmless in prod).
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__camera = camera;
        window.__controls = controlsRef.current;
        window.__setZoom = (dist) => {
          const c = controlsRef.current;
          if (!c) return false;
          const dir = camera.position.clone().sub(c.target).normalize();
          camera.position.copy(c.target).add(dir.multiplyScalar(dist));
          c.update();
          return true;
        };
        // Screen-space pan (used by the on-screen PanPad). dx/dy in [-1,1];
        // step scales with zoom distance so it feels consistent at any zoom.
        window.__panView = (dx, dy) => {
          const c = controlsRef.current;
          if (!c) return;
          const dist = camera.position.distanceTo(c.target);
          const step = Math.max(0.15, dist * 0.06);
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
          const move = new THREE.Vector3()
            .addScaledVector(right, dx * step)
            .addScaledVector(up, dy * step);
          camera.position.add(move);
          c.target.add(move);
          c.update();
        };
        // Re-center the current vantage body (undo any pan offset).
        window.__recenter = () => {
          const c = controlsRef.current;
          if (!c) return;
          const { vantage, epochMs, trueInclination } = useStore.getState();
          if (vantage === 'free') return;
          const newT = bodyWorldPos(vantage, epochMs, trueInclination, TMP);
          if (!newT) return;
          const offset = camera.position.clone().sub(c.target);
          c.target.copy(newT);
          camera.position.copy(newT).add(offset);
          prevTarget.current.copy(newT);
          c.update();
        };
      }
    } catch (_) { /* no-op */ }
  }, [camera]);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    const v = useStore.getState().vantage;

    if (v !== 'free') {
      const { epochMs, trueInclination } = useStore.getState();
      const newT = bodyWorldPos(v, epochMs, trueInclination, TMP);
      if (newT) {
        // First frame after a (re)lock: baseline only, no delta.
        if (prevVantage.current !== v) {
          prevTarget.current.copy(newT);
          prevVantage.current = v;
        }
        // Add the body's motion since last frame to BOTH camera + target,
        // so the body stays put on screen while user framing is preserved.
        const dx = newT.x - prevTarget.current.x;
        const dy = newT.y - prevTarget.current.y;
        const dz = newT.z - prevTarget.current.z;
        camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
        c.target.x += dx; c.target.y += dy; c.target.z += dz;
        prevTarget.current.copy(newT);
      }
    }
    c.update();

    // Zoom meter (~10Hz, change-gated) — runs in every mode incl. free.
    distFrame.current = (distFrame.current + 1) % 6;
    if (distFrame.current === 0) {
      const dist = camera.position.distanceTo(c.target);
      if (Math.abs(dist - lastDist.current) > Math.max(0.05, dist * 0.003)) {
        lastDist.current = dist;
        useStore.getState().setCameraDist(dist);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning   // pan in the screen plane — intuitive "scroll around"
      panSpeed={0.9}
      keyEvents           // arrow keys pan (conflict-free vs Vivaldi gestures)
      keyPanSpeed={18}
      minDistance={1.2}
      maxDistance={1600}
    />
  );
}
