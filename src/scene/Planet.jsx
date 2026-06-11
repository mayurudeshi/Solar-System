import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  bodyPositionAU,
  auVecToSceneUnits,
  eclipticToThreePosition,
  DEG,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

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

function bodyRadius(body) {
  return body.dia > 40000 ? 2.4 : 0.9;
}

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
  const setSelected = useStore((s) => s.setSelected);
  const [hovered, setHovered] = useState(false);

  const radius = useMemo(() => bodyRadius(body), [body]);
  const banded = useMemo(
    () => ['Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(name),
    [name]
  );
  const texture = useMemo(() => makeProceduralTexture(body.color, banded), [body, banded]);

  // Boost small planets' raycaster hit-target without changing visible radius —
  // reviewer 3's accessibility point. The invisible mesh is at 1.6× radius.
  const hitRadius = Math.max(radius * 1.6, 2.0);

  useFrame(() => {
    if (!groupRef.current) return;
    const { epochMs, trueInclination } = useStore.getState();
    const auPos = bodyPositionAU(body, epochMs, { useInclination: trueInclination });
    const scenePos = auVecToSceneUnits(auPos);
    const [x, y, z] = eclipticToThreePosition(scenePos);
    groupRef.current.position.set(x, y, z);
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003;
    }
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

  return (
    <group ref={groupRef}>
      <mesh
        ref={meshRef}
        rotation={[0, 0, body.axial * DEG]}
      >
        <sphereGeometry args={[radius, 40, 40]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.85}
          metalness={0.0}
          emissive={hovered ? new THREE.Color(body.color) : new THREE.Color(0, 0, 0)}
          emissiveIntensity={hovered ? 0.15 : 0}
        />
      </mesh>
      {/* Invisible hit-mesh — boosts pick target for Mercury/Mars touch input. */}
      <mesh
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        visible={false}
      >
        <sphereGeometry args={[hitRadius, 16, 16]} />
      </mesh>
      {name === 'Saturn' && <SaturnRings planetRadius={radius} />}
    </group>
  );
}
