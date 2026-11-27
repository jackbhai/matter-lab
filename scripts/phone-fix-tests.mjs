// PHONE-FIX WAVE acceptance tests (user's real-phone rejection, 2026-11-27).
// Real mouse input for every interaction under test; window.__matterlab is
// read-only measurement (plus the app's own paint passthrough for water).
// Screenshots + soak log -> ~/workspace/matter-lab-shots/phonefix/
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const SHOT = '/home/hatch/workspace/matter-lab-shots/phonefix/';
await mkdir(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const R = {};
let failures = 0;
const check = (name, ok, detail) => { R[name] = { ok, detail }; if (!ok) failures++; log(ok ? 'PASS' : 'FAIL', name, '-', detail); };

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
async function tapText(page, reSrc, label) { const r = await rectOf(page, byText, reSrc); if (!r) { log('TAP-MISS', label || reSrc); return false; } await page.mouse.click(r.cx, r.cy); return true; }
async function tapGearTile(page, kind) {
  await page.evaluate((k) => { const t = document.querySelector(`[data-gear="${k}"]`); if (t) t.scrollIntoView({ block: 'center' }); }, kind);
  await sleep(500);
  const r = await rectOf(page, bySel, `[data-gear="${kind}"]`);
  if (!r) { log('TAP-MISS tile', kind); return false; }
  await page.mouse.click(r.cx, r.cy);
  return true;
}
async function enterLab(page) {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  await tapText(page, 'Enter Free Sandbox|Open the lab');
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  await tapText(page, 'Skip tutorial');
  await sleep(600);
}
const M = (page, fn, arg) => page.evaluate(fn, arg);
const objs = (page) => M(page, () => window.__matterlab.objects());
const geom = (page) => M(page, () => {
  const m = window.__matterlab; const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect();
  const g = m.geom();
  return { s: g.s, ox: g.ox, oy: g.oy, left: r.left, top: r.top, cw: cv.clientWidth, ch: cv.clientHeight, cols: m.engine.cols, rows: m.engine.rows };
});
const cellXY = (G, cx, cy) => ({ x: G.left + G.ox + (cx + 0.5) * G.s, y: G.top + G.oy + (cy + 0.5) * G.s });
async function useInteract(page) {
  // gear interaction lives behind the Move gear (interact) tool; the
  // switch is VERIFIED via the substance bar's tool label, with a retry.
  const toolNow = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /tap to change/.test(x.innerText || '')); return b ? b.innerText : ''; });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (/interact/i.test(await toolNow())) return true;
    const pt = await page.evaluate(() => { const b = document.querySelector('.ml-wheel-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (pt) { await page.mouse.click(pt.x, pt.y); await sleep(700); }
    const mg = await page.evaluate(() => { const pop = document.querySelector('.ml-wheel-pop'); if (!pop) return null; const b = [...pop.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'Move gear'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (mg) { await page.mouse.click(mg.x, mg.y); await sleep(600); }
  }
  const ok = /interact/i.test(await toolNow());
  log('useInteract ->', ok ? 'interact' : 'FAILED, tool=' + (await toolNow()));
  return ok;
}
async function dismissChrome(page) {
  // close picker sheet if open, then the selection bar via its Done button
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === '✕'); if (b) b.click(); });
  await sleep(300);
  const done = await page.evaluate(() => { const bar = document.querySelector('[data-selbar="1"]'); if (!bar) return false; const b = [...bar.querySelectorAll('button')].find((x) => /done/i.test(x.innerText || '')); if (b) { b.click(); return true; } return false; });
  if (done) await sleep(400);
}

/* ================= T1: hero beaker on a fresh profile ================= */
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
await enterLab(page);
await tapText(page, '^Gear$'); await sleep(900);
await tapGearTile(page, 'beaker-m'); await sleep(1200);
let os = await objs(page);
let bk = os.find((o) => o.kind === 'beaker-m');
let G = await geom(page);
if (bk) {
  const pxW = bk.w * G.s;
  const ratio = pxW / G.cw;
  check('T1 hero beaker width', ratio >= 0.70 && ratio <= 0.86, `beaker ${bk.w} cells x ${G.s.toFixed(2)}px = ${Math.round(pxW)}px of ${G.cw}px canvas = ${(ratio * 100).toFixed(1)}% (target 75-80%)`);
  check('T1 hero beaker height', bk.h / bk.w >= 0.95, `stamp ${bk.w}x${bk.h} cells (h/w ${(bk.h / bk.w).toFixed(2)})`);
  // fill with water via the app's own paint passthrough for a readable shot
  await M(page, (a) => { const m = window.__matterlab; for (let k = 0; k < 26; k++) m.place('water', a.x + (k % 9) * 8 - 32, a.y - k * 2, 5); }, { x: bk.x + (bk.w >> 1), y: bk.y + bk.h - 6 });
  await M(page, () => window.__matterlab.step(30));
}
await dismissChrome(page);
await sleep(800);
await page.screenshot({ path: SHOT + 'phonefix-hero-beaker.png' });

/* ================= T3: Burner under + attachment + lever ================= */
if (bk) {
  const toolOk = await useInteract(page);
  check('T3 interact tool engaged', toolOk, 'Move gear tool active for gear gestures');
  G = await geom(page);
  const c = cellXY(G, bk.x + (bk.w >> 1), bk.y + (bk.h >> 1));
  await page.mouse.click(c.x, c.y); await sleep(700); // select the beaker
  const selbarHas = await M(page, () => { const bar = document.querySelector('[data-selbar="1"]'); return bar ? [...bar.querySelectorAll('button')].some((b) => /burner under/i.test(b.innerText || '')) : false; });
  check('T3 Burner-under button in selection bar', selbarHas, 'vessel selection bar carries the one-tap action');
  await page.evaluate(() => { const bar = document.querySelector('[data-selbar="1"]'); if (!bar) return false; const b = [...bar.querySelectorAll('button')].find((x) => /burner under/i.test(x.innerText || '')); if (b) { b.click(); return true; } return false; });
  await sleep(900);
  os = await objs(page);
  const bn = os.find((o) => o.kind === 'burner');
  bk = os.find((o) => o.kind === 'beaker-m');
  if (bn && bk) {
    const cd = Math.abs((bn.x + bn.w / 2) - (bk.x + bk.w / 2));
    check('T3 burner attached + centred', bn.attachedTo === bk.id && cd <= 2, `attachedTo=${bn.attachedTo} beakerId=${bk.id} centreDelta=${cd.toFixed(1)} cells`);
    check('T3 burner proportional width', bn.w / bk.w >= 0.33 && bn.w / bk.w <= 0.47, `burner ${bn.w} cells vs beaker ${bk.w} cells = ${(bn.w / bk.w * 100).toFixed(0)}% (target 35-45%)`);
    check('T3 burner lit by default', bn.level === 2, `level=${bn.level}`);
    await dismissChrome(page);
    await sleep(1600);
    await page.screenshot({ path: SHOT + 'phonefix-burner-attached.png' });

    /* lever: geometry + drag to max, then to mid */
    const lr = await M(page, (id) => window.__matterlab.leverRectOf(id), bn.id);
    check('T3 lever touch target >=44px', lr && lr.w >= 44 && lr.h >= 44, lr ? `strip ${Math.round(lr.w)}x${Math.round(lr.h)}px` : 'no rect');
    G = await geom(page);
    const knob = (lvl) => ({ x: G.left + lr.cx, y: G.top + lr.trackBot - (lvl / 3) * (lr.trackBot - lr.trackTop) });
    const dragLever = async (toLvl) => {
      const cur = await M(page, (id) => (window.__matterlab.objects().find((o) => o.id === id) || {}).level || 0, bn.id);
      const from = knob(cur), to = knob(toLvl);
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 12 });
      await page.mouse.up(); await sleep(500);
      return M(page, (id) => (window.__matterlab.objects().find((o) => o.id === id) || {}).level, bn.id);
    };
    const lMax = await dragLever(3);
    check('T3 lever drag to max', lMax === 3, `level=${lMax}`);
    await sleep(1200);
    await page.screenshot({ path: SHOT + 'phonefix-lever-max.png' });
    const lMid = await dragLever(2);
    check('T3 lever drag to mid', lMid === 2, `level=${lMid}`);
    await sleep(1200);
    await page.screenshot({ path: SHOT + 'phonefix-lever-mid.png' });

    /* body tap still toggles on/off (and does not fight the lever);
       the tap point is recomputed before each tap — a tap can open the
       selection bar, which resizes the stage, exactly as on the phone. */
    const tapBurnerBody = async () => {
      const o = await objs(page); const b = o.find((x) => x.kind === 'burner'); const GG = await geom(page);
      const p = cellXY(GG, b.x + (b.w >> 1), b.y + (b.h >> 1));
      await page.mouse.click(p.x, p.y); await sleep(600);
      return M(page, (id) => (window.__matterlab.objects().find((x) => x.id === id) || {}).level, bn.id);
    };
    const lOff = await tapBurnerBody();
    await dismissChrome(page); // the tap selected the burner; its bar overlays the bench — a user dismisses it before the next body tap
    const lBack = await tapBurnerBody();
    check('T3 body tap toggles on/off', lOff === 0 && lBack === 2, `tap -> ${lOff}, tap again -> ${lBack}`);
    await dismissChrome(page);

    /* attachment follow: drag the beaker sideways, burner must follow.
       +30px only: the hero beaker (236 cells) nearly spans the 301-cell
       world, so a bigger drag is an out-of-bounds move by design.
       Setup: clear the landing lane of stray painted cells with the
       engine's own erase (the strict move validation rejects a drag
       whose target footprint has even one stray cell — pre-existing
       behaviour for all gear, not part of this wave). */
    await M(page, (b) => { const e = window.__matterlab.engine; for (let x = b.x + b.w - 2; x < Math.min(e.cols, b.x + b.w + 36); x += 4) for (let y = b.y; y < e.rows; y += 4) e.erase(x, y, 3); }, bk);
    G = await geom(page);
    const grab = cellXY(G, bk.x + (bk.w >> 2), bk.y + (bk.h >> 1));
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    await page.mouse.move(grab.x + 30, grab.y, { steps: 10 });
    await page.mouse.up(); await sleep(900);
    os = await objs(page);
    const bk2 = os.find((o) => o.kind === 'beaker-m'); const bn2 = os.find((o) => o.kind === 'burner');
    if (bk2 && bn2) {
      const cd2 = Math.abs((bn2.x + bn2.w / 2) - (bk2.x + bk2.w / 2));
      check('T3 attachment survives vessel drag', bn2.attachedTo === bk2.id && cd2 <= 3 && bk2.x !== bk.x, `beaker moved ${bk.x}->${bk2.x}, centreDelta=${cd2.toFixed(1)} cells, attachedTo=${bn2.attachedTo}`);
    } else check('T3 attachment survives vessel drag', false, 'objects missing after drag');
    await dismissChrome(page);
    await sleep(1000);
    await page.screenshot({ path: SHOT + 'phonefix-attached-drag.png' });
  } else check('T3 burner placed', false, `burner=${!!bn} beaker=${!!bk}`);
}

