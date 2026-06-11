import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bodyPositionAU, auVecToSceneUnits, DEG } from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

// Procedural fallback texture — banded planets get horizontal stripes,
// rocky planets get noisy speckle. Matches the POC's degraded-graceful
// pattern; real Solar System Scope textures swap in at v1.1.
function makeProceduralTexture(hex, banded) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 128);
  const base = new THREE.Color(hex);
  const passes = banded ? 14 : 60;
  for (let i = 0; i < passes; i++) {
    const y = Math.random() * 128;
    const h = banded ? 4 + Math.random() * 8 : 1 + Math.random() * 2;
    const shade = base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.18);
    const r = (shade.r * 255) | 0, g = (shade.g * 255) | 0, b = (shade.b * 255) | 0;
    ctx.fillStyle = `rgba(${r},${g},${b},${banded ? 0.5 : 0.25})`;
    if (banded) ctx.fillRect(0, y, 256, h);
    else        ctx.fillRect(Math.random() * 256, y, h * 8, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Render diameter — body sphere radii are NOT to true scale. True scale
// would make every planet a sub-pixel dot at the distances we're showing.
// The POC's "small=0.9, big=2.4" split is preserved.
function bodyRadius(body) {
  return body.dia > 40000 ? 2.4 : 0.9;
}

// Saturn ring as a flat ring geometry around the planet sphere.
// Real ring texture swaps in at v1.1.
function SaturnRings({ planetRadius }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[planetRadius * 1.3, planetRadius * 2.2, 64]} />
      <meshBasicMaterial
        color="#e3c78a"
        side={THREE.DoubleSide}
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

export function Planet({ name, body }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const date = useStore((s) => s.date);
  const setSelected = useStore((s) => s.setSelected);

  // Texture, radius, banded — derived once per body.
  const radius = useMemo(() => bodyRadius(body), [body]);
  const banded = useMemo(
    () => ['Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(name),
    [name]
  );
  const texture = useMemo(() => makeProceduralTexture(body.color, banded), [body, banded]);

  // Re-compute position each frame, driven by the store's current `date`.
  // (Cheap — 9 bodies × Kepler iteration per frame is ~negligible.)
  useFrame(() => {
    if (!groupRef.current) return;
    const auPos = bodyPositionAU(body, date);
    const scenePos = auVecToSceneUnits(auPos);
    groupRef.current.position.set(scenePos.x, scenePos.z, -scenePos.y);
    // ECL X→ scene X, ECL Z→ scene Y (vertical),
    // ECL Y→ negative scene Z (right-handed → Three.js).
    if (meshRef.current) {
      // Slow spin so the texture is alive on close-up; not physically accurate.
      meshRef.current.rotation.y += 0.003;
    }
  });

  const onClick = (e) => {
    e.stopPropagation();
    setSelected(name);
  };

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        rotation={[0, 0, body.axial * DEG]}
        onClick={onClick}
      >
        <sphereGeometry args={[radius, 40, 40]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.85}
          metalness={0.0}
        />
      </mesh>
      {name === 'Saturn' && <SaturnRings planetRadius={radius} />}
    </group>
  );
}
