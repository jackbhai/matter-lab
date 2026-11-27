// FEEL Phase 1 — supplementary probes (stone strokes that don't fall, so the
// brush measurements are not confounded by gravity; beaker-lift stacking
// attempt that job2's flow skipped; slow-press burner tap test).
// Same rules: real mouse only for actions; __matterlab read-only for measurement.
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = '/home/hatch/workspace/matter-lab-shots/feel-before';
mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html';
    p = p.replace(/^\/matter-lab/, '');
    const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${srv.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const OUT = {};
const log = (...a) => console.log(...a);

async function freshLab() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 412, height: 915 });
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  const pt = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox/.test(x.innerText || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(pt.x, pt.y); log('tap Enter');
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(3000);
  const sk = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'Skip tutorial'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (sk) { await page.mouse.click(sk.x, sk.y); log('tap Skip tutorial'); await sleep(600); }
  return { ctx, page };
}
async function clickBy(page, finder, arg, scope) {
  const pt = await page.evaluate(finder, arg, scope).catch(() => null);
  if (!pt) { log('MISS', arg); return null; }
  await page.mouse.click(pt.x, pt.y); await sleep(650);
  return pt;
}
const byAria = (label, scope) => { const root = scope ? document.querySelector(scope) : document; if (!root) return null; const el = [...root.querySelectorAll('button,[role="button"]')].find((e) => (e.getAttribute('aria-label') || '') === label) || [...root.querySelectorAll('button,[role="button"]')].find((e) => (e.getAttribute('aria-label') || '').includes(label)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { w: r.width, h: r.height } }; };
const byData = (attr, val, scope) => { const root = scope ? document.querySelector(scope) : document; if (!root) return null; const el = root.querySelector(`[data-${attr}="${val}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { w: r.width, h: r.height }, offscreenX: r.x < 0 || r.x + r.width > innerWidth }; };
const world = (page) => page.evaluate(() => {
  const ml = window.__matterlab; const e = ml.engine; const g = ml.geom();
  const cv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cv.getBoundingClientRect();
  const objs = [...e.objects.values()].map((o) => { const x = cr.x + g.ox + o.anchor.x * g.s, y = cr.y + g.oy + o.anchor.y * g.s; return { kind: o.kind, level: o.level, locked: !!o.locked, px: { x: Math.round(x), y: Math.round(y), w: Math.round(o.w * g.s), h: Math.round(o.h * g.s), cx: Math.round(x + o.w * g.s / 2), cy: Math.round(y + o.h * g.s / 2), bottom: Math.round(y + o.h * g.s) } }; });
  return { objs, canvas: { x: cr.x, y: cr.y, w: cr.width, h: cr.height }, cellPx: g.s, steam: ml.countKey('steam') };
});
const lineProfile = (page, x1, y1, x2, y2, key) => page.evaluate(({ x1, y1, x2, y2, key }) => {
  const ml = window.__matterlab; const e = ml.engine; const g = ml.geom();
  const cv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cv.getBoundingClientRect();
  const id = (() => { for (let i = 0; i < e.el.length; i++) { /* find via inspect-free: use census ids */ } return null; })();
  // identify the substance id by probing cells near the stroke start (any painted cell)
  const C = { x: (x1 - cr.x - g.ox) / g.s, y: (y1 - cr.y - g.oy) / g.s };
  const D = { x: (x2 - cr.x - g.ox) / g.s, y: (y2 - cr.y - g.oy) / g.s };
  const len = Math.hypot(D.x - C.x, D.y - C.y);
  const at = (t, r) => { const cx = C.x + (D.x - C.x) * t, cy = C.y + (D.y - C.y) * t; for (let yy = Math.floor(cy - r); yy <= cy + r; yy++) for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) if (xx >= 0 && yy >= 0 && xx < e.cols && yy < e.rows && e.el[yy * e.cols + xx]) return true; return false; };
  const prof = []; const N = Math.floor(len);
  for (let i = 0; i <= N; i++) prof.push(at(i / N, 2.5) ? 1 : 0);
  const runs = []; let cur = prof[0], start = 0;
  for (let i = 1; i <= N; i++) { if (prof[i] !== cur) { runs.push({ painted: !!cur, lenCells: i - start }); cur = prof[i]; start = i; } }
  runs.push({ painted: !!cur, lenCells: N + 1 - start });
  const gaps = runs.filter((r) => !r.painted && r.lenCells >= 2);
  const blobs = runs.filter((r) => r.painted);
  return { lineCells: N, cellPx: Math.round(g.s * 100) / 100, blobRuns: blobs.length, blobLensCells: blobs.map((b) => b.lenCells), gapCount: gaps.length, gapLensCells: gaps.map((g2) => g2.lenCells), maxGapCells: gaps.length ? Math.max(...gaps.map((g2) => g2.lenCells)) : 0, maxGapPx: gaps.length ? Math.round(Math.max(...gaps.map((g2) => g2.lenCells)) * g.s) : 0, paintedFrac: Math.round(prof.reduce((a, b) => a + b, 0) / prof.length * 100) / 100 };
}, { x1, y1, x2, y2, key });

// ---------------- S-A: stone strokes ----------------
{
  const { ctx, page } = await freshLab();
  await clickBy(page, byAria, 'Solids');
  let pt = await page.evaluate(byData, 'tile', 'stone', '[data-dockpanel="1"]').catch(() => null);
  let sw = 0;
  while (pt && pt.offscreenX && sw < 5) {
    const sy = await page.evaluate(() => { const el = document.querySelector('.ml-chipstrip'); const r = el.getBoundingClientRect(); return r.y + r.height / 2; });
    await page.mouse.move(340, sy); await page.mouse.down(); await page.mouse.move(90, sy, { steps: 8 }); await page.mouse.up(); sw++; await sleep(500);
    pt = await page.evaluate(byData, 'tile', 'stone', '[data-dockpanel="1"]').catch(() => null);
  }
  if (pt) { await page.mouse.click(pt.x, pt.y); log('tap stone tile after', sw, 'strip swipes'); await sleep(600); }
  else log('MISS stone tile');
  const w0 = await world(page); const cv = w0.canvas;
  // slow tracking stroke (stone — does not fall)
  const ty = cv.y + cv.h * 0.18;
  await page.mouse.move(cv.x + cv.w * 0.12, ty); await page.mouse.down();
  await page.mouse.move(cv.x + cv.w * 0.88, ty, { steps: 30 }); await page.mouse.up();
  await sleep(120);
  const track = await page.evaluate((py) => {
    const ml = window.__matterlab; const e = ml.engine; const g = ml.geom();
    const cvv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cvv.getBoundingClientRect();
    const pointerCellY = (py - cr.y - g.oy) / g.s;
    const rows = [];
    for (let y = 0; y < e.rows; y++) { let c = 0; for (let x = 0; x < e.cols; x++) if (e.el[y * e.cols + x]) c++; if (c > 10) rows.push({ y, c }); }
    return { pointerCellY: Math.round(pointerCellY * 10) / 10, paintedRowMin: rows.length ? rows[0].y : null, paintedRowMax: rows.length ? rows[rows.length - 1].y : null, paintedRowCentre: rows.length ? Math.round((rows[0].y + rows[rows.length - 1].y) / 2 * 10) / 10 : null, cellPx: g.s };
  }, ty);
  log('STONE TRACKING', JSON.stringify(track)); OUT.tracking = track;
  // FAST stroke: 5 discrete jumps, no interpolation steps (real flick = sparse pointermove events)
  const fx1 = cv.x + cv.w * 0.08, fy1 = cv.y + cv.h * 0.38, fx2 = cv.x + cv.w * 0.92, fy2 = cv.y + cv.h * 0.60;
  await page.mouse.move(fx1, fy1); await page.mouse.down();
  for (let i = 1; i <= 5; i++) { await page.mouse.move(fx1 + (fx2 - fx1) * i / 5, fy1 + (fy2 - fy1) * i / 5); await sleep(12); }
  await page.mouse.up();
  const prof = await lineProfile(page, fx1, fy1, fx2, fy2, 'stone');
  log('STONE FAST PROFILE', JSON.stringify(prof)); OUT.dotted = prof;
  await page.screenshot({ path: `${SHOTS}/supp-stone-strokes.png` });
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/supp-stone-strokes-settled.png` });
  await ctx.close();
}

