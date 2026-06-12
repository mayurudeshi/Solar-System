import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Radial coronal streamers — the dominant visual feature of real
// SOHO/SDO imagery that the smooth gradient sprite is missing.
//
// Implementation: a billboarded sprite at the Sun's position that
// always faces camera. The shader works in polar coordinates around
// the sprite centre, painting:
//
//   - Angular streamer bands (some directions bright, some dim) via
//     noise on theta + radial fbm for irregularity
//   - Radial profile: hidden behind the photosphere disc (r < ~0.18),
//     bright just outside it, fading to nothing at the sprite edge
//   - Slow time evolution so streamers shift over real-time minutes
//
// Because we use additive blending, the streamers behind the opaque
// photosphere disc contribute nothing visible — they only show where
// the photosphere ISN'T. That gives the "sunburst around the disc"
// look exactly like real coronagraph imagery.

const STREAMER_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;

  #define PI 3.14159265358979

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0; float amp = 0.5;
    for (int i = 0; i < 5; i++) { v += amp * noise(p); p *= 2.0; amp *= 0.5; }
    return v;
  }

  void main() {
    // Centred coordinates: -0.5..+0.5
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;  // 0..1 from centre to corner of UV square
    if (r > 1.0) discard;
    // Theta wraps continuously — wrap on the longest dimension so the
    // seam at theta=±PI doesn't create a hard band.
    float theta = atan(d.y, d.x);

    // ── ANGULAR STREAMER PATTERN ────────────────────────────────────────
    // Sample noise in (theta, r) but with MUCH higher frequency in theta
    // than in r — streamers extend radially outward as long thin streaks.
    // Time drift makes them slowly rotate / breathe.
    float angularLow  = fbm(vec2(theta * 3.5, r * 1.5 + uTime * 0.03));
    float angularHigh = fbm(vec2(theta * 9.0, r * 1.0 + uTime * 0.05));
    float streamer = angularLow * 0.65 + angularHigh * 0.35;
    streamer = smoothstep(0.42, 0.78, streamer);

    // A few BRIGHT streamers picked from a coarser noise — these are
    // the helmet streamers that anchor at active regions.
    float bright = smoothstep(0.66, 0.82,
                              fbm(vec2(theta * 1.8, uTime * 0.012)));
    streamer = max(streamer, bright * 1.2);

    // ── RADIAL PROFILE ──────────────────────────────────────────────────
    // r ≈ 0.18 is the inner ring (just outside the photosphere disc when
    // the sprite scale is matched). r=1.0 is the outer fade boundary.
    // Hidden inside the disc (additive blending means invisible there
    // anyway, but discarding saves fragment shader work).
    float inner = smoothstep(0.16, 0.22, r);
    float outer = 1.0 - smoothstep(0.22, 0.95, r);
    float radial = inner * outer;

    // ── COLOUR ──────────────────────────────────────────────────────────
    // Hot near the disc (yellow-white), cools to deep red-orange outward.
    vec3 hotCol  = vec3(1.00, 0.85, 0.55);
    vec3 coolCol = vec3(1.00, 0.35, 0.10);
    vec3 col = mix(hotCol, coolCol, smoothstep(0.20, 0.70, r));

    float alpha = radial * streamer * 0.85;
    gl_FragColor = vec4(col * alpha, 1.0);
  }
`;

const STREAMER_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function CoronalStreamers({ scale = 26 }) {
  const matRef = useRef();
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += dt;
  });

  return (
    <sprite scale={[scale, scale, 1]}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={STREAMER_VERTEX}
        fragmentShader={STREAMER_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
}
