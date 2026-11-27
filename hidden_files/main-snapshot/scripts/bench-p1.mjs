import { resolveChromePath } from './chrome-path.mjs';
// P1/P2 bench + gate script (throttled shared sandbox — numbers are
// labelled sandbox figures, not device figures):
//  - busy scene (~5,400 particles) at 412x915: median + p95 rAF interval
//    for 2D path, GL Low, GL Med, GL High
//  - same scene on a 576x324 grid: GL High + 2D
//  - screenshots: every view mode + every texture quality (busy scene)
//  - watchdog fault injection: GL present forced to background colour ->
//    fallback must engage + notice must show
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = process.env.SHOTS_DIR || '/home/hatch/workspace/matter-lab-shots/p1';
mkdirSync(SHOTS, { recursive: true });
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
const EXTRA_FLAGS = (process.env.CHROME_FLAGS || '').split(/\s+/).filter(Boolean);
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage', ...EXTRA_FLAGS] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await wait(6000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || ''));
  if (b) b.click();
});
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await wait(3000);

const glState0 = await page.evaluate(() => (window.__matterlab && window.__matterlab.gl ? window.__matterlab.gl() : null));
console.log('GL-STATE', JSON.stringify(glState0));

// Busy scene: mixed substances + a beaker, topped up to ~5,400 particles.
const sceneInfo = await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine;
  const fx = (f) => Math.round(e.cols * f), fy = (f) => Math.round(e.rows * f);
  M.placeObject('beaker-l', fx(0.55), fy(0.72));
  M.place('stone', fx(0.5), fy(0.97), 60);
  M.place('sand', fx(0.3), fy(0.15), 17); M.place('sand', fx(0.62), fy(0.1), 17);
  M.place('water', fx(0.45), fy(0.3), 15); M.place('oil', fx(0.7), fy(0.35), 12);
  M.place('lava', fx(0.85), fy(0.12), 9); M.place('wood', fx(0.15), fy(0.5), 12);
  M.place('salt', fx(0.35), fy(0.55), 10); M.place('iron', fx(0.8), fy(0.55), 8);
  let guard = 0;
  while (e.stats().particles < 5400 && guard++ < 60) {
    M.place('sand', fx(0.2 + 0.6 * ((guard * 37) % 10) / 10), fy(0.08 + 0.1 * ((guard * 13) % 5) / 5), 11);
    M.place('water', fx(0.25 + 0.5 * ((guard * 29) % 8) / 8), fy(0.2 + 0.15 * ((guard * 7) % 4) / 4), 9);
  }
  M.step(45);
  return { cols: e.cols, rows: e.rows, particles: e.stats().particles };
});
console.log('SCENE', JSON.stringify(sceneInfo));
await wait(1200);

const measure = async (label) => {
  const ts = await page.evaluate(() => new Promise((res) => {
    const arr = []; let last = 0;
    const step = (t) => { if (last) arr.push(t - last); last = t; if (arr.length < 330) requestAnimationFrame(step); else res(arr.slice(30)); };
    requestAnimationFrame(step);
  }));
  ts.sort((a, b) => a - b);
  const med = ts[Math.floor(ts.length / 2)], p95 = ts[Math.floor(ts.length * 0.95)];
  const gl = await page.evaluate(() => window.__matterlab.gl());
  console.log(`PERF ${label}: median=${med.toFixed(1)}ms p95=${p95.toFixed(1)}ms n=${ts.length} gl=${JSON.stringify(gl)}`);
  return { label, median: +med.toFixed(1), p95: +p95.toFixed(1) };
};

const results = [];
await page.evaluate(() => { window.__matterlab.setGLRenderer(false); });
await wait(700);
results.push(await measure('2d-242x536'));
await page.evaluate(() => { window.__matterlab.setGLRenderer(true); window.__matterlab.setTexQuality('low'); });
await wait(700);
results.push(await measure('gl-low'));
await page.evaluate(() => { window.__matterlab.setTexQuality('med'); });
await wait(700);
results.push(await measure('gl-med'));
await page.evaluate(() => { window.__matterlab.setTexQuality('high'); });
await wait(700);
results.push(await measure('gl-high'));

// Screenshots: view modes (High), then texture qualities (Normal view).
for (const vm of ['normal', 'heat', 'pressure', 'flow']) {
  await page.evaluate((m) => { window.__matterlab.setViewMode(m); window.__matterlab.setTexQuality('high'); }, vm);
  await wait(900);
  await page.screenshot({ path: `${SHOTS}/view-${vm}.png` });
}
for (const q of ['low', 'med', 'high']) {
  await page.evaluate((qq) => { window.__matterlab.setViewMode('normal'); window.__matterlab.setTexQuality(qq); }, q);
  await wait(900);
  await page.screenshot({ path: `${SHOTS}/quality-${q}.png` });
}
console.log('SHOTS done');

// 576x324 grid scene.
const big = await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine;
  e.resize(576, 324);
  M.zeroOffscreen();
  const fx = (f) => Math.round(e.cols * f), fy = (f) => Math.round(e.rows * f);
  M.place('stone', fx(0.5), fy(0.97), 80);
  M.place('sand', fx(0.3), fy(0.15), 20); M.place('water', fx(0.5), fy(0.3), 18);
  M.place('lava', fx(0.85), fy(0.12), 11); M.place('oil', fx(0.68), fy(0.35), 13);
  let guard = 0;
  while (e.stats().particles < 5400 && guard++ < 60) M.place('sand', fx(0.15 + 0.7 * ((guard * 37) % 12) / 12), fy(0.1), 13);
  M.step(45);
  return { cols: e.cols, rows: e.rows, particles: e.stats().particles };
});
console.log('SCENE-576x324', JSON.stringify(big));
await wait(1200);
await page.evaluate(() => { window.__matterlab.setGLRenderer(true); window.__matterlab.setTexQuality('high'); });
await wait(700);
results.push(await measure('gl-high-576x324'));
await page.evaluate(() => { window.__matterlab.setGLRenderer(false); });
await wait(700);
results.push(await measure('2d-576x324'));
await page.screenshot({ path: `${SHOTS}/scene-576x324-2d.png` });

// Watchdog fault injection: GL present forced to pure background colour.
// Back on the small grid first: the watchdog samples every 30th FRAME, so
// at sandbox GL frame rates the two strikes need wall-clock time — poll
// generously (on a 60fps device this engages in ~1s).
await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine;
  e.resize(242, 536); M.zeroOffscreen();
  M.place('sand', 80, 60, 16); M.place('lava', 180, 40, 9); M.step(20);
  M.setGLRenderer(true); M.setTexQuality('high');
});
await wait(800);
const sabOk = await page.evaluate(() => window.__matterlab.sabotageGL(true));
let fi = null;
for (let k = 0; k < 80; k++) {
  await wait(500);
  fi = await page.evaluate(() => ({ gfx: window.__matterlab.gfx(), notice: !!document.querySelector('[data-gfxnotice]'), noticeVal: (document.querySelector('[data-gfxnotice]') || {}).getAttribute ? document.querySelector('[data-gfxnotice]').getAttribute('data-gfxnotice') : null }));
  if (fi.gfx.fallback) break;
}
console.log('FI', JSON.stringify({ sabOk, ...fi }));
await page.screenshot({ path: `${SHOTS}/fi-gl-black-fallback.png` });

console.log('RESULTS', JSON.stringify(results));
console.log('ERRORS', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
srv.close();
