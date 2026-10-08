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

// Returns [{ slot, open, pts: [[x,y,z],...] }] for all regions.
export function traceRegionLoops(regions, parity) {
  const charges = buildCharges(regions, parity);
  const lines = [];
  for (const r of regions) {
    if (!r || r.s < 0.06) continue;
    // Seed around the positive spot and follow +B (out of the + pole).
    const plusSpot = r.leadSign > 0 ? r.lead : r.follow;
    const n = Math.round(4 + 9 * r.s);
    const c = plusSpot;
    const up = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let t1 = [up[1] * c[2] - up[2] * c[1], up[2] * c[0] - up[0] * c[2], up[0] * c[1] - up[1] * c[0]];
    const l1 = Math.hypot(...t1); t1 = t1.map((v) => v / l1);
    const t2 = [c[1] * t1[2] - c[2] * t1[1], c[2] * t1[0] - c[0] * t1[2], c[0] * t1[1] - c[1] * t1[0]];
    const rad = r.halfSep * 0.75;
    // Bright active-region loops are the core field joining the two spots, so
    // seed mainly on the side of the + spot that faces the - spot (+/-70 deg).
    const minus = r.leadSign > 0 ? r.follow : r.lead;
    const d = [minus[0] - c[0], minus[1] - c[1], minus[2] - c[2]];
    const base = Math.atan2(d[0] * t2[0] + d[1] * t2[1] + d[2] * t2[2], d[0] * t1[0] + d[1] * t1[1] + d[2] * t1[2]);
    for (let k = 0; k < n; k++) {
      const fr = Math.sqrt((k + 0.5) / n) * rad;
      const th = base + (((k * 0.618034 + r.seed) % 1) - 0.5) * 2.4;
      const px = c[0] + (t1[0] * Math.cos(th) + t2[0] * Math.sin(th)) * fr;
      const py = c[1] + (t1[1] * Math.cos(th) + t2[1] * Math.sin(th)) * fr;
      const pz = c[2] + (t1[2] * Math.cos(th) + t2[2] * Math.sin(th)) * fr;
      const l = Math.hypot(px, py, pz) / 1.002;
      const res = trace(charges, [px / l, py / l, pz / l], 1);
      if (!res || res.pts.length < 6) continue;
      lines.push({ slot: r.slot, open: res.open, pts: res.pts });
    }
  }
  return lines;
}
