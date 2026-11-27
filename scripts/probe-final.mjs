// Final confirmation on the PR4 tree: (1) selection-state R2 recount via
// placement selection (selbar visible => TouchActionBar must be hidden);
// (2) the full T1 boil flow with the Done-first fill order.
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
const taps = [];
async function tap(fn, arg, label) { const r = await rectOf(fn, arg); if (!r) { console.log('MISS', label); return; } await page.mouse.click(r.cx, r.cy); if (label) taps.push(label); }
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await sleep(5000);
await tap(byText, 'Enter Free Sandbox|Open the lab', 'tap: Enter'); await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await sleep(2500);
await tap(byText, 'Skip tutorial', 'tap: Skip tutorial'); await sleep(600);
let last = '', stable = 0;
for (let i = 0; i < 25 && stable < 3; i++) { const d = await page.evaluate(() => window.__matterlab.engine.cols + 'x' + window.__matterlab.engine.rows); if (d === last) stable++; else { stable = 0; last = d; } await sleep(1000); }
console.log('grid settled:', last);
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
const clusterProbe = () => page.evaluate(() => {
  const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
  const parts = { topbar: vis('[data-topbar="1"]') || vis('[data-mlroot="1"] header'), dock: vis('[data-dock="1"]'), toolPill: vis('[data-toolwheel="1"]'), selbar: vis('[data-selbar="1"]'), touchbar: vis('[data-touchbar="1"]'), brushPill: vis('[data-brushpill="1"]'), strip: vis('.ml-stripdock') };
  return { parts, count: Object.values(parts).filter(Boolean).length };
});
// water first
await tap(byText, '^Liquids$', 'tap: Liquids'); await sleep(800);
await tap(bySel, '[data-tile="water"]', 'tap: Water chip'); await sleep(500);
// place beaker -> placement selection opens the selbar
await tap(byText, '^Gear$', 'tap: Gear'); await sleep(900);
await page.evaluate(() => { const t = document.querySelector('[data-gear="beaker-m"]'); if (t) t.scrollIntoView({ block: 'center' }); }); await sleep(400);
await tap(bySel, '[data-gear="beaker-m"]', 'tap: Beaker M tile'); await sleep(900);
console.log('SELECTION STATE (placement selection):', JSON.stringify(await clusterProbe()));
await page.screenshot({ path: '/home/hatch/workspace/matter-lab-shots/feel-tests/final-selection-state.png' });
// Done, then fill
const doneFn = () => { const bar = document.querySelector('[data-selbar="1"]'); return bar ? [...bar.querySelectorAll('button')].find((b) => /done/i.test(b.innerText || '')) : null; };
await tap(doneFn, null, 'tap: Done'); await sleep(600);
console.log('AFTER DONE:', JSON.stringify(await clusterProbe()));
let bk = (await objs()).find((o) => o.kind.startsWith('beaker'));
for (let k = 0; k < 4; k++) {
  const jy = Math.floor(bk.h * 0.45) + (k - 1);
  const a = CAL.toScreen(bk.x + 3, bk.y + jy), b = CAL.toScreen(bk.x + bk.w - 4, bk.y + jy);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  taps.push('drag: paint stroke'); await sleep(700);
}
await sleep(1500);
console.log('FILL:', JSON.stringify(await page.evaluate(() => { const e = window.__matterlab.engine; const b = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); let n = 0; for (const i of b.interior) if (e.el[i]) n++; return { filled: n, interior: b.interior.length }; })));
// burner
await tap(byText, '^Gear$', 'tap: Gear'); await sleep(900);
await page.evaluate(() => { const t = document.querySelector('[data-gear="burner"]'); if (t) t.scrollIntoView({ block: 'center' }); }); await sleep(400);
await tap(bySel, '[data-gear="burner"]', 'tap: Burner tile'); await sleep(900);
let os = await objs(); bk = os.find((o) => o.kind.startsWith('beaker')); const bu = os.find((o) => o.kind === 'burner');
console.log('SEATED:', bk && bu ? bk.y + bk.h === bu.y : null, 'burner level:', bu && bu.level);
await tap(doneFn, null, 'tap: Done (pre-boil)'); await sleep(600);
let boil = { max: 0, steam: 0 }; const t0 = Date.now();
for (let t = 0; t < 25; t++) {
  boil = await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const b = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); if (!b) return { max: -1, steam: 0, noBeaker: true }; let mx = 0; for (const i of b.interior) if (e.el[i] && e.temp[i] > mx) mx = e.temp[i]; return { max: Math.round(mx * 10) / 10, steam: M.countKey('steam') }; });
  if (boil.max >= 95 && boil.steam > 0) break;
  await sleep(3000);
}
console.log('BOIL:', JSON.stringify({ ...boil, sec: Math.round((Date.now() - t0) / 1000), tapsTotal: taps.length, taps }));
await page.screenshot({ path: '/home/hatch/workspace/matter-lab-shots/feel-tests/final-boil.png' });
await browser.close(); srv.close(); console.log('FINAL PROBE DONE');
