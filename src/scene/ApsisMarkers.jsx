import { useMemo } from 'react';
import {
  getElementsAtDate,
  perifocalToEcliptic,
  auVecToSceneUnits,
  eclipticToThreePosition,
  DEG,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Small spheres at perihelion (closest to Sun) and aphelion (farthest) for
// orbits eccentric enough to be interesting. Mercury, Mars, Jupiter,
// Saturn, Uranus, Pluto qualify. Venus / Earth / Neptune are too circular.
//
// Like OrbitPath, positions are bucketed by century — they drift on
// secular timescales, not per-frame. Recomputed when trueInclination toggles.
const PERI_COLOR = '#ff8c6e';
const APO_COLOR = '#78b4ff';
const MARKER_RADIUS = 0.5;
const MIN_E_FOR_DISPLAY = 0.04;
const MS_PER_CENTURY = 36525 * 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export function ApsisMarkers({ body }) {
  const showApsides     = useStore((s) => s.showApsides);
  const trueInclination = useStore((s) => s.trueInclination);
  const orbitBucket     = useStore((s) =>
    Math.floor(((s.epochMs - J2000_MS) / MS_PER_CENTURY) * 100)
  );

  const positions = useMemo(() => {
    const epochMs = J2000_MS + (orbitBucket / 100) * MS_PER_CENTURY;
    const date = new Date(epochMs);
    if (!Number.isFinite(date.getTime())) return null;

    const el = getElementsAtDate(body.elements, date);
    if (el.e < MIN_E_FOR_DISPLAY) return null;

    const argp_deg = el.long_peri - el.raan;
    const raan = el.raan * DEG;
    const argp = argp_deg * DEG;
    const inc  = (trueInclination ? el.I : 0) * DEG;
    const a = el.a, e = el.e;

    return {
      peri: perifocalToEcliptic({ nu: 0,         r: a * (1 - e), raan, argp, inc }),
      apo:  perifocalToEcliptic({ nu: Math.PI,   r: a * (1 + e), raan, argp, inc }),
    };
  }, [body, trueInclination, orbitBucket]);

  if (!showApsides || !positions) return null;

  const [px, py, pz] = eclipticToThreePosition(auVecToSceneUnits(positions.peri));
  const [ax, ay, az] = eclipticToThreePosition(auVecToSceneUnits(positions.apo));

  return (
    <group>
      <mesh position={[px, py, pz]}>
        <sphereGeometry args={[MARKER_RADIUS, 12, 12]} />
        <meshBasicMaterial color={PERI_COLOR} />
      </mesh>
      <mesh position={[ax, ay, az]}>
        <sphereGeometry args={[MARKER_RADIUS, 12, 12]} />
        <meshBasicMaterial color={APO_COLOR} />
      </mesh>
    </group>
  );
}