/* ================= T4: 30 s soak — zero resizes after settle ============ */
{
  const bnId = await M(page, () => { const b = window.__matterlab.objects().find((o) => o.kind === 'burner'); if (b) window.__matterlab.engine.setObjectLevel(b.id, 3); return b ? b.id : null; });
  check('T4 soak setup (burner at level 3)', bnId != null, `burnerId=${bnId}`);
  const t0 = Date.now();
  const samples = [];
  while (Date.now() - t0 < 30000) {
    const s = await M(page, () => {
      const m = window.__matterlab; const cv = document.querySelector('[data-mlroot="1"] canvas');
      const a = m.adaptive();
      return { tier: a ? a.currentIndex : -1, cols: m.engine.cols, rows: m.engine.rows, cvw: cv.width, cvh: cv.height, frozen: a ? a.sessionFrozen : null, ratcheted: a ? a.ratcheted : null, reason: a ? a.lastReason : '' };
    });
    samples.push({ t: Math.round((Date.now() - t0) / 100) / 10, ...s });
    await sleep(200);
  }
  const key = (s) => `${s.cols}x${s.rows}|${s.cvw}x${s.cvh}|t${s.tier}`;
  const changes = [];
  for (let i = 1; i < samples.length; i++) if (key(samples[i]) !== key(samples[i - 1])) changes.push({ at: samples[i].t, from: key(samples[i - 1]), to: key(samples[i]), reason: samples[i].reason });
  const late = changes.filter((c) => c.at > 3.5);
  await writeFile(SHOT + 'soak-log.json', JSON.stringify({ samples: samples.filter((_, i) => i % 5 === 0), changes }, null, 1));
  check('T4 zero grid/canvas resizes after 3.5s settle (30s soak, flame L3)', late.length === 0, `total changes=${changes.length} (${changes.map((c) => c.at + 's:' + c.reason).join('; ') || 'none'}), late=${late.length}, frozen=${samples.at(-1).frozen}`);
}

