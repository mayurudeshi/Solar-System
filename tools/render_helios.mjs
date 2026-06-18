// Verify the HELIOS plasma LOD integration against a LOCAL build.
//   node tools/render_helios.mjs <baseUrl>
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:8123';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11','--use-gl=angle','--enable-gpu','--ignore-gpu-blocklist','--enable-webgl','--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(base, { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForFunction(() => !!window.__solarStore && !!window.__setZoom, { timeout: 15000 });

const setView = async (dist) => {
  await page.evaluate((d) => {
    window.__solarStore.getState().setVantage('sun');
    window.__setZoom(d);
  }, dist);
};

// 1) System view — plasma should be OFF (invisible, near-zero cost)
await setView(220);
await page.waitForTimeout(1500);
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_helios_systemview.png' });

// 2) Close-up — plasma spins up; let it populate
await setView(20);
await page.waitForTimeout(4500);
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_helios_closeup.png' });

// 3) Fire a CME and catch it mid-flight
await page.evaluate(() => {
  if (window.__fireCME) window.__fireCME();
  else window.__solarStore.getState().fireCME();
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_helios_cme.png' });

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
