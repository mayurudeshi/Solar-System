import { useFrame } from '@react-three/fiber';
import { useStore } from '../state/useStore.js';

// Single global tick that advances simulated time. Base rate: at speed=1,
// one real second of wall-clock advances the simulation by ONE DAY.
//
//   1× → Earth orbit in ~365 real seconds (~6 minutes)
//   8× → Earth orbit in ~46 real seconds
//
// Lives in the R3F tree (mounted from Scene.jsx) so it has a useFrame
// host. Returns null — no scene contribution beyond writing the store.
const MS_PER_DAY = 86400000;

export function SimClock() {
  useFrame((_, dt) => {
    const { speed, paused, epochMs, setEpochMs } = useStore.getState();
    if (paused || speed === 0) return;
    // dt is the real-time delta in seconds. Multiply by speed (days/sec)
    // and ms-per-day to get the simulated ms to advance.
    setEpochMs(epochMs + dt * speed * MS_PER_DAY);
  });
  return null;
}
