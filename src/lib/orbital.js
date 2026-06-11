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

import { trueAnomaly } from './kepler.js';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export function perifocalToEcliptic({ nu, r, raan, argp, inc }) {
  const u = argp + nu;
  const cosO = Math.cos(raan), sinO = Math.sin(raan);
  const cosU = Math.cos(u),    sinU = Math.sin(u);
  const cosI = Math.cos(inc),  sinI = Math.sin(inc);
  return {
    x: r * (cosO * cosU - sinO * sinU * cosI),
    y: r * (sinO * cosU + cosO * sinU * cosI),
    z: r * (sinU * sinI),
  };
}

export function keplerianToCartesian({ a, e, M, raan, argp, inc }) {
  const { nu, r } = trueAnomaly(M, e, a);
  return perifocalToEcliptic({ nu, r, raan, argp, inc });
}

// ── Time / propagation ──────────────────────────────────────────────────

const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const MS_PER_DAY = 86400000;
const DAYS_PER_CENTURY = 36525;

export function julianCenturiesSinceJ2000(date) {
  return (date.getTime() - J2000_EPOCH_MS) / MS_PER_DAY / DAYS_PER_CENTURY;
}

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

function normalizeDeg(d) { return ((d % 360) + 360) % 360; }

// NaN-safe coercion: if epochMs is a number, build a Date; if it's invalid,
// return null and let the caller substitute the origin.
function toValidDate(epochMs) {
  const ms = Number(epochMs);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

// Heliocentric position of a body at a given epoch ms, in AU
// (ecliptic-J2000 frame). When `useInclination=false`, the body is forced
// onto the ecliptic plane (inc=0) — the "flatten orbits" UI toggle.
//
// On invalid date input the function returns the origin rather than NaN,
// so a downstream THREE position never gets corrupted.
export function bodyPositionAU(body, epochMs, { useInclination = true } = {}) {
  const date = toValidDate(epochMs);
  if (!date) return { x: 0, y: 0, z: 0 };

  const el = getElementsAtDate(body.elements, date);
  const M_deg = normalizeDeg(el.L - el.long_peri);
  const argp_deg = el.long_peri - el.raan;
  const inc_deg = useInclination ? el.I : 0;

  return keplerianToCartesian({
    a:    el.a,
    e:    el.e,
    M:    M_deg    * DEG,
    raan: el.raan  * DEG,
    argp: argp_deg * DEG,
    inc:  inc_deg  * DEG,
  });
}

// Sample a body's orbit as N positions around the full ellipse. Same
// useInclination flag — orbits flatten with the toggle.
export function orbitPathAU(body, epochMs, { useInclination = true, samples = 256 } = {}) {
  const date = toValidDate(epochMs);
  if (!date) return [];

  const el = getElementsAtDate(body.elements, date);
  const argp_deg = el.long_peri - el.raan;
  const raan = el.raan * DEG;
  const argp = argp_deg * DEG;
  const inc  = (useInclination ? el.I : 0) * DEG;
  const a = el.a, e = el.e;

  const points = new Array(samples + 1);
  for (let k = 0; k <= samples; k++) {
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
// True linear AU → scene units would put Pluto at ~26·39.5=1027 units
// while Mercury sits at ~10. Log compression keeps inner planets visible
// while not losing outer planets to the far plane.

const SCALE = 26;
export function auToSceneUnits(au) {
  return Math.log10(au * 9 + 1) * SCALE;
}

export function auVecToSceneUnits({ x, y, z }) {
  const auLen = Math.sqrt(x * x + y * y + z * z);
  if (auLen < 1e-9) return { x: 0, y: 0, z: 0 };
  const sceneLen = auToSceneUnits(auLen);
  const k = sceneLen / auLen;
  return { x: x * k, y: y * k, z: z * k };
}

// Ecliptic-J2000 (right-handed, Z=ecliptic north) → Three.js (Y-up).
// Verified by reviewer 1: this preserves handedness AND puts Pluto's
// +17° inclination above the ecliptic plane (would be inverted with +y).
export function eclipticToThreePosition({ x, y, z }) {
  return [x, z, -y];
}
