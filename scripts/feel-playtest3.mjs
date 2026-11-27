// FEEL Phase 1 — probe round 3: (A) WHERE does the Interact hit-test actually
// land on a beaker/burner (read-only objectsAt probe per cell), and does a drag
// from a verified-hit cell move the object? (B) Sodium painted DIRECTLY into a
// floor pool (overlapping the water) — does the flagship reaction fire?
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = '/home/hatch/workspace/matter-lab-shots/feel-before';
mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; p = p.replace(/^\/matter-lab/, ''); const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${srv.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const OUT = {}; const log = (...a) => console.log(...a);
async function freshLab() {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width: 412, height: 915 }); page.on('pageerror', (e) => log('PAGEERROR', e.message));
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 }); await sleep(5000);
  const pt = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox/.test(x.innerText || '')); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(pt.x, pt.y); await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {}); await sleep(3000);
  const sk = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === 'Skip tutorial'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (sk) { await page.mouse.click(sk.x, sk.y); await sleep(600); }
  return { ctx, page };
}
const byAria = (label, scope) => { const root = scope ? document.querySelector(scope) : document; if (!root) return null; const el = [...root.querySelectorAll('button,[role="button"]')].find((e) => (e.getAttribute('aria-label') || '') === label) || [...root.querySelectorAll('button,[role="button"]')].find((e) => (e.getAttribute('aria-label') || '').includes(label)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const byData = (attr, val, scope) => { const root = scope ? document.querySelector(scope) : document; if (!root) return null; const el = root.querySelector(`[data-${attr}="${val}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, offscreenX: r.x < 0 || r.x + r.width > innerWidth }; };
async function clickBy(page, finder, arg, scope) { const pt = await page.evaluate(finder, arg, scope).catch(() => null); if (!pt) { log('MISS', arg); return null; } await page.mouse.click(pt.x, pt.y); await sleep(650); return pt; }
const world = (page) => page.evaluate(() => { const ml = window.__matterlab; const e = ml.engine; const g = ml.geom(); const cv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cv.getBoundingClientRect(); const objs = [...e.objects.values()].map((o) => { const x = cr.x + g.ox + o.anchor.x * g.s, y = cr.y + g.oy + o.anchor.y * g.s; return { kind: o.kind, level: o.level, px: { x: Math.round(x), y: Math.round(y), w: Math.round(o.w * g.s), h: Math.round(o.h * g.s), cx: Math.round(x + o.w * g.s / 2), cy: Math.round(y + o.h * g.s / 2), bottom: Math.round(y + o.h * g.s) } }; }); return { objs, canvas: { x: cr.x, y: cr.y, w: cr.width, h: cr.height }, cellPx: g.s }; });

// ---------- A: hit-test probe ----------
{
  const { ctx, page } = await freshLab();
  await clickBy(page, byAria, 'Lab Gear');
  await clickBy(page, byData, 'gear', 'beaker-m');
  await sleep(600);
  await clickBy(page, byAria, 'Lab Gear');
  await clickBy(page, byData, 'gear', 'burner');
  await sleep(800);
  const xc = await page.evaluate(() => { const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null; const b = p.querySelector('button'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (xc) { await page.mouse.click(xc.x, xc.y); await sleep(500); }
  const probe = await page.evaluate(() => {
    const ml = window.__matterlab; const e = ml.engine; const g = ml.geom();
    const cv = document.querySelector('[data-mlroot="1"] canvas'); const cr = cv.getBoundingClientRect();
    const cellToPx = (cx, cy) => ({ x: Math.round(cr.x + g.ox + (cx + 0.5) * g.s), y: Math.round(cr.y + g.oy + (cy + 0.5) * g.s) });
    const out = {};
    for (const o of e.objects.values()) {
      const a = o.anchor, w = o.w, h = o.h;
      const spots = {
        centre: [a.x + (w >> 1), a.y + (h >> 1)],
        leftWallMid: [a.x, a.y + (h >> 1)],
        rightWallMid: [a.x + w - 1, a.y + (h >> 1)],
        bottomLeft: [a.x, a.y + h - 1],
        bottomCentre: [a.x + (w >> 1), a.y + h - 1],
        topLeftRim: [a.x, a.y],
        topCentre: [a.x + (w >> 1), a.y],
      };
      out[o.kind] = {};
      let hitCells = 0, total = 0;
      for (let yy = a.y; yy < a.y + h; yy++) for (let xx = a.x; xx < a.x + w; xx++) { total++; if (e.objectsAt(xx, yy) === o.id) hitCells++; }
      out[o.kind].hitCoverage = `${hitCells}/${total} cells (${Math.round(hitCells / total * 100)}%)`;
      for (const [name, [cx, cy]] of Object.entries(spots)) out[o.kind][name] = { hit: e.objectsAt(cx, cy) === o.id, px: cellToPx(cx, cy), cell: [cx, cy] };
    }
    return out;
  });
  log('HIT PROBE', JSON.stringify(probe, null, 1)); OUT.hitProbe = probe;
  // drag from a verified HIT cell of the beaker (bottomCentre or leftWallMid)
  await clickBy(page, byAria, 'tap to change tool');
  await clickBy(page, byAria, 'Move gear', '[data-toolwheel="1"]');
  const bkInfo = probe['beaker-m'];
  const grabName = bkInfo.bottomCentre.hit ? 'bottomCentre' : (bkInfo.leftWallMid.hit ? 'leftWallMid' : (bkInfo.bottomLeft.hit ? 'bottomLeft' : null));
  log('grab spot chosen:', grabName);
  if (grabName) {
    const gp = bkInfo[grabName].px;
    const before = (await world(page)).objs.find((o) => o.kind.startsWith('beaker'));
    await page.mouse.move(gp.x, gp.y); await page.mouse.down();
    await page.mouse.move(gp.x - 60, gp.y, { steps: 18 }); await page.mouse.up();
    await sleep(700);
    const after = (await world(page)).objs.find((o) => o.kind.startsWith('beaker'));
    const toast = await page.evaluate(() => { const t = document.querySelector('.toasts, [class*="toast"]'); return t ? t.innerText.slice(0, 120) : null; });
    log('drag from hit cell:', JSON.stringify({ grabName, fromCx: before.px.cx, toCx: after.px.cx, movedPx: before.px.cx - after.px.cx, toast }));
    OUT.hitDrag = { grabName, fromCx: before.px.cx, toCx: after.px.cx, movedPx: before.px.cx - after.px.cx };
    await page.screenshot({ path: `${SHOTS}/supp-hit-drag.png` });
  }
  // tap from a verified HIT cell of the burner
  const bnInfo = probe['burner'];
  const tapName = bnInfo.bottomCentre.hit ? 'bottomCentre' : (bnInfo.centre.hit ? 'centre' : (bnInfo.bottomLeft.hit ? 'bottomLeft' : null));
  if (tapName) {
    const tp = bnInfo[tapName].px;
    const lvlBefore = (await world(page)).objs.find((o) => o.kind === 'burner').level;
    await page.mouse.move(tp.x, tp.y); await page.mouse.down(); await sleep(150); await page.mouse.up();
    await sleep(800);
    const lvlAfter = (await world(page)).objs.find((o) => o.kind === 'burner').level;
    log('tap from burner hit cell:', JSON.stringify({ tapName, lvlBefore, lvlAfter }));
    OUT.hitTap = { tapName, lvlBefore, lvlAfter };
  } else log('burner: NO named spot hits');
  await ctx.close();
}

// ---------- B: sodium directly into the pool ----------
{
  const { ctx, page } = await freshLab();
  const cv = (await world(page)).canvas;
  await clickBy(page, byAria, 'Liquids');
  await clickBy(page, byData, 'tile', 'water', '[data-dockpanel="1"]');
  const floorY = cv.y + cv.h - 12;
  await page.mouse.move(cv.x + cv.w * 0.30, floorY - 26); await page.mouse.down();
  await page.mouse.move(cv.x + cv.w * 0.58, floorY - 20, { steps: 12 }); await page.mouse.up();
  await page.mouse.move(cv.x + cv.w * 0.32, floorY - 44); await page.mouse.down();
  await page.mouse.move(cv.x + cv.w * 0.56, floorY - 38, { steps: 12 }); await page.mouse.up();
  await sleep(2000);
  const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-mlroot="1"] button')].find((x) => /tap to change/.test(x.innerText || '')); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(bar.x, bar.y); await sleep(800);
  const inp = await page.evaluate(() => { const i = document.querySelector('.sheet input'); const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(inp.x, inp.y); await page.keyboard.type('sodium', { delay: 50 }); await sleep(900);
  await clickBy(page, byData, 'tile', 'sodium', '.sheet');
  await sleep(400);
  // paint sodium AT the pool (bottom band, overlapping the water layer)
  await page.mouse.move(cv.x + cv.w * 0.36, floorY - 8); await page.mouse.down();
  await page.mouse.move(cv.x + cv.w * 0.50, floorY - 6, { steps: 10 }); await page.mouse.up();
  await sleep(3500);
  await page.screenshot({ path: `${SHOTS}/supp-sodium-in-pool.png` });
  const res = await page.evaluate(() => { const ml = window.__matterlab; const b = [...document.querySelectorAll('button')].find((x) => /^Menu/.test(x.getAttribute('aria-label') || '')); return { badge: b ? b.getAttribute('aria-label') : null, steam: ml.countKey('steam'), hydrogen: ml.countKey('hydrogen'), water: ml.countKey('water'), sodiumHydroxide: ml.countKey('sodium-hydroxide'), fire: ml.countKey('fire') }; });
  log('SODIUM-IN-POOL result', JSON.stringify(res)); OUT.sodiumInPool = res;
  const msgBtn = (txt, scope) => { const root = scope ? document.querySelector(scope) : document; const el = [...root.querySelectorAll('button')].find((e) => (e.innerText || '').trim().startsWith(txt)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await clickBy(page, byAria, 'Menu');
  await clickBy(page, msgBtn, 'Messages', '.sheet');
  await sleep(700);
  const feed = await page.evaluate(() => { const s = document.querySelector('.sheet'); if (!s) return null; return [...s.querySelectorAll('p')].map((p) => p.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12); });
  log('FEED paragraphs', JSON.stringify(feed)); OUT.feed = feed;
  await page.screenshot({ path: `${SHOTS}/supp-feed-after-sodium.png` });
  await ctx.close();
}
writeFileSync('/tmp/feel-report3.json', JSON.stringify(OUT, null, 1));
await browser.close(); srv.close();
log('PROBE3 DONE');
