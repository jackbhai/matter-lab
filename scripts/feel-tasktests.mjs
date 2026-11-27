// Phase 3 acceptance tests for the FEEL OVERHAUL wave (sceptic pass).
// Real mouse clicks/drags on visible elements only; window.__matterlab is
// read-only measurement. Screenshots -> ~/workspace/matter-lab-shots/feel-tests/
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\\.\\.[/\\\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const SHOT = '/home/hatch/workspace/matter-lab-shots/feel-tests/';
await mkdir(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = {}; // results
const log = (...a) => console.log(...a);

/* ---------- real-input helpers ---------- */
// find a visible element's rect by predicate source run in page
async function rectOf(page, fn, arg) {
  return page.evaluate((src, a) => {
    const f = eval(src);
    const el = f(a);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }, fn.toString(), arg);
}
const byText = (a) => [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(a, 'i').test(x.innerText || x.getAttribute('aria-label') || ''));
const bySel = (a) => document.querySelector(a);
async function tapRect(page, rect, label, taps) {
  if (!rect) { log('TAP-MISS', label); return false; }
  await page.mouse.click(rect.cx, rect.cy);
  if (taps) taps.push(label);
  return true;
}
async function tapText(page, reSrc, label, taps) {
  const r = await rectOf(page, byText, reSrc);
  return tapRect(page, r, label || reSrc, taps);
}
async function tapSel(page, sel, label, taps) {
  const r = await rectOf(page, bySel, sel);
  return tapRect(page, r, label || sel, taps);
}
// gear tiles can sit below the picker sheet's fold: scroll the tile into
// view first (a scroll, not the action), then a real click on it.
async function tapGearTile(page, kind, label, taps) {
  await page.evaluate((k) => { const t = document.querySelector(`[data-gear="${k}"]`); if (t) t.scrollIntoView({ block: 'center' }); }, kind);
  await sleep(500);
  return tapSel(page, `[data-gear="${kind}"]`, label, taps);
}

async function enterLab(page, taps) {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  await tapText(page, 'Enter Free Sandbox|Open the lab', 'tap: Enter Free Sandbox', taps);
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  await tapText(page, 'Skip tutorial', 'tap: Skip tutorial', taps);
  await sleep(600);
}
const geom = (page) => page.evaluate(() => {
  const M = window.__matterlab; const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect();
  const g = M.geom(); const st = document.querySelector('.ml-stage').getBoundingClientRect();
  return { s: g.s, ox: g.ox, oy: g.oy, cvw: cv.width, cvh: cv.height, left: r.left, top: r.top, w: r.width, h: r.height, stageBottom: st.bottom, stageTop: st.top, cols: M.engine.cols, rows: M.engine.rows };
});
const cellToXY = (G, cx, cy) => ({ x: G.left + (G.ox + (cx + 0.5) * G.s) * (G.w / G.cvw), y: G.top + (G.oy + (cy + 0.5) * G.s) * (G.h / G.cvh) });
async function calibrate(page) {
  const dot = async (x, y) => { await page.mouse.click(x, y); await sleep(40); return page.evaluate(() => { const e = window.__matterlab.engine; let mnx = 1e9, mxx = -1, mny = 1e9, mxy = -1, n = 0; for (let i = 0; i < e.el.length; i++) if (e.el[i]) { const cx = i % e.cols, cy = (i / e.cols) | 0; if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx; if (cy < mny) mny = cy; if (cy > mxy) mxy = cy; n++; } if (!n) return null; return { cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2 }; }); };
  let d1 = await dot(80, 200); if (!d1) { await sleep(700); d1 = await dot(80, 200); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  let d2 = await dot(330, 500); if (!d2) { await sleep(700); d2 = await dot(330, 500); }
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(200);
  if (!d1 || !d2) return null;
  const aX = (d2.cx - d1.cx) / 250, bX = d1.cx - aX * 80;
  const aY = (d2.cy - d1.cy) / 300, bY = d1.cy - aY * 200;
  return { toCell: (sx, sy) => ({ x: aX * sx + bX, y: aY * sy + bY }), toScreen: (cx, cy) => ({ x: (cx - bX) / aX, y: (cy - bY) / aY }), aX, aY };
}
const objs = (page) => page.evaluate(() => { const e = window.__matterlab.engine; return [...e.objects.values()].map((o) => ({ id: o.id, kind: o.kind, x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h, level: o.level, locked: !!o.locked })); });
const gridDims = (page) => page.evaluate(() => { const e = window.__matterlab.engine; return e.cols + 'x' + e.rows; });
/* PR3's adaptive tier governor can resize the grid early in a session
   (headless CPU); wait until cols/rows are stable before calibrating. */
async function settleGrid(page) {
  let last = '', stable = 0;
  for (let i = 0; i < 25 && stable < 3; i++) {
    const d = await gridDims(page);
    if (d === last) stable++; else { stable = 0; last = d; }
    await sleep(1000);
  }
  return last;
}
const bySelbarDone = () => { const bar = document.querySelector('[data-selbar="1"]'); if (!bar) return null; return [...bar.querySelectorAll('button')].find((b) => /done/i.test(b.innerText || '')) || null; };
async function dismissSelbar(page, taps, label) {
  const r = await rectOf(page, bySelbarDone, null);
  if (r) { await tapRect(page, r, label || 'tap: selection bar Done (dismiss)', taps); await sleep(600); return true; }
  return false;
}
const waterInBeaker = (page) => page.evaluate(() => { const e = window.__matterlab.engine; const bk = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); if (!bk) return null; let n = 0; for (const i of bk.interior) if (e.el[i]) n++; return { filled: n, interior: bk.interior.length }; });

/* ================= Session A: T5, T4, T3, T1, T2, T6, T8 ================= */
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
page.on('pageerror', (e) => log('PAGEERROR', e.message));
const taps = [];
await enterLab(page, taps);
const settledGrid = await settleGrid(page);
log('grid settled at:', settledGrid);
const CAL = await calibrate(page);
log('calibration aX,aY:', CAL.aX.toFixed(4), CAL.aY.toFixed(4), 'grid:', await gridDims(page));

/* ---- T5 FAST STROKE ---- */
{
  const G0 = await geom(page);
  const c0 = { x: Math.floor(G0.cols * 0.15), y: Math.floor(G0.rows * 0.25) }, c1 = { x: Math.floor(G0.cols * 0.85), y: Math.floor(G0.rows * 0.55) };
  const a = CAL.toScreen(c0.x, c0.y), b = CAL.toScreen(c1.x, c1.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 1 }); await page.mouse.up();
  await sleep(150);
  const cov = await page.evaluate((L) => {
    const e = window.__matterlab.engine; const n = 240; let hit8 = 0, hit2 = 0, run = 0, maxRun = 0;
    const probe = (x, y, rad) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < e.cols && yy < e.rows && e.el[yy * e.cols + xx]) return true; } return false; };
    for (let i = 0; i <= n; i++) { const x = Math.round(L.x0 + (L.x1 - L.x0) * i / n), y = Math.round(L.y0 + (L.y1 - L.y0) * i / n); if (probe(x, y, 8)) hit8++; if (probe(x, y, 2)) hit2++; else { run++; if (run > maxRun) maxRun = run; } if (probe(x, y, 2)) run = 0; }
    const pathCells = Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
    return { pct8: Math.round(hit8 / (n + 1) * 100), pct2: Math.round(hit2 / (n + 1) * 100), maxGapCellsStrict: maxRun, gapPxApprox: Math.round(maxRun / (n + 1) * pathCells / 0.74) };
  }, { x0: c0.x, y0: c0.y, x1: c1.x, y1: c1.y });
  R.T5 = cov;
  log('T5 fast stroke:', JSON.stringify(cov));
  await page.screenshot({ path: SHOT + 't5-fast-stroke.png' });
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(300);
}

