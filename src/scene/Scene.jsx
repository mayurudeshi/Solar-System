import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Sun } from './Sun.jsx';
import { Starfield } from './Starfield.jsx';

// Top-level R3F canvas. Scaffold renders only Sun + Starfield to prove
// the build → push → deploy → R3F pipeline. Planets/orbits/moons land in
// subsequent passes once positioning math is implemented and reviewed.
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
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={1600}
      />
    </Canvas>
  );
}
