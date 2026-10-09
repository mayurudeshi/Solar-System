// Coronal magnetic field + field-line tracing, in the Sun's body frame
// (unit sphere = photosphere).
//
// Field model: each active region is a buried bipole (a + and a - magnetic
// "charge" just under its two spots), plus a weak global dipole for the polar
// field. The field of buried point sources is a standard simplified
// potential-field model of the low corona. Kept from the previous build
// (HELIOS); what changed is that the regions now come from the shared
// activity model, so loops sit over the actual sunspots.
//
// Coronal loops are traced field lines that leave the surface near one spot
// and land again. Lines that climb past OPEN_R are open field (solar-wind
// source) and are kept as short fading plumes.

const OPEN_R = 1.9;
const STEP = 0.006;
const MAX_STEPS = 520;

function buildCharges(regions, parity) {
  const q = [];
  for (const r of regions) {
    if (!r || r.s < 0.06) continue;
    // Bigger bipoles have deeper sources -> taller loops.
    const depth = 1 - 1.35 * r.halfSep;
    const lp = r.lead, fp = r.follow;
    q.push({ x: lp[0] * depth, y: lp[1] * depth, z: lp[2] * depth, q: r.s * r.leadSign });
    q.push({ x: fp[0] * depth, y: fp[1] * depth, z: fp[2] * depth, q: -r.s * r.leadSign });
  }
  // Global dipole; its sign flips with the cycle like the real polar field.
  q.push({ x: 0, y: 0.7, z: 0, q: 0.12 * parity });
  q.push({ x: 0, y: -0.7, z: 0, q: -0.12 * parity });
  return q;
}

function field(charges, x, y, z, out) {
  let bx = 0, by = 0, bz = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    let r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-5) r2 = 1e-5;
    const k = c.q / (r2 * Math.sqrt(r2));
    bx += dx * k; by += dy * k; bz += dz * k;
  }
  const l = Math.hypot(bx, by, bz) || 1;
  out[0] = bx / l; out[1] = by / l; out[2] = bz / l;
  return out;
}

// Trace one line from p along sign*B with midpoint (RK2) steps.
function trace(charges, p, sign) {
  const pts = [p.slice()];
  const b = [0, 0, 0];
  let [x, y, z] = p;
  for (let i = 0; i < MAX_STEPS; i++) {
    field(charges, x, y, z, b);
    const mx = x + b[0] * sign * STEP * 0.5, my = y + b[1] * sign * STEP * 0.5, mz = z + b[2] * sign * STEP * 0.5;
    field(charges, mx, my, mz, b);
    x += b[0] * sign * STEP; y += b[1] * sign * STEP; z += b[2] * sign * STEP;
    const r = Math.hypot(x, y, z);
    if (r < 1) {
      // landed: snap the footpoint onto the surface
      pts.push([x / r, y / r, z / r]);
      return { pts, open: false };
    }
    if (i % 2 === 0) pts.push([x, y, z]);
    if (r > OPEN_R) return { pts, open: true };
  }
  return null; // neither landed nor escaped: discard
}

function arcLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return s;
}

// Small seeded PRNG so a region keeps the same loops across retraces (the
// arcade evolves smoothly as the field changes instead of reshuffling).
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns [{ slot, open, w, b, pts: [[x,y,z],...] }] for all regions.
// w = strand width multiplier, b = strand brightness multiplier.
//
// An active region in EUV is not a handful of identical wires: it is a
// tangle of dozens of loops rooted all over the + polarity (umbra edge,
// penumbra, surrounding plage). Short low "core" loops join the two spots;
// footpoints farther out reach higher, longer loops; the outermost often
// open into fan loops. Strands differ a lot in thickness and brightness and a
// few dominate. Seeding the whole + polarity patch (not a single ring) is
// what turns nested rainbow arcs into an arcade.
export function traceRegionLoops(regions, parity) {
  const charges = buildCharges(regions, parity);
  const lines = [];
  for (const r of regions) {
    if (!r || r.s < 0.06) continue;
    // Seed around the positive spot and follow +B (out of the + pole).
    const plusSpot = r.leadSign > 0 ? r.lead : r.follow;
    const n = Math.round(8 + 26 * r.s);
    const c = plusSpot;
    const up = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let t1 = [up[1] * c[2] - up[2] * c[1], up[2] * c[0] - up[0] * c[2], up[0] * c[1] - up[1] * c[0]];
    const l1 = Math.hypot(...t1); t1 = t1.map((v) => v / l1);
    const t2 = [c[1] * t1[2] - c[2] * t1[1], c[2] * t1[0] - c[0] * t1[2], c[0] * t1[1] - c[1] * t1[0]];
    const minus = r.leadSign > 0 ? r.follow : r.lead;
    const d = [minus[0] - c[0], minus[1] - c[1], minus[2] - c[2]];
    const base = Math.atan2(d[0] * t2[0] + d[1] * t2[1] + d[2] * t2[2], d[0] * t1[0] + d[1] * t1[1] + d[2] * t1[2]);
    const rand = rng(Math.floor(r.seed * 1e6) + 17);
    for (let k = 0; k < n; k++) {
      // Footpoint: anywhere in the + patch, denser near the spot; direction
      // biased toward the - spot (core field) but spread all round.
      const fr = r.halfSep * (0.12 + 1.35 * rand() ** 0.8);
      const g = (rand() + rand() + rand() - 1.5) * 2;       // ~gaussian
      const th = base + g * 1.1;
      const px = c[0] + (t1[0] * Math.cos(th) + t2[0] * Math.sin(th)) * fr;
      const py = c[1] + (t1[1] * Math.cos(th) + t2[1] * Math.sin(th)) * fr;
      const pz = c[2] + (t1[2] * Math.cos(th) + t2[2] * Math.sin(th)) * fr;
      const l = Math.hypot(px, py, pz) / 1.002;
      const w = 0.5 + 2.0 * rand() ** 2;
      let b = 0.3 + 1.0 * rand() ** 2;
      const res = trace(charges, [px / l, py / l, pz / l], 1);
      if (!res || res.pts.length < 6) continue;
      // Long loops are faint. Loop scaling laws (Rosner-Tucker-Vaiana) give
      // density ~ 1/L at a given temperature, and EUV brightness goes as
      // density squared, so per unit length ~ L^-2. Softened to L^-1.5 and
      // referenced to a typical core loop (~0.15 R, ~100 Mm).
      const L = arcLength(res.pts);
      b *= res.open ? 0.35 : Math.min(1.3, (0.15 / L) ** 1.5);
      if (b < 0.02) continue;
      lines.push({ slot: r.slot, open: res.open, w, b, pts: res.pts });
    }
  }
  return lines;
}
