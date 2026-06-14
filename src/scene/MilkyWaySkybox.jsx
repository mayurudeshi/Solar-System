import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/useStore.js';

// v1.7 — the Milky Way backdrop. A huge inverted sphere following the
// camera ("at infinity"), combining:
//   1. The real Solar System Scope all-sky star map (CC-BY 4.0, same source
//      as our planet textures) for a dense, honest starfield.
//   2. A PROCEDURAL luminous galactic band + central bulge so the galaxy
//      actually READS dramatically (the raw star map's band is realistic =
//      too subtle for the "whoa, our galaxy" moment MJ wants).
//
// THE RULE (MJ 2026-06-14): pristine v1.6 when "inside." The whole thing is
// invisible up close and fades in only as you pull out into the void:
//   <= FADE_START (300) : opacity 0 — pristine v1.6 (planet study + the
//                         full-system overview ~110 both sit here)
//   FADE_START → FADE_FULL : smooth fade-in as you leave
//   >= FADE_FULL (1000) : full galaxy (up to the 1600 max-zoom void)
//
// Static — never animates. Recentred on the camera each frame; orientation
// is world-fixed (the galaxy doesn't spin with the camera), so orbiting the
// void sweeps the band across the view and reveals it from every angle.
const SKY_RADIUS = 4000;
const FADE_START = 300;
const FADE_FULL = 1000;
const MAX_OPACITY = 1.0;

// World-fixed orientation. The skybox's local +Y is the galactic pole; we
// aim it at this vector so the band lies ⊥ to the default Sun-vantage void
// view direction (~[0,-0.53,-0.85]). That drops the luminous band as a
// diagonal arc across the lower frame with the solar system floating just
// above it in clear dark space — legible AND dramatic (chosen 2026-06-14
// from a headless pole-vector sweep).
const GALACTIC_POLE = new THREE.Vector3(0.733, 0.5, -0.5).normalize();

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// NO procedural band. The uMap is a REAL all-sky photographic panorama
// (Solar System Scope, CC-BY 4.0) that already contains the actual Milky Way
// — star clouds, the Sagittarius core, dust rifts, the Magellanic Clouds.
// It's just rendered very dark (true faint-night-sky levels). All we do is
// EXPOSURE-tone-map it so the real structure reads dramatically, rolling off
// the highlights so bright stars / the core never blow into a white wall.
// 100% honest: it's a photo of our own sky, brightened.
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uExposure;
  varying vec2 vUv;

  void main(){
    vec3 raw = texture2D(uMap, vUv).rgb;
    // Exponential exposure: lifts the faint nebulosity, soft-clips highlights.
    vec3 col = vec3(1.0) - exp(-raw * uExposure);
    // Gentle contrast to deepen the gaps between the star clouds.
    col = pow(col, vec3(0.85));
    gl_FragColor = vec4(col * uOpacity, uOpacity);
  }
`;

export function MilkyWaySkybox() {
  const meshRef = useRef();
  const matRef = useRef();
  const { camera } = useThree();
  const [tex, setTex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load('/textures/8k_stars_milky_way.jpg', (loaded) => {
      if (cancelled) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 4;
      setTex(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  // NOTE: drive uniforms through the MATERIAL ref, not a memo'd uniforms
  // object — R3F clones the `uniforms` prop into the material, so mutating
  // the prop object never reaches the GPU (this silently pinned uOpacity at
  // 0 = fully transparent for a long debug session, 2026-06-14).
  const uniforms = useMemo(() => ({
    uMap: { value: null },
    uOpacity: { value: 0 },
    uExposure: { value: 14.0 },
  }), []);

  // World-fixed galactic orientation: aim local +Y at the galactic pole.
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), GALACTIC_POLE);
    return q;
  }, []);

  useFrame(() => {
    const m = meshRef.current;
    const mat = matRef.current;
    if (!m || !mat) return;
    m.quaternion.copy(quat);          // world-fixed galactic orientation
    m.position.copy(camera.position); // sit at infinity (follows camera)
    // Fade by how far we've pulled out from the focused body. Pristine v1.6
    // up close; galaxy blooms in only out in the void.
    const dist = useStore.getState().cameraDist;
    const t = Math.min(1, Math.max(0, (dist - FADE_START) / (FADE_FULL - FADE_START)));
    mat.uniforms.uOpacity.value = t * MAX_OPACITY;
    if (tex && mat.uniforms.uMap.value !== tex) mat.uniforms.uMap.value = tex;
    m.visible = t > 0.001; // skip the draw entirely when pristine
  });

  if (!tex) return null;

  return (
    <mesh ref={meshRef} quaternion={quat} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 128, 128]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        toneMapped={false}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
