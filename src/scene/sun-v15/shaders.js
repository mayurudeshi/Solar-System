// v1.5 Sun shaders. Procedural photosphere generates the surface from
// animated 3D simplex/fbm noise sampled on the sphere's WORLD-SPACE
// direction — no UV mapping, no equirectangular seam, no static texture
// to smear into latitude bands when differential rotation is applied.
//
// Differential rotation is realised by ROTATING THE SAMPLE POINT, not
// by shifting UVs. Each latitude rotates the input position around the
// Y axis by an angle proportional to time/period(latitude). Because the
// noise is 3D and continuous, this leaves NO artifacts — adjacent
// latitudes sample neighbouring points in noise-space.

export const PHOTOSPHERE_VERT = /* glsl */ `
  varying vec3 vObjectPos;     // for latitude + noise sampling (axis-aligned)
  varying vec3 vWorldNormal;   // for limb darkening (view-direction dependent)
  varying vec3 vViewPos;
  void main() {
    vObjectPos = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 vp = modelViewMatrix * vec4(position, 1.0);
    vViewPos = vp.xyz;
    gl_Position = projectionMatrix * vp;
  }
`;

// Photosphere fragment: build a colour from animated 3D fbm sampled at
// the rotated direction-on-sphere. Three layers compose the surface:
//   1. base granulation (small scale, fast-evolving)
//   2. supergranulation / active region brightening (mid scale)
//   3. limb darkening (radial brightness falloff)
export const PHOTOSPHERE_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;          // seconds since boot (real-time, monotonic)
  uniform float uSpinSeconds;   // sim-seconds for rotation (frozen on pause)
  uniform vec3  uEqColor;       // hot equator base
  uniform vec3  uPoleColor;     // slightly cooler poles
  uniform vec3  uHotColor;      // active-region highlight
  uniform float uActivityLevel; // 0..1 — modulates active region brightness
  uniform vec3  uTint;          // ×tint at end (for hover/click feedback)

  varying vec3 vObjectPos;
  varying vec3 vWorldNormal;
  varying vec3 vViewPos;

  #define PI 3.14159265358979
  #define EQ_PERIOD_S    (24.47 * 86400.0)
  #define POLE_PERIOD_S  (34.40 * 86400.0)

  // ── 3D noise primitives ───────────────────────────────────────────────
  // Stefan Gustavson's textureless simplex noise (snoise) is the standard
  // for procedural surface generation. For scaffold we use a simpler
  // hash-based value noise; will swap for snoise during build-out.
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
          mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
          mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p, int octaves) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      v += amp * noise3(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  // Rotate point p around Y axis by angle a.
  vec3 rotateY(vec3 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    // Direction in OBJECT space — independent of any parent group rotations
    // (axial tilt etc), so the Sun's rotation axis is local Y and the noise
    // stays pinned to the sphere as it tilts.
    vec3 dir = normalize(vObjectPos);

    // Latitude (lat=0 at equator) and differential rotation angle.
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    float sinLat2 = sin(lat) * sin(lat);
    float periodS = mix(EQ_PERIOD_S, POLE_PERIOD_S, sinLat2);
    float rotAngle = uSpinSeconds / periodS * 2.0 * PI;

    // Rotate the SAMPLE POINT — equivalent to rotating that latitude band
    // by -rotAngle, but with continuous 3D noise so adjacent latitudes
    // sample neighbouring points in noise-space (no banding artifact).
    vec3 sampleP = rotateY(dir, -rotAngle);

    // GRANULATION — high-contrast cellular pattern. Mix raw fbm with
    // a tighter smoothstep so the disc shows visible variation across
    // its whole face, not just at the limb.
    float smallRaw = fbm3(sampleP * 14.0 + vec3(uTime * 0.018, uTime * 0.012, 0.0), 5);
    float small    = smoothstep(0.32, 0.72, smallRaw);

    // SUPERGRANULATION — large-scale warm/cool plasma flow, high
    // contrast so big bright/dim regions are visible across the disc.
    float largeRaw = fbm3(sampleP * 4.0 + vec3(0.0, uTime * 0.008, uTime * 0.005), 4);
    float large    = smoothstep(0.30, 0.78, largeRaw);

    // Active regions — MORE of them, brighter. Real sun has dozens of
    // visible active region complexes during solar maximum.
    float activity = fbm3(sampleP * 2.4 + vec3(uTime * 0.003, 7.0, uTime * 0.002), 3);
    activity = smoothstep(0.48, 0.72, activity) * uActivityLevel;

    // Sunspots — TIGHT, SMALL, RARE. Higher-frequency noise so spots
    // are small relative to the disc, and a narrow threshold band so
    // only a handful appear. Previous version painted huge dark blotches
    // covering ~30% of the disc — looked like rotten patches, not
    // sunspots (MJ flagged: "those black blotches… looks worse than v1.4").
    float spot = fbm3(sampleP * 8.5 + vec3(uTime * 0.001, 13.7, uTime * 0.0008), 3);
    float spotMask = 1.0 - smoothstep(0.18, 0.24, spot);  // narrow band
    spotMask *= spotMask;                                  // square for tighter cores

    // Latitude-based base colour (equator hotter than poles), build up
    // the disc with strong granulation contrast + bright supergranulation
    // + bright active regions, then apply gentle sunspot darkening.
    float latT = abs(dir.y);  // 0 at equator → 1 at poles
    vec3 base = mix(uEqColor, uPoleColor, latT);
    base *= 0.75 + 0.55 * small;          // GRANULATION — wider contrast band
    base += 0.55 * large * uHotColor;     // supergranulation glow — brighter
    base += 0.95 * activity * uHotColor;  // active region peaks — much brighter
    base *= 1.0 - 0.55 * spotMask;        // sunspot darkening — gentler max

    // Limb darkening — real photosphere is dimmer at the edge because
    // we're seeing through more atmosphere at grazing angles.
    vec3 viewDir = normalize(-vViewPos);
    float mu = max(0.0, dot(normalize(vWorldNormal), viewDir));
    float limb = 0.45 + 0.55 * mu;        // 0.45 at limb → 1.0 head-on

    vec3 finalColor = base * limb * uTint;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Particle-based CME shader. Each particle's position/velocity is
// updated CPU-side per frame and pushed to a BufferAttribute. The
// vertex shader projects each one as a point sprite; the fragment
// shader produces a soft circular glow.
export const CME_PARTICLE_VERT = /* glsl */ `
  attribute float aAge;
  attribute float aSize;
  uniform float uPointScale;
  varying float vAgeNorm;
  void main() {
    vAgeNorm = aAge;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Grow modestly over lifetime — plasma expanding outward. 1x at
    // birth, ~1.8x at death. Combined with alpha fade in the fragment
    // shader, the cloud disperses. Earlier 3.5x growth combined with
    // a too-high pixel scale saturated the whole screen.
    float sizeMult = 1.0 + 0.8 * pow(aAge, 1.4);
    gl_PointSize = aSize * sizeMult * uPointScale / (-mv.z + 0.001);
  }
`;

export const CME_PARTICLE_FRAG = /* glsl */ `
  precision highp float;
  varying float vAgeNorm;     // 0 = just spawned, 1 = end of life
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    // Soft circular falloff
    float soft = smoothstep(0.5, 0.0, r);
    // Fade by age — sharp birth, slow death
    float life = vAgeNorm < 0.15
      ? vAgeNorm / 0.15
      : 1.0 - (vAgeNorm - 0.15) / 0.85;
    float alpha = soft * life;
    // Hot plasma colour (whitish at birth, redder as it cools/expands)
    vec3 birthCol = vec3(1.00, 0.92, 0.75);
    vec3 ageCol   = vec3(0.95, 0.35, 0.15);
    vec3 col = mix(birthCol, ageCol, vAgeNorm);
    gl_FragColor = vec4(col * alpha, 1.0);
  }
`;
