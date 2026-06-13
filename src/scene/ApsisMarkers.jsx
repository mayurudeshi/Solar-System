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
// Filter: only skip TRULY circular orbits (e ≈ 0) where the peri/apo
// DIRECTION is mathematically undefined. Every real planet has a nonzero
// eccentricity (Venus, the most circular, is e≈0.0068), so all of them
// show A/P. Previously this threshold was 0.04, which silently hid Venus,
// Earth, and Neptune — MJ correctly flagged that as an inconsistency
// (2026-06-13). The markers are well-defined at any nonzero e: perihelion
// is just the orbit-orientation direction, independent of how elliptical
// the orbit is.
const PERI_COLOR = '#ff8c6e';
const APO_COLOR  = '#78b4ff';
const FONT_SIZE = 2.2;
const MIN_E_FOR_DISPLAY = 0.0005;
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
