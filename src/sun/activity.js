import * as THREE from 'three';
import { solarCycleAt } from './solarCycle.js';
import { latLonToBody, sunBodyMatrix, R_SUN_KM, AU_KM } from './sunFrame.js';
import { BODIES } from '../data/bodies.js';
import { bodyPositionAU, eclipticToThreePosition } from '../lib/orbital.js';

// ONE model of solar activity. Every visible phenomenon reads from here:
//
//   active region (bipolar sunspot group, emerges + decays over days to weeks)
//     -> sunspots + bright plage on the photosphere
//     -> magnetic field -> coronal loops
//     -> flares (sudden energy release, two ribbons straddling the polarity
//        inversion line, post-flare loops)
//        -> sometimes a CME (probability rises steeply with flare class)
//           -> propagates through the heliosphere by the drag-based model
//              and can hit Earth
//
// Everything runs on SIM time (the orbit clock, epochMs). Paused = frozen,
// 1x = one day per second, so a ~2-day CME transit to Earth takes ~2 real
// seconds and a 30-minute flare is a brief flash; slow the sim down to watch
// a flare evolve. Nothing here is on wall-clock time.
//
// Sources for the numbers (all approximate, published averages):
//   - flare peak-flux distribution  N(>F) ~ F^-0.8   (power law, index ~1.8)
//   - C+ flare rate ~ 0.06 x sunspot number per day
//   - flare->CME association ~15% C, ~45% M, ~90% X   (Yashiro et al. 2006)
//   - CME speed grows with flare class; widths 30-100 deg
//   - CME impulsive acceleration lasts about the flare rise (Zhang et al. 2001)
//   - interplanetary motion: drag-based model, w = 400 km/s,
//     gamma = 0.2e-7 /km  (Vrsnak et al. 2013)
//   - Joy's law tilt, Hale polarity, Sporer latitudes (see solarCycle.js)

export const MAX_REGIONS = 12;
export const MAX_CMES = 8;

const DAY_S = 86400;
const KMS_TO_RDAY = DAY_S / R_SUN_KM;          // km/s -> solar radii per day
const W_SOLAR_WIND = 400 * KMS_TO_RDAY;        // R/day
const GAMMA = 0.2e-7 * R_SUN_KM;               // 1/R
const R_EARTH_ORBIT_MAX = 2.2 * AU_KM / R_SUN_KM; // drop CMEs past ~2.2 AU

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

// ── Flares ────────────────────────────────────────────────────────────────

export function flareLabel(F) {
  const [letter, base] = F >= 1e-4 ? ['X', 1e-4] : F >= 1e-5 ? ['M', 1e-5] : ['C', 1e-6];
  return `${letter}${(F / base).toFixed(1)}`;
}

function sampleFlareFlux(minF = 1e-6) {
  // N(>F) ~ F^-0.8  =>  F = Fmin * U^(-1/0.8)
  return Math.min(minF * Math.pow(1 - Math.random(), -1.25), 3e-3);
}

function makeFlare(tDays, F) {
  const lg = Math.log10(F / 1e-6);               // 0 = C1, 1 = M1, 2 = X1
  return {
    t0: tDays,
    F,
    label: flareLabel(F),
    rise: (4 + 8 * Math.random() + 4 * lg) / 1440,      // days
    decay: (8 + 20 * Math.random() + 15 * lg) / 1440,   // e-folding, days
    vis: (lg + 1.5) / 3.5,                               // C1 0.43, X1 1.0
  };
}

// Flare light curve at time t: fast rise, exponential decay.
export function flareIntensity(fl, t) {
  if (!fl) return 0;
  const dt = t - fl.t0;
  if (dt < 0) return 0;
  const shape = dt < fl.rise ? (dt / fl.rise) ** 2 : Math.exp(-(dt - fl.rise) / fl.decay);
  return fl.vis * shape;
}
export function flareRibbonProgress(fl, t) {
  if (!fl) return 0;
  return Math.min(1, Math.max(0, (t - fl.t0) / (fl.rise + 2 * fl.decay)));
}
// Post-flare loops cool more slowly than the ribbons fade.
function postFlareGlow(fl, t) {
  if (!fl) return 0;
  const dt = t - fl.t0;
  if (dt < fl.rise) return 0;
  return fl.vis * Math.exp(-(dt - fl.rise) / (3 * fl.decay));
}

// ── CMEs ──────────────────────────────────────────────────────────────────

