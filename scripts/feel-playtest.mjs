// FEEL OVERHAUL Phase 1 play-test — interacts ONLY via real mouse clicks/drags
// on visible elements (found by visible text / aria-label / data hooks).
// window.__matterlab is used READ-ONLY for measurement (object positions,
// temperatures, cell counts) — never to perform an action.
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = '/home/hatch/workspace/matter-lab-shots/feel-before';
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
const PORT = srv.address().port;
const URL_ = `http://127.0.0.1:${PORT}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteerLaunch();
async function puppeteerLaunch() {
  const { default: puppeteer } = await import('puppeteer-core');
  return puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

const REPORT = { jobs: {}, panels: [], targets: [], notes: [] };
let L = null; // per-job log
function newJob(id, title) {
  L = { id, title, steps: [], taps: 0, drags: 0, swipes: 0, panelOpens: 0, misses: [] };
  REPORT.jobs[id] = L;
  console.log(`\n===== JOB ${id}: ${title} =====`);
}
function step(action, detail = '') {
  L.steps.push({ n: L.steps.length + 1, action, detail });
  console.log(`  [${L.id}] ${action}${detail ? ' — ' + detail : ''}`);
}
function note(s) { REPORT.notes.push(s); console.log('  NOTE:', s); }

// ---------- finders (run in page; return centre + rect of a VISIBLE element) ----------
const F = {
  byText: (txt, scope) => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return null;
    const els = [...root.querySelectorAll('button, [role="button"]')];
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    let el = els.find((e) => vis(e) && (e.innerText || '').trim() === txt)
      || els.find((e) => vis(e) && (e.innerText || '').trim().startsWith(txt))
      || els.find((e) => vis(e) && (e.innerText || '').includes(txt));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, text: (el.innerText || '').trim().slice(0, 60) };
  },
  byAria: (label, scope) => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return null;
    const els = [...root.querySelectorAll('button, [role="button"]')];
    const el = els.find((e) => (e.getAttribute('aria-label') || '') === label) || els.find((e) => (e.getAttribute('aria-label') || '').includes(label));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, text: el.getAttribute('aria-label') };
  },
  byData: (attr, val, scope) => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return null;
    const el = root.querySelector(`[data-${attr}="${val}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, offscreenX: r.x < 0 || r.x + r.width > innerWidth };
  },
};

// ---------- actions (real mouse) ----------
async function tap(page, label, finder, arg, scope, wait = 650) {
  const pt = await page.evaluate(finder, arg, scope).catch(() => null);
  if (!pt) { L.misses.push(label); step(`MISS: ${label}`, 'element not found'); return null; }
  await page.mouse.click(pt.x, pt.y);
  L.taps++;
  step(`tap: ${label}`, pt.text ? `"${pt.text}" @${Math.round(pt.x)},${Math.round(pt.y)} size ${Math.round(pt.rect.w)}x${Math.round(pt.rect.h)}` : `@${Math.round(pt.x)},${Math.round(pt.y)}`);
  await sleep(wait);
  return pt;
}
async function tapXY(page, label, x, y, wait = 650) {
  await page.mouse.click(x, y);
  L.taps++;
  step(`tap: ${label}`, `@${Math.round(x)},${Math.round(y)}`);
  await sleep(wait);
}
async function drag(page, label, x1, y1, x2, y2, { steps = 14, midShot = null, holdMs = 0 } = {}) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  if (holdMs) await sleep(holdMs);
  await page.mouse.move(x2, y2, { steps });
  if (midShot) await page.screenshot({ path: `${SHOTS}/${midShot}.png` });
  await page.mouse.up();
  L.drags++;
  step(`drag: ${label}`, `(${Math.round(x1)},${Math.round(y1)}) -> (${Math.round(x2)},${Math.round(y2)})`);
  await sleep(550);
}
async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  step(`screenshot: ${name}.png`);
}

