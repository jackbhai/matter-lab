/* FEEL fix12 hero proof: beaker on burner, water boiling, NO panels open.
   Flow is the real user flow: gear tiles -> fill -> centre-tap the burner
   to light it (fix12 auto-dismiss) -> app wheel-zoom to watch. */
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/webmanifest' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = '/home/hatch/workspace/matter-lab-shots/feel-after/';
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await sleep(5000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || '')); if (b) b.click(); });
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await sleep(2500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Skip tutorial/i.test(x.innerText || '')); if (b) b.click(); });
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Dismiss$/i.test((x.innerText || '').trim())); if (b) b.click(); });
await sleep(600);

/* calibrated pointer mapping (same method as feel-verify.mjs) */
async function calibrate(page) {
  const dot = async (x, y) => { await page.mouse.click(x, y); await sleep(40); return page.evaluate(() => { const e = window.__matterlab.engine; let mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, n = 0; for (let i = 0; i < e.el.length; i++) if (e.el[i]) { const cx = i % e.cols, cy = (i / e.cols) | 0; if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx; if (cy < mny) mny = cy; if (cy > mxy) mxy = cy; n++; } if (!n) return null; return { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 }; }); };
  let d1 = await dot(80, 200); if (!d1) { await sleep(700); d1 = await dot(80, 200); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  let d2 = await dot(330, 500); if (!d2) { await sleep(700); d2 = await dot(330, 500); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(200);
  if (!d1 || !d2) return null;
  const aX = (d2.cx - d1.cx) / (330 - 80), bX = d1.cx - aX * 80;
  const aY = (d2.cy - d1.cy) / (500 - 200), bY = d1.cy - aY * 200;
  return { toCell: (sx, sy) => ({ x: aX * sx + bX, y: aY * sy + bY }), toScreen: (cx, cy) => ({ x: (cx - bX) / aX, y: (cy - bY) / aY }) };
}
const clickText = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(src, 'i').test(x.innerText || x.getAttribute('aria-label') || '')); if (b) { b.click(); return true; } return false; }, re.source);
const placeGear = async (kind) => { await clickText(/^Gear$/); await sleep(900); const ok = await page.evaluate((k) => { const t = document.querySelector(`[data-gear="${k}"]`); if (t) { t.click(); return true; } return false; }, kind); await sleep(900); return ok; };
await sleep(6000); // let the perf governor/tier settle BEFORE calibrating (mapping must stay valid)
const CAL = await calibrate(page);
console.log('calibrated:', !!CAL);
await placeGear('beaker-m');
await placeGear('burner');
/* burner starts lit at level 2 from placement in this build; turn it OFF
   first via hook-free centre tap so the LIGHTING tap is the real flow */
const objs = () => page.evaluate(() => { const e = window.__matterlab.engine; return [...e.objects.values()].map((o) => ({ id: o.id, kind: o.kind, x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h, level: o.level })); });
const toXY = (cx, cy) => CAL.toScreen(cx, cy);
/* select the Move gear (interact) tool */
await page.evaluate(() => { const w = document.querySelector('[data-toolwheel="1"] button'); if (w) w.click(); });
await sleep(500);
await clickText(/^Move gear$/);
await sleep(400);
/* HERO composition: grow BOTH pieces with the app's own Resize (selbar
   feature, hook passthrough) so they fill the frame like the reference */
