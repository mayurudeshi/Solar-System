import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  bodyPositionAU,
  auVecToSceneUnits,
  eclipticToThreePosition,
  DEG,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Each moon orbits its PARENT planet, not the Sun. We compute the moon's
// world position each frame as:
//   parent_heliocentric_position + moon_relative_orbit_position
//
// Moon relative orbit uses a simplified circular-plus-eccentricity model:
//   M = (epochMs / period_ms) × 2π          (mean anomaly)
//   ν ≈ M + 2e·sin(M)                       (Fourier approximation, fine for low-e moons)
//   r = a · (1 - e·cos(M))
// All moon eccentricities here are ≤ 0.06 so the approximation is plenty
// good for visualization (sub-pixel error on screen).

// Scale tuning — moons in true-linear scale relative to planets are
// invisible (Phobos is 22 km vs Mars 6779 km). We boost moon sphere
// radius to a perceptible minimum and exaggerate orbital distance.
const MIN_MOON_RADIUS = 0.18;
const MAX_MOON_RADIUS = 0.65;
const ORBIT_DISTANCE_BASE = 1.4;     // multiplier on planet scene radius
const ORBIT_DISTANCE_SCALE = 0.018;  // scene-units per parent-radius of true a_km

function moonRadius(moonDiaKm) {
  // Map 100 km → MIN, 5000 km → MAX. Logarithmic so the small moons
  // (Phobos, Deimos, Enceladus) don't completely vanish.
  const t = Math.min(1, Math.max(0, Math.log10(moonDiaKm) - 2) / 1.7);
  return MIN_MOON_RADIUS + (MAX_MOON_RADIUS - MIN_MOON_RADIUS) * t;
}

function orbitRadiusSceneUnits(moon, parent) {
  // a_km / parent_radius_km = how many parent-radii away the moon orbits.
  // Multiply by parent's RENDERED scene radius + a scale factor so the
  // smallest orbits don't sit inside the planet sphere.
  const aInParentRadii = moon.a_km / (parent.dia / 2);
  const sceneParentRadius = parent.dia > 40000 ? 2.4 : 0.9;
  return sceneParentRadius * ORBIT_DISTANCE_BASE
    + aInParentRadii * sceneParentRadius * ORBIT_DISTANCE_SCALE;
}

// Compute moon position in its parent's local frame (Three.js convention,
// y-up, parent at origin). Inclination >90° means retrograde — we flip
// the sign of the orbital angle to spin the moon backwards.
function moonRelativePosition(moon, epochMs) {
  const TWO_PI = Math.PI * 2;
  const periodMs = moon.period_d * 86400000;
  const M = (epochMs / periodMs) * TWO_PI;
  const e = moon.e;
  const nu = M + 2 * e * Math.sin(M);  // 1st-order Fourier
  const r = 1 - e * Math.cos(M);       // r/a
  const retro = moon.inc > 90 ? -1 : 1;
  const angle = retro * nu;
  const inc = (moon.inc > 90 ? 180 - moon.inc : moon.inc) * DEG;
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  // Tilt orbital plane about x-axis by inclination
  const y = z * Math.sin(inc);
  const z2 = z * Math.cos(inc);
  return { x, y, z: z2 };
}

export function Moon({ name, moon, parent }) {
  const ref = useRef();
  const { camera } = useThree();
  const setSelected = useStore((s) => s.setSelected);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);

  const radius = useMemo(() => moonRadius(moon.dia), [moon.dia]);
  const orbitRadius = useMemo(() => orbitRadiusSceneUnits(moon, parent), [moon, parent]);

  // LOD threshold: only show the moon when the camera is reasonably
  // close to its parent. Tighter than the first cut — moons stay hidden
  // at the default zoom level and fade in as you actually approach a
  // planet. Tuning: Callisto (orbitRadius ~6) → ~73 unit threshold;
  // default camera-to-Jupiter distance is ~95, so you have to move in.
  const LOD_DISTANCE = orbitRadius * 8 + 25;

  useFrame(() => {
    if (!ref.current) return;
    const { epochMs, spinEpochMs, trueInclination, showMoons } = useStore.getState();
    if (!showMoons) {
      if (visible) setVisible(false);
      return;
    }

    // Parent's heliocentric position
    const parentAU = bodyPositionAU(parent, epochMs, { useInclination: trueInclination });
    const parentScene = auVecToSceneUnits(parentAU);
    const [px, py, pz] = eclipticToThreePosition(parentScene);

    // Moon's relative position (using spinEpochMs so moons keep orbiting
    // their planets even when the system pause is active — same logic as
    // planet rotation: pause freezes heliocentric motion, not the local
    // dynamics).
    const rel = moonRelativePosition(moon, spinEpochMs);
    const x = px + rel.x * orbitRadius;
    const y = py + rel.y * orbitRadius;
    const z = pz + rel.z * orbitRadius;

    ref.current.position.set(x, y, z);

    // LOD: distance from camera to parent
    const dx = camera.position.x - px;
    const dy = camera.position.y - py;
    const dz = camera.position.z - pz;
    const distSq = dx * dx + dy * dy + dz * dz;
    const shouldShow = distSq < LOD_DISTANCE * LOD_DISTANCE;
    if (shouldShow !== visible) setVisible(shouldShow);
  });

  const onClick = (e) => {
    e.stopPropagation();
    setSelected(name);
  };
  const onPointerOver = (e) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };
  const onPointerOut = () => {
    setHovered(false);
    document.body.style.cursor = '';
  };

  if (!visible) return null;

  return (
    <mesh
      ref={ref}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <sphereGeometry args={[radius, 24, 24]} />
      <meshStandardMaterial
        color={moon.color}
        roughness={0.9}
        metalness={0.0}
        emissive={hovered ? new THREE.Color(moon.color) : new THREE.Color(0, 0, 0)}
        emissiveIntensity={hovered ? 0.2 : 0}
      />
    </mesh>
  );
}
