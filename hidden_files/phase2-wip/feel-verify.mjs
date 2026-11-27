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
  const dot = async (x, y) => { await page.mouse.click(x, y); await sleep(220); return page.evaluate(() => { const e = window.__matterlab.engine; const out = []; for (let i = 0; i < e.el.length; i++) if (e.el[i]) out.push([i % e.cols, (i / e.cols) | 0]); if (!out.length) return null; return { cx: out.reduce((a, c) => a + c[0], 0) / out.length, cy: out.reduce((a, c) => a + c[1], 0) / out.length }; }); };
  const d1 = await dot(80, 200);
  await page.evaluate(() => window.__matterlab.engine.clear());
  const d2 = await dot(330, 700);
  await page.evaluate(() => window.__matterlab.engine.clear());
  await sleep(200);
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

/* ---------- Session A: stroke, beaker, stack, boil, toggle, selbar ---------- */
const page = await newLab();
const CAL = await calibrate(page);
console.log('calibration fit aX,aY:', CAL.aX.toFixed(4), CAL.aY.toFixed(4));
// FIX1 fast stroke: single-jump diagonal drag (screen endpoints -> calibrated cells)
{
  const G0 = await page.evaluate(() => { const e = window.__matterlab.engine; return { cols: e.cols, rows: e.rows }; });
  const c0 = { x: Math.floor(G0.cols * 0.15), y: Math.floor(G0.rows * 0.25) }, c1 = { x: Math.floor(G0.cols * 0.85), y: Math.floor(G0.rows * 0.55) };
  const a = CAL.toScreen(c0.x, c0.y), b = CAL.toScreen(c1.x, c1.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 2 }); await page.mouse.up();
  await sleep(150);
  const cov = await page.evaluate((L) => {
    const e = window.__matterlab.engine; let hit = 0, tot = 0;
    const n = 120;
    for (let i = 0; i <= n; i++) { const x = Math.round(L.x0 + (L.x1 - L.x0) * i / n), y = Math.round(L.y0 + (L.y1 - L.y0) * i / n); tot++; let f = false; for (let dy = -8; dy <= 8 && !f; dy++) for (let dx = -8; dx <= 8 && !f; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < e.cols && yy < e.rows && e.el[yy * e.cols + xx]) f = true; } if (f) hit++; }
    return { pct: Math.round(hit / tot * 100), hit, tot };
  }, { x0: c0.x, y0: c0.y, x1: c1.x, y1: c1.y });
  console.log('FIX1 fast-stroke path coverage %:', JSON.stringify(cov));
  await page.screenshot({ path: SHOT + 'fast-stroke.png' });
  await page.evaluate(() => window.__matterlab.engine.clear());
}
// FIX2+6: place beaker, measure bench %, selbar
await placeGear(page, 'beaker-m');
{
  const G = await geom(page); const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker'));
  const cellPxY = 1 / CAL.aY;
  const top = CAL.toScreen(bk.x, bk.y).y - cellPxY / 2, bot = CAL.toScreen(bk.x, bk.y + bk.h - 1).y + cellPxY / 2;
  const benchTop = G.stageBottom - 14;
  const pctBelow = Math.max(0, (bot - benchTop) / (bot - top) * 100);
  console.log('FIX2 beaker screen h px:', Math.round(bot - top), 'bottom:', Math.round(bot), 'benchTop:', Math.round(benchTop), '% below bench line:', Math.round(pctBelow * 10) / 10);
  const bar = await page.evaluate(() => { const b = document.querySelector('[data-selbar="1"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), pctVh: Math.round(r.height / 915 * 100), text: b.innerText.replace(/\n/g, ' | ').slice(0, 200) }; });
  console.log('FIX6 selection bar:', JSON.stringify(bar));
  await page.screenshot({ path: SHOT + 'beaker-placed.png' });
}
// fill water via UI: Liquids -> Water, paint inside beaker
await clickText(page, /Liquids/); await sleep(800);
await page.evaluate(() => { const c = [...document.querySelectorAll('button, [role="button"], .chip')].find((x) => /^Water/i.test((x.innerText || '').trim())); if (c) c.click(); });
await sleep(500);
{
  const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker'));
  for (let k = 0; k < 4; k++) {
    const a = CAL.toScreen(bk.x + 3, bk.y + Math.floor(bk.h * 0.45)), b = CAL.toScreen(bk.x + bk.w - 4, bk.y + Math.floor(bk.h * 0.45));
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); await sleep(250);
  }
  await sleep(1500);
  const fill = await page.evaluate(() => { const e = window.__matterlab.engine; const bk = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); let n = 0; for (const i of bk.interior) if (e.el[i]) n++; return { filledCells: n, interior: bk.interior.length }; });
  console.log('beaker fill:', JSON.stringify(fill));
}
// FIX4: place burner -> auto-stack; then boil poll
await placeGear(page, 'burner');
{
  const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker')); const bu = os.find((o) => o.kind === 'burner');
  console.log('FIX4 after burner placement:', JSON.stringify({ beaker: bk, burner: bu, seated: bk && bu ? (bk.y + bk.h === bu.y) : null }));
  await page.screenshot({ path: SHOT + 'stacked-beaker-burner.png' });
}
let boil = { max: 20, steam: 0 };
for (let t = 0; t < 20; t++) {
  await sleep(3000);
  boil = await page.evaluate(() => { const e = window.__matterlab.engine; const bk = [...e.objects.values()].find((o) => o.kind.startsWith('beaker')); let mx = 0; for (const i of bk.interior) if (e.el[i] && e.temp[i] > mx) mx = e.temp[i]; let hot = 0; for (const i of bk.interior) if (e.el[i] && e.temp[i] >= 95) hot++; return { max: Math.round(mx * 10) / 10, hotCells: hot, tick: e.tick }; });
  console.log('boil poll', t, JSON.stringify(boil));
  if (boil.max >= 95) break;
}
console.log('FIX4 BOIL RESULT:', JSON.stringify(boil));
await page.screenshot({ path: SHOT + 'boiling-water.png' });
// FIX5: burner toggle via interact tool, tap burner CENTRE
{
  await page.evaluate(() => { const w = document.querySelector('[data-toolwheel="1"] button'); if (w) w.click(); });
  await sleep(600);
  await clickText(page, /^Interact/); await sleep(500);
  const os = await objs(page); const bu = os.find((o) => o.kind === 'burner');
  const c = CAL.toScreen(bu.x + bu.w / 2, bu.y + bu.h / 2);
  const before = bu.level;
  await page.mouse.click(c.x, c.y); await sleep(700);
  const mid = (await objs(page)).find((o) => o.kind === 'burner');
  await page.mouse.click(c.x, c.y); await sleep(700);
  const after = (await objs(page)).find((o) => o.kind === 'burner');
  console.log('FIX5 burner centre-tap toggle: before', before, '-> after 1 tap', mid && mid.level, '-> after 2 taps', after && after.level);
  const bar = await page.evaluate(() => { const b = document.querySelector('[data-selbar="1"]'); return b ? b.innerText.replace(/\n/g, ' | ').slice(0, 160) : null; });
  console.log('FIX3/6 selbar after centre tap on burner:', JSON.stringify(bar));
}
// FIX8: beaker px size with chip strip open vs closed
{
  const measure = async () => { const G = await geom(page); const os = await objs(page); const bk = os.find((o) => o.kind.startsWith('beaker')); return { geomS: G.s, hPx: Math.round(bk.h / CAL.aY * 100) / 100, cols: G.cols, rows: G.rows }; };
  const closed = await measure();
  await clickText(page, /Liquids/); await sleep(900);
  const open = await measure();
  console.log('FIX8 beaker px chrome closed vs strip open:', JSON.stringify({ closed, open }));
  await clickText(page, /Liquids/); await sleep(500);
}
await page.close();

/* ---------- Session B: drag stacking both directions ---------- */
const p2 = await newLab();
const CAL2 = await calibrate(p2);
await placeGear(p2, 'burner');
await placeGear(p2, 'beaker-m');
{
  let os = await objs(p2); let bk = os.find((o) => o.kind.startsWith('beaker')); let bu = os.find((o) => o.kind === 'burner');
  console.log('B: vessel placed near burner seated?', bk.y + bk.h === bu.y, JSON.stringify({ bk, bu }));
  // switch to interact, drag beaker OFF to the left bench
  await p2.evaluate(() => { const w = document.querySelector('[data-toolwheel="1"] button'); if (w) w.click(); });
  await sleep(500); await clickText(p2, /^Interact/); await sleep(400);
  let G = null;
  const from = CAL2.toScreen( bk.x + bk.w / 2, bk.y + bk.h / 2);
  const to = CAL2.toScreen( Math.max(4, bk.x - Math.floor(bk.w * 1.8)), bk.y + bk.h / 2 + 30);
  await p2.mouse.move(from.x, from.y); await p2.mouse.down(); await p2.mouse.move(to.x, to.y, { steps: 10 }); await p2.mouse.up(); await sleep(600);
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B: after drag-off:', JSON.stringify({ bk, bu, unseated: bk.y + bk.h !== bu.y }));
  // drag beaker back over the burner (drop overlapping burner top)
  const f2 = CAL2.toScreen( bk.x + bk.w / 2, bk.y + bk.h / 2);
  const t2 = CAL2.toScreen( bu.x + bu.w / 2, bu.y - Math.floor(bu.h / 2));
  await p2.mouse.move(f2.x, f2.y); await p2.mouse.down(); await p2.mouse.move(t2.x, t2.y, { steps: 10 }); await p2.mouse.up(); await sleep(600);
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B: FIX3/FIX4 drag beaker onto burner seated?', bk.y + bk.h === bu.y, JSON.stringify({ bk, bu }));
  await p2.screenshot({ path: SHOT + 'drag-stacked.png' });
  // drag burner out to the right, then back under the beaker
  const f3 = CAL2.toScreen( bu.x + bu.w / 2, bu.y + bu.h / 2);
  const t3 = CAL2.toScreen( bu.x + bu.w * 3, bu.y + bu.h / 2);
  await p2.mouse.move(f3.x, f3.y); await p2.mouse.down(); await p2.mouse.move(t3.x, t3.y, { steps: 10 }); await p2.mouse.up(); await sleep(600);
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B: after burner dragged out:', JSON.stringify({ bk, bu }));
  const f4 = CAL2.toScreen( bu.x + bu.w / 2, bu.y + bu.h / 2);
  const t4 = CAL2.toScreen( bk.x + bk.w / 2, bk.y + bk.h + 2);
  await p2.mouse.move(f4.x, f4.y); await p2.mouse.down(); await p2.mouse.move(t4.x, t4.y, { steps: 10 }); await p2.mouse.up(); await sleep(600);
  os = await objs(p2); bk = os.find((o) => o.kind.startsWith('beaker')); bu = os.find((o) => o.kind === 'burner');
  console.log('B: drag burner under beaker seated?', bk.y + bk.h === bu.y, JSON.stringify({ bk, bu }));
  await p2.screenshot({ path: SHOT + 'drag-burner-under.png' });
}
await p2.close();

/* ---------- Session C: sheets + picker caps, experiment auto-close ---------- */
const p3 = await newLab();
await clickText(p3, /Menu/); await sleep(900);
await clickText(p3, /^Experiments/); await sleep(900);
{
  const sh = await p3.evaluate(() => { const sEl = document.querySelector('.sheet'); const bg = document.querySelector('.sheet-bg'); if (!sEl) return null; const r = sEl.getBoundingClientRect(); const closeBtns = [...sEl.querySelectorAll('button')].filter((b) => /Close/i.test(b.innerText || '')).map((b) => { const br = b.getBoundingClientRect(); return { y: Math.round(br.top), visible: br.top >= r.top && br.top < r.top + 60 }; }); return { sheetH: Math.round(r.height), pctVh: Math.round(r.height / 915 * 100), closeBtns }; });
  console.log('FIX7 experiments sheet:', JSON.stringify(sh));
  await p3.screenshot({ path: SHOT + 'experiments-sheet.png' });
  const setup = await p3.evaluate(() => { const cards = [...document.querySelectorAll('.sheet .glass')]; const card = cards.find((c) => /Boil Water/i.test(c.innerText || '')); if (!card) return 'no-card'; const b = [...card.querySelectorAll('button')].find((x) => /Set up/i.test(x.innerText || '')); if (!b) return 'no-btn'; b.click(); return 'clicked'; });
  console.log('experiment setup click:', setup);
  await sleep(1500);
  const after = await p3.evaluate(() => ({ sheetOpen: !!document.querySelector('.sheet-bg'), objects: [...window.__matterlab.engine.objects.values()].map((o) => o.kind) }));
  console.log('FIX7 after Set up (sheet should be closed):', JSON.stringify(after));
  await p3.screenshot({ path: SHOT + 'experiment-setup-world.png' });
}
// picker cap
await clickText(p3, /^Gear$/); await sleep(900);
{
  const sh = await p3.evaluate(() => { const sEl = document.querySelector('.sheet[data-panel="tiles"]'); if (!sEl) return null; const r = sEl.getBoundingClientRect(); return { h: Math.round(r.height), pctVh: Math.round(r.height / 915 * 100) }; });
  console.log('FIX7 picker sheet:', JSON.stringify(sh));
  await p3.screenshot({ path: SHOT + 'picker-sheet.png' });
}
await p3.close();
await browser.close();
srv.close();
console.log('DONE');
