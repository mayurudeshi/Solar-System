import { useFrame } from '@react-three/fiber';
import { useStore } from '../state/useStore.js';

// Single global tick. Drives both epoch sources via tickSim:
//   - When NOT paused: both epochMs (orbit) and spinEpochMs (rotation) advance.
//   - When paused: only spinEpochMs advances. Orbital positions hold,
//     planets keep spinning at the current speed multiplier.
//
// Base rate: speed=1 → one real second of wall-clock advances simulation
// time by one day.
const MS_PER_DAY = 86400000;

export function SimClock() {
  useFrame((_, dt) => {
    const { speed, paused, tickSim } = useStore.getState();
    if (speed <= 0) return;
    tickSim(dt * speed * MS_PER_DAY, paused);
  });
  return null;
}
