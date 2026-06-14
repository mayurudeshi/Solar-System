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
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = normalize(position);   // direction on the unit sphere
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The galactic band lies along the sphere's local equator (y = 0). The
// texture's star field is sampled in UV; the band glow is computed from
// latitude so it's independent of the texture content.
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vLocal;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453123); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){v+=a*noise(p);p*=2.0;a*=0.5;} return v; }

  void main(){
    // Real star map.
    vec3 stars = texture2D(uMap, vUv).rgb;

    // Latitude off the galactic plane (vLocal.y in [-1,1]).
    float lat = vLocal.y;
    // Longitude angle for patchy structure + a central-bulge hotspot.
    float lon = atan(vLocal.z, vLocal.x);

    // Band profile: a bright tight CORE riding inside a broad faint HALO,
    // so even edge-on it reads as a structured belt rather than a flat wall.
    float core = exp(-(lat*lat) / 0.006);   // tight bright spine
    float halo = exp(-(lat*lat) / 0.060);   // broad faint glow
    // Patchy clumping along the band (low vertical freq = no vertical streaks).
    float mott = 0.45 + 0.85 * fbm(vec2(lon*2.4, lat*2.2) + 3.3);
    float band = (core * 0.9 + halo * 0.55) * mott;
    // A dark dust lane snaking down the middle (real Milky Way has one).
    float dust = smoothstep(0.0, 0.010, abs(lat - 0.010*sin(lon*3.0) - 0.006));
    band *= mix(0.35, 1.0, dust);

    // Central bulge — brighter, warmer hotspot toward "galactic center"
    // (an arbitrary but fixed longitude so it has a recognizable core).
    float toCenter = cos(lon - 1.2); // peak near lon=1.2
    float bulge = exp(-(lat*lat)/0.018) * pow(max(0.0,toCenter), 5.0);

    vec3 bandCol = vec3(0.60, 0.64, 0.80);   // cool milky white
    vec3 bulgeCol = vec3(0.97, 0.87, 0.64);  // warm core
    vec3 glow = bandCol * band * 0.78 + bulgeCol * bulge * 1.25;

    // Star map boosted a touch; add the procedural glow on top.
    vec3 col = stars * 1.25 + glow;
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
      <sphereGeometry args={[SKY_RADIUS, 64, 64]} />
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