/* ---- T1 BOIL JOB (includes T4 bench + T3 fill) ---- */
const t1Start = Date.now();
/* Order matters (acceptance runs 3-4 + diag4 evidence): select Water FIRST,
   then place the beaker. Placing gear selects it -> selection bar opens and
   the brush pill hides (fixes 11/12), leaving the vessel interior reachable.
   The reverse order leaves the brush pill (219x56 card) floating over the
   bench-spawned M beaker at the 290x643 tier, and strokes land on the pill. */
await tapText(page, '^Liquids$', 'tap: Dock Liquids', taps); await sleep(800);
{ // T6a: chip strip / dock panel heights in the working state, strip open
  const strip = await page.evaluate(() => { const els = [...document.querySelectorAll('[data-dockpanel="1"], .ml-stage [class*="strip"], .ml-stage [class*="card"]')]; return els.map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return (r.height > 0 && s.display !== 'none') ? { h: Math.round(r.height), pctVh: Math.round(r.height / 915 * 1000) / 10, cls: (el.className || '').toString().slice(0, 40) } : null; }).filter(Boolean); });
  R.T6a_strip = strip; log('T6a strip candidates:', JSON.stringify(strip));
}
await tapSel(page, '[data-tile="water"]', 'tap: Water chip', taps); await sleep(500);
await tapText(page, '^Gear$', 'tap: Dock Gear (picker opens)', taps); await sleep(900);
await tapGearTile(page, 'beaker-m', 'tap: gear tile Beaker M', taps); await sleep(900);
/* T4 bench line */
{
  const G = await geom(page); const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker'));
  const cellPxY = 1 / CAL.aY;
  const top = CAL.toScreen(bk.x, bk.y).y - cellPxY / 2, bot = CAL.toScreen(bk.x, bk.y + bk.h - 1).y + cellPxY / 2;
  const benchTop = G.stageBottom - 14;
  const pctBelow = Math.max(0, (bot - benchTop) / (bot - top) * 100);
  R.T4 = { beakerHPx: Math.round(bot - top), bottom: Math.round(bot), benchTop: Math.round(benchTop), pctBelow: Math.round(pctBelow * 10) / 10 };
  log('T4 bench:', JSON.stringify(R.T4));
  await page.screenshot({ path: SHOT + 't4-beaker-bench.png' });
}
/* T6a selection bar (beaker is selected after placement) */
{
  const bar = await page.evaluate(() => { const b = document.querySelector('[data-selbar="1"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), pctVh: Math.round(r.height / 915 * 1000) / 10 }; });
  R.T6a_selbar = bar; log('T6a selbar:', JSON.stringify(bar));
}
/* T3: fill the beaker by painting (beaker stays selected -> pill hidden,
   selbar is pointer-events:none except its buttons; probe candidate rows
   inside the interior and paint on a row whose midpoint reaches CANVAS). */
const fillBefore = await waterInBeaker(page);
{
  /* The selection bar's button rows can overlay the bench-spawned vessel
     (run 7: every interior row at the beaker's centre column hit a selbar
     button). The natural user move is Done first: the selbar closes and —
     unlike the old floating pill — PR#4's TouchActionBar sits in-flow
     BELOW the stage, so nothing covers the vessel afterwards. */
  await dismissSelbar(page, taps, 'tap: selection bar Done (before painting)');
  const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker'));
  const atPoint = async (cx, cy) => { const p = CAL.toScreen(cx, cy); return page.evaluate((pt) => { const el = document.elementFromPoint(pt.x, pt.y); return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 40) : null; }, p); };
  let rowFrac = 0.45;
  for (const f of [0.45, 0.35, 0.55, 0.3, 0.6]) {
    const hit = await atPoint(bk.x + bk.w / 2, bk.y + Math.floor(bk.h * f));
    log('T3 probe row', f, '->', JSON.stringify(hit));
    if (hit && /CANVAS/i.test(hit)) { rowFrac = f; break; }
  }
  log('T3 painting on interior row fraction:', rowFrac);
  /* human-paced strokes: >=700ms apart, jittered starts — two stroke-starts
     within 350ms/48px would trip the app's double-tap=Undo gesture (Phase-1
     item C3, not in Phase-2 fix scope), which is a different test. */
  for (let k = 0; k < 4; k++) {
    const jx = (k % 2) * 2 - 1, jy = Math.floor(bk.h * rowFrac) + (k - 1);
    const a = CAL.toScreen(bk.x + 3 + jx, bk.y + jy), b = CAL.toScreen(bk.x + bk.w - 4 - jx, bk.y + jy);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    taps.push('drag: paint water stroke into beaker'); await sleep(700);
  }
  await sleep(1500);
  log('T3 grid after strokes:', await gridDims(page), 'objs:', JSON.stringify((await objs(page)).map((o) => o.kind)));
}
const fillAfter = await waterInBeaker(page);
const worldWater = await page.evaluate(() => window.__matterlab.countKey('water'));
R.T3 = { before: fillBefore, after: fillAfter, worldWaterCells: worldWater };
log('T3 fill:', JSON.stringify(R.T3));
await page.screenshot({ path: SHOT + 't3-beaker-filled.png' });
/* place burner -> must seat via snap */
await tapText(page, '^Gear$', 'tap: Dock Gear (picker opens)', taps); await sleep(900);
await tapGearTile(page, 'burner', 'tap: gear tile Burner', taps); await sleep(900);
if (!(await objs(page)).find((o) => o.kind === 'burner')) {
  const diag = await page.evaluate(() => { const t = document.querySelector('[data-gear="burner"]'); if (!t) return 'no-tile'; const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { tileRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, atPoint: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 40) : null, sheetOpen: !!document.querySelector('.sheet-bg') }; });
  log('T1 burner tile first tap did not place; diag:', JSON.stringify(diag));
  await tapGearTile(page, 'burner', 'tap: gear tile Burner (retry)', taps); await sleep(900);
}
let os = await objs(page);
let bk = os.find((o) => o.kind.startsWith('beaker')); let bu = os.find((o) => o.kind === 'burner');
const seated = bk && bu ? (bk.y + bk.h === bu.y) : null;
log('T1 after burner placement:', JSON.stringify({ bk, bu, seated }), 'grid:', await gridDims(page));
/* light it if not already lit: one centre tap on the burner body */
if (bu && !bu.level) {
  const c = CAL.toScreen(bu.x + bu.w / 2, bu.y + bu.h / 2);
  await page.mouse.click(c.x, c.y); taps.push('tap: burner body centre (light)');
  await sleep(700);
  bu = (await objs(page)).find((o) => o.kind === 'burner');
  log('T1 burner level after light tap:', bu && bu.level);
}
/* close any contextual surface so the boil screenshot has NO panels open */
{
  const st = await page.evaluate(() => ({ selbar: !!document.querySelector('[data-selbar="1"]'), sheet: !!document.querySelector('.sheet-bg') }));
  if (st.selbar) { await dismissSelbar(page, taps); }
  if (st.sheet) { await tapText(page, 'Close', 'tap: sheet Close (dismiss)', taps); await sleep(500); }
  const st2 = await page.evaluate(() => ({ selbar: !!document.querySelector('[data-selbar="1"]'), sheet: !!document.querySelector('.sheet-bg'), stripCard: !!document.querySelector('.ml-stage [data-dockpanel="1"]') }));
  R.T1_panelsAtBoil = st2; log('T1 panels state before boil wait:', JSON.stringify(st2));
}
/* boil poll */
let boil = { max: 20, steam: 0 }; const boilT0 = Date.now();
for (let t = 0; t < 25; t++) {
  await sleep(3000);
  boil = await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const bk = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); if (!bk) return { max: -1, steam: 0, tick: e.tick, noBeaker: true }; let mx = 0; for (const i of bk.interior) if (e.el[i] && e.temp[i] > mx) mx = e.temp[i]; return { max: Math.round(mx * 10) / 10, steam: M.countKey('steam'), tick: e.tick }; });
  log('T1 boil poll', t, JSON.stringify(boil));
  if (boil.max >= 95 && boil.steam > 0) break;
}
R.T1 = { taps: [...taps], tapCount: taps.filter((x) => x.startsWith('tap:')).length, dragCount: taps.filter((x) => x.startsWith('drag:')).length, seated, burnerLevel: bu && bu.level, timeToBoilSec: Math.round((Date.now() - boilT0) / 1000), totalElapsedSec: Math.round((Date.now() - t1Start) / 1000), finalTemp: boil.max, steam: boil.steam };
log('T1 RESULT:', JSON.stringify(R.T1));
await page.screenshot({ path: SHOT + 't1-boiling-nopanels.png' });