// ---------- measurement (read-only) ----------
async function measurePanels(page, label) {
  const found = await page.evaluate(() => {
    const out = [];
    const grab = (sel, name) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ name, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    };
    grab('.sheet', 'sheet (picker/generic)');
    grab('[data-sidepanel="1"]', 'side panel (Tools & controls)');
    grab('.ml-wheel-pop', 'tool wheel popover');
    grab('.ml-stripdock', 'dock chip strip');
    grab('[data-coach="1"] .glass', 'coach/tutorial card');
    grab('[data-panel="tiles"]', 'picker sheet (tiles)');
    return out;
  });
  for (const p of found) {
    const areaPct = Math.round((p.w * p.h) / (412 * 915) * 1000) / 10;
    const rec = { label, ...p, areaPct, heightPct: Math.round(p.h / 915 * 1000) / 10, widthPct: Math.round(p.w / 412 * 1000) / 10 };
    REPORT.panels.push(rec);
    console.log(`  PANEL ${label}: ${p.name} ${p.w}x${p.h} @${p.x},${p.y} = ${areaPct}% of viewport area, ${rec.heightPct}% of height`);
  }
  return found;
}
async function target(page, name, finder, arg, scope) {
  const pt = await page.evaluate(finder, arg, scope).catch(() => null);
  if (pt) { REPORT.targets.push({ name, w: Math.round(pt.rect.w), h: Math.round(pt.rect.h) }); console.log(`  TARGET ${name}: ${Math.round(pt.rect.w)}x${Math.round(pt.rect.h)}px`); }
  return pt;
}
async function world(page) {
  return page.evaluate(() => {
    const ml = window.__matterlab; if (!ml || !ml.engine) return null;
    const e = ml.engine; const g = ml.geom();
    const cv = document.querySelector('[data-mlroot="1"] canvas');
    const cr = cv.getBoundingClientRect();
    const toPx = (cx, cy) => ({ x: cr.x + (g ? g.ox : 0) + cx * (g ? g.s : 1), y: cr.y + (g ? g.oy : 0) + cy * (g ? g.s : 1) });
    const objs = [...e.objects.values()].map((o) => {
      const tl = toPx(o.anchor.x, o.anchor.y); const br = toPx(o.anchor.x + o.w, o.anchor.y + o.h);
      return { id: o.id, kind: o.kind, level: o.level, locked: !!o.locked, scale: o.scale, cells: { x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h }, px: { x: Math.round(tl.x), y: Math.round(tl.y), w: Math.round(br.x - tl.x), h: Math.round(br.y - tl.y), cx: Math.round((tl.x + br.x) / 2), cy: Math.round((tl.y + br.y) / 2), bottom: Math.round(br.y) } };
    });
    const stage = document.querySelector('.ml-stage');
    const sr = stage ? stage.getBoundingClientRect() : null;
    return { cols: e.cols, rows: e.rows, cellPx: g ? g.s : null, canvas: { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height), bottom: Math.round(cr.bottom) }, stage: sr ? { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height), bottom: Math.round(sr.bottom) } : null, objs, steam: ml.countKey('steam'), water: ml.countKey('water'), sand: ml.countKey('sand'), parts: e.stats().particles };
  });
}
async function beakerWaterTemp(page) {
  return page.evaluate(() => {
    const ml = window.__matterlab; const e = ml.engine;
    const bk = [...e.objects.values()].find((o) => String(o.kind).startsWith('beaker'));
    if (!bk) return null;
    let best = null;
    for (let yy = bk.anchor.y + 2; yy < bk.anchor.y + bk.h - 1; yy += 3) {
      for (let xx = bk.anchor.x + 2; xx < bk.anchor.x + bk.w - 1; xx += 3) {
        const info = e.inspect(xx, yy);
        if (info && /water/i.test(info.name || '') && (!best || info.temp > best.temp)) best = { temp: Math.round(info.temp * 10) / 10, name: info.name, x: xx, y: yy };
      }
    }
    return best;
  });
}