// ---------------- S-B: lift beaker onto burner + slow-press tap ----------------
{
  const { ctx, page } = await freshLab();
  await clickBy(page, byAria, 'Lab Gear');
  await clickBy(page, byData, 'gear', 'beaker-m');
  await sleep(700);
  await clickBy(page, byAria, 'Lab Gear');
  await clickBy(page, byData, 'gear', 'burner');
  await sleep(900);
  // close auto side panel via its first button (X)
  const x = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const b = p.querySelector('button'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (x) { await page.mouse.click(x.x, x.y); log('closed side panel'); await sleep(600); }
  await clickBy(page, byAria, 'tap to change tool');
  await clickBy(page, byAria, 'Move gear', '[data-toolwheel="1"]');
  let w = await world(page);
  const bk = w.objs.find((o) => o.kind.startsWith('beaker')); const bn = w.objs.find((o) => o.kind === 'burner');
  log('before stacking', JSON.stringify({ bk, bn }));
  // drag BEAKER up onto the burner
  await page.mouse.move(bk.px.cx, bk.px.cy); await page.mouse.down();
  await page.mouse.move(bn.px.cx, bn.px.y - bk.px.h / 2 + 3, { steps: 16 }); await page.mouse.up();
  await sleep(700);
  w = await world(page);
  const bk2 = w.objs.find((o) => o.kind.startsWith('beaker')); const bn2 = w.objs.find((o) => o.kind === 'burner');
  log('after beaker-lift drag', JSON.stringify({ bk2, bn2 }));
  OUT.liftResult = { bk: bk2, bn: bn2, stacked: !!(bk2 && bn2 && bk2.px.bottom <= bn2.px.y + 6 && Math.abs(bk2.px.cx - bn2.px.cx) < 30) };
  await page.screenshot({ path: `${SHOTS}/supp-lift-attempt.png` });
  if (!OUT.liftResult.stacked && bk2 && bn2) {
    // drag BURNER up under the beaker (floating placement attempt)
    await page.mouse.move(bn2.px.cx, bn2.px.cy); await page.mouse.down();
    await page.mouse.move(bk2.px.cx, bk2.px.bottom - bn2.px.h / 2, { steps: 16 }); await page.mouse.up();
    await sleep(700);
    w = await world(page);
    const bk3 = w.objs.find((o) => o.kind.startsWith('beaker')); const bn3 = w.objs.find((o) => o.kind === 'burner');
    log('after burner-lift drag', JSON.stringify({ bk3, bn3 }));
    OUT.burnerLiftResult = { bk: bk3, bn: bn3, stacked: !!(bk3 && bn3 && bk3.px.bottom <= bn3.px.y + 6 && Math.abs(bk3.px.cx - bn3.px.cx) < 30) };
    await page.screenshot({ path: `${SHOTS}/supp-burner-lift-attempt.png` });
  }
  // slow-press taps on the burner (150ms hold — finger-like), read level after each
  w = await world(page);
  const bnT = w.objs.find((o) => o.kind === 'burner');
  const levels = [bnT ? bnT.level : null];
  for (let i = 0; i < 2; i++) {
    const cur = (await world(page)).objs.find((o) => o.kind === 'burner');
    await page.mouse.move(cur.px.cx, cur.px.cy); await page.mouse.down(); await sleep(150); await page.mouse.up();
    await sleep(800);
    const after = (await world(page)).objs.find((o) => o.kind === 'burner');
    levels.push(after ? after.level : null);
    log(`slow-press tap ${i + 1}: level ->`, after ? after.level : '?');
  }
  OUT.tapLevels = levels;
  await page.screenshot({ path: `${SHOTS}/supp-tap-test.png` });
  await ctx.close();
}

// ---------------- S-C: job4 redo — grab beaker by its GLASS EDGE; scroll side panel to Gear controls ----------------
{
  const { ctx, page } = await freshLab();
  const byText = (txt, scope) => { const root = scope ? document.querySelector(scope) : document; if (!root) return null; const el = [...root.querySelectorAll('button,[role="button"]')].find((e) => (e.innerText || '').trim() === txt) || [...root.querySelectorAll('button,[role="button"]')].find((e) => (e.innerText || '').trim().startsWith(txt)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { w: r.width, h: r.height }, text: (el.innerText || '').trim().slice(0, 40) }; };
  await clickBy(page, byAria, 'Lab Gear');
  await clickBy(page, byData, 'gear', 'beaker-m');
  await sleep(700);
  await clickBy(page, byAria, 'tap to change tool');
  await clickBy(page, byAria, 'Move gear', '[data-toolwheel="1"]');
  let w = await world(page);
  const bk = w.objs.find((o) => o.kind.startsWith('beaker'));
  log('S-C beaker', JSON.stringify(bk));
  // select by tapping the LEFT GLASS WALL (edge), not the hollow centre
  const edgeX = bk.px.x + 3, midY = bk.px.cy;
  await page.mouse.click(edgeX, midY); await sleep(800);
  log('S-C tapped beaker left wall at', edgeX, midY);
  // move: drag FROM the wall
  await page.mouse.move(edgeX, midY); await page.mouse.down();
  await page.mouse.move(edgeX - 70, midY, { steps: 18 }); await page.mouse.up();
  await sleep(700);
  w = await world(page);
  const bk2 = w.objs.find((o) => o.kind.startsWith('beaker'));
  log('S-C after edge-drag move', JSON.stringify(bk2));
  OUT.edgeMove = { fromCx: bk.px.cx, toCx: bk2 ? bk2.px.cx : null, movedPx: bk2 ? bk.px.cx - bk2.px.cx : null };
  await page.screenshot({ path: `${SHOTS}/supp-edge-move.png` });
  // open gear controls: Menu -> Tools & controls panel, then SCROLL the panel to the Gear section
  await clickBy(page, byAria, 'Menu');
  await clickBy(page, byText, 'Tools & controls panel', '.sheet');
  await sleep(700);
  const gearInfo = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const heads = [...p.querySelectorAll('.seclabel')].map((s) => s.innerText); return { scrollH: p.scrollHeight, clientH: p.clientHeight, heads }; });
  log('S-C side panel scroll info', JSON.stringify(gearInfo));
  OUT.panelScroll = gearInfo;
  // scroll panel down in steps until 'Lock item' is inside the panel's visible box
  let lockPt = null;
  for (let i = 0; i < 14 && !lockPt; i++) {
    lockPt = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const pr = p.getBoundingClientRect(); const b = [...p.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'Lock item'); if (!b) return null; const r = b.getBoundingClientRect(); if (r.y > pr.y + 10 && r.bottom < pr.bottom - 4 && r.y > 0 && r.bottom < innerHeight) return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { w: r.width, h: r.height } }; return null; });
    if (!lockPt) { const pr = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.move(pr.x, pr.y); await page.mouse.wheel({ deltaY: 420 }); await sleep(350); }
  }
  log('S-C Lock item visible after scrolling:', JSON.stringify(lockPt));
  OUT.lockVisible = lockPt;
  await page.screenshot({ path: `${SHOTS}/supp-panel-scrolled.png` });
  // RESIZE first (Larger button near Lock): scroll it into view the same way
  let bigPt = null;
  for (let i = 0; i < 6 && !bigPt; i++) {
    bigPt = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const pr = p.getBoundingClientRect(); const b = [...p.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '') === 'Larger'); if (!b) return null; const r = b.getBoundingClientRect(); if (r.y > pr.y + 6 && r.bottom < pr.bottom - 2) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; return null; });
    if (!bigPt) { const pr = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.move(pr.x, pr.y); await page.mouse.wheel({ deltaY: -200 }); await sleep(300); }
  }
  const sizePre = (await world(page)).objs.find((o) => o.kind.startsWith('beaker'));
  if (bigPt) { await page.mouse.click(bigPt.x, bigPt.y); await sleep(800); log('S-C clicked Larger at', JSON.stringify(bigPt)); }
  else log('S-C Larger button could not be scrolled into view');
  const sizePost = (await world(page)).objs.find((o) => o.kind.startsWith('beaker'));
  log('S-C resize result', JSON.stringify({ pre: sizePre && sizePre.px, post: sizePost && sizePost.px }));
  OUT.resize = { found: !!bigPt, pre: sizePre && sizePre.px, post: sizePost && sizePost.px };
  // LOCK (re-find after resize re-render)
  lockPt = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const pr = p.getBoundingClientRect(); const b = [...p.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'Lock item'); if (!b) return null; const r = b.getBoundingClientRect(); if (r.y > pr.y + 6 && r.bottom < pr.bottom - 2) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; return null; });
  if (lockPt) { await page.mouse.click(lockPt.x, lockPt.y); await sleep(700); log('S-C clicked Lock item'); }
  const bkL = (await world(page)).objs.find((o) => o.kind.startsWith('beaker'));
  log('S-C locked state', bkL ? bkL.locked : '?');
  OUT.locked = bkL ? bkL.locked : null;
  await page.screenshot({ path: `${SHOTS}/supp-resize-lock.png` });
  await ctx.close();
}

