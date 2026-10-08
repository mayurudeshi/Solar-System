// Filmstrip harness for the v2 Sun (activity model). Serve a build first:
//   npx vite preview --port 4318
// node tools/render_sun2.mjs <outPrefix> <mode> [url]
//   mode "close": zoom 13, slow sim (0.01x), fire a CME, frames over ~12 s
//   mode "flare": zoom 13, 0.001x, X2 flare on the region nearest disk centre
//   mode "wide":  zoom 70, 1x, fire a CME, frames every 0.4 s (CME transit)
import { chromium } from 'playwright';
const out = process.argv[2];
const mode = process.argv[3] || 'close';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
await page.goto(process.argv[4] || 'http://localhost:4318',{ waitUntil: 'networkidle' });
await page.waitForSelector('canvas');
await page.evaluate(() => { const s = window.__solarStore.getState(); s.setVantage('sun'); s.toggleLabels(); s.toggleOrbits(); });
await page.waitForTimeout(2500);
const zoom = mode === 'wide' ? 70 : 13;
await page.evaluate(async (z) => { for (let i = 0; i < 5; i++) { window.__setZoom(z); await new Promise((r) => setTimeout(r, 150)); } }, zoom);
await page.evaluate((m) => {
  const s = window.__solarStore.getState();
  s.setSpeed(m === 'wide' ? 1 : 0.01);
  if (s.paused) s.togglePause();
}, mode);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}_full.png` });
if (mode === 'flare') {
  // Force an X2 flare (no CME) on the region nearest disk centre at 0.001x.
  await page.evaluate(() => {
    const st = window.__solarStore.getState();
    st.setSpeed(0.001);
    const A = window.__sunActivity;
    let best = null, bd = -2;
    for (const r of A.regions()) {
      if (!r || r.s < 0.1) continue;
      const cam = window.__camera.position.clone().normalize();
      const w = A.worldDir(r, st);
      const d = w[0] * cam.x + w[1] * cam.y + w[2] * cam.z;
      if (d > bd) { bd = d; best = r; }
    }
    if (best) A._flare(best, A.t, 2e-4, st, false);
  });
} else {
  await page.evaluate(() => window.__fireCME());
}
const frames = 8;
const gap = mode === 'wide' ? 400 : 1500;
for (let i = 0; i < frames; i++) {
  await page.waitForTimeout(gap);
  await page.screenshot({ path: `${out}_${i}.png` });
}
const info = await page.evaluate(() => window.__solarStore.getState().sunInfo);
console.log(JSON.stringify(info));
console.log(logs.slice(0, 15).join('\n') || 'no errors');
await browser.close();
