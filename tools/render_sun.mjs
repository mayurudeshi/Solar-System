// Headless WebGL render harness — loads the deployed (or local) solar system,
// drives the camera to the Sun vantage at a given zoom, waits for the scene to
// settle, and screenshots the canvas. Lets Claude SEE its own shader changes
// instead of tuning blind.
//
// Usage:
//   node tools/render_sun.mjs <url> <out.png> [zoomDist] [waitMs]
//
// Uses GPU via ANGLE/D3D11 (RTX 5070 Ti on this machine). WebGL in headless
// Chromium needs --use-gl=angle + --enable-unsafe-swiftshader fallback.

import { chromium } from 'playwright';

const url = process.argv[2] || 'https://solar-system-olive-gamma.vercel.app';
const out = process.argv[3] || 'tools/_render.png';
const zoomDist = parseFloat(process.argv[4] || '12');
const waitMs = parseInt(process.argv[5] || '6000', 10);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--use-gl=angle',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--enable-unsafe-swiftshader', // CPU fallback if GPU path fails
  ],
});

// MOBILE=1 emulates an S24-class phone (Android UA, coarse pointer, high DPR)
// to exercise the mobile render path. Note: headless uses ANGLE/SwiftShader,
// not a real Adreno, so driver-specific GPU bugs may not reproduce — but it
// DOES verify the mobile code path (e.g. PostFX skipping on mobile UA).
const page = process.env.MOBILE === '1'
  ? await browser.newPage({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    })
  : await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });

// Capture console + errors so we can see WebGL failures.
const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

// Inject BODIES_ONLY list before driving the scene.
const bodiesOnly = process.env.BODIES_ONLY ? process.env.BODIES_ONLY.split(',') : null;
if (bodiesOnly) {
  await page.evaluate((list) => { window.__bodiesOnly = list; }, bodiesOnly);
}
if (process.env.DATE) {
  const ms = new Date(process.env.DATE).getTime();
  await page.evaluate((m) => { window.__dateMs = m; }, ms);
}

// Wait for the R3F canvas to exist.
await page.waitForSelector('canvas', { timeout: 15000 });

// Probe WebGL availability + renderer string (confirms GPU vs swiftshader).
const glInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { ok: false, reason: 'no canvas' };
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { ok: false, reason: 'no webgl context' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    ok: true,
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'unknown',
    canvasW: c.width,
    canvasH: c.height,
  };
});

// Set the Sun vantage via the exposed zustand store, let the camera lerp
// converge, then set an exact zoom distance via the __setZoom hook.
const enableV15 = process.env.SUN_V15 === '1';
const vantage = process.env.VANTAGE || 'sun';
const drove = await page.evaluate(async ({ targetDist, enableV15, vantage }) => {
  const result = { method: null, vantageSet: false, zoomSet: false, v15: false };
  const store = window.__solarStore;
  if (store) {
    store.getState().setVantage(vantage);
    // DATE=YYYY-MM-DD drives orbital position (e.g. Saturn ring tilt to Sun).
    if (window.__dateMs && store.getState().setEpochMs) {
      store.getState().setEpochMs(window.__dateMs);
    }
    if (enableV15 && !store.getState().sunV15) { store.getState().toggleSunV15(); result.v15 = true; }
    // BODIES_ONLY="Earth,Jupiter" → show only those planets (v1.6 test)
    if (window.__bodiesOnly) {
      const st = store.getState();
      if (st.showOnlySun) {
        st.showOnlySun();
        window.__bodiesOnly.forEach((n) => st.toggleBody(n));
        result.bodiesOnly = window.__bodiesOnly;
      }
    }
    result.vantageSet = true;
    result.method = 'store';
  } else {
    // Fallback: UI click
    const buttons = Array.from(document.querySelectorAll('button, .seg-btn, [role=button]'));
    const sunBtn = buttons.find((b) => b.textContent.trim() === 'Sun');
    if (sunBtn) { sunBtn.click(); result.vantageSet = true; result.method = 'ui-click'; }
  }
  return result;
}, { targetDist: zoomDist, enableV15, vantage });

// Optional: crank sim speed to accumulate time-dependent artifacts
// (e.g. photosphere differential-rotation banding builds over sim-days).
const soakSpeed = parseFloat(process.env.SUN_SPEED || '0');
const soakMs = parseInt(process.env.SUN_SOAK_MS || '0', 10);
if (soakSpeed > 0 && soakMs > 0) {
  await page.evaluate((sp) => {
    const s = window.__solarStore;
    if (s) s.getState().setSpeed(sp);
  }, soakSpeed);
  await page.waitForTimeout(soakMs);
}

// Let camera lerp toward Sun target first.
await page.waitForTimeout(2500);

// Now force exact zoom distance, repeatedly (the lerp + setZoom fight a bit;
// apply a few times so it sticks).
const zoomResult = await page.evaluate(async (targetDist) => {
  if (typeof window.__setZoom !== 'function') return { ok: false, reason: 'no __setZoom' };
  let ok = false;
  for (let i = 0; i < 5; i++) {
    ok = window.__setZoom(targetDist);
    await new Promise((r) => setTimeout(r, 150));
  }
  const c = window.__controls;
  const cam = window.__camera;
  const dist = c && cam ? cam.position.distanceTo(c.target) : null;
  return { ok, finalDist: dist };
}, zoomDist);
drove.zoomResult = zoomResult;

// Let animation (CME pulses, photosphere noise) settle/advance.
await page.waitForTimeout(waitMs);

await page.screenshot({ path: out });

console.log(JSON.stringify({ glInfo, drove, out, logs: logs.slice(0, 20) }, null, 2));

await browser.close();
