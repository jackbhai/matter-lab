// Diagnostic 2: replicate the run-4 real-click flow, then identify exactly
// which elements cover the beaker centre after Water is selected.
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
async function rectOf(fn, arg) { return page.evaluate((src, a) => { const f = eval(src); const el = f(a); if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, fn.toString(), arg); }
const byText = (a) => [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(a, 'i').test(x.innerText || x.getAttribute('aria-label') || ''));
const bySel = (a) => document.querySelector(a);
async function tap(fn, arg) { const r = await rectOf(fn, arg); if (!r) { console.log('MISS'); return; } await page.mouse.click(r.cx, r.cy); }
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await sleep(5000);
await tap(byText, 'Enter Free Sandbox|Open the lab');
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await sleep(2500);
await tap(byText, 'Skip tutorial'); await sleep(600);
// settle grid
let last = '', stable = 0;
for (let i = 0; i < 25 && stable < 3; i++) { const d = await page.evaluate(() => window.__matterlab.engine.cols + 'x' + window.__matterlab.engine.rows); if (d === last) stable++; else { stable = 0; last = d; } await sleep(1000); }
console.log('settled grid:', last);
// calibrate
async function calibrate() {
  const dot = async (x, y) => { await page.mouse.click(x, y); await sleep(40); return page.evaluate(() => { const e = window.__matterlab.engine; let mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, n = 0; for (let i = 0; i < e.el.length; i++) if (e.el[i]) { const cx = i % e.cols, cy = (i / e.cols) | 0; if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx; if (cy < mny) mny = cy; if (cy > mxy) mxy = cy; n++; } if (!n) return null; return { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 }; }); };
  let d1 = await dot(80, 200); if (!d1) { await sleep(700); d1 = await dot(80, 200); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  let d2 = await dot(330, 500); if (!d2) { await sleep(700); d2 = await dot(330, 500); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(200);
  const aX = (d2.cx - d1.cx) / 250, bX = d1.cx - aX * 80;
  const aY = (d2.cy - d1.cy) / 300, bY = d1.cy - aY * 200;
  return { toScreen: (cx, cy) => ({ x: (cx - bX) / aX, y: (cy - bY) / aY }) };
}
const CAL = await calibrate();
const objs = () => page.evaluate(() => [...window.__matterlab.engine.objects.values()].map((o) => ({ kind: o.kind, x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h, level: o.level })));
await tap(byText, '^Gear$'); await sleep(900);
await page.evaluate(() => { const t = document.querySelector('[data-gear="beaker-m"]'); if (t) { t.scrollIntoView({ block: 'center' }); } });
await sleep(400);
await tap(bySel, '[data-gear="beaker-m"]'); await sleep(900);
let bk = (await objs()).find((o) => o.kind.startsWith('beaker'));
console.log('beaker:', JSON.stringify(bk));
await tap(byText, '^Liquids$'); await sleep(800);
await tap(bySel, '[data-tile="water"]'); await sleep(500);
const c = CAL.toScreen(bk.x + bk.w / 2, bk.y + bk.h / 2);
console.log('beaker centre screen:', Math.round(c.x), Math.round(c.y));
const ident = (p) => page.evaluate((pt) => {
  const els = document.elementsFromPoint(pt.x, pt.y).slice(0, 8).map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), text: (el.innerText || '').slice(0, 40).replace(/\n/g, ' '), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, pe: getComputedStyle(el).pointerEvents }; });
  return els;
}, p);
console.log('STACK at beaker centre (strip open, water selected):');
console.log(JSON.stringify(await ident(c), null, 1));
await page.screenshot({ path: '/home/hatch/workspace/matter-lab-shots/feel-tests/diag4-state.png' });
// try ONE stroke in this exact state and measure
const a = CAL.toScreen(bk.x + 3, bk.y + Math.floor(bk.h * 0.45)), b = CAL.toScreen(bk.x + bk.w - 4, bk.y + Math.floor(bk.h * 0.45));
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
await sleep(1200);
console.log('after 1 stroke:', JSON.stringify(await page.evaluate(() => { const e = window.__matterlab.engine; const bk2 = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); let n = -1; if (bk2) { n = 0; for (const i of bk2.interior) if (e.el[i]) n++; } return { filled: n, worldWater: window.__matterlab.countKey('water'), objs: [...e.objects.values()].map((o) => o.kind) }; })));
await browser.close(); srv.close(); console.log('DIAG4 DONE');