async function freshLab(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 412, height: 915 });
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message));
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  return { ctx, page };
}
async function enterLab(page) {
  const pt = await page.evaluate(F.byText, 'Enter Free Sandbox');
  if (!pt) { step('MISS: Enter Free Sandbox on homepage'); return false; }
  await page.mouse.click(pt.x, pt.y); L.taps++;
  step('tap: Enter Free Sandbox (homepage)', `@${Math.round(pt.x)},${Math.round(pt.y)}`);
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  return true;
}
async function dismissFirstRun(page) {
  // Coach card (Skip tutorial) + demo-offer bar (Skip) — both are real first-run taps.
  let pt = await page.evaluate(F.byText, 'Skip tutorial').catch(() => null);
  if (pt) { await page.mouse.click(pt.x, pt.y); L.taps++; step('tap: Skip tutorial (coach card)', `@${Math.round(pt.x)},${Math.round(pt.y)}`); await sleep(600); }
  else step('no coach card present');
  pt = await page.evaluate(F.byText, 'Skip', '[data-mlroot="1"]').catch(() => null);
  // the demo bar Skip is an exact 'Skip' button; byText exact match handles it
  if (pt && pt.text === 'Skip') { await page.mouse.click(pt.x, pt.y); L.taps++; step('tap: Skip (demo-offer bar)', `@${Math.round(pt.x)},${Math.round(pt.y)}`); await sleep(600); }
  else step('no demo-offer Skip present');
}
async function pickFromStrip(page, tabLabel, tileKey, tabData) {
  // open dock tab (strip), scroll strip if tile offscreen, tap tile
  await tap(page, `Dock tab: ${tabLabel}`, F.byAria, tabLabel);
  L.panelOpens++;
  await measurePanels(page, `after ${tabLabel} tab`);
  let pt = await page.evaluate(F.byData, 'tile', tileKey, '[data-dockpanel="1"]').catch(() => null);
  let swipes = 0;
  while (pt && pt.offscreenX && swipes < 4) {
    const strip = await page.evaluate(() => { const el = document.querySelector('.ml-chipstrip'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2 }; });
    if (!strip) break;
    await page.mouse.move(340, strip.y); await page.mouse.down(); await page.mouse.move(90, strip.y, { steps: 8 }); await page.mouse.up();
    L.swipes++; swipes++;
    step(`swipe: chip strip left (${swipes})`, `to reveal ${tileKey}`);
    await sleep(500);
    pt = await page.evaluate(F.byData, 'tile', tileKey, '[data-dockpanel="1"]').catch(() => null);
  }
  if (!pt) { L.misses.push(tileKey); step(`MISS: tile ${tileKey} in strip`); return null; }
  await page.mouse.click(pt.x, pt.y); L.taps++;
  step(`tap: tile "${tileKey}" in ${tabLabel} strip`, `@${Math.round(pt.x)},${Math.round(pt.y)} size ${Math.round(pt.rect.w)}x${Math.round(pt.rect.h)}`);
  await sleep(650);
  return pt;
}
async function canvasRect(page) {
  return page.evaluate(() => { const c = document.querySelector('[data-mlroot="1"] canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
}

// ============================================================ JOB 1
newJob('job1', 'Paint sand, then water; brush tracking + DOTTED BRUSH test');
{
  const { ctx, page } = await freshLab(browser);
  await enterLab(page);
  await shot(page, 'job1-start-first-run');
  await measurePanels(page, 'first run (coach/demo)');
  await dismissFirstRun(page);
  const cv = await canvasRect(page);
  step('canvas rect', JSON.stringify(cv));
  await target(page, 'TopBar button (Menu)', F.byAria, 'Menu');
  await target(page, 'Dock tab (Liquids)', F.byAria, 'Liquids');
  await target(page, 'Tool wheel button (current tool)', F.byAria, 'tap to change tool');

  // Default substance is Sand, default tool Paint.
  const sx = cv.x + cv.w * 0.22, sy = cv.y + cv.h * 0.78;
  await drag(page, 'paint SAND pile (default substance, slow drag)', sx, sy, cv.x + cv.w * 0.62, sy + 14, { midShot: 'job1-mid-sand' });
  await sleep(1200);

  // Water from Liquids strip
  await pickFromStrip(page, 'Liquids', 'water');
  const wx = cv.x + cv.w * 0.30, wy = cv.y + cv.h * 0.52;
  await drag(page, 'paint WATER above the sand (drag 1)', wx, wy, cv.x + cv.w * 0.58, wy + 6);
  await drag(page, 'paint WATER above the sand (drag 2)', wx + 10, wy + 26, cv.x + cv.w * 0.55, wy + 30);
  await sleep(3000);
  await shot(page, 'job1-end-sand-water');
  const w1 = await world(page);
  step('world after settle', `sand=${w1.sand} water=${w1.water} parts=${w1.parts} cellPx=${w1.cellPx}`);

  // --- brush tracking: slow straight stroke in empty upper area, compare pointer row vs painted rows
  await pickFromStrip(page, 'Solids', 'sand');
  const ty = cv.y + cv.h * 0.16;
  await drag(page, 'TRACKING stroke: slow straight horizontal line, upper area', cv.x + cv.w * 0.15, ty, cv.x + cv.w * 0.85, ty, { steps: 30, midShot: 'job1-brush-mid' });
  const track = await page.evaluate((py) => {
    const ml = window.__matterlab; const e = ml.engine; const g = ml.geom();
    const cvv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cvv.getBoundingClientRect();
    const pointerCellY = Math.floor((py - cr.y - g.oy) / g.s);
    // sand id via a known painted cell: scan top 45% rows for the stroke band (long horizontal run)
    let best = null;
    for (let y = 0; y < Math.floor(e.rows * 0.45); y++) {
      let run = 0, idHere = 0;
      for (let x = 0; x < e.cols; x++) { const id = e.el[y * e.cols + x]; if (id) { run++; idHere = id; } else { if (run > (best?.run || 0)) best = { run, y, id: idHere }; run = 0; } }
      if (run > (best?.run || 0)) best = { run, y, id: idHere };
    }
    if (!best) return { pointerCellY, found: false };
    // vertical extent of that substance near the band
    const rows = [];
    for (let y = Math.max(0, best.y - 30); y < Math.min(e.rows, best.y + 30); y++) { let c = 0; for (let x = 0; x < e.cols; x++) if (e.el[y * e.cols + x] === best.id) c++; if (c > 3) rows.push(y); }
    return { pointerCellY, found: true, bandRow: best.y, bandRunCells: best.run, paintedRows: rows, cellPx: g.s, brushCellsNote: 'default brush=6' };
  }, ty);
  step('TRACKING measurement', JSON.stringify(track));
  REPORT.jobs.job1.tracking = track;
  await shot(page, 'job1-tracking-stroke');

  // --- DOTTED BRUSH: one FAST long diagonal, minimal move steps (finger flick speed)
  const fx1 = cv.x + cv.w * 0.08, fy1 = cv.y + cv.h * 0.30, fx2 = cv.x + cv.w * 0.92, fy2 = cv.y + cv.h * 0.62;
  const t0 = Date.now();
  await page.mouse.move(fx1, fy1);
  await page.mouse.down();
  await page.mouse.move(fx2, fy2, { steps: 2 });
  await page.mouse.up();
  L.drags++;
  step('FAST diagonal stroke (dotted-brush test)', `(${Math.round(fx1)},${Math.round(fy1)}) -> (${Math.round(fx2)},${Math.round(fy2)}) in ${Date.now() - t0}ms, move steps=2`);
  await sleep(400);
  await shot(page, 'job1-dotted-stroke');
  const dots = await page.evaluate(({ x1, y1, x2, y2 }) => {
    const ml = window.__matterlab; const e = ml.engine; const g = ml.geom();
    const cvv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cvv.getBoundingClientRect();
    const c1 = { x: (x1 - cr.x - g.ox) / g.s, y: (y1 - cr.y - g.oy) / g.s };
    const c2 = { x: (x2 - cr.x - g.ox) / g.s, y: (y2 - cr.y - g.oy) / g.s };
    const len = Math.hypot(c2.x - c1.x, c2.y - c1.y);
    const paintedAt = (t) => {
      const cx = c1.x + (c2.x - c1.x) * t, cy = c1.y + (c2.y - c1.y) * t;
      for (let yy = Math.floor(cy - 2); yy <= cy + 2; yy++) for (let xx = Math.floor(cx - 2); xx <= cx + 2; xx++) {
        if (xx >= 0 && yy >= 0 && xx < e.cols && yy < e.rows && e.el[yy * e.cols + xx]) return true;
      }
      return false;
    };
    const runs = []; let cur = null;
    const N = Math.floor(len * 2);
    for (let i = 0; i <= N; i++) {
      const p = paintedAt(i / N);
      if (p && !cur) cur = { start: i / 2, painted: true };
      if (!p && cur) { runs.push({ fromCell: Math.round(cur.start * 10) / 10, toCell: Math.round(i / 2 * 10) / 10, lenCells: Math.round((i / 2 - cur.start) * 10) / 10, painted: true }); cur = null; }
      if (!p && !cur) cur = { start: i / 2, painted: false };
      if (p && cur && !cur.painted) { runs.push({ fromCell: Math.round(cur.start * 10) / 10, toCell: Math.round(i / 2 * 10) / 10, lenCells: Math.round((i / 2 - cur.start) * 10) / 10, painted: false }); cur = { start: i / 2, painted: true }; }
    }
    const gaps = runs.filter((r) => !r.painted && r.lenCells > 1);
    const blobs = runs.filter((r) => r.painted);
    return { lineCells: Math.round(len), cellPx: Math.round(g.s * 100) / 100, blobCount: blobs.length, blobs: blobs.slice(0, 14), gapCount: gaps.length, gaps: gaps.slice(0, 14), maxGapCells: gaps.length ? Math.max(...gaps.map((g2) => g2.lenCells)) : 0, maxGapPx: gaps.length ? Math.round(Math.max(...gaps.map((g2) => g2.lenCells)) * g.s) : 0 };
  }, { x1: fx1, y1: fy1, x2: fx2, y2: fy2 });
  step('DOTTED-BRUSH measurement', JSON.stringify(dots));
  REPORT.jobs.job1.dotted = dots;
  await sleep(1500);
  await shot(page, 'job1-dotted-settled');
  await ctx.close();
}

// ============================================================ JOB 2 — THE BOIL JOB
newJob('job2', 'BOIL: beaker + water + burner underneath, light it, wait for boil');
{
  const { ctx, page } = await freshLab(browser);
  await enterLab(page);                                   // tap 1
  await dismissFirstRun(page);                             // taps 2..3
  // --- place beaker
  await tap(page, 'Dock tab: Lab Gear', F.byAria, 'Lab Gear'); L.panelOpens++;
  await measurePanels(page, 'Lab Gear picker');
  await target(page, 'Gear tile (Beaker M)', F.byData, 'gear', 'beaker-m');
  await tap(page, 'Gear tile: Beaker M', F.byData, 'gear', 'beaker-m');
  await sleep(900);
  await shot(page, 'job2-beaker-placed');
  let w = await world(page);
  const bk = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('beaker placed', JSON.stringify(bk));
  REPORT.jobs.job2.beakerPx = bk ? bk.px : null;
  // --- BLOCKER 1 measurement: beaker vs bench strip
  if (bk && w.stage) {
    const benchAfterTop = w.stage.bottom - 14;             // .ml-stage::after is 14px tall at stage bottom
    const benchBandTop = Math.round(w.stage.y + w.stage.h * 0.822); // stage bg brown gradient starts ~82.2%
    const belowAfter = Math.max(0, bk.px.bottom - benchAfterTop);
    const belowBand = Math.max(0, bk.px.bottom - benchBandTop);
    const crossAfter = bk.px.y < benchAfterTop && bk.px.bottom > benchAfterTop;
    const m = {
      beakerPx: bk.px, stage: w.stage, canvasBottom: w.canvas.bottom,
      benchStripTop_afterPseudo: benchAfterTop, benchBandTop_gradient: benchBandTop,
      beakerBottomBelowStageAfterTopPx: belowAfter,
      beakerBottomBelowGradientBandPx: belowBand,
      pctOfBeakerBelowGradientBand: Math.round((belowBand / bk.px.h) * 1000) / 10,
      benchLineCrossesBeakerAtPctFromTop: Math.round(((benchBandTop - bk.px.y) / bk.px.h) * 1000) / 10,
      canvasBottomVsStageBottom: w.stage.bottom - w.canvas.bottom,
    };
    step('BENCH measurement', JSON.stringify(m));
    REPORT.jobs.job2.bench = m;
  }
  // --- fill with water
  await pickFromStrip(page, 'Liquids', 'water');
  w = await world(page);
  const bk2 = w.objs.find((o) => o.kind.startsWith('beaker'));
  if (bk2) {
    const ix = bk2.px.x + 14, ix2 = bk2.px.x + bk2.px.w - 14;
    await drag(page, 'paint WATER into beaker (stroke 1, upper interior)', ix, bk2.px.y + bk2.px.h * 0.30, ix2, bk2.px.y + bk2.px.h * 0.32);
    await drag(page, 'paint WATER into beaker (stroke 2, mid interior)', ix, bk2.px.y + bk2.px.h * 0.48, ix2, bk2.px.y + bk2.px.h * 0.50);
    await drag(page, 'paint WATER into beaker (stroke 3, lower interior)', ix, bk2.px.y + bk2.px.h * 0.62, ix2, bk2.px.y + bk2.px.h * 0.64);
  }
  await sleep(2500);
  w = await world(page);
  step('after filling', `waterCells=${w.water}`);
  await shot(page, 'job2-mid-filled');
  // --- place burner
  await tap(page, 'Dock tab: Lab Gear (for burner)', F.byAria, 'Lab Gear'); L.panelOpens++;
  await tap(page, 'Gear tile: Burner', F.byData, 'gear', 'burner');
  await sleep(900);
  L.panelOpens++; // placing a level-gear auto-opens the side panel
  await measurePanels(page, 'after placing burner (auto side panel?)');
  await shot(page, 'job2-burner-placed');
  w = await world(page);
  const bn = w.objs.find((o) => o.kind === 'burner');
  const bk3 = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('burner placed', JSON.stringify(bn));
  step('beaker now', JSON.stringify(bk3));
  REPORT.jobs.job2.burnerPx = bn ? bn.px : null;
  REPORT.jobs.job2.burnerLevelOnPlacement = bn ? bn.level : null;
  await target(page, 'Side-panel level button (Med)', F.byText, 'Med', '[data-sidepanel="1"]');
  // close the auto-opened side panel (its X)
  const closedSide = await tap(page, 'Close side panel (X)', F.byAria, 'Close', '[data-sidepanel="1"]', 500).catch(() => null);
  if (!closedSide) {
    const x = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const b = p.querySelector('button'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { w: r.width, h: r.height } }; });
    if (x) { await page.mouse.click(x.x, x.y); L.taps++; step('tap: Close side panel (first button = X)', `@${Math.round(x.x)},${Math.round(x.y)}`); await sleep(500); }
    else step('side panel was not open');
  }
  // --- position burner under beaker via Interact (Move gear) tool
  await tap(page, 'Tool wheel button (open tools)', F.byAria, 'tap to change tool'); L.panelOpens++;
  await measurePanels(page, 'tool wheel open');
  await tap(page, 'Tool: Move gear (Interact)', F.byAria, 'Move gear', '[data-toolwheel="1"]');
  w = await world(page);
  const bn2 = w.objs.find((o) => o.kind === 'burner');
  const bk4 = w.objs.find((o) => o.kind.startsWith('beaker'));
  if (bn2 && bk4) {
    const dxNeeded = bk4.px.cx - bn2.px.cx;
    step('alignment before move', `burnerCx=${bn2.px.cx} beakerCx=${bk4.px.cx} dxNeeded=${dxNeeded}px, burnerBottom=${bn2.px.bottom} beakerBottom=${bk4.px.bottom} beakerTop=${bk4.px.y}`);
    // attempt 1: drag burner horizontally to under beaker centre (same floor line)
    await drag(page, 'drag BURNER under beaker centre', bn2.px.cx, bn2.px.cy, bk4.px.cx, bn2.px.cy, { steps: 16 });
    w = await world(page);
    const bn3 = w.objs.find((o) => o.kind === 'burner'); const bk5 = w.objs.find((o) => o.kind.startsWith('beaker'));
    step('after burner drag', `burner=${JSON.stringify(bn3 && bn3.px)} beaker=${JSON.stringify(bk5 && bk5.px)}`);
    const aligned = bn3 && bk5 && Math.abs(bn3.px.cx - bk5.px.cx) < 30;
    const stacked = bn3 && bk5 && bk5.px.bottom <= bn3.px.y + 6; // beaker base resting on/above burner top
    step('alignment verdict', `horizontallyAligned=${aligned} beakerSitsOnBurner=${stacked}`);
    REPORT.jobs.job2.aligned = aligned; REPORT.jobs.job2.stacked = stacked;
    if (aligned && !stacked) {
      // attempt 2: lift the BEAKER on top of the burner
      await drag(page, 'drag BEAKER on top of burner', bk5.px.cx, bk5.px.cy, bn3.px.cx, bn3.px.y - bk5.px.h / 2 + 4, { steps: 16 });
      w = await world(page);
      const bn4 = w.objs.find((o) => o.kind === 'burner'); const bk6 = w.objs.find((o) => o.kind.startsWith('beaker'));
      step('after beaker lift attempt', `burner=${JSON.stringify(bn4 && bn4.px)} beaker=${JSON.stringify(bk6 && bk6.px)}`);
      REPORT.jobs.job2.stackedAfterLift = !!(bn4 && bk6 && bk6.px.bottom <= bn4.px.y + 6 && Math.abs(bk6.px.cx - bn4.px.cx) < 30);
    }
  }
  await shot(page, 'job2-positioned');
  // --- set level from the world: one Interact tap on the burner (auto-lit L2 on placement -> tap cycles)
  w = await world(page);
  const bn5 = w.objs.find((o) => o.kind === 'burner');
  if (bn5) {
    const before = bn5.level;
    await tapXY(page, 'tap BURNER in world (Interact tool — cycle level)', bn5.px.cx, bn5.px.cy, 800);
    w = await world(page);
    const bn6 = w.objs.find((o) => o.kind === 'burner');
    step('burner level after world tap', `${before} -> ${bn6 ? bn6.level : '?'}`);
    REPORT.jobs.job2.levelBeforeTap = before; REPORT.jobs.job2.levelAfterTap = bn6 ? bn6.level : null;
    if (bn6 && bn6.level === 0) { // cycled to OFF — tap again to relight
      await tapXY(page, 'tap BURNER again (it had cycled to OFF)', bn6.px.cx, bn6.px.cy, 800);
      w = await world(page); const bn7 = w.objs.find((o) => o.kind === 'burner');
      step('burner level after re-light tap', `${bn7 ? bn7.level : '?'}`);
      REPORT.jobs.job2.levelAfterRelight = bn7 ? bn7.level : null;
    }
  }
  REPORT.jobs.job2.tapsToBoilingSetup = { taps: L.taps, drags: L.drags, panelOpens: L.panelOpens };
  step('SETUP COMPLETE — taps so far', `taps=${L.taps} drags=${L.drags} panelOpens=${L.panelOpens}`);
  // --- wait for the boil
  const startWait = Date.now();
  let boiled = false; let firstSteamAt = null; let lastTemp = null;
  while (Date.now() - startWait < 300000) {
    await sleep(6000);
    const s = await world(page);
    const t = await beakerWaterTemp(page);
    lastTemp = t;
    const el = Math.round((Date.now() - startWait) / 1000);
    step(`boil poll ${el}s`, `steam=${s.steam} water=${s.water} hottestWaterInBeaker=${t ? t.temp + 'C (' + t.name + ')' : 'none found'}`);
    if (s.steam > 0 && !firstSteamAt) { firstSteamAt = el; await shot(page, 'job2-mid-first-steam'); }
    if (t && t.temp >= 95) { boiled = true; break; }
    if (s.steam >= 25 && t && t.temp >= 90) { boiled = true; break; }
  }
  REPORT.jobs.job2.boiled = boiled;
  REPORT.jobs.job2.firstSteamAtSec = firstSteamAt;
  REPORT.jobs.job2.waitSec = Math.round((Date.now() - startWait) / 1000);
  REPORT.jobs.job2.finalTemp = lastTemp;
  step('BOIL VERDICT', `boiled=${boiled} waitSec=${REPORT.jobs.job2.waitSec} firstSteamAt=${firstSteamAt}s finalTemp=${JSON.stringify(lastTemp)}`);
  await shot(page, 'job2-end-boil');
  await ctx.close();
}

// ============================================================ JOB 3 — experiment
newJob('job3', 'Run one experiment (Boil Water) via Menu -> Experiments -> Set up');
{
  const { ctx, page } = await freshLab(browser);
  await enterLab(page);
  await dismissFirstRun(page);
  await tap(page, 'TopBar: Menu', F.byAria, 'Menu'); L.panelOpens++;
  await measurePanels(page, 'menu sheet');
  await shot(page, 'job3-mid-menu');
  await tap(page, 'Menu sheet: Experiments', F.byText, 'Experiments', '.sheet'); L.panelOpens++;
  await measurePanels(page, 'experiments sheet');
  await shot(page, 'job3-experiments-list');
  const setupPt = await tap(page, 'Experiment card: "Set up" (Boil Water, first card)', F.byText, 'Set up', '.sheet');
  await sleep(1200);
  const sheetStill = await page.evaluate(() => !!document.querySelector('.sheet'));
  step('after Set up', `sheetStillOpen=${sheetStill}`);
  REPORT.jobs.job3.sheetStayedOpenAfterSetup = sheetStill;
  if (sheetStill) { await tap(page, 'Close experiments sheet', F.byText, 'Close', '.sheet'); }
  await sleep(800);
  await shot(page, 'job3-setup-world');
  let w = await world(page);
  step('world after setup', JSON.stringify(w.objs.map((o) => ({ kind: o.kind, level: o.level, px: o.px }))));
  step('counts', `water=${w.water} steam=${w.steam}`);
  // first objective: some water reaches 95C — wait and watch (no further input)
  const t0 = Date.now(); let done = false; let lastT = null;
  while (Date.now() - t0 < 240000) {
    await sleep(6000);
    const t = await beakerWaterTemp(page); lastT = t;
    const s = await world(page);
    step(`objective poll ${Math.round((Date.now() - t0) / 1000)}s`, `hottestWater=${t ? t.temp + 'C' : 'none'} steam=${s.steam}`);
    if (t && t.temp >= 95) { done = true; break; }
  }
  REPORT.jobs.job3.objectiveDone = done;
  REPORT.jobs.job3.waitSec = Math.round((Date.now() - t0) / 1000);
  REPORT.jobs.job3.finalTemp = lastT;
  await shot(page, 'job3-mid-objective');
  // re-open the sheet to read the official objective status (2 more taps)
  await tap(page, 'TopBar: Menu (re-check status)', F.byAria, 'Menu'); L.panelOpens++;
  await tap(page, 'Menu sheet: Experiments (re-check status)', F.byText, 'Experiments', '.sheet'); L.panelOpens++;
  const statusTxt = await page.evaluate(() => { const s = document.querySelector('.sheet'); return s ? s.innerText.replace(/\s+/g, ' ').slice(0, 700) : null; });
  step('experiments sheet status text', statusTxt || 'none');
  REPORT.jobs.job3.statusText = statusTxt;
  await shot(page, 'job3-end-status');
  await ctx.close();
}

// ============================================================ JOB 4 — select / move / resize / lock
newJob('job4', 'Select a placed beaker, move it, resize it, lock it');
{
  const { ctx, page } = await freshLab(browser);
  await enterLab(page);
  await dismissFirstRun(page);
  // setup: place a beaker (setup taps counted separately in the log)
  const setupStart = { taps: L.taps, drags: L.drags };
  await tap(page, '[setup] Dock tab: Lab Gear', F.byAria, 'Lab Gear'); L.panelOpens++;
  await tap(page, '[setup] Gear tile: Beaker M', F.byData, 'gear', 'beaker-m');
  await sleep(800);
  REPORT.jobs.job4.setupTaps = L.taps - setupStart.taps;
  let w = await world(page);
  const bk = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('beaker for job4', JSON.stringify(bk && bk.px));
  const opStart = L.taps + L.drags;
  // SELECT: switch tool to Move gear, then tap the beaker
  await tap(page, 'Tool wheel button (open tools)', F.byAria, 'tap to change tool'); L.panelOpens++;
  await measurePanels(page, 'tool wheel open (job4)');
  await tap(page, 'Tool: Move gear (Interact)', F.byAria, 'Move gear', '[data-toolwheel="1"]');
  w = await world(page);
  const bkA = w.objs.find((o) => o.kind.startsWith('beaker'));
  await tapXY(page, 'tap BEAKER in world (select it)', bkA.px.cx, bkA.px.cy, 800);
  REPORT.jobs.job4.selectTaps = (L.taps + L.drags) - opStart;
  const sideAfterSelect = await page.evaluate(() => !!document.querySelector('[data-sidepanel="1"]'));
  const sheetAfterSelect = await page.evaluate(() => !!document.querySelector('.sheet'));
  step('after select tap', `sidePanelOpen=${sideAfterSelect} sheetOpen=${sheetAfterSelect} (does anything show the selection/controls?)`);
  REPORT.jobs.job4.controlsAppearedOnSelect = sideAfterSelect || sheetAfterSelect;
  await shot(page, 'job4-selected');
  // MOVE: drag the beaker left
  const moveStart = L.taps + L.drags;
  await drag(page, 'drag BEAKER left ~70px (move it)', bkA.px.cx, bkA.px.cy, bkA.px.cx - 70, bkA.px.cy, { steps: 16 });
  w = await world(page);
  const bkB = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('after move drag', `cx ${bkA.px.cx} -> ${bkB ? bkB.px.cx : '?'} (moved ${bkB ? bkA.px.cx - bkB.px.cx : 0}px)`);
  REPORT.jobs.job4.moveDrags = (L.taps + L.drags) - moveStart;
  REPORT.jobs.job4.movedPx = bkB ? bkA.px.cx - bkB.px.cx : 0;
  await shot(page, 'job4-mid-moved');
  // RESIZE + LOCK live in the side panel: Menu -> Tools & controls panel
  const panelStart = L.taps + L.drags;
  await tap(page, 'TopBar: Menu', F.byAria, 'Menu'); L.panelOpens++;
  await tap(page, 'Menu sheet: Tools & controls panel', F.byText, 'Tools & controls panel', '.sheet'); L.panelOpens++;
  await measurePanels(page, 'side panel with gear controls');
  REPORT.jobs.job4.tapsToReachGearControls = (L.taps + L.drags) - panelStart;
  const gearHead = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); return p ? p.innerText.replace(/\s+/g, ' ').slice(0, 400) : null; });
  step('side panel content (first 400 chars)', gearHead || 'PANEL NOT OPEN');
  await shot(page, 'job4-sidepanel');
  // RESIZE: the "+" (Larger) button in the Gear section
  const sizeBefore = bkB ? bkB.px : null;
  const rsStart = L.taps + L.drags;
  await tap(page, 'Gear section: Larger (+)', F.byAria, 'Larger', '[data-sidepanel="1"]');
  await sleep(800);
  w = await world(page);
  const bkC = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('after Larger tap', `px ${sizeBefore ? sizeBefore.w + 'x' + sizeBefore.h : '?'} -> ${bkC ? bkC.px.w + 'x' + bkC.px.h : '?'} scale=${bkC ? bkC.scale : '?'}`);
  REPORT.jobs.job4.resizeTaps = (L.taps + L.drags) - rsStart;
  REPORT.jobs.job4.sizeBefore = sizeBefore; REPORT.jobs.job4.sizeAfter = bkC ? bkC.px : null;
  // LOCK
  const lkStart = L.taps + L.drags;
  await tap(page, 'Gear section: Lock item', F.byText, 'Lock item', '[data-sidepanel="1"]');
  await sleep(600);
  w = await world(page);
  const bkD = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('after Lock tap', `locked=${bkD ? bkD.locked : '?'}`);
  REPORT.jobs.job4.lockTaps = (L.taps + L.drags) - lkStart;
  REPORT.jobs.job4.locked = bkD ? bkD.locked : null;
  // try to move it while locked (feedback check)
  const panelOpen = await page.evaluate(() => !!document.querySelector('[data-sidepanel="1"]'));
  if (panelOpen) { const x = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); const b = p && p.querySelector('button'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); if (x) { await page.mouse.click(x.x, x.y); L.taps++; step('tap: close side panel (X) before locked-move test'); await sleep(500); } }
  if (bkD) await drag(page, 'drag LOCKED beaker (should refuse)', bkD.px.cx, bkD.px.cy, bkD.px.cx + 60, bkD.px.cy, { steps: 12 });
  w = await world(page);
  const bkE = w.objs.find((o) => o.kind.startsWith('beaker'));
  step('locked beaker after drag attempt', `cx ${bkD ? bkD.px.cx : '?'} -> ${bkE ? bkE.px.cx : '?'} (0 = lock held)`);
  REPORT.jobs.job4.lockedMoveHeld = bkD && bkE ? bkE.px.cx === bkD.px.cx : null;
  await shot(page, 'job4-end-locked');
  await ctx.close();
}

