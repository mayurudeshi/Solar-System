import { useMemo } from 'react';
import * as THREE from 'three';
import { orbitPathAU, auVecToSceneUnits } from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Render the elliptical orbit of a body as a line, using the body's actual
// (Ω, i, ω) orientation. Sampled in AU then compressed into scene units so
// the orbit line passes through the planet's sphere — no double-bookkeeping.
export function OrbitPath({ body, samples = 256 }) {
  const date = useStore((s) => s.date);
  const showOrbits = useStore((s) => s.showOrbits);

  const geometry = useMemo(() => {
    const pts = orbitPathAU(body, date, samples);
    const arr = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const sceneP = auVecToSceneUnits(pts[i]);
      // Same ECL → scene axis mapping as Planet.jsx
      arr[i * 3 + 0] = sceneP.x;
      arr[i * 3 + 1] = sceneP.z;
      arr[i * 3 + 2] = -sceneP.y;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [body, date, samples]);

  if (!showOrbits) return null;

  return (
    <line geometry={geometry}>
      <lineBasicMaterial
        color={body.color}
        transparent
        opacity={0.55}
      />
    </line>
  );
}
