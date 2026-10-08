// Headless statistics check of the solar activity model: flare/CME rates,
// loop heights, CME transit times. node tools/sun_sim_check.mjs
import { sunActivity, cmeFrontR, cmeSpeedKms } from '../src/sun/activity.js';
import { traceRegionLoops } from '../src/sun/fieldLines.js';

const state = { spinEpochMs: Date.now(), showRotation: true, slowRotation: false };
let ep = Date.parse('2026-10-08T00:00:00Z');
sunActivity.step(ep, state);
console.log('regions', sunActivity.activeCount(), 'ssn', sunActivity.cycle.ssn.toFixed(0));
const flares = { C: 0, M: 0, X: 0 };
let cmes = 0, last = null, impacts = 0, lastImp = null;
const seen = new Set();
for (let i = 0; i < 60 * 100; i++) {
  ep += 86400000 / 60; state.spinEpochMs = ep;
  sunActivity.step(ep, state);
  const lf = sunActivity.lastFlare;
  if (lf && lf !== last) { flares[lf.label[0]]++; last = lf; }
  for (const c of sunActivity.cmes) if (c && !seen.has(c.id)) { seen.add(c.id); cmes++; }
  if (sunActivity.earthImpact && sunActivity.earthImpact !== lastImp) { impacts++; lastImp = sunActivity.earthImpact; }
}
console.log('100 days: flares', flares, 'cmes', cmes, 'earth impacts', impacts, 'regions now', sunActivity.activeCount());
const t0 = performance.now();
const lines = traceRegionLoops(sunActivity.regions(), sunActivity.cycle.parity);
console.log('lines', lines.length, 'open', lines.filter((l) => l.open).length,
  'pts', lines.reduce((a, l) => a + l.pts.length, 0), 'ms', (performance.now() - t0).toFixed(1));
const h = lines.filter((l) => !l.open).map((l) => Math.max(...l.pts.map((p) => Math.hypot(...p)))).sort((a, b) => a - b);
console.log('closed loop heights (R): min', h[0]?.toFixed(3), 'median', h[h.length >> 1]?.toFixed(3), 'max', h[h.length - 1]?.toFixed(3));
for (const kms of [450, 1000, 2000]) {
  const c = { t0: 0, tAcc: 15 / 1440, v0: kms * 86400 / 695700 };
  let t = 0; while (cmeFrontR(c, t) < 215) t += 0.001;
  console.log(kms, 'km/s -> Earth in', t.toFixed(2), 'days, arrives at', cmeSpeedKms(c, t).toFixed(0), 'km/s');
}