// ============================================================ JOB 5 — reaction + Messages
newJob('job5', 'Cause a reaction (sodium + water), then read it in Messages');
{
  const { ctx, page } = await freshLab(browser);
  await enterLab(page);
  await dismissFirstRun(page);
  const cv = await canvasRect(page);
  await pickFromStrip(page, 'Liquids', 'water');
  await drag(page, 'paint WATER pool (floor, left-centre)', cv.x + cv.w * 0.28, cv.y + cv.h * 0.80, cv.x + cv.w * 0.52, cv.y + cv.h * 0.82);
  await drag(page, 'paint WATER pool (second stroke)', cv.x + cv.w * 0.30, cv.y + cv.h * 0.76, cv.x + cv.w * 0.50, cv.y + cv.h * 0.78);
  await sleep(1500);
  // pick Sodium via the full picker search (selected-substance bar -> sheet -> type -> tile)
  const barPt = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-mlroot="1"] button')].find((x) => /tap to change/.test(x.innerText || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { w: r.width, h: r.height } }; });
  if (barPt) { await page.mouse.click(barPt.x, barPt.y); L.taps++; step('tap: selected-substance bar (opens full picker)', `"${'Sand/Water bar'}" @${Math.round(barPt.x)},${Math.round(barPt.y)}`); L.panelOpens++; await sleep(800); }
  else step('MISS: selected-substance bar');
  await measurePanels(page, 'full picker (search for sodium)');
  const inp = await page.evaluate(() => { const i = document.querySelector('.sheet input'); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (inp) { await page.mouse.click(inp.x, inp.y); L.taps++; step('tap: picker search input'); await page.keyboard.type('sodium', { delay: 60 }); step('typed: "sodium" in search'); await sleep(900); }
  await shot(page, 'job5-mid-search');
  await tap(page, 'Search result tile: Sodium', F.byData, 'tile', 'sodium', '.sheet');
  await sleep(500);
  await drag(page, 'paint SODIUM into the water pool', cv.x + cv.w * 0.34, cv.y + cv.h * 0.74, cv.x + cv.w * 0.46, cv.y + cv.h * 0.78, { steps: 10 });
  await sleep(2500);
  await shot(page, 'job5-reaction');
  const badge = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Menu/.test(x.getAttribute('aria-label') || '')); return b ? b.getAttribute('aria-label') : null; });
  step('Menu button aria-label after reaction', badge || 'no badge text');
  REPORT.jobs.job5.menuBadge = badge;
  const w = await world(page);
  step('world counts after sodium+water', `water=${w.water} steam=${w.steam} parts=${w.parts}`);
  // open Messages: Menu -> Messages
  const msgStart = L.taps + L.drags;
  await tap(page, 'TopBar: Menu', F.byAria, 'Menu'); L.panelOpens++;
  await measurePanels(page, 'menu sheet (job5)');
  await tap(page, 'Menu sheet: Messages', F.byText, 'Messages', '.sheet'); L.panelOpens++;
  REPORT.jobs.job5.tapsToMessages = (L.taps + L.drags) - msgStart;
  await measurePanels(page, 'messages sheet');
  await sleep(600);
  const feed = await page.evaluate(() => { const s = document.querySelector('.sheet'); return s ? s.innerText.replace(/\s+/g, ' ').slice(0, 900) : null; });
  step('Messages sheet text', feed || 'SHEET NOT OPEN');
  REPORT.jobs.job5.feedText = feed;
  await shot(page, 'job5-end-messages');
  await ctx.close();
}

await browser.close();
srv.close();
writeFileSync('/tmp/feel-report.json', JSON.stringify(REPORT, null, 1));
for (const [id, j] of Object.entries(REPORT.jobs)) console.log(`SUMMARY ${id}: taps=${j.taps} drags=${j.drags} swipes=${j.swipes} panelOpens=${j.panelOpens} misses=${j.misses.join(',') || 'none'}`);
console.log('FEEL-PLAYTEST DONE');
