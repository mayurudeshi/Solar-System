import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CME_PARTICLE_VERT, CME_PARTICLE_FRAG } from './shaders.js';

// v1.5 CMEs: real particle clusters traveling radially OUTWARD through
// 3D space. Each burst spawns N particles at a random surface point with
// outward radial velocity + small random spread. Each particle's position
// is integrated per frame; alpha fades over its lifetime. The cluster
// reads as a volumetric tendril — true LASCO-style outward eruption.
//
// CPU-side particle pool (a fixed-size BufferGeometry whose attributes
// we mutate every frame) is the simplest portable approach. GPU
// transform feedback would be faster but is webgl2-only and overkill
// for the particle counts we need here (~2000 total active).

const MAX_PARTICLES = 2400;
const TRACK_INTERVAL_S = 11.0;     // seconds between bursts on ONE track
const NUM_TRACKS = 2;              // staggered tracks → constant activity
const PARTICLES_PER_BURST = 180;
const PARTICLE_LIFETIME_S = 8.0;
const SURFACE_RADIUS = 3.4;        // photosphere radius — emit from here
const SPEED_MIN = 0.50;
const SPEED_MAX = 1.20;
const SPREAD_DEG = 16.0;           // cone half-angle around radial
const PATCH_DEG = 8.0;             // surface patch the particles spawn FROM

function randUnitVector() {
  // Uniform random point on unit sphere
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t));
}

function tiltVector(base, halfAngleRad) {
  // Random direction within a cone of half-angle around `base`
  const cosA = Math.cos(halfAngleRad);
  const z = cosA + (1 - cosA) * Math.random();
  const phi = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  const local = new THREE.Vector3(s * Math.cos(phi), s * Math.sin(phi), z);
  // Build a basis around `base`
  const up = Math.abs(base.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, base).normalize();
  const v = new THREE.Vector3().crossVectors(base, u);
  return new THREE.Vector3()
    .addScaledVector(u, local.x)
    .addScaledVector(v, local.y)
    .addScaledVector(base, local.z);
}

export function ParticleCMEs() {
  const pointsRef = useRef();
  const dataRef = useRef(null);
  // One last-burst timestamp per track so the tracks fire independently
  // and stay staggered. Initial offsets spread tracks evenly across one
  // interval so they don't both fire at t=0.
  const lastBurstRef = useRef(
    Array.from({ length: NUM_TRACKS }, (_, i) => -i * (TRACK_INTERVAL_S / NUM_TRACKS))
  );

  // Pre-allocate all GPU buffers once. Each particle has position(3),
  // age(1), and size(1). Inactive particles are kept at the origin with
  // age = 1.0 (= dead) so they're discarded in the fragment shader.
  const { geometry, uniforms } = useMemo(() => {
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const ages = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) ages[i] = 1.0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aAge', new THREE.BufferAttribute(ages, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    // uPointScale: pixel-size multiplier in the vertex shader. At ~80
    // each particle renders 10–25 px at a typical Sun-vantage zoom.
    // Was 800 — particles overran into a single saturated white cloud
    // that swallowed the Sun. Tuned conservatively to start.
    const u = {
      uPointScale: { value: 80 },
    };

    return { geometry: g, uniforms: u };
  }, []);

  // CPU-side dynamics: velocity per particle, born_at_seconds per particle.
  useEffect(() => {
    dataRef.current = {
      velocities: new Float32Array(MAX_PARTICLES * 3),
      bornAt: new Float32Array(MAX_PARTICLES),
      alive: new Uint8Array(MAX_PARTICLES),
      cursor: 0,
      simSeconds: 0,
    };
  }, []);

  useFrame((_, dtSec) => {
    if (!dataRef.current) return;
    const data = dataRef.current;
    data.simSeconds += dtSec;

    // Fire any track whose interval has elapsed. Tracks share the spawn
    // pool but pick their own origin point so eruptions happen at
    // independent random surface locations.
    let didSpawn = false;
    for (let track = 0; track < NUM_TRACKS; track++) {
      if (data.simSeconds - lastBurstRef.current[track] < TRACK_INTERVAL_S) continue;
      lastBurstRef.current[track] = data.simSeconds;
      const origin = randUnitVector();
      const posArrLocal = geometry.attributes.position.array;
      const ageArrLocal = geometry.attributes.aAge.array;
      const sizeArr = geometry.attributes.aSize.array;
      const patchRad = (PATCH_DEG * Math.PI) / 180;
      const spreadRad = (SPREAD_DEG * Math.PI) / 180;
      for (let n = 0; n < PARTICLES_PER_BURST; n++) {
        const i = data.cursor;
        data.cursor = (data.cursor + 1) % MAX_PARTICLES;
        // Each particle spawns from a slightly different point on a small
        // surface patch around origin — looks like a cluster eruption
        // instead of a point source.
        const spawnDir = tiltVector(origin.clone(), patchRad);
        const p = spawnDir.clone().multiplyScalar(SURFACE_RADIUS);
        posArrLocal[i * 3]     = p.x;
        posArrLocal[i * 3 + 1] = p.y;
        posArrLocal[i * 3 + 2] = p.z;
        // Velocity outward from THAT particle's surface point (not the
        // patch centre), so the eruption fans out radially as a whole
        // and particles don't all converge or diverge oddly.
        const velDir = tiltVector(spawnDir.clone(), spreadRad);
        const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
        data.velocities[i * 3]     = velDir.x * speed;
        data.velocities[i * 3 + 1] = velDir.y * speed;
        data.velocities[i * 3 + 2] = velDir.z * speed;
        data.bornAt[i] = data.simSeconds;
        data.alive[i] = 1;
        ageArrLocal[i] = 0;
        sizeArr[i] = 5 + Math.random() * 7;
      }
      didSpawn = true;
    }
    if (didSpawn) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAge.needsUpdate = true;
      geometry.attributes.aSize.needsUpdate = true;
    }

    // Integrate alive particles
    const posArr = geometry.attributes.position.array;
    const ageArr = geometry.attributes.aAge.array;
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!data.alive[i]) continue;
      const age = data.simSeconds - data.bornAt[i];
      if (age >= PARTICLE_LIFETIME_S) {
        data.alive[i] = 0;
        ageArr[i] = 1.0;
        dirty = true;
        continue;
      }
      posArr[i * 3]     += data.velocities[i * 3]     * dtSec;
      posArr[i * 3 + 1] += data.velocities[i * 3 + 1] * dtSec;
      posArr[i * 3 + 2] += data.velocities[i * 3 + 2] * dtSec;
      ageArr[i] = age / PARTICLE_LIFETIME_S;
      dirty = true;
    }
    if (dirty) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAge.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={CME_PARTICLE_VERT}
        fragmentShader={CME_PARTICLE_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