/* ---- T8 boil-state clusters + ticker ---- */
{
  const cl = await page.evaluate(() => {
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
    const clusters = {
      topbar: vis('[data-topbar="1"]') || vis('[data-mlroot="1"] header'),
      gfxBanner: vis('[data-gfxnotice="1"]'),
      substanceBar: vis('[data-mlroot="1"] [class*="subbar"], [data-mlroot="1"] [class*="substance"]'),
      dock: vis('[data-dock="1"]'),
      toolPill: vis('[data-toolwheel="1"]'),
      chipStripCard: vis('.ml-stage [data-dockpanel="1"]'),
      selbar: vis('[data-selbar="1"]'),
      touchbar: vis('[data-touchbar="1"]'),
      brushPill: vis('[data-brushpill="1"]'),
      settingsRail: (() => { const el = document.querySelector('.mz-shell'); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth; })(),
    };
    const ticker = document.querySelector('[data-ticker="1"]');
    const tr = ticker ? ticker.getBoundingClientRect() : null;
    return { clusters, clusterCount: Object.values(clusters).filter(Boolean).length, clusterNames: Object.entries(clusters).filter(([, v]) => v).map(([k]) => k), ticker: ticker ? { visible: tr.height > 0 && tr.top >= 0, text: (ticker.innerText || '').slice(0, 120), top: Math.round(tr.top) } : null };
  });
  R.T8 = cl; log('T8 boil-state clusters/ticker:', JSON.stringify(cl));
  await page.screenshot({ path: SHOT + 't8-boil-clusters-ticker.png' });
  /* R2 recount, selection state: select the beaker (Move gear tap on its
     centre) -> selbar must show and TouchActionBar must hide (exactly one
     bar); count clusters in that state too. */
  const selState = await (async () => {
    const bkNow = (await objs(page)).find((o) => o.kind.startsWith('beaker'));
    if (!bkNow) return { error: 'no beaker' };
    /* selection requires the interact (Move gear) tool — a Paint-tool tap
       on a vessel just paints (runs 6-7 measured selbar:false for that
       reason). Switch tools first (setup taps, not part of the count). */
    await tapSel(page, '[data-toolwheel="1"] button', 'setup: tool wheel open (recount)', null); await sleep(600);
    await tapText(page, '^Move gear$', 'setup: Move gear tool (recount)', null); await sleep(500);
    /* dual-mapping tap: geom and CAL disagree by up to ~100px at the bench
       in the fallback tier (run 6: the geom point landed on the
       TouchActionBar's Undo/Redo row and un-placed the burner). Use
       whichever mapped point actually hits CANVAS. */
    const pCal = CAL.toScreen(bkNow.x + bkNow.w / 2, bkNow.y + bkNow.h / 2);
    const pGeom = cellToXY(await geom(page), bkNow.x + bkNow.w / 2, bkNow.y + bkNow.h / 2);
    const hit = async (p) => page.evaluate((pt) => { const el = document.elementFromPoint(pt.x, pt.y); return el ? el.tagName : null; }, p);
    let p = pCal, used = 'CAL';
    if ((await hit(pCal)) !== 'CANVAS' && (await hit(pGeom)) === 'CANVAS') { p = pGeom; used = 'geom'; }
    log('T8 selection tap via', used, 'at', JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y), hit: await hit(p) }));
    await page.mouse.click(p.x, p.y); await sleep(800);
    return page.evaluate(() => {
      const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05; };
      const parts = { topbar: vis('[data-topbar="1"]') || vis('[data-mlroot="1"] header'), dock: vis('[data-dock="1"]'), toolPill: vis('[data-toolwheel="1"]'), selbar: vis('[data-selbar="1"]'), touchbar: vis('[data-touchbar="1"]'), brushPill: vis('[data-brushpill="1"]') };
      return { parts, clusterCount: Object.values(parts).filter(Boolean).length, bothBars: parts.selbar && parts.touchbar };
    });
  })();
  R.T8_selectionState = selState; log('T8 selection-state clusters (R2 recount):', JSON.stringify(selState));
  await dismissSelbar(page, null, 'cleanup: Done after selection-state recount');
}
/* ---- T2 BURNER TOGGLE: one centre tap each way ---- */
{
  let buNow = (await objs(page)).find((o) => o.kind === 'burner');
  if (!buNow) { R.T2 = { error: 'no burner present' }; log('T2 toggle: NO BURNER'); }
  else {
  /* The app's gear-interaction path is the Move gear (interact) tool —
     Phase 2 fix 5's toggle lives there (same route as feel-verify FIX5 and
     feel-hero). Select it via the tool wheel, then tap the burner CENTRE. */
  await tapSel(page, '[data-toolwheel="1"] button', 'setup: tool wheel open (not a toggle tap)', null); await sleep(600);
  await tapText(page, '^Move gear$', 'setup: Move gear tool (not a toggle tap)', null); await sleep(500);
  await dismissSelbar(page, null, 'setup: dismiss selbar before toggle taps');
  /* tap point: dual mapping with a CANVAS hit-check (see T8 note) — geom
     hit dead centre in probe-t2, CAL hit in other runs; use whichever
     point is actually on the canvas at the burner's body centre. */
  const cGeom = cellToXY(await geom(page), buNow.x + buNow.w / 2, buNow.y + buNow.h / 2);
  const cCal = CAL.toScreen(buNow.x + buNow.w / 2, buNow.y + buNow.h / 2);
  const hitC = async (p) => page.evaluate((pt) => { const el = document.elementFromPoint(pt.x, pt.y); return el ? el.tagName : null; }, p);
  let c = cGeom, cUsed = 'geom';
  if ((await hitC(cGeom)) !== 'CANVAS' && (await hitC(cCal)) === 'CANVAS') { c = cCal; cUsed = 'CAL'; }
  log('T2 tap point via', cUsed, JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y), hit: await hitC(c) }));
  const lvl0 = buNow.level;
  await page.mouse.click(c.x, c.y); await sleep(800);
  let after1 = (await objs(page)).find((o) => o.kind === 'burner');
  const lvl1 = after1 ? after1.level : null;
  /* the toggle tap also selects the burner (fix 5 decision) and its selbar
     overlays the bench; dismiss it so tap 2 is a clean world tap — the
     dismissal is UI cleanup, not part of the toggle (Phase-2 FIX5 did the
     same). */
  await dismissSelbar(page, null, 'cleanup: Done between toggle taps (not a toggle tap)');
  await page.mouse.click(c.x, c.y); await sleep(800);
  let after2 = (await objs(page)).find((o) => o.kind === 'burner');
  const lvl2 = after2 ? after2.level : null;
  R.T2 = { startLevel: lvl0, afterTap1: lvl1, afterTap2: lvl2, tapsUsed: 2, tool: 'Move gear (interact)' };
  log('T2 toggle:', JSON.stringify(R.T2));
  await page.screenshot({ path: SHOT + 't2-burner-toggle.png' });
  }
}
/* ---- T6b modal sheets (report-only) ---- */
{
  await tapText(page, '^Gear$', null, null); await sleep(900);
  const picker = await page.evaluate(() => { const sEl = document.querySelector('.sheet[data-panel="tiles"]') || document.querySelector('.sheet'); if (!sEl) return null; const r = sEl.getBoundingClientRect(); return { h: Math.round(r.height), pctVh: Math.round(r.height / 915 * 1000) / 10 }; });
  await page.screenshot({ path: SHOT + 't6b-picker-sheet.png' });
  await tapText(page, 'Close', null, null); await sleep(600);
  await tapText(page, 'Menu', null, null); await sleep(900);
  const menu = await page.evaluate(() => { const sEl = document.querySelector('.sheet'); if (!sEl) return null; const r = sEl.getBoundingClientRect(); return { h: Math.round(r.height), pctVh: Math.round(r.height / 915 * 1000) / 10 }; });
  await page.screenshot({ path: SHOT + 't6b-menu-sheet.png' });
  R.T6b = { picker, menu }; log('T6b sheets:', JSON.stringify(R.T6b));
  /* T8 messages grouping: open Messages from the menu sheet */
  await tapText(page, '^Messages', null, null); await sleep(1000);
  const feed = await page.evaluate(() => { const t = document.body.innerText; const m = t.match(/×\s?\d+/g); return { groupChips: m ? m.slice(0, 5) : [], hasFeed: /reaction/i.test(t) }; });
  R.T8_messages = feed; log('T8 messages grouping:', JSON.stringify(feed));
  await page.screenshot({ path: SHOT + 't8-messages-feed.png' });
  await tapText(page, 'Close', null, null); await sleep(500);
}
/* ---- T9: legacy ML1 share code still loads (PR#4 scene-archive) ---- */
{
  const t9 = await page.evaluate(async () => {
    const M = window.__matterlab; const e = M.engine;
    const before = e.stats().particles;
    if (!before) return { error: 'empty scene, nothing to encode' };
    const scene = e.serialize();
    const json = JSON.stringify(scene);
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const ml1 = 'ML1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    e.clear();
    const cleared = e.stats().particles;
    const ok = await M.importCode(ml1);
    const after = e.stats().particles;
    const objsAfter = [...e.objects.values()].map((o) => o.kind);
    return { particlesBefore: before, particlesAfterClear: cleared, importOk: ok, particlesAfterImport: after, objectsAfter: objsAfter, codePrefix: ml1.slice(0, 4), codeLen: ml1.length };
  });
  R.T9 = t9; log('T9 ML1 load:', JSON.stringify(t9));
  await page.screenshot({ path: SHOT + 't9-ml1-loaded.png' });
}
await page.close();