// Heliocentric distance of the CME front (solar radii) at sim time t (days).
// Impulsive phase: constant acceleration from the surface to v0 over tAcc.
// Then the drag-based model, closed form (Vrsnak et al. 2013).
export function cmeFrontR(cme, t) {
  const dt = t - cme.t0;
  if (dt <= 0) return 1;
  if (dt < cme.tAcc) return 1 + 0.5 * cme.v0 * dt * dt / cme.tAcc;
  const r0 = 1 + 0.5 * cme.v0 * cme.tAcc;
  const tau = dt - cme.tAcc;
  const d = cme.v0 - W_SOLAR_WIND;
  return r0 + W_SOLAR_WIND * tau + Math.sign(d) * Math.log(1 + GAMMA * Math.abs(d) * tau) / GAMMA;
}
export function cmeSpeedKms(cme, t) {
  const dt = t - cme.t0;
  if (dt <= 0) return 0;
  if (dt < cme.tAcc) return (cme.v0 * dt / cme.tAcc) / KMS_TO_RDAY;
  const tau = dt - cme.tAcc;
  const d = cme.v0 - W_SOLAR_WIND;
  return (W_SOLAR_WIND + d / (1 + GAMMA * Math.abs(d) * tau)) / KMS_TO_RDAY;
}
// Sim time (days) when the front reaches distance r, by bisection.
function cmeTimeAtR(cme, r) {
  let lo = cme.t0, hi = cme.t0 + 30;
  if (cmeFrontR(cme, hi) < r) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (cmeFrontR(cme, mid) < r) lo = mid; else hi = mid;
  }
  return hi;
}

// ── The simulation ────────────────────────────────────────────────────────

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

function earthDirection(epochMs) {
  const au = bodyPositionAU(BODIES.Earth, epochMs);
  const [x, y, z] = eclipticToThreePosition(au);
  const d = Math.hypot(x, y, z);
  return { dir: [x / d, y / d, z / d], rSun: d * AU_KM / R_SUN_KM };
}

class SunActivity {
  constructor() {
    this.slots = new Array(MAX_REGIONS).fill(null);   // active regions, stable slots
    this.cmes = new Array(MAX_CMES).fill(null);
    this.t = null;                                    // sim time, days since epoch 0
    this.epochMs = null;
    this.cycle = solarCycleAt(Date.now());
    this.cycleScale = 1;
    this.fieldVersion = 0;                            // bumps when loops must be retraced
    this.lastFlare = null;                            // { label, epochMs }
    this.lastCME = null;                              // { kms, widthDeg, epochMs, label }
    this.earthImpact = null;                          // { epochMs, kms }
    this.earthETA = null;                             // { epochMs, kms }
    this._nextId = 1;
    this._meanLife = this._estimateMeanLife();
  }

  _estimateMeanLife() {
    let s = 0;
    for (let i = 0; i < 4000; i++) s += this._sampleRegionShape().life;
    return s / 4000;
  }

  _sampleRegionShape() {
    // Most regions are small and short-lived; a few big complex ones last
    // weeks (Gnevyshev-Waldmeier: lifetime grows with peak area).
    const peakS = 0.25 + 0.75 * Math.random() ** 2;
    return {
      peakS,
      life: 4 + 50 * peakS ** 1.5 * (0.6 + 0.8 * Math.random()),   // days
      grow: 1.5 + 3 * peakS,                                        // days
      halfSep: 0.03 + 0.05 * peakS,                                 // radians
    };
  }

  _targetCount() {
    // Sunspot number R = 10 g + s; on average ~9 SSN per group over the whole
    // Sun (both hemispheres, front and far side).
    return Math.min(MAX_REGIONS, Math.max(0, this.cycle.ssn * this.cycleScale / 9));
  }

  _spawnRegion(age = 0) {
    const free = this.slots.indexOf(null);
    if (free < 0) return;
    const shape = this._sampleRegionShape();
    const hemi = Math.random() < 0.5 ? 1 : -1;
    const latDeg = Math.max(2, Math.min(40, this.cycle.meanLatDeg + gauss() * 6));
    const lat = hemi * latDeg * Math.PI / 180;
    const lon = Math.random() * 2 * Math.PI;
    const c = latLonToBody(lat, lon);
    const east = [Math.sin(lon), 0, Math.cos(lon)];                 // direction of rotation (west on the Sun)
    const north = norm(cross(c, east));
    // Joy's law: the leading spot sits closer to the equator, tilt ~ 0.5 * lat.
    const tilt = 0.5 * Math.abs(lat);
    const toEq = -hemi;
    const axis = norm([
      east[0] * Math.cos(tilt) + north[0] * Math.sin(tilt) * toEq,
      east[1] * Math.cos(tilt) + north[1] * Math.sin(tilt) * toEq,
      east[2] * Math.cos(tilt) + north[2] * Math.sin(tilt) * toEq,
    ]);
    const h = shape.halfSep;
    const lead = norm([c[0] * Math.cos(h) + axis[0] * Math.sin(h), c[1] * Math.cos(h) + axis[1] * Math.sin(h), c[2] * Math.cos(h) + axis[2] * Math.sin(h)]);
    const follow = norm([c[0] * Math.cos(h) - axis[0] * Math.sin(h), c[1] * Math.cos(h) - axis[1] * Math.sin(h), c[2] * Math.cos(h) - axis[2] * Math.sin(h)]);
    // Hale's law: leading polarity = hemisphere sign x cycle parity.
    const leadSign = hemi * this.cycle.parity;
    this.slots[free] = {
      id: this._nextId++,
      slot: free,
      c, axis, lead, follow, leadSign,
      lat, lon,
      ...shape,
      born: this.t - age,
      s: 0,
      tracedS: 0,
      flare: null,
      seed: Math.random(),
    };
    this.fieldVersion++;
  }

