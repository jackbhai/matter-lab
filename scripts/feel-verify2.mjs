import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await puppeteerLaunch();
async function puppeteerLaunch() { const puppeteer = (await import('puppeteer-core')).default; return puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] }); }
const SHOT = '/home/hatch/workspace/matter-lab-shots/feel-after/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function newLab() {
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
  return page;
}
const geom = (page) => page.evaluate(() => {
  const M = window.__matterlab; const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect();
  const g = M.geom(); const st = document.querySelector('.ml-stage').getBoundingClientRect();
  return { s: g.s, ox: g.ox, oy: g.oy, cvw: cv.width, cvh: cv.height, left: r.left, top: r.top, w: r.width, h: r.height, stageBottom: st.bottom, cols: M.engine.cols, rows: M.engine.rows };
});
const cellToXY = (G, cx, cy) => ({ x: G.left + (G.ox + (cx + 0.5) * G.s) * (G.w / G.cvw), y: G.top + (G.oy + (cy + 0.5) * G.s) * (G.h / G.cvh) });
/* Per-session screen<->cell calibration: paint 2 dots at known screen
   points, fit the affine map from their painted centroids, clear. Absorbs
   any letterbox/DPR mismatch between geom() and live pointer mapping. */
async function calibrate(page) {
  const dot = async (x, y) => { await page.mouse.click(x, y); await sleep(40); return page.evaluate(() => { const e = window.__matterlab.engine; let mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, n = 0; for (let i = 0; i < e.el.length; i++) if (e.el[i]) { const cx = i % e.cols, cy = (i / e.cols) | 0; if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx; if (cy < mny) mny = cy; if (cy > mxy) mxy = cy; n++; } if (!n) return null; return { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 }; }); };
  let d1 = await dot(80, 200);
  if (!d1) { await sleep(700); d1 = await dot(80, 200); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  let d2 = await dot(330, 700);
  if (!d2) { await sleep(700); d2 = await dot(330, 700); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(200);
  if (!d1 || !d2) return null;
  const aX = (d2.cx - d1.cx) / (330 - 80), bX = d1.cx - aX * 80;
  const aY = (d2.cy - d1.cy) / (700 - 200), bY = d1.cy - aY * 200;
  return { toCell: (sx, sy) => ({ x: aX * sx + bX, y: aY * sy + bY }), toScreen: (cx, cy) => ({ x: (cx - bX) / aX, y: (cy - bY) / aY }), aX, aY };
}
const objs = (page) => page.evaluate(() => { const e = window.__matterlab.engine; return [...e.objects.values()].map((o) => ({ id: o.id, kind: o.kind, x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h, level: o.level, locked: !!o.locked })); });
async function clickText(page, re) { return page.evaluate((src) => { const b = [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(src, 'i').test(x.innerText || x.getAttribute('aria-label') || '')); if (b) { b.click(); return true; } return false; }, re.source); }
async function placeGear(page, kind) {
  await clickText(page, /^Gear$/); await sleep(900);
  const ok = await page.evaluate((k) => { const t = document.querySelector(`[data-gear="${k}"]`); if (t) { t.click(); return true; } return false; }, kind);
  await sleep(900); return ok;
}


/* ---------- Focused: hand-stack + boil (500ms polls) ---------- */
const page = await newLab();
const clickDock = async (label) => page.evaluate((L) => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === L); if (b) { b.click(); return true; } return false; }, label);
const clickTile = async (k) => page.evaluate((kk) => { const t = document.querySelector(`[data-gear="${kk}"]`); if (t) { t.click(); return true; } return false; }, k);
await clickDock('Gear'); await sleep(900); await clickTile('beaker-m'); await sleep(800);
// half-fill via UI painting would take minutes of drags; use the hook paint
// (equivalent cells) — the STACKING under test is done via real tile clicks.
await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const o = [...e.objects.values()].find((x) => x.kind.startsWith('beaker')); for (let k = 0; k < 5; k++) M.place('water', o.anchor.x + Math.floor(o.w / 2), o.anchor.y + o.h - 7, 7); });
await sleep(2000);
await clickDock('Gear'); await sleep(900); await clickTile('burner'); await sleep(800);
{
  const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker')); const bu = os.find((o) => o.kind === 'burner');
  console.log('BOILTEST stacked:', JSON.stringify({ bk, bu, seated: bk.y + bk.h === bu.y }));
}
let best = { maxWater: 0, steam: 0 };
for (let t = 0; t < 40; t++) {
  await sleep(500);
  const r = await page.evaluate(() => { const e = window.__matterlab.engine; const bk = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); let mw = 0, steam = 0, wid = null;
    // water id: find via a known interior cell's substance? use census-free approach: hottest LIQUID cell in beaker bbox
    for (let y = bk.anchor.y; y < bk.anchor.y + bk.h; y++) for (let x = bk.anchor.x; x < bk.anchor.x + bk.w; x++) { const i = y * e.cols + x; const id = e.el[i]; if (!id) continue; if (e.temp[i] > mw) mw = e.temp[i]; }
    for (let i = 0; i < e.el.length; i++) { const id = e.el[i]; if (id && e.temp[i] >= 95) steam++; }
    return { maxInBeaker: Math.round(mw * 10) / 10, hotCellsWorld: steam, tick: e.tick };
  });
  if (r.maxInBeaker > best.maxWater) best.maxWater = r.maxInBeaker;
  if (r.hotCellsWorld > best.steam) best.steam = r.hotCellsWorld;
  if (t % 6 === 0 || r.maxInBeaker >= 95) console.log('boil500 poll', t, JSON.stringify(r));
  if (r.maxInBeaker >= 95 && t > 4) { await sleep(1200); break; }
}
console.log('BOILTEST RESULT:', JSON.stringify(best));
await page.screenshot({ path: SHOT + 'boiling-water.png' });
await page.close();

