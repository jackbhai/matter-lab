// UI-A tap-through verification: puppeteer touch at 360x800, 412x915, 768x1024.
// Home -> lab -> every dock tab, grid expand, long-press info card, tool wheel,
// gear placement, Messages, view modes, Menu/Settings sheet. Screenshots to
// ~/workspace/matter-lab-shots/ui-a/. Asserts: 0 page errors, no horizontal
// viewport overflow, no overlapping controls in topbar/dock/wheel/rail.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from '../scripts/chrome-path.mjs';

const DIST = new URL('../dist', import.meta.url).pathname;
const OUT = '/home/hatch/workspace/matter-lab-shots/ui-a';
await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/matter-lab/' || p === '/matter-lab') p = '/index.html';
    p = p.replace(/^\/matter-lab/, '');
    const data = await readFile(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const SIZES = [[360, 800], [412, 915], [768, 1024]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

async function frameBench(page) {
  return page.evaluate(async () => {
    const M = window.__matterlab; if (!M) return null;
    const e = M.engine; const cx = Math.floor(e.cols / 2), cy = Math.floor(e.rows / 3);
    for (let i = 0; i < 40; i++) { M.place('sand', cx - 20 + (i % 20), cy + Math.floor(i / 20), 3); M.place('water', cx + 10, cy + i % 10, 3); }
    M.place('lava', cx, cy - 8, 4); M.step(30);
    const measure = () => new Promise((res) => { const ts = []; let last = performance.now(); const f = (t) => { ts.push(t - last); last = t; if (ts.length < 90) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res(ts[Math.floor(ts.length / 2)]); } }; requestAnimationFrame(f); });
    const gl = await measure();
    M.setGLRenderer(false); await new Promise((r) => setTimeout(r, 600));
    const d2 = await measure();
    return { renderer: M.gl(), glMedianMs: Math.round(gl * 10) / 10, d2MedianMs: Math.round(d2 * 10) / 10, particles: e.particles };
  });
}

for (const [W, H] of SIZES) {
  const tag = `${W}x${H}`; const R = { errors: [], checks: {} }; results[tag] = R;
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  page.on('pageerror', (e) => R.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') R.errors.push('console: ' + m.text()); });
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}-${tag}.png` }); };
  const clickBtn = (re, scope) => page.evaluate((rs, sc) => {
    const root = sc ? document.querySelector(sc) : document;
    if (!root) return false;
    const b = [...root.querySelectorAll('button')].find((x) => new RegExp(rs, 'i').test(x.getAttribute('aria-label') || x.innerText || ''));
    if (b) { b.click(); return true; } return false;
  }, re.source || re, scope || null).catch(() => false);

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  // expected values verified live from the data modules in node:
  // SUBSTANCE_COUNT=1822, NAMED_REACTIVE_COUNT=34775, GEAR.length=26
  R.checks.homeLiveNumbers = await page.evaluate(() => { const t = document.body.innerText; return /1,822/.test(t) && /34,775/.test(t) && /\b26\b/.test(t) && !/\b34\b placeable/.test(t); });
  R.checks.homeCards = await page.evaluate(() => { const hs = [...document.querySelectorAll('h3')].map((h) => h.innerText.trim()); return hs.includes('Sandbox') && hs.includes('Challenges') && hs.includes('Scenes') && !!document.querySelector('.ml-ticker'); });
  R.checks.privacyLink = await page.evaluate(() => !!document.querySelector('a[href="./privacy.html"]'));
  await shot('home');

  await clickBtn(/Enter Free Sandbox/);
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(3500);
  // UI2 design: the lab auto-enters fullscreen on open (chrome hidden, rail +
  // wheel stay). Exit via the rail like a user would, to exercise the
  // windowed TopBar + Dock chrome.
  await page.evaluate(() => { const b = document.querySelector('[data-rail="full"]'); if (b) b.click(); });
  await sleep(1500);
  R.checks.emptyHint = await page.evaluate(() => !!document.querySelector('[data-emptyhint="1"]'));
  R.checks.topbar = await page.evaluate(() => !!document.querySelector('[data-topbar="1"]'));
  R.checks.dock = await page.evaluate(() => !!document.querySelector('[data-dock="1"]'));
  R.checks.wheelShowsTool = await page.evaluate(() => { const b = document.querySelector('.ml-wheel-btn'); return b ? /Current tool:/.test(b.getAttribute('aria-label') || '') : false; });
  R.checks.railLabels = await page.evaluate(() => [...document.querySelectorAll('.ml-rail-label')].filter((s) => s.innerText.trim()).length >= 5);
  // overflow + overlap audit on the main screen
  R.checks.layout = await page.evaluate(() => {
    const vw = window.innerWidth;
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    const groups = ['[data-topbar="1"]', '[data-dock="1"]', '[data-toolwheel="1"]'];
    const overlaps = [];
    for (const g of groups) {
      const root = document.querySelector(g); if (!root) continue;
      const els = [...root.querySelectorAll('button')].map((b) => ({ b, r: b.getBoundingClientRect() })).filter((x) => x.r.width > 0);
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].r, c = els[j].r;
        if (a.left < c.right - 2 && c.left < a.right - 2 && a.top < c.bottom - 2 && c.top < a.bottom - 2) overlaps.push(`${g}:${els[i].b.getAttribute('aria-label')}~${els[j].b.getAttribute('aria-label')}`);
      }
    }
    const outside = [...document.querySelectorAll('[data-mlroot="1"] button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > vw + 1); }).length;
    return { overflowX, overlaps, outsideButtons: outside };
  });
  await shot('lab-main');

  // Dock: Liquids tab -> chip strip
  const dockPt = await page.evaluate(() => { const b = document.querySelector('[data-docktab="liquids"]'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(dockPt.x, dockPt.y); await sleep(1200);
  R.checks.dockStrip = await page.evaluate(() => !!document.querySelector('[data-dockpanel="1"] .ml-chipstrip'));
  await shot('dock-liquids');
  await clickBtn(/Expand to full grid/, '[data-dockpanel="1"]'); await sleep(800);
  await shot('dock-grid');
  await clickBtn(/Collapse to chip strip/, '[data-dockpanel="1"]'); await sleep(500);
  // Long-press first chip -> InfoCard
  await page.evaluate(() => { const t = document.querySelector('[data-dockpanel="1"] [data-tile]'); if (t) t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await page.waitForFunction(() => !!document.querySelector('[data-infocard="1"]'), { timeout: 3000 }).catch(() => {});
  R.checks.infoCard = await page.evaluate(() => !!document.querySelector('[data-infocard="1"]'));
  await shot('infocard');
  await clickBtn(/Close details/); await sleep(400);
  // Pick water chip (tap) -> picker closes, pour anim fires
  // NOTE: a tile whose long-press just fired suppresses its next click (by
  // design) — a real user's pick starts with a fresh pointerdown, so do that.
  await page.evaluate(() => { const t = document.querySelector('[data-dockpanel="1"] [data-tile="water"]') || document.querySelector('[data-dockpanel="1"] [data-tile]'); if (t) { t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); t.click(); } });
  await sleep(600);
  // Paint on canvas with touch drag
  const cv = await page.evaluate(() => { const c = document.querySelector('[data-mlroot="1"] canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.touchscreen.touchStart(cv.x + cv.w * 0.4, cv.y + cv.h * 0.3);
  await page.touchscreen.touchMove(cv.x + cv.w * 0.6, cv.y + cv.h * 0.35);
  await page.touchscreen.touchEnd(); await sleep(1200);
  R.checks.hintGoneAfterPaint = await page.evaluate(() => !document.querySelector('[data-emptyhint="1"]'));
  await shot('lab-painted');

  // Tool wheel: open, switch every primary tool
  await clickBtn(/Current tool:/); await sleep(600);
  await shot('toolwheel');
  R.checks.toolsSwitched = await page.evaluate(async () => {
    const names = { Paint: 'Paint', Spray: 'Spray', Erase: 'Eraser', Stir: 'Stir', Heat: 'Heat', Cool: 'Cool', Poke: 'Poke', Spark: 'Spark', 'Move gear': 'Interact' };
    let ok = 0;
    for (const n of Object.keys(names)) {
      const pop = document.querySelector('.ml-wheel-pop');
      const b = pop && [...pop.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '') === n);
      if (!b) continue; b.click(); await new Promise((r) => setTimeout(r, 150));
      const wb = document.querySelector('.ml-wheel-btn');
      if (wb && (wb.getAttribute('aria-label') || '').includes(names[n])) ok++;
      const wb2 = document.querySelector('.ml-wheel-btn'); if (wb2) wb2.click(); await new Promise((r) => setTimeout(r, 150));
    }
    return `${ok}/${Object.keys(names).length}`;
  });

  // Lab Gear via dock: place beaker + burner through the real UI.
  // Test setup: clear the painted world first — a liquid pool covering the
  // floor legitimately leaves "no clear space" for floor placement.
  await page.evaluate(() => { const M = window.__matterlab; if (M && M.engine) M.engine.clear(); });
  await sleep(400);
  await clickBtn(/Lab Gear/, '[data-dock="1"]'); await sleep(1000);
  R.checks.gearTab = await page.evaluate(() => !!document.querySelector('[data-gear="beaker-l"]'));
  await page.evaluate(() => { const g = document.querySelector('[data-gear="beaker-l"]'); if (g) g.click(); });
  await sleep(700);
  await clickBtn(/Lab Gear/, '[data-dock="1"]'); await sleep(1000);
  await page.evaluate(() => { const g = document.querySelector('[data-gear="burner"]'); if (g) g.click(); });
  await sleep(700);
  R.checks.gearPlaced = await page.evaluate(() => { const M = window.__matterlab; return M && M.engine ? M.engine.objects.size : -1; });
  // light the burner + step via hook (same engine the UI placed into)
  await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const b = [...e.objects.values()].find((o) => o.kind === 'burner'); if (b && typeof e.setObjectLevel === 'function') e.setObjectLevel(b.id, 3); M.step(90); });
  await sleep(800);
  await shot('gear-burner');

  // Side tools panel: placing a burner (LEVEL_GEAR) auto-opens it — acceptance
  // (a): panel + Speed 4x must fit inside the viewport.
  await sleep(900);
  R.checks.sidePanelFit = await page.evaluate(() => {
    const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null;
    const pr = p.getBoundingClientRect();
    const b4 = [...p.querySelectorAll('button')].find((x) => x.innerText.trim() === '4×');
    const bf = [...p.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Flow');
    return { panelInViewport: pr.left >= 0 && pr.right <= window.innerWidth + 1, speed4: b4 ? { right: Math.round(b4.getBoundingClientRect().right), vw: window.innerWidth, visible: b4.getBoundingClientRect().right <= window.innerWidth } : null, flow: bf ? { visible: bf.getBoundingClientRect().right <= window.innerWidth } : null };
  });
  await shot('tools-panel');
  // view modes
  for (const m of ['Heat', 'Pressure', 'Flow', 'Normal']) { await clickBtn(new RegExp('^' + m + '$'), '[data-sidepanel="1"]'); await sleep(350); }
  await clickBtn(/Heat/, '[data-sidepanel="1"]'); await sleep(600);
  await shot('view-heat');
  await clickBtn(/Normal/, '[data-sidepanel="1"]'); await sleep(300);
  await clickBtn(/Tools & controls/); await sleep(500); // close the panel (toggle)

  // Selection (c): pick the burner with Move gear (Interact), open the tools
  // panel, scroll to the selection section — "Gear —" must appear exactly once.
  await clickBtn(/Current tool:/); await sleep(400);
  await page.evaluate(() => { const pop = document.querySelector('.ml-wheel-pop'); const b = pop && [...pop.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '') === 'Move gear'); if (b) b.click(); });
  await sleep(400);
  const bp = await page.evaluate(() => {
    const M = window.__matterlab; const e = M.engine; const o = [...e.objects.values()].find((x) => x.kind === 'burner');
    const c = document.querySelector('[data-mlroot="1"] canvas'); const r = c.getBoundingClientRect();
    if (!o) return null;
    return { x: r.x + ((o.x + (o.w || 8) / 2) / e.cols) * r.width, y: r.y + ((o.y + (o.h || 8) / 2) / e.rows) * r.height };
  });
  if (bp) { await page.touchscreen.tap(bp.x, bp.y); await sleep(700); }
  await clickBtn(/Tools & controls/); await sleep(900);
  R.checks.selectionOnce = await page.evaluate(() => {
    const p = document.querySelector('[data-sidepanel="1"]'); if (!p) return null;
    p.scrollTop = p.scrollHeight;
    const m = p.innerText.match(/Gear —/g);
    return { gearBlocks: m ? m.length : 0 };
  });
  await sleep(400);
  await shot('selection');
  await clickBtn(/Tools & controls/); await sleep(500);

  // Messages via rail
  await page.evaluate(() => { const b = document.querySelector('[data-rail="messages"]'); if (b) b.click(); });
  await sleep(1000);
  R.checks.messages = await page.evaluate(() => /Messages — reaction feed/.test(document.body.innerText));
  await shot('messages');
  await clickBtn(/^Close$/); await sleep(500);

  // Menu sheet (Settings surface: sounds/mute live here)
  await clickBtn(/Menu/, '[data-topbar="1"]'); await sleep(900);
  R.checks.menuOneLine = await page.evaluate(() => { const b = [...document.querySelectorAll('b')].find((x) => x.innerText.trim() === 'Tool menu'); if (!b) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), oneLine: r.height < 30 }; });
  await shot('menu');
  await clickBtn(/^Close$/); await sleep(400);

  if (W === 412) R.bench = await frameBench(page);
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close(); srv.close();