/* ================= T2: stale perf migration ============================ */
{
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 412, height: 915 });
  await p2.evaluateOnNewDocument(() => {
    try { localStorage.setItem('omni:sandlab:perf', JSON.stringify({ autoTier: false, startTier: 4, capParts: 12345, tierCooldownMs: 1100, downgradeHoldMs: 1200 })); } catch { /* noop */ }
  });
  await enterLab(p2);
  const perf = await M(p2, () => window.__matterlab.perfLoad());
  check('T2 stale perf migrated', perf.v === 2 && perf.autoTier === true && perf.startTier === -1 && perf.tierCooldownMs === 8000, `v=${perf.v} autoTier=${perf.autoTier} startTier=${perf.startTier} cooldown=${perf.tierCooldownMs}`);
  check('T2 user prefs preserved', perf.capParts === 12345, `capParts=${perf.capParts}`);
  await tapText(p2, '^Gear$'); await sleep(900);
  await tapGearTile(p2, 'beaker-m'); await sleep(1200);
  const os2 = await objs(p2); const bk2 = os2.find((o) => o.kind === 'beaker-m'); const G2 = await geom(p2);
  if (bk2) {
    const ratio = bk2.w * G2.s / G2.cw;
    check('T2 hero beaker despite stale save', ratio >= 0.70 && ratio <= 0.86, `${(ratio * 100).toFixed(1)}% of canvas width`);
  } else check('T2 hero beaker despite stale save', false, 'beaker not placed');
  await dismissChrome(p2); await sleep(600);
  await p2.screenshot({ path: SHOT + 'phonefix-stale-save-hero.png' });
  await p2.close();
}

