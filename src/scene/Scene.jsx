import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Sun } from './Sun.jsx';
import { Starfield } from './Starfield.jsx';
import { Planet } from './Planet.jsx';
import { OrbitPath } from './OrbitPath.jsx';
import { BODIES, BODY_NAMES } from '../data/bodies.js';

// Top-level R3F canvas. Renders Sun + starfield + every body + its orbit
// line. Positions are driven by `useStore.date` via `bodyPositionAU`.
export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 60, 95], fov: 50, near: 0.1, far: 5000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
      style={{ position: 'fixed', inset: 0, background: '#03040a' }}
    >
      <ambientLight intensity={0.35} color="#404a5c" />
      <Sun />
      <Starfield />
      {BODY_NAMES.map((name) => (
        <Planet key={name} name={name} body={BODIES[name]} />
      ))}
      {BODY_NAMES.map((name) => (
        <OrbitPath key={`orbit-${name}`} body={BODIES[name]} />
      ))}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={1600}
      />
    </Canvas>
  );
}
