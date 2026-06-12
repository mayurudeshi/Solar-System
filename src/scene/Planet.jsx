import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  bodyPositionAU,
  auVecToSceneUnits,
  eclipticToThreePosition,
  spinAtEpoch,
  DEG,
} from '../lib/orbital.js';
import { useStore } from '../state/useStore.js';

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

// Saturn rings — two-layer LOD system:
//
//   1. A smooth alpha-mapped disc with the real ring texture (shows the
//      Cassini Division + the B/A ring bands). Dominant at distance.
//   2. A field of ~4000 particles distributed across the ring, each
//      orbiting at its own Keplerian angular velocity (ω ∝ r^-1.5 so
//      inner particles outpace outer ones). Dominant up close.
//
// The two crossfade based on camera distance to Saturn — far view stays
// the recognizable disc, close-up reveals what the disc really IS.
const PARTICLE_COUNT = 4000;
// Crossfade window:
//   dist > 35  → pure disc (particles fully off)
//   dist 10-35 → crossfade
//   dist < 10  → pure particles, disc fully invisible
// MJ flagged 2026-06-11 that the disc was still readable at "literally
// touching Saturn" zoom — pulled FAR out (start fading sooner) and
// made the disc opacity go to 0 (not 0.05) at NEAR so close-up is
// 100% particle field.
const FAR_THRESHOLD = 35;
const NEAR_THRESHOLD = 10;

function SaturnRings({ planetRadius, ringTexture }) {
  const groupRef = useRef();
  const ringMeshRef = useRef();
  const pointsRef = useRef();
  const { camera } = useThree();

  const INNER = planetRadius * 1.25;
  const OUTER = planetRadius * 2.30;

  // Disc geometry — swap UVs so the horizontal-strip ring texture's
  // radial profile maps to the geometry's radial direction.
  const ringGeom = useMemo(() => {
    const g = new THREE.RingGeometry(INNER, OUTER, 192, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, v, u);
    }
    return g;
  }, [INNER, OUTER]);

  // Particle field. Radii biased toward middle (B-ring dense region).
  // Built in the XY plane (z = tiny thickness) to MATCH the RingGeometry's
  // native plane — so the wrapping group's [π/2, 0, 0] rotation moves
  // BOTH disc and particles into the ecliptic XZ plane together. Earlier
  // version put particles in XZ pre-rotation, which then got rotated 90°
  // OUT of the disc plane — particles ended up perpendicular to the rings.
  const particleState = useRef(null);
  const particleGeom = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const radii = new Float32Array(PARTICLE_COUNT);
    const angles = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = Math.pow(Math.random(), 0.7);
      const r = INNER + (OUTER - INNER) * t;
      const a = Math.random() * Math.PI * 2;
      radii[i] = r;
      angles[i] = a;
      positions[i * 3]     = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.sin(a) * r;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.02; // ring thickness
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleState.current = { radii, angles };
    return g;
  }, [INNER, OUTER]);

  const tmpWorld = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!groupRef.current) return;

    // Advance particles by Kepler. ω ∝ r^-1.5; normalise so inner-edge
    // particles complete one revolution per ~10 sim hours (Saturn's own
    // 10.66 hr day for visual parity).
    const points = pointsRef.current;
    if (points && particleState.current) {
      const spinEpoch = useStore.getState().spinEpochMs;
      const tHrs = spinEpoch / 3600000;
      const { radii, angles } = particleState.current;
      const positions = points.geometry.attributes.position;
      const arr = positions.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const r = radii[i];
        const omega = Math.pow(INNER / r, 1.5);
        const a = angles[i] + tHrs * omega * 0.6;
        arr[i * 3]     = Math.cos(a) * r;
        arr[i * 3 + 1] = Math.sin(a) * r;
        // arr[i * 3 + 2] stays as init thickness — no per-frame update.
      }
      positions.needsUpdate = true;
    }

    // LOD: distance from camera to ring centre (= Saturn position).
    groupRef.current.getWorldPosition(tmpWorld.current);
    const dist = camera.position.distanceTo(tmpWorld.current);
    const t = Math.max(
      0, Math.min(1, (FAR_THRESHOLD - dist) / (FAR_THRESHOLD - NEAR_THRESHOLD))
    );

    // Crossfade only inside the [NEAR, FAR] window. Outside it, hard off.
    // Disc 0.9 → 0.05, particles 0 → 0.9. Also gate `visible` so the
    // particle points don't ghost-render with sizeAttenuation at distance.
    if (ringMeshRef.current?.material) {
      ringMeshRef.current.material.opacity = 0.9 * (1 - t);
    }
    if (pointsRef.current) {
      pointsRef.current.visible = t > 0.001;
      if (pointsRef.current.material) {
        pointsRef.current.material.opacity = 0.9 * t;
      }
    }
  });

  return (
    <group ref={groupRef} rotation={[Math.PI / 2, 0, 0]}>
      <mesh ref={ringMeshRef} geometry={ringGeom}>
        {/* depthWrite=true so the disc occludes the particles behind it
            properly. The earlier depthWrite=false was creating layered
            transparency artifacts at close zoom — the dark irregular
            silhouette MJ flagged. */}
        <meshBasicMaterial
          map={ringTexture}
          color={ringTexture ? '#ffffff' : '#e3c78a'}
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
          alphaTest={ringTexture ? 0.05 : 0}
        />
      </mesh>
      <points ref={pointsRef} geometry={particleGeom}>
        <pointsMaterial
          color="#f0e6c8"
          size={0.06}
          transparent
          opacity={0}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
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

  // Hit-sphere kept tight (no 2.0 floor) so it doesn't swallow moons that
  // orbit close to their planet. Phobos/Deimos sit at ~1.6-1.7 from Mars
  // center — the old 2.0 floor meant clicks on the moons hit the Mars
  // shell first via raycast ordering, and Mars won the event every time.
  const hitRadius = Math.max(radius * 1.4, 1.3);

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
