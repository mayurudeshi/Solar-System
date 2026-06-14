import { Canvas } from '@react-three/fiber';
import { Sun } from './Sun.jsx';
import { SunV15 } from './sun-v15/SunV15.jsx';
import { Starfield } from './Starfield.jsx';
import { MilkyWaySkybox } from './MilkyWaySkybox.jsx';
import { Planet } from './Planet.jsx';
import { OrbitPath } from './OrbitPath.jsx';
import { ApsisMarkers } from './ApsisMarkers.jsx';
import { Moon } from './Moon.jsx';
import { SimClock } from './SimClock.jsx';
import { VantageCamera } from './VantageCamera.jsx';
import { BODIES, PLANET_NAMES } from '../data/bodies.js';
import { MOONS, MOON_NAMES } from '../data/moons.js';
import { useStore } from '../state/useStore.js';

export function Scene() {
  const sunV15 = useStore((s) => s.sunV15);
  return (
    <Canvas
      camera={{ position: [0, 60, 95], fov: 50, near: 0.1, far: 5000 }}
      gl={{ antialias: true }}
      dpr={[1, 2]}
      // Kill the right-click context menu over the canvas so right-drag pan
      // doesn't pop the menu / trigger Vivaldi's back gesture (MJ 2026-06-14).
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', inset: 0, background: '#03040a' }}
    >
      <ambientLight intensity={0.35} color="#404a5c" />
      <MilkyWaySkybox />
      {sunV15 ? <SunV15 /> : <Sun />}
      <Starfield />
      {PLANET_NAMES.map((name) => (
        <Planet key={name} name={name} body={BODIES[name]} />
      ))}
      {PLANET_NAMES.map((name) => (
        <OrbitPath key={`orbit-${name}`} name={name} body={BODIES[name]} />
      ))}
      {PLANET_NAMES.map((name) => (
        <ApsisMarkers key={`apsis-${name}`} name={name} body={BODIES[name]} />
      ))}
      {MOON_NAMES.map((name) => (
        <Moon
          key={`moon-${name}`}
          name={name}
          moon={MOONS[name]}
          parent={BODIES[MOONS[name].parent]}
        />
      ))}
      <SimClock />
      <VantageCamera />
    </Canvas>
  );
}
