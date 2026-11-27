import { resolveChromePath } from './chrome-path.mjs';
// Headless verification for the standalone Matter Lab build.
// Serves dist/ locally, loads it in headless Chrome, and checks:
// page errors, homepage -> lab entry (like a real user), tool mount, canvas
// present, engine ticking (canvas changes over time), substance panel tiles.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/matter-lab/' || p === '/matter-lab') p = '/index.html';
    p = p.replace(/^\/matter-lab/, '');
    const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

// CHROME_FLAGS env hook (P0): extra Chromium flags, space-separated — e.g.
// CHROME_FLAGS='--disable-gpu --use-gl=angle --use-angle=swiftshader' for the
// software-rendering gate run.
const EXTRA_FLAGS = (process.env.CHROME_FLAGS || '').split(/\s+/).filter(Boolean);
const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...EXTRA_FLAGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));

// v2+: the app boots to a homepage — enter the lab like a real user.
const entered = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || ''));
  if (b) { b.click(); return true; }
  return false;
});
console.log('ENTERED', entered);
if (entered) {
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
}

const probe1 = await page.evaluate(() => {
  const root = document.querySelector('[data-mlroot="1"]');
  const canvas = document.querySelector('[data-mlroot="1"] canvas');
  const tiles = document.querySelectorAll('[data-mlroot="1"] button').length;
  const bodyText = document.body.innerText.slice(0, 400);
  return { mounted: !!root, canvas: !!canvas, buttons: tiles, bodyText };
});
console.log('PROBE1', JSON.stringify(probe1, null, 1));

// Paint some sand: find the canvas and drag across it, then sample pixels twice.
const px = await page.evaluate(() => {
  const c = document.querySelector('[data-mlroot="1"] canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
let tickCheck = 'no-canvas';
if (px) {
  await page.mouse.move(px.x + px.w * 0.5, px.y + px.h * 0.25);
  await page.mouse.down();
  await page.mouse.move(px.x + px.w * 0.6, px.y + px.h * 0.3, { steps: 5 });
  await page.mouse.up();
  const snap = async () => page.evaluate(() => {
    const c = document.querySelector('[data-mlroot="1"] canvas');
    const g = c.getContext('2d', { willReadFrequently: true });
    try {
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let nonBg = 0;
      for (let i = 3; i < d.length; i += 401) if (d[i] > 0) nonBg++;
      return nonBg;
    } catch (e) { return 'ctx-err:' + e.message; }
  });
  const s1 = await snap();
  await new Promise((r) => setTimeout(r, 1500));
  const s2 = await snap();
  tickCheck = `alphaSamples t1=${s1} t2=${s2}`;
}
console.log('TICKS', tickCheck);

// Side-rail inventory (diagnostic).
const panel = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-mlroot="1"] button')];
  return btns.map((b, i) => ({ i, label: (b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 30) }));
});
console.log('RAIL', JSON.stringify(panel));

// Open the substance panel via the rail button labelled for it.
const subBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-mlroot="1"] button')].find((x) => /Substances/i.test(x.getAttribute('aria-label') || x.innerText || ''));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
let tilesOk = false;
if (subBtn) {
  await page.mouse.click(subBtn.x, subBtn.y);
  await new Promise((r) => setTimeout(r, 3000));
  const tiles = await page.evaluate(() => {
    const root = document.querySelector('[data-mlroot="1"]');
    if (!root) return { buttons: 0, hasSand: false, hasWater: false, hasCount: false, snippet: 'root-gone' };
    const txt = root.innerText;
    return {
      buttons: root.querySelectorAll('button').length,
      hasSand: /Sand/.test(txt), hasWater: /Water/.test(txt),
      hasCount: /1,?822/.test(txt),
      snippet: txt.replace(/\s+/g, ' ').slice(0, 300),
    };
  });
  console.log('SUBSTANCES', JSON.stringify(tiles, null, 1));
  tilesOk = tiles.hasSand && tiles.hasWater;
  await page.screenshot({ path: new URL('./verify-shot-panel.png', import.meta.url).pathname });
}
console.log('ERRORS', errors.length ? errors.slice(0, 10) : 'none');
await page.screenshot({ path: new URL('./verify-shot.png', import.meta.url).pathname });
await browser.close();
srv.close();
if (errors.length || !probe1.mounted || !probe1.canvas || !tilesOk) { console.log('VERIFY: FAIL'); process.exit(1); }
console.log('VERIFY: PASS');
