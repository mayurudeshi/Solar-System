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

// Wires `vantage` to the OrbitControls target. Sun = origin; 'free' =
// stop following anything; otherwise lerp the target toward the named
// body's current scene position each frame.
const TARGET = new THREE.Vector3();

export function VantageCamera() {
  const controlsRef = useRef();
  const { camera } = useThree();
  const distFrame = useRef(0);
  const lastDist = useRef(0);

  // Snap on vantage change so the user gets an immediate response, then
  // useFrame keeps a smooth lerp (target drifts as the planet orbits).
  const vantage = useStore((s) => s.vantage);
  useEffect(() => {
    if (!controlsRef.current) return;
    if (vantage === 'free') return;
    if (vantage === 'sun') {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [vantage]);

  // Dev hook — expose camera + controls so the headless render harness can
  // position the camera at an exact distance from the target (precise zoom)
  // for screenshot-driven shader iteration. Harmless in prod.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.__camera = camera;
        window.__controls = controlsRef.current;
        // Helper: set camera to `dist` units from current target along the
        // current view direction. Used by render_sun.mjs.
        window.__setZoom = (dist) => {
          const c = controlsRef.current;
          if (!c) return false;
          const dir = camera.position.clone().sub(c.target).normalize();
          camera.position.copy(c.target).add(dir.multiplyScalar(dist));
          c.update();
          return true;
        };
      }
    } catch (_) { /* no-op */ }
  }, [camera]);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    const v = useStore.getState().vantage;
    const epochMs = useStore.getState().epochMs;
    const useInclination = useStore.getState().trueInclination;

    if (v === 'free') return;
    if (v === 'sun') {
      TARGET.set(0, 0, 0);
    } else {
      const body = BODIES[v];
      if (!body) return;
      const auPos = bodyPositionAU(body, epochMs, { useInclination });
      const scenePos = auVecToSceneUnits(auPos);
      const [tx, ty, tz] = eclipticToThreePosition(scenePos);
      TARGET.set(tx, ty, tz);
    }
    c.target.lerp(TARGET, 0.12);
    c.update();

    // Push camera→target distance to store at ~10Hz, and only when it
    // actually changed by more than a hair. ControlBar reads this for
    // the zoom meter; we don't want a 60Hz re-render storm.
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
      minDistance={1.2}
      maxDistance={1600}
    />
  );
}