  reset(epochMs) {
    this.slots.fill(null);
    this.cmes.fill(null);
    this.epochMs = epochMs;
    this.t = epochMs / 86400000;
    this.cycle = solarCycleAt(epochMs);
    this.lastFlare = null;
    this.lastCME = null;
    this.earthImpact = null;
    this.earthETA = null;
    // Start in statistical steady state: regions at random ages.
    const n = Math.round(this._targetCount());
    for (let i = 0; i < n; i++) {
      this._spawnRegion(0);
      const r = this.slots[this.slots.findLastIndex((x) => x)];
      if (r) r.born = this.t - Math.random() * r.life;
    }
    this._updateStrengths();
    this.fieldVersion++;
  }

  _updateStrengths() {
    for (const r of this.slots) {
      if (!r) continue;
      const age = this.t - r.born;
      r.s = r.peakS * smoothstep(0, r.grow, age) * (1 - smoothstep(0.45 * r.life, r.life, age));
    }
  }

  // Advance to a new sim epoch. state = store snapshot (for spin + inclination).
  step(epochMs, state, cycleScale = 1) {
    this.cycleScale = cycleScale;
    if (this.epochMs === null) { this.reset(epochMs); return; }
    const dtDays = (epochMs - this.epochMs) / 86400000;
    // Date picked by the user (backwards or a big jump): re-seed the Sun for
    // that date instead of fast-forwarding through it.
    if (dtDays < 0 || dtDays > 30) { this.reset(epochMs); return; }
    if (dtDays === 0) return;
    const tPrev = this.t;
    this.epochMs = epochMs;
    this.t = epochMs / 86400000;
    this.cycle = solarCycleAt(epochMs);

    // Region lifecycle: retire the dead, emerge new ones (Poisson in sim time).
    for (let i = 0; i < MAX_REGIONS; i++) {
      const r = this.slots[i];
      if (r && this.t - r.born > r.life) { this.slots[i] = null; this.fieldVersion++; }
    }
    const rate = this._targetCount() / this._meanLife;          // births per day
    let births = 0;
    let p = rate * dtDays;
    while (p > 0) { if (Math.random() < Math.min(p, 1)) births++; p -= 1; }
    for (let k = 0; k < births; k++) this._spawnRegion(Math.random() * dtDays);
    this._updateStrengths();

    // Retrace loops when any region's strength changed noticeably.
    for (const r of this.slots) {
      if (r && Math.abs(r.s - r.tracedS) > 0.12) { this.fieldVersion++; break; }
    }

    // Flares: per-region Poisson rate ~ s^2 (bigger, more complex regions
    // flare more), normalized so the whole Sun produces ~0.06 x SSN C+ flares
    // per day.
    let sumS2 = 0;
    for (const r of this.slots) if (r) sumS2 += r.s * r.s;
    const K = (0.06 * this.cycle.ssn * this.cycleScale) / Math.max(sumS2, 0.3);
    for (const r of this.slots) {
      if (!r || r.s <= 0.02) continue;
      const lam = K * r.s * r.s;
      if (Math.random() < 1 - Math.exp(-lam * dtDays)) {
        const busy = r.flare && this.t - r.flare.t0 < r.flare.rise + 5 * r.flare.decay;
        if (!busy) this._flare(r, tPrev + Math.random() * dtDays, sampleFlareFlux(), state);
      }
    }

    this._stepCMEs();
  }

  _flare(r, t0, F, state, forceCME = false) {
    const fl = makeFlare(t0, F);
    r.flare = fl;
    this.lastFlare = { label: fl.label, epochMs: t0 * 86400000 };
    const lg = Math.log10(F / 1e-6);
    const pCME = Math.min(0.95, 0.15 + 0.375 * lg);
    if (forceCME || Math.random() < pCME) this._launchCME(r, fl, state);
  }