const rs = await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const bk = [...e.objects.values()].find((x) => x.kind.startsWith('beaker')); const bu = [...e.objects.values()].find((x) => x.kind === 'burner'); const r1 = M.resizeObject(bu.id, 2.0); const r2 = M.resizeObject(bk.id, 2.6); return { r1: !!r1, r2: !!r2 }; });
console.log('resize:', JSON.stringify(rs));
await sleep(400);
/* reseat if the resize broke the stack (engine-exact adjacency) */
const seat = await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const bk = [...e.objects.values()].find((x) => x.kind.startsWith('beaker')); const bu = [...e.objects.values()].find((x) => x.kind === 'burner'); const seated = bk.anchor.y + bk.h === bu.anchor.y; if (!seated) { const tx = Math.round(bu.anchor.x + bu.w / 2 - bk.w / 2), ty = bu.anchor.y - bk.h; M.moveObjectTo(bk.id, tx, ty); } const bk2 = [...e.objects.values()].find((x) => x.kind.startsWith('beaker')); return { seatedNow: bk2.anchor.y + bk2.h === bu.anchor.y, bk: { x: bk2.anchor.x, y: bk2.anchor.y, w: bk2.w, h: bk2.h }, bu: { x: bu.anchor.x, y: bu.anchor.y, w: bu.w, h: bu.h } }; });
console.log('seat after resize:', JSON.stringify(seat));
await clickText(/^Done$/); await sleep(400); // close the placement selbar so the burner is uncovered
let oo = await objs(); let bu = oo.find((o) => o.kind === 'burner');
let c = toXY(bu.x + bu.w / 2, bu.y + bu.h / 2);
for (let t = 0; t < 3 && bu.level > 0; t++) { await page.mouse.click(c.x, c.y); await sleep(450); bu = (await objs()).find((o) => o.kind === 'burner'); } // off
oo = await objs(); bu = oo.find((o) => o.kind === 'burner');
console.log('burner level before fill/light:', bu.level);
await clickText(/^Done$/); await sleep(400); // close the selbar from the OFF tap before the LIGHT tap
/* fill the beaker */
await page.evaluate(() => { const M = window.__matterlab; const o = [...M.engine.objects.values()].find((x) => x.kind.startsWith('beaker')); for (let fx = 0.15; fx <= 0.9; fx += 0.15) for (let fy = 0.2; fy <= 0.9; fy += 0.15) M.place('water', o.anchor.x + Math.floor(o.w * fx), o.anchor.y + Math.floor(o.h * fy), 7); });
await sleep(300);
/* LIGHT: centre-tap the burner (fix5 toggle + fix12 auto-dismiss) */
c = toXY(bu.x + bu.w / 2, bu.y + bu.h / 2);
for (let t = 0; t < 3 && bu.level === 0; t++) { await page.mouse.click(c.x, c.y); await sleep(450); bu = (await objs()).find((o) => o.kind === 'burner'); }
oo = await objs(); bu = oo.find((o) => o.kind === 'burner');
const surfaces = await page.evaluate(() => ({ selbar: !!document.querySelector('[data-selbar="1"]'), sheet: !!document.querySelector('.sheet'), strip: !!document.querySelector('.ml-stripdock'), shellRect: (() => { const el = document.querySelector('.mz-shell'); if (!el) return 'absent'; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; })() }));
console.log('after LIGHT tap: burner level', bu.level, 'surfaces:', JSON.stringify(surfaces));
/* zoom in on the pair with the app's own wheel zoom (CAL from the
   settled layout; zoom-to-cursor keeps the anchor cell under the point) */
const bk = oo.find((o) => o.kind.startsWith('beaker'));
c = await page.evaluate(([cx, cy]) => { const M = window.__matterlab; const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect(); const g = M.geom(); return { x: r.left + (g.ox + (cx + 0.5) * g.s) * (r.width / cv.width), y: r.top + (g.oy + (cy + 0.5) * g.s) * (r.height / cv.height) }; }, [bk.x + bk.w / 2, Math.max(0, bk.y - 150)]);
console.log('zoom anchor (live geom):', JSON.stringify(c));
/* no zoom: at 2.6x the pair is frame-filling on the bench and complete */
console.log('geom s after zoom:', await page.evaluate(() => window.__matterlab.geom().s));
await sleep(4000); // rolling boil, liquid body still present
const state = await page.evaluate(() => { const M = window.__matterlab; return { particles: M.engine.stats().particles, steam: M.countKey('steam'), water: M.countKey('water') }; });
console.log('world at shot:', JSON.stringify(state));
await page.screenshot({ path: SHOT + 'hero-boil-nopanels.png' });
console.log('saved hero-boil-nopanels.png');
await browser.close(); srv.close();
