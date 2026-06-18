import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createSolarPlasma } from './helios-plasma.js';
import { useStore } from '../state/useStore.js';

// HELIOS plasma layer (bolt-on, by 2Codius2Code) wired into our Sun as a
// level-of-detail close-up: a magnetically-bound corona of coronal loops,
// open-field plumes, flux-rope CMEs and coronal rain that lives *around* our
// existing photosphere. It NEVER touches the surface — our surface stays ours.
//
// LOD: the whole layer fades on a single intensity 0..1 driven by camera
// distance to the Sun (at world origin). Far out in system view it's at 0 =
// emission paused + invisible = near-zero cost. Fly in toward the Sun and it
// spins up. So the system view stays pinned at framerate; the diva only shows
// up when she's the only thing on stage.
const SUN_R = 3.4;          // must match Photosphere/SUN_SURFACE_R in Sun.jsx
const FADE_FAR = 60;        // begin fading in at this camera-to-Sun distance
const FADE_NEAR = 22;       // full intensity once this close

export function SolarPlasma() {
  const { scene, gl, camera } = useThree();
  const plasmaRef = useRef(null);

  // The Fire CME button bumps this nonce; we erupt on each change.
  const cmeNonce = useStore((s) => s.cmeNonce);

  useEffect(() => {
    const plasma = createSolarPlasma(THREE, scene, {
      center: new THREE.Vector3(0, 0, 0),
      sunRadius: SUN_R,
      particleBudget: 10000,   // headroom for 5 roaming active regions
    });
    plasma.setPixelRatio(gl.getPixelRatio());
    plasma.setIntensity(0);
    plasmaRef.current = plasma;
    // Harness/dev hook so the headless render can fire a CME directly.
    try { window.__fireCME = () => plasma.triggerCME(camera); } catch (_) { /* no-op */ }
    return () => {
      plasma.dispose();
      plasmaRef.current = null;
      try { delete window.__fireCME; } catch (_) { /* no-op */ }
    };
  }, [scene, gl, camera]);

  // Manual eruption: skip the initial mount (nonce starts at 0).
  const firstNonce = useRef(true);
  useEffect(() => {
    if (firstNonce.current) { firstNonce.current = false; return; }
    plasmaRef.current?.triggerCME(camera);
  }, [cmeNonce, camera]);

  useFrame((_, dt) => {
    const plasma = plasmaRef.current;
    if (!plasma) return;
    const { plasmaLoops, plasmaWind, plasmaEruption } = useStore.getState().config;
    plasma.setActivity({
      loops: plasmaLoops,
      wind: plasmaWind,
      eruptionFrequency: plasmaEruption,
    });
    // Distance from camera to the Sun's center (origin). Independent of vantage,
    // so it works in free-cam too.
    const dist = camera.position.length();
    const k = THREE.MathUtils.clamp((FADE_FAR - dist) / (FADE_FAR - FADE_NEAR), 0, 1);
    plasma.setIntensity(k);
    plasma.update(dt);
  });

  return null;
}
