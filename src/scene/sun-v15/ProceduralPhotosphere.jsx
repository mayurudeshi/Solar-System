import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../state/useStore.js';
import { PHOTOSPHERE_VERT, PHOTOSPHERE_FRAG } from './shaders.js';

// v1.5 photosphere — fully procedural, no static texture.
//
// Why: v1.4's Sun used a static H-alpha texture sampled with a u-shift
// per latitude. Over long viewing sessions the same texture features
// at adjacent latitudes drift apart longitudinally and accumulate into
// horizontal latitude bands ("wind effect"). The fundamental cause is
// applying continuous differential rotation to STATIC content.
//
// Fix: generate the surface entirely from 3D fbm noise. Differential
// rotation is realised by rotating the SAMPLE POINT around the Y axis
// per latitude — adjacent latitudes sample neighbouring continuous-noise
// points, so no banding can ever form. The noise itself also slowly
// evolves with uTime, so granulation cells appear to live + die.

const REF_TIME_MS = Date.now();

export function ProceduralPhotosphere({ hovered, eventHandlers, radius = 3.4 }) {
  const matRef = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpinSeconds: { value: 0 },
      uEqColor:  { value: new THREE.Color(0xff5a1f) },
      uPoleColor:{ value: new THREE.Color(0xc83a14) },
      uHotColor: { value: new THREE.Color(0xffe09a) },
      uActivityLevel: { value: 0.75 },
      uTint:     { value: new THREE.Color(1, 1, 1) },
    }),
    []
  );

  useFrame(() => {
    if (!matRef.current) return;
    const { spinEpochMs, showRotation, slowRotation } = useStore.getState();
    const realSeconds = (Date.now() - REF_TIME_MS) / 1000;
    let spinDeltaMs = showRotation ? spinEpochMs - REF_TIME_MS : 0;
    if (slowRotation) spinDeltaMs *= 0.1;
    matRef.current.uniforms.uTime.value = realSeconds;
    matRef.current.uniforms.uSpinSeconds.value = spinDeltaMs / 1000;
    matRef.current.uniforms.uTint.value.set(hovered ? '#fff0e0' : '#ffffff');
  });

  return (
    <mesh {...eventHandlers}>
      <sphereGeometry args={[radius, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={PHOTOSPHERE_VERT}
        fragmentShader={PHOTOSPHERE_FRAG}
      />
    </mesh>
  );
}
