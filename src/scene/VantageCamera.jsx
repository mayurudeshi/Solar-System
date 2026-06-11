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
