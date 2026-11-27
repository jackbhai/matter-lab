import { resolveChromePath } from './chrome-path.mjs';
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
    const data = await readFile(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await wait(6000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || '')); if (b) b.click(); });
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await wait(3000);
await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine;
  M.place('sand', 80, 60, 16); M.place('lava', 180, 40, 9); M.step(20);
});
await wait(800);
const before = await page.evaluate(() => window.__matterlab.gl());
console.log('GL before sabotage', JSON.stringify(before));
console.log('sabotage ->', await page.evaluate(() => window.__matterlab.sabotageGL(true)));
for (let k = 0; k < 40; k++) { await wait(1000); const f = await page.evaluate(() => window.__matterlab.gfx()); if (f.fallback) { console.log('FI engaged after ~' + (k + 1) + 's', JSON.stringify(f)); break; } if (k === 39) console.log('FI NOT engaged in 40s'); }
const diag = await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine;
  const c = document.querySelector('[data-mlroot="1"] canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let nonBg = 0, alpha0 = 0; const colours = {};
  for (let i = 0; i < d.length; i += 4 * 37) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a === 0) alpha0++;
    if (a > 0 && !(r === 10 && gg === 12 && b === 18)) { nonBg++; const k = `${r},${gg},${b}`; colours[k] = (colours[k] || 0) + 1; }
  }
  // first live cell (same strided scan as wdCheck)
  let first = -1;
  for (let i = 0; i < e.el.length; i += 211) if (e.el[i]) { first = i; break; }
  return { gfx: M.gfx(), gl: M.gl(), canvas: { w: c.width, h: c.height }, nonBg, alpha0, topColours: Object.entries(colours).sort((a, b) => b[1] - a[1]).slice(0, 6), firstCell: first, firstXY: first >= 0 ? [first % e.cols, (first / e.cols) | 0] : null, objects: (() => { try { return [...e.objects].map((o) => o.kind || String(o)); } catch { return 'n/a'; } })(), particles: e.stats().particles };
});
console.log('DIAG', JSON.stringify(diag, null, 1));
await browser.close(); srv.close();
