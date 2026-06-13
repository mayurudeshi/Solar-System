import { useMemo } from 'react';
import * as THREE from 'three';
import {
  orbitPathAU,
  auVecToSceneUnits,
  eclipticToThreePosition,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Render an elliptical orbit line in the body's actual (Ω, i, ω) plane.
//
// `epochMs` is intentionally NOT in the useMemo deps — orbit shape changes
// on the century timescale, so rebuilding the BufferGeometry once per
// SimClock tick (60/sec) would be pure waste. We instead bucket by
// "centuries since J2000 × 100" so the line refreshes every 1 century.
// At simulation speeds humans can perceive (≤8 days/sec), that's a
// rebuild every ~5000 real years of sim time. Effectively static.
//
// The `trueInclination` toggle IS in the dep set — it changes the line's
// orientation immediately, which is the headline visual feature.
const MS_PER_CENTURY = 36525 * 86400000;

export function OrbitPath({ name, body, samples = 256 }) {
  const showOrbits      = useStore((s) => s.showOrbits);
  const bodyShown       = useStore((s) => s.bodyVisible[name] !== false);
  const trueInclination = useStore((s) => s.trueInclination);
  const orbitBucket     = useStore((s) =>
    Math.floor(((s.epochMs - Date.UTC(2000, 0, 1, 12)) / MS_PER_CENTURY) * 100)
  );

  const geometry = useMemo(() => {
    // Use the bucket-converted epoch so the math sees a stable date
    // within the bucket window.
    const epochMs = Date.UTC(2000, 0, 1, 12) + (orbitBucket / 100) * MS_PER_CENTURY;
    const pts = orbitPathAU(body, epochMs, { useInclination: trueInclination, samples });
    const arr = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const sceneP = auVecToSceneUnits(pts[i]);
      const [x, y, z] = eclipticToThreePosition(sceneP);
      arr[i * 3 + 0] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [body, trueInclination, orbitBucket, samples]);

  if (!showOrbits || !bodyShown) return null;

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
