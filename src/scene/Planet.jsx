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


// Earth cloud layer. Transparent sphere slightly outside Earth, lit by
// the Sun's pointLight (so it's naturally dark on the night side), with
// the cloud texture driving alpha — bright pixels = clouds, dark pixels
// = clear sky transparent over the surface map below. Clouds rotate
// slightly FASTER than the surface — upper-atmosphere winds drift faster
// than Earth's rotation, so we set the cloud rotation period to 23.0h
// vs Earth's 23.93h. Slow, but you'll see it over a sim-minute.
//
// Why a dedicated texture loader instead of useAsyncTexture: the shared
// loader sets colorSpace=SRGB, which is correct for color maps but WRONG
// for alphaMaps — sRGB gamma compresses the dark cloud edges into
// near-zero alpha before the material reads them. We need NoColorSpace
// (read pixel values literally) so a grayscale 0.5 means alpha 0.5.
function EarthClouds({ planetRadius }) {
  const cloudsRef = useRef();
  const [tex, setTex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load('/textures/2k_earth_clouds.jpg', (loaded) => {
      if (cancelled) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.NoColorSpace;
      loaded.anisotropy = 4;
      setTex(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  useFrame(() => {
    if (!cloudsRef.current) return;
    const { spinEpochMs, showRotation, slowRotation } = useStore.getState();
    cloudsRef.current.rotation.y = showRotation
      ? spinAtEpoch(23.0, spinEpochMs, slowRotation)
      : 0;
  });

  if (!tex) return null;

  return (
    <mesh ref={cloudsRef}>
      <sphereGeometry args={[planetRadius * 1.03, 48, 48]} />
      <meshStandardMaterial
        color="#ffffff"
        alphaMap={tex}
        transparent
        opacity={1.0}
        roughness={1.0}
        metalness={0.0}
        depthWrite={false}
      />
    </mesh>
  );
}


// Ice-giant atmospheric detail (v1.6.2). The stock Uranus texture is
// near-featureless, so (a) you can't see it rotate and (b) it lacks the
// banding + storms the real planet has. This draws a procedural RGBA
// overlay — latitude bands + a storm — onto a sphere just outside the
// planet, locked to the planet's exact rotation so it reads as surface
// features and makes the spin obvious. Lit by the Sun's point light.
//
// ONLY Uranus uses this. Neptune's stock texture is fine (MJ 2026-06-14:
// "Neptune is fine... it's Uranus"). Jupiter/Saturn have detailed real
// textures already. The Neptune branch below is kept generic in case we
// ever want it, but nothing mounts it.
function makeGiantDetailTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 512); // transparent base — only features paint

  const isNeptune = kind === 'Neptune';
  // ── Latitude bands — NEPTUNE ONLY ───────────────────────────────────
  // MJ 2026-06-14: bands on Uranus read as a "circus ball." Uranus keeps
  // ONLY the white storm spot below — a single clean rotation marker that
  // also shows off its sideways (north-south) spin. Bands stay in the
  // generator for Neptune in case it's ever mounted.
  if (isNeptune) {
    const bandCount = 9;
    for (let i = 0; i < bandCount; i++) {
      const y = (i + 0.5) * (512 / bandCount);
      const h = 512 / bandCount;
      const dark = i % 2 === 0;
      const a = dark ? 0.16 : 0.06;
      ctx.fillStyle = dark ? `rgba(10, 20, 55, ${a})` : `rgba(210, 230, 255, ${a})`;
      ctx.fillRect(0, y - h / 2, 1024, h);
    }
  }

  // ── Great Dark Spot (Neptune) / faint storm (Uranus) ────────────────
  // Drawn as a soft dark ellipse at a characteristic mid-southern latitude.
  const spotX = isNeptune ? 360 : 620;
  const spotY = isNeptune ? 320 : 300;
  const rx = isNeptune ? 95 : 70;
  const ry = isNeptune ? 60 : 48;
  const grad = ctx.createRadialGradient(spotX, spotY, 4, spotX, spotY, rx);
  if (isNeptune) {
    grad.addColorStop(0, 'rgba(6, 12, 40, 0.85)');
    grad.addColorStop(0.7, 'rgba(8, 16, 48, 0.45)');
    grad.addColorStop(1, 'rgba(8, 16, 48, 0.0)');
  } else {
    // Uranus is already pale, so a faint white cloud vanishes. Make it a
    // BRIGHT, sharper white spot with a hot core so it's a clear trackable
    // marker (MJ wants the white spot as the rotation indicator).
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.4, 'rgba(245, 252, 255, 0.55)');
    grad.addColorStop(1, 'rgba(240, 250, 255, 0.0)');
  }
  ctx.save();
  ctx.translate(spotX, spotY); ctx.scale(1, ry / rx); ctx.translate(-spotX, -spotY);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(spotX, spotY, rx, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Bright methane companion cloud (Neptune only) ───────────────────
  if (isNeptune) {
    const cg = ctx.createRadialGradient(spotX + 130, spotY + 36, 2, spotX + 130, spotY + 36, 46);
    cg.addColorStop(0, 'rgba(245, 250, 255, 0.55)');
    cg.addColorStop(1, 'rgba(245, 250, 255, 0.0)');
    ctx.fillStyle = cg;
    ctx.save();
    ctx.translate(spotX + 130, spotY + 36); ctx.scale(1.8, 0.5); ctx.translate(-(spotX + 130), -(spotY + 36));
    ctx.beginPath(); ctx.arc(spotX + 130, spotY + 36, 46, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function IceGiantDetail({ name, planetRadius, rot }) {
  const ref = useRef();
  const tex = useMemo(() => makeGiantDetailTexture(name), [name]);

  useFrame(() => {
    if (!ref.current) return;
    const { spinEpochMs, showRotation, slowRotation } = useStore.getState();
    // Lock to the planet's EXACT rotation so the bands/spot read as surface.
    ref.current.rotation.y = showRotation
      ? spinAtEpoch(rot, spinEpochMs, slowRotation)
      : 0;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[planetRadius * 1.006, 64, 64]} />
      <meshStandardMaterial
        map={tex}
        transparent
        opacity={1.0}
        roughness={0.9}
        metalness={0.0}
        depthWrite={false}
      />
    </mesh>
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
  const visible = useStore((s) => s.bodyVisible[name] !== false);
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

  // v1.6: `visible` toggles the whole planet. Keep the group MOUNTED (so
  // the useFrame position ref stays alive) but invisible; gate the click
  // target so a hidden planet can't be clicked (R3F raycasts invisible
  // meshes that carry handlers, so we conditionally render it instead).
  return (
    <group ref={orbitGroupRef} visible={visible}>
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
        {name === 'Earth' && (
          <EarthClouds planetRadius={radius} />
        )}
        {name === 'Uranus' && (
          <IceGiantDetail name={name} planetRadius={radius} rot={body.rot} />
        )}
      </group>
      {visible && (
        <mesh
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          visible={false}
        >
          <sphereGeometry args={[hitRadius, 16, 16]} />
        </mesh>
      )}
    </group>
  );
}
