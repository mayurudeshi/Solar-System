import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../../state/useStore.js';
import { sunActivity } from '../../sun/activity.js';

// Steps the shared solar-activity model once per frame on sim time, handles
// the Fire CME button, and publishes a small summary to the store (~4 Hz) for
// the on-screen readout. Mounted before the Sun's visual layers so they all
// read the same state each frame.
export function SunActivityDriver() {
  const camera = useThree((s) => s.camera);
  const cmeNonce = useStore((s) => s.cmeNonce);
  const lastPublish = useRef(0);
  const firstNonce = useRef(true);

  useEffect(() => {
    if (firstNonce.current) { firstNonce.current = false; return; }
    sunActivity.fire(camera.position, useStore.getState());
  }, [cmeNonce, camera]);

  useEffect(() => {
    try { window.__fireCME = () => useStore.getState().fireCME(); } catch { /* no-op */ }
    return () => { try { delete window.__fireCME; } catch { /* no-op */ } };
  }, []);

  useFrame(() => {
    const st = useStore.getState();
    sunActivity.step(st.epochMs, st, st.config.sunCycleScale ?? 1);

    const now = performance.now();
    if (now - lastPublish.current > 250) {
      lastPublish.current = now;
      st.setSunInfo({
        cycle: sunActivity.cycle.cycle,
        ssn: Math.round(sunActivity.cycle.ssn * (st.config.sunCycleScale ?? 1)),
        regions: sunActivity.activeCount(),
        lastFlare: sunActivity.lastFlare,
        lastCME: sunActivity.lastCME,
        earthETA: sunActivity.earthETA,
        earthImpact: sunActivity.earthImpact,
      });
    }
  });

  return null;
}