  _launchCME(r, fl, state) {
    const lg = Math.log10(fl.F / 1e-6);
    const kms = Math.min(3000, 450 * Math.pow(fl.F / 1e-6, 0.2) * Math.exp(gauss() * 0.25));
    const halfWidthDeg = Math.min(60, 12 + 9 * lg + Math.random() * 12);
    // Launch direction: the region's current world direction, plus a small
    // non-radial deflection (CMEs are often deflected by nearby field).
    sunBodyMatrix(_m, state);
    _v.set(r.c[0], r.c[1], r.c[2]).applyMatrix4(_m).normalize();
    const defl = (Math.random() * 8) * Math.PI / 180;
    const tmp = new THREE.Vector3().randomDirection().cross(_v).normalize();
    _v.applyAxisAngle(tmp, defl).normalize();
    const axis = [_v.x, _v.y, _v.z];
    const up = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const bx = norm(cross(up, axis));
    const by = norm(cross(axis, bx));
    const cme = {
      id: this._nextId++,
      t0: fl.t0,
      tAcc: Math.max(fl.rise, 5 / 1440),
      v0: kms * KMS_TO_RDAY,
      kms,
      halfWidth: halfWidthDeg * Math.PI / 180,
      axis, bx, by,
      label: fl.label,
      prevR: 1,
      hitEarth: false,
      seed: Math.random(),
    };
    let slot = this.cmes.indexOf(null);
    if (slot < 0) {
      // recycle the oldest
      let oldest = 0;
      for (let i = 1; i < MAX_CMES; i++) if (this.cmes[i].t0 < this.cmes[oldest].t0) oldest = i;
      slot = oldest;
    }
    this.cmes[slot] = cme;
    this.lastCME = { kms: Math.round(kms), widthDeg: Math.round(2 * halfWidthDeg), epochMs: fl.t0 * 86400000, label: fl.label };

    // Earth-directed? Then predict arrival.
    const e = earthDirection(fl.t0 * 86400000);
    const ang = Math.acos(Math.min(1, axis[0] * e.dir[0] + axis[1] * e.dir[1] + axis[2] * e.dir[2]));
    if (ang < cme.halfWidth) {
      const tArr = cmeTimeAtR(cme, e.rSun);
      if (tArr) this.earthETA = { epochMs: tArr * 86400000, kms: Math.round(cmeSpeedKms(cme, tArr)), id: cme.id };
    }
  }

  _stepCMEs() {
    const e = earthDirection(this.epochMs);
    for (let i = 0; i < MAX_CMES; i++) {
      const c = this.cmes[i];
      if (!c) continue;
      const r = cmeFrontR(c, this.t);
      if (!c.hitEarth && c.prevR < e.rSun && r >= e.rSun) {
        const ang = Math.acos(Math.min(1, c.axis[0] * e.dir[0] + c.axis[1] * e.dir[1] + c.axis[2] * e.dir[2]));
        if (ang < c.halfWidth) {
          c.hitEarth = true;
          this.earthImpact = { epochMs: this.epochMs, kms: Math.round(cmeSpeedKms(c, this.t)), label: c.label };
          if (this.earthETA && this.earthETA.id === c.id) this.earthETA = null;
        }
      }
      c.prevR = r;
      if (r > R_EARTH_ORBIT_MAX) this.cmes[i] = null;
    }
  }

  // Manual trigger: an M/X flare with a CME from the region best placed to
  // be seen (near the limb on the camera's side). If no region is visible,
  // one emerges there first.
  fire(cameraPos, state) {
    if (this.t === null) return;
    sunBodyMatrix(_m, state);
    const view = new THREE.Vector3().copy(cameraPos).normalize();
    let best = null, bestScore = -1;
    for (const r of this.slots) {
      if (!r || r.s < 0.05) continue;
      _v.set(r.c[0], r.c[1], r.c[2]).applyMatrix4(_m);
      const d = _v.dot(view);
      if (d < -0.15) continue;                    // behind the limb
      const score = (1 - Math.abs(d)) + r.s * 0.3;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (!best) {
      this._spawnRegion(4);
      best = this.slots[this.slots.findLastIndex((x) => x)];
      if (!best) return;
      this._updateStrengths();
    }
    // M1..X3: big enough to see, without rolling a once-a-cycle monster.
    this._flare(best, this.t, Math.min(sampleFlareFlux(1e-5), 3e-4), state, true);
  }

  // World-space unit direction of a region's centre right now.
  worldDir(r, state) {
    sunBodyMatrix(_m, state);
    _v.set(r.c[0], r.c[1], r.c[2]).applyMatrix4(_m).normalize();
    return [_v.x, _v.y, _v.z];
  }

  regions() { return this.slots; }
  activeCount() { return this.slots.reduce((n, r) => n + (r && r.s > 0.02 ? 1 : 0), 0); }
  regionGlow(r) { return postFlareGlow(r.flare, this.t); }
}

export const sunActivity = new SunActivity();
try { if (typeof window !== 'undefined') window.__sunActivity = sunActivity; } catch { /* no-op */ }
