import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  bodyPositionAU,
  auVecToSceneUnits,
  eclipticToThreePosition,
  DEG,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

const TWO_PI = Math.PI * 2;
const MS_PER_HOUR = 3600000;
const SLOW_FACTOR = 10;

// Procedural fallback. Stays as the FIRST RENDER while the real CC-BY 4.0
// texture is fetched in the background, so the planet appears immediately
// and then sharpens up. Also the permanent texture when textureUrl is
// missing (currently nothing — every body has one).
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

function SaturnRings({ planetRadius, ringTexture }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[planetRadius * 1.3, planetRadius * 2.2, 96]} />
      <meshBasicMaterial
        map={ringTexture}
        color={ringTexture ? '#ffffff' : '#e3c78a'}
        side={THREE.DoubleSide}
        transparent
        opacity={ringTexture ? 0.9 : 0.5}
        alphaTest={ringTexture ? 0.02 : 0}
      />
    </mesh>
  );
}

function spinAtEpoch(rotHrs, epochMs, slow) {
  const periodMs = Math.abs(rotHrs) * MS_PER_HOUR;
  const sign = rotHrs < 0 ? -1 : 1;
  const factor = slow ? 1 / SLOW_FACTOR : 1;
  return sign * ((epochMs * factor) / periodMs) * TWO_PI;
}

// Async-load a real texture; resolve to null on failure so the procedural
// fallback persists.
function useAsyncTexture(url) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!url) { setTex(null); return; }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (cancelled) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        setTex(loaded);
      },
      undefined,
      () => { /* silent fail — procedural fallback remains */ }
    );
    return () => {
      cancelled = true;
      setTex((t) => { if (t) t.dispose(); return null; });
    };
  }, [url]);
  return tex;
}

export function Planet({ name, body }) {
  const orbitGroupRef = useRef();
  const tiltGroupRef = useRef();
  const spinMeshRef = useRef();
  const setSelected = useStore((s) => s.setSelected);
  const [hovered, setHovered] = useState(false);

  const radius = useMemo(() => bodyRadius(body), [body]);
  const banded = useMemo(
    () => ['Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(name),
    [name]
  );

  const procedural = useMemo(() => makeProceduralTexture(body.color, banded), [body, banded]);
  const real = useAsyncTexture(body.textureUrl);
  const ringTexture = useAsyncTexture(body.ringTextureUrl);
  const texture = real || procedural;

  const hitRadius = Math.max(radius * 1.6, 2.0);

  useFrame(() => {
    if (!orbitGroupRef.current) return;
    const { epochMs, spinEpochMs, trueInclination, showRotation, slowRotation } = useStore.getState();

    const auPos = bodyPositionAU(body, epochMs, { useInclination: trueInclination });
    const scenePos = auVecToSceneUnits(auPos);
    const [x, y, z] = eclipticToThreePosition(scenePos);
    orbitGroupRef.current.position.set(x, y, z);

    if (spinMeshRef.current) {
      spinMeshRef.current.rotation.y = showRotation
        ? spinAtEpoch(body.rot, spinEpochMs, slowRotation)
        : 0;
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
    <group ref={orbitGroupRef}>
      <group ref={tiltGroupRef} rotation={[0, 0, body.axial * DEG]}>
        <mesh ref={spinMeshRef}>
          <sphereGeometry args={[radius, 48, 48]} />
          <meshStandardMaterial
            map={texture}
            roughness={0.85}
            metalness={0.0}
            emissive={hovered ? new THREE.Color(body.color) : new THREE.Color(0, 0, 0)}
            emissiveIntensity={hovered ? 0.15 : 0}
          />
        </mesh>
        {name === 'Saturn' && (
          <SaturnRings planetRadius={radius} ringTexture={ringTexture} />
        )}
      </group>
      <mesh
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        visible={false}
      >
        <sphereGeometry args={[hitRadius, 16, 16]} />
      </mesh>
    </group>
  );
}