/* ---------- Focused Session B: drags with selbar closed before each ---------- */
const p2 = await newLab();
const closeBar = async (pg) => { await pg.evaluate(() => { const b = [...document.querySelectorAll('[data-selbar="1"] button')].find((x) => (x.innerText || '').trim() === 'Done'); if (b) b.click(); }); await sleep(350); };
await placeGear(p2, 'burner');
await placeGear(p2, 'beaker-m');
{
  let os = await objs(p2); let bk = os.find((o) => o.kind.startsWith('beaker')); let bu = os.find((o) => o.kind === 'burner');
  console.log('B2: vessel placed near burner seated?', bk.y + bk.h === bu.y, JSON.stringify({ bk, bu }));
  await closeBar(p2);
  await p2.evaluate(() => { const w = document.querySelector('[data-toolwheel="1"] button'); if (w) w.click(); });
  await sleep(500); await clickText(p2, /^Move gear$/); await sleep(400);
  const drag = async (fromCell, toCell) => { const G = await geom(p2); const f = cellToXY(G, fromCell.x, fromCell.y), t = cellToXY(G, toCell.x, toCell.y); await p2.mouse.move(f.x, f.y); await p2.mouse.down(); await p2.mouse.move(t.x, t.y, { steps: 12 }); await p2.mouse.up(); await sleep(600); };
  // drag beaker OFF: centre -> centre + delta to anchor (14, bench)
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker'));
  const c0 = { x: bk.x + bk.w / 2, y: bk.y + bk.h / 2 };
  await drag(c0, { x: c0.x - 84, y: c0.y + 13 });
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B2: after drag-off:', JSON.stringify({ bk, bu, unseated: bk.y + bk.h !== bu.y }));
  // drag beaker back over the burner
  await closeBar(p2);
  const c1 = { x: bk.x + bk.w / 2, y: bk.y + bk.h / 2 };
  await drag(c1, { x: bu.x + bu.w / 2, y: bu.y - Math.floor(bu.h / 2) });
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B2: drag beaker onto burner seated?', bk.y + bk.h === bu.y, JSON.stringify({ bk, bu }));
  await p2.screenshot({ path: SHOT + 'drag-stacked.png' });
  // drag burner out to the right
  await closeBar(p2);
  const c2 = { x: bu.x + bu.w / 2, y: bu.y + bu.h / 2 };
  await drag(c2, { x: c2.x + bu.w * 3, y: c2.y });
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B2: after burner dragged out:', JSON.stringify({ bk, bu }));
  // drag burner back under the beaker
  await closeBar(p2);
  const c3 = { x: bu.x + bu.w / 2, y: bu.y + bu.h / 2 };
  await drag(c3, { x: bk.x + bk.w / 2, y: bk.y + bk.h + 2 });
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B2: drag burner under beaker seated?', bk.y + bk.h === bu.y, JSON.stringify({ bk, bu }));
  await p2.screenshot({ path: SHOT + 'drag-burner-under.png' });
}
await p2.close();
await browser.close();
srv.close();
console.log('DONE');