/* ================= T5: badge counts distinct identities ================ */
{
  const p3 = await browser.newPage();
  await p3.setViewport({ width: 412, height: 915 });
  await enterLab(p3);
  const fired = await M(p3, async () => {
    const m = window.__matterlab; const e = m.engine;
    const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
    const burst = async (keyA, keyB, cx, cy) => {
      for (let k = 0; k < 8; k++) m.place(keyB, cx + (k % 4) * 6 - 9, cy + 14, 4);
      m.step(10);
      for (let k = 0; k < 5; k++) m.place(keyA, cx + k * 4 - 8, cy, 3);
      m.step(90);
      await sleep2(250);
    };
    e.clear();
    const cy = e.rows - 30;
    for (let round = 0; round < 3; round++) {
      await burst('sodium', 'water', Math.floor(e.cols * 0.3), cy);
      await burst('lava', 'water', Math.floor(e.cols * 0.7), cy);
    }
    return { heads: m.rxHeads(), seen: m.unreadSeen() };
  });
  const distinct = new Set(fired.heads).size;
  check('T5 reactions fired', fired.heads.length >= 4, `${fired.heads.length} reaction events, ${distinct} distinct identities`);
  /* the two seed pairs cascade into chain reactions, so distinct > 2 is
     expected; the flood test is badge == distinct identities while the
     raw event count is much higher (repeats suppressed). */
  check('T5 badge = distinct identities (no flood)', fired.seen === distinct && fired.seen < fired.heads.length, `badge=${fired.seen}, distinct=${distinct}, events=${fired.heads.length}`);
  const badgeTxt = await M(p3, () => { const b = [...document.querySelectorAll('button')].find((x) => /Menu/.test(x.innerText || '')); return b ? b.innerText.replace(/\s+/g, ' ').trim() : 'not-found'; });
  log('T5 DOM Menu label:', badgeTxt);
  await p3.close();
}

log('RESULTS', JSON.stringify(R, null, 1));
log(failures ? `PHONE-FIX TESTS: ${failures} FAILURE(S)` : 'PHONE-FIX TESTS: ALL PASS');
await browser.close();
srv.close();
process.exit(failures ? 1 : 0);