/* ================= Session B: T7 overlap audit at 3 viewports ================= */
{
  const viewports = [[360, 800], [412, 915], [768, 1024]];
  R.T7 = {};
  for (const [w, h] of viewports) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h });
    p.on('pageerror', (e) => log('PAGEERROR', e.message));
    await enterLab(p, null);
    const audit = await p.evaluate(() => {
      const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return (r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden') ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
      const named = {
        topbar: document.querySelector('[data-topbar="1"]'),
        dock: document.querySelector('[data-dock="1"]'),
        toolPill: document.querySelector('[data-toolwheel="1"]'),
        brushPill: document.querySelector('[data-brushpill="1"]'),
        touchbar: document.querySelector('[data-touchbar="1"]'),
        ticker: document.querySelector('[data-ticker="1"]'),
        gfxBanner: document.querySelector('[data-gfxnotice="1"]'),
        zoomChip: document.querySelector('[data-zoomchip="1"]'),
        emptyHint: document.querySelector('[data-emptyhint="1"]'),
      };
      const boxes = Object.entries(named).map(([n, el]) => [n, vis(el)]).filter(([, v]) => v);
      const pairs = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const [an, a] = boxes[i]; const [bn, b] = boxes[j];
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ix > 4 && iy > 4) pairs.push(`${an}~${bn} (${Math.round(ix)}x${Math.round(iy)})`);
      }
      return { boxes: Object.fromEntries(boxes), pairs };
    });
    R.T7[`${w}x${h}`] = audit;
    log('T7', `${w}x${h}`, 'overlapping pairs:', JSON.stringify(audit.pairs));
    await p.screenshot({ path: SHOT + `t7-overlaps-${w}x${h}.png` });
    await p.close();
  }
}
await browser.close();
srv.close();
log('ALL RESULTS:', JSON.stringify(R, null, 1));
log('DONE');
