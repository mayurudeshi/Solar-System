import { Canvas } from '@react-three/fiber';
import { Sun } from './Sun.jsx';
import { Starfield } from './Starfield.jsx';
import { Planet } from './Planet.jsx';
import { OrbitPath } from './OrbitPath.jsx';
import { ApsisMarkers } from './ApsisMarkers.jsx';
import { SimClock } from './SimClock.jsx';
import { VantageCamera } from './VantageCamera.jsx';
import { BODIES, PLANET_NAMES } from '../data/bodies.js';

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
      {PLANET_NAMES.map((name) => (
        <Planet key={name} name={name} body={BODIES[name]} />
      ))}
      {PLANET_NAMES.map((name) => (
        <OrbitPath key={`orbit-${name}`} body={BODIES[name]} />
      ))}
      {PLANET_NAMES.map((name) => (
        <ApsisMarkers key={`apsis-${name}`} body={BODIES[name]} />
      ))}
      <SimClock />
      <VantageCamera />
    </Canvas>
  );
}
