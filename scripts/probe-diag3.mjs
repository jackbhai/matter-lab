// Diagnostic: identify the ghost button over the beaker, test fill/toggle
// with Phase-2-style interactions vs real clicks, on the PR3-resynced tree.
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\\.\\.[/\\\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await sleep(5000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || '')); if (b) b.click(); });
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await sleep(2500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Skip tutorial/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(600);
// calibrate (Phase-2 method)
async function calibrate(page) {
  const dot = async (x, y) => { await page.mouse.click(x, y); await sleep(40); return page.evaluate(() => { const e = window.__matterlab.engine; let mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, n = 0; for (let i = 0; i < e.el.length; i++) if (e.el[i]) { const cx = i % e.cols, cy = (i / e.cols) | 0; if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx; if (cy < mny) mny = cy; if (cy > mxy) mxy = cy; n++; } if (!n) return null; return { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 }; }); };
  let d1 = await dot(80, 200); if (!d1) { await sleep(700); d1 = await dot(80, 200); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  let d2 = await dot(330, 500); if (!d2) { await sleep(700); d2 = await dot(330, 500); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(200);
  const aX = (d2.cx - d1.cx) / 250, bX = d1.cx - aX * 80;
  const aY = (d2.cy - d1.cy) / 300, bY = d1.cy - aY * 200;
  return { toScreen: (cx, cy) => ({ x: (cx - bX) / aX, y: (cy - bY) / aY }), aX, aY };
}
const CAL = await calibrate(page);
console.log('cal', CAL.aX.toFixed(3), CAL.aY.toFixed(3));
const objs = () => page.evaluate(() => { const e = window.__matterlab.engine; return [...e.objects.values()].map((o) => ({ kind: o.kind, x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h, level: o.level })); });
const clickText = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(src, 'i').test(x.innerText || x.getAttribute('aria-label') || '')); if (b) { b.click(); return b.innerText.slice(0, 40); } return null; }, re.source || re);
// place beaker (Phase-2 style evaluate clicks)
await clickText(/^Gear$/); await sleep(900);
await page.evaluate(() => { const t = document.querySelector('[data-gear="beaker-m"]'); if (t) { t.scrollIntoView({ block: 'center' }); t.click(); } });
await sleep(900);
let os = await objs(); const bk = os.find((o) => o.kind.startsWith('beaker'));
console.log('beaker:', JSON.stringify(bk), 'grid:', await page.evaluate(() => { const e = window.__matterlab.engine; return e.cols + 'x' + e.rows; }));
const c = CAL.toScreen(bk.x + bk.w / 2, bk.y + bk.h / 2);
console.log('beaker centre screen:', JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y) }));
const stack = await page.evaluate((p) => {
  const els = document.elementsFromPoint(p.x, p.y).slice(0, 6).map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 45) + ' "' + (el.innerText || '').slice(0, 30).replace(/\n/g, ' ') + '"');
  const bar = document.querySelector('[data-selbar="1"]');
  const barBtns = bar ? [...bar.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { t: (b.innerText || '').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }) : null;
  const barRect = bar ? (() => { const r = bar.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null;
  return { stack: els, barRect, barBtns };
}, c);
console.log('elementsFromPoint at beaker centre:', JSON.stringify(stack, null, 1));
await page.screenshot({ path: '/home/hatch/workspace/matter-lab-shots/feel-tests/diag-beaker-selected.png' });
const path = await page.evaluate((p) => { const bar = document.querySelector('[data-selbar="1"]'); const btns = [...bar.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { t: (b.innerText || '').trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }); return btns; });
console.log('ALL selbar buttons:', JSON.stringify(path));
console.log('stroke path would be: from', JSON.stringify((() => { const a = CAL.toScreen(bk.x + 3, bk.y + Math.floor(bk.h * 0.45)); return { x: Math.round(a.x), y: Math.round(a.y) }; })()), 'to', JSON.stringify((() => { const a = CAL.toScreen(bk.x + bk.w - 4, bk.y + Math.floor(bk.h * 0.45)); return { x: Math.round(a.x), y: Math.round(a.y) }; })()));
// select water (evaluate clicks), then REAL-mouse paint into beaker with selbar still open
await clickText(/^Liquids$/); await sleep(800);
await page.evaluate(() => { const t = document.querySelector('[data-tile="water"]'); if (t) t.click(); });
await sleep(500);
const fillMeasure = () => page.evaluate(() => { const e = window.__matterlab.engine; const b = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); if (!b) return { beakerGone: true }; let n = 0; for (const i of b.interior) if (e.el[i]) n++; return { filled: n, worldWater: window.__matterlab.countKey('water') }; });
for (let k = 0; k < 3; k++) {
  const a = CAL.toScreen(bk.x + 3, bk.y + Math.floor(bk.h * 0.45)), b2 = CAL.toScreen(bk.x + bk.w - 4, bk.y + Math.floor(bk.h * 0.45));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b2.x, b2.y, { steps: 6 }); await page.mouse.up(); await sleep(250);
}
await sleep(1200);
console.log('fill with selbar OPEN (real mouse):', JSON.stringify(await fillMeasure()));
console.log('objs after strokes:', JSON.stringify(await objs()));
await browser.close(); srv.close(); console.log('DIAG DONE');
