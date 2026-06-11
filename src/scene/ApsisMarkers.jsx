import { useMemo } from 'react';
import { Text, Billboard } from '@react-three/drei';
import {
  getElementsAtDate,
  perifocalToEcliptic,
  auVecToSceneUnits,
  eclipticToThreePosition,
  DEG,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Apsis labels at perihelion ("P", closest to Sun) and aphelion ("A",
// farthest). Letters instead of spheres so they read as MARKERS rather
// than tiny bodies, and so Aaron picks up the vocabulary on sight.
// Billboarded — always face the camera.
//
// Filter: only show when e ≥ 0.04. Mercury, Mars, Jupiter, Saturn,
// Uranus, Pluto qualify; Venus / Earth / Neptune are too circular.
const PERI_COLOR = '#ff8c6e';
const APO_COLOR  = '#78b4ff';
const FONT_SIZE = 2.2;
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
      peri: perifocalToEcliptic({ nu: 0,       r: a * (1 - e), raan, argp, inc }),
      apo:  perifocalToEcliptic({ nu: Math.PI, r: a * (1 + e), raan, argp, inc }),
    };
  }, [body, trueInclination, orbitBucket]);

  if (!showApsides || !positions) return null;

  const [px, py, pz] = eclipticToThreePosition(auVecToSceneUnits(positions.peri));
  const [ax, ay, az] = eclipticToThreePosition(auVecToSceneUnits(positions.apo));

  return (
    <group>
      <Billboard position={[px, py, pz]}>
        <Text
          color={PERI_COLOR}
          fontSize={FONT_SIZE}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#03040a"
        >
          P
        </Text>
      </Billboard>
      <Billboard position={[ax, ay, az]}>
        <Text
          color={APO_COLOR}
          fontSize={FONT_SIZE}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#03040a"
        >
          A
        </Text>
      </Billboard>
    </group>
  );
}
