// One-off harness to take the CME field HTML for a spin and capture frames.
import { chromium } from 'playwright';

const file = 'file:///C:/Users/Mayur-A/Downloads/solar_cme_field.html';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11','--use-gl=angle','--enable-gpu','--ignore-gpu-blocklist','--enable-webgl','--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));

await page.goto(file, { waitUntil: 'load' });
await page.waitForTimeout(3500); // let loops populate + auto-eruptions settle

// snapshot live stats from the running sim
const stat = async () => page.evaluate(() => ({
  fps: document.getElementById('sFps')?.textContent,
  count: document.getElementById('sCount')?.textContent,
  webgl: !!document.querySelector('canvas'),
}));

console.log('default state:', JSON.stringify(await stat()));
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_cme_default.png' });

// fire a CME and catch the eruption mid-flight
await page.click('#fire');
await page.waitForTimeout(550);
console.log('post-fire :', JSON.stringify(await stat()));
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_cme_fired.png' });

// crank eruption freq + loop activity, switch to Plasma (blue) palette
await page.evaluate(() => {
  const set = (id,v) => { const s=document.getElementById(id); s.value=v; s.dispatchEvent(new Event('input')); };
  set('freq',100); set('loop',100); set('wind',80);
});
await page.click('#palette button[data-p="1"]');
await page.waitForTimeout(1600);
console.log('plasma/high:', JSON.stringify(await stat()));
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_cme_plasma.png' });

// aurora palette, fire again
await page.click('#palette button[data-p="2"]');
await page.click('#fire');
await page.waitForTimeout(600);
console.log('aurora/fire:', JSON.stringify(await stat()));
await page.screenshot({ path: 'C:/Users/Mayur-A/Downloads/_cme_aurora.png' });

console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
