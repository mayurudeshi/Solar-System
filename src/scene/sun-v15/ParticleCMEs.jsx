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

const MAX_PARTICLES = 2000;
const BURST_INTERVAL_S = 11.0;     // average seconds between CME emissions
const PARTICLES_PER_BURST = 220;
const PARTICLE_LIFETIME_S = 7.5;
const SURFACE_RADIUS = 3.4;        // photosphere radius — emit from here
const SPEED_MIN = 0.55;
const SPEED_MAX = 1.10;
const SPREAD_DEG = 14.0;           // cone half-angle around radial

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
  const lastBurstRef = useRef(0);

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

    const u = {
      uPointScale: { value: 800 },
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

    // Spawn next burst if it's time
    if (data.simSeconds - lastBurstRef.current >= BURST_INTERVAL_S) {
      lastBurstRef.current = data.simSeconds;
      const origin = randUnitVector(); // surface point direction
      for (let n = 0; n < PARTICLES_PER_BURST; n++) {
        // Find slot
        const i = data.cursor;
        data.cursor = (data.cursor + 1) % MAX_PARTICLES;
        // Position at surface
        const p = origin.clone().multiplyScalar(SURFACE_RADIUS);
        positions(geometry).setXYZ(i, p.x, p.y, p.z);
        // Velocity in a small cone around the radial outward direction
        const dir = tiltVector(origin.clone(), (SPREAD_DEG * Math.PI) / 180);
        const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
        data.velocities[i * 3]     = dir.x * speed;
        data.velocities[i * 3 + 1] = dir.y * speed;
        data.velocities[i * 3 + 2] = dir.z * speed;
        data.bornAt[i] = data.simSeconds;
        data.alive[i] = 1;
        geometry.attributes.aAge.array[i] = 0;
        geometry.attributes.aSize.array[i] = 12 + Math.random() * 12;
      }
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

// helper to write XYZ via setXYZ without depending on Three's BufferAttribute
function positions(geometry) {
  const attr = geometry.attributes.position;
  return {
    setXYZ(i, x, y, z) {
      attr.array[i * 3] = x;
      attr.array[i * 3 + 1] = y;
      attr.array[i * 3 + 2] = z;
    },
  };
}