// ---------------- S-D: job5 redo — verified elemental Sodium + clean feed extraction ----------------
{
  const { ctx, page } = await freshLab();
  const cv = await page.evaluate(() => { const c = document.querySelector('[data-mlroot="1"] canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await clickBy(page, byAria, 'Liquids');
  await clickBy(page, byData, 'tile', 'water', '[data-dockpanel="1"]');
  await page.mouse.move(cv.x + cv.w * 0.30, cv.y + cv.h * 0.80); await page.mouse.down();
  await page.mouse.move(cv.x + cv.w * 0.55, cv.y + cv.h * 0.82, { steps: 12 }); await page.mouse.up();
  await sleep(1500);
  // open full picker, search sodium, pick the tile whose aria-label is exactly 'Sodium'
  const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-mlroot="1"] button')].find((x) => /tap to change/.test(x.innerText || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(bar.x, bar.y); await sleep(800);
  const inp = await page.evaluate(() => { const i = document.querySelector('.sheet input'); const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(inp.x, inp.y); await page.keyboard.type('sodium', { delay: 50 }); await sleep(900);
  const hits = await page.evaluate(() => [...document.querySelectorAll('.sheet [data-tile]')].map((t) => t.getAttribute('aria-label') || t.getAttribute('data-tile')));
  log('S-D sodium search hits (first 8):', JSON.stringify(hits.slice(0, 8)));
  OUT.sodiumHits = hits.slice(0, 8);
  await clickBy(page, byData, 'tile', 'sodium', '.sheet');
  await sleep(500);
  const selName = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-mlroot="1"] button')].find((x) => /tap to change/.test(x.innerText || '')); return b ? b.innerText.replace(/\s+/g, ' ').slice(0, 80) : null; });
  log('S-D selected substance bar reads:', selName);
  OUT.selectedSubstance = selName;
  await page.mouse.move(cv.x + cv.w * 0.36, cv.y + cv.h * 0.74); await page.mouse.down();
  await page.mouse.move(cv.x + cv.w * 0.48, cv.y + cv.h * 0.79, { steps: 10 }); await page.mouse.up();
  await sleep(3000);
  await page.screenshot({ path: `${SHOTS}/supp-sodium-reaction.png` });
  const badge = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Menu/.test(x.getAttribute('aria-label') || '')); return b ? b.getAttribute('aria-label') : null; });
  const counts = await page.evaluate(() => { const ml = window.__matterlab; return { steam: ml.countKey('steam'), hydrogen: ml.countKey('hydrogen'), water: ml.countKey('water'), fire: ml.countKey('fire') }; });
  log('S-D after sodium into water:', JSON.stringify({ badge, counts }));
  OUT.sodiumResult = { badge, counts };
  // Messages: Menu -> Messages, extract ONLY feed entry paragraphs (skip the lookup selects)
  await clickBy(page, byAria, 'Menu');
  const msgBtn = (txt, scope) => { const root = scope ? document.querySelector(scope) : document; const el = [...root.querySelectorAll('button')].find((e) => (e.innerText || '').trim().startsWith(txt)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await clickBy(page, msgBtn, 'Messages', '.sheet');
  await sleep(700);
  const feed = await page.evaluate(() => {
    const s = document.querySelector('.sheet'); if (!s) return null;
    const ps = [...s.querySelectorAll('p')].map((p) => p.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t && !/CHECK A REACTION/i.test(t));
    return ps.slice(0, 14);
  });
  log('S-D Messages feed paragraphs:', JSON.stringify(feed));
  OUT.feedParagraphs = feed;
  await page.screenshot({ path: `${SHOTS}/supp-messages-feed.png` });
  await ctx.close();
}

writeFileSync('/tmp/feel-report2.json', JSON.stringify(OUT, null, 1));
await browser.close(); srv.close();
log('SUPP DONE');
