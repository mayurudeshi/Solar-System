// Orbital element → heliocentric Cartesian transform.
//
// REPLACES the POC's x-axis tilt approximation. The POC stored only `lop`
// (longitude of perihelion ≈ Ω + ω combined) and rotated the whole orbital
// plane about the world x-axis by `inc`. That's wrong for showing inclined
// orbits in their TRUE relative orientation — most notably Pluto's 17°
// tilt vs Neptune.
//
// Correct transform per standard celestial mechanics:
//   1. Position in orbital plane (perifocal frame, P-Q-W):
//        x_p = r · cos(ν)
//        y_p = r · sin(ν)
//        z_p = 0
//   2. Rotate by -ω about z (align node with x-axis)
//   3. Rotate by -i about x (tilt to ecliptic by inclination)
//   4. Rotate by -Ω about z (rotate ascending node to its ecliptic longitude)
//
// Closed form for ecliptic-frame Cartesian (x_ecl, y_ecl, z_ecl):
//   x_ecl = (cos(Ω)·cos(ω+ν) - sin(Ω)·sin(ω+ν)·cos(i)) · r
//   y_ecl = (sin(Ω)·cos(ω+ν) + cos(Ω)·sin(ω+ν)·cos(i)) · r
//   z_ecl =  sin(ω+ν) · sin(i)                          · r
//
// All angles in radians, r and a in same units.

import { trueAnomaly } from './kepler.js';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function perifocalToEcliptic({ nu, r, raan, argp, inc }) {
  const u = argp + nu; // argument of latitude
  const cosO = Math.cos(raan), sinO = Math.sin(raan);
  const cosU = Math.cos(u),    sinU = Math.sin(u);
  const cosI = Math.cos(inc),  sinI = Math.sin(inc);
  return {
    x: r * (cosO * cosU - sinO * sinU * cosI),
    y: r * (sinO * cosU + cosO * sinU * cosI),
    z: r * (sinU * sinI),
  };
}

// Full Keplerian element → heliocentric ecliptic-J2000 Cartesian helper.
// Inputs in radians. Returns {x, y, z} in same units as `a`.
export function keplerianToCartesian({ a, e, M, raan, argp, inc }) {
  const { nu, r } = trueAnomaly(M, e, a);
  return perifocalToEcliptic({ nu, r, raan, argp, inc });
}

// ── Time / propagation ──────────────────────────────────────────────────
//
// J2000 epoch = 2000 January 1.5 TT = JD 2451545.0
// JavaScript Date treats input as UTC; the small UT/TT difference (~64s)
// is negligible at the precision of the JPL 1800-2050 elements set.
//
// T = (JD - 2451545.0) / 36525 = centuries since J2000.

const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86400000;
const DAYS_PER_CENTURY = 36525;

export function julianCenturiesSinceJ2000(date) {
  return (date.getTime() - J2000_EPOCH_MS) / MS_PER_DAY / DAYS_PER_CENTURY;
}

// Apply linear-rate corrections from JPL Keplerian elements table.
// Input: body.elements object with {a, e, I, L, long_peri, raan} + *_dot
// per-century rates; date as JS Date.
// Output: same fields after propagation, still in degrees / AU.
export function getElementsAtDate(elements, date) {
  const T = julianCenturiesSinceJ2000(date);
  return {
    a:         elements.a         + elements.a_dot         * T,
    e:         elements.e         + elements.e_dot         * T,
    I:         elements.I         + elements.I_dot         * T,
    L:         elements.L         + elements.L_dot         * T,
    long_peri: elements.long_peri + elements.long_peri_dot * T,
    raan:      elements.raan      + elements.raan_dot      * T,
  };
}

// Normalize an angle in degrees to the half-open range [0, 360).
function normalizeDeg(d) {
  return ((d % 360) + 360) % 360;
}

// Heliocentric position of a body at a given date.
// Returns {x, y, z} in AU, ecliptic-J2000 frame.
//
// This is the canonical date-accurate position function for the simulator.
// Earth here is the Earth-Moon barycenter (JPL Keplerian set definition).
export function bodyPositionAU(body, date) {
  const el = getElementsAtDate(body.elements, date);

  // Mean anomaly = mean longitude - longitude of perihelion
  const M_deg = normalizeDeg(el.L - el.long_peri);
  // Argument of perihelion = ϖ - Ω
  const argp_deg = el.long_peri - el.raan;

  return keplerianToCartesian({
    a:    el.a,
    e:    el.e,
    M:    M_deg    * DEG,
    raan: el.raan  * DEG,
    argp: argp_deg * DEG,
    inc:  el.I     * DEG,
  });
}

// Sample a body's orbit as N positions around the full ellipse, using the
// body's elements at the given date for orientation. For rendering the
// orbit path line.
export function orbitPathAU(body, date, samples = 256) {
  const el = getElementsAtDate(body.elements, date);
  const argp_deg = el.long_peri - el.raan;
  const raan = el.raan * DEG;
  const argp = argp_deg * DEG;
  const inc  = el.I * DEG;
  const a = el.a, e = el.e;

  const points = new Array(samples + 1);
  for (let k = 0; k <= samples; k++) {
    // Sample eccentric anomaly evenly — this concentrates points near
    // perihelion where the planet moves faster, which renders cleaner.
    const E = (k / samples) * 2 * Math.PI;
    const r = a * (1 - e * Math.cos(E));
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    );
    points[k] = perifocalToEcliptic({ nu, r, raan, argp, inc });
  }
  return points;
}

// ── Scene scaling ───────────────────────────────────────────────────────
//
// True linear AU → scene units would put Pluto at ~26 × 39.5 = 1027 units
// while Mercury sits at ~10 — visually unusable. Log compression keeps
// inner planets visible while not losing outer planets to the far plane.
// Toggle to true-linear is the v1.1 UI improvement.

const SCALE = 26;
export function auToSceneUnits(au) {
  // log10(au * 9 + 1) is monotonic, 0 at AU=0, and produces:
  //   Mercury 0.39 AU → ~9   Venus 0.72 → ~21   Earth 1.0 → ~26
  //   Mars 1.52 → ~31  Jupiter 5.2 → ~47  Saturn 9.5 → ~55
  //   Uranus 19.2 → ~63  Neptune 30.1 → ~67  Pluto 39.5 → ~71
  return Math.log10(au * 9 + 1) * SCALE;
}

// Scale a heliocentric AU position vector into scene units, preserving
// direction (so the Ω/i/ω orientation survives the compression).
export function auVecToSceneUnits({ x, y, z }) {
  const auLen = Math.sqrt(x * x + y * y + z * z);
  if (auLen < 1e-9) return { x: 0, y: 0, z: 0 };
  const sceneLen = auToSceneUnits(auLen);
  const k = sceneLen / auLen;
  return { x: x * k, y: y * k, z: z * k };
}
