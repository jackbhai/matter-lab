// P4 + UI-B tap-through: 3 viewports — experiment stars, discovery, panels,
// save-slot round-trip, delta undo/redo census, pinch-zoom paint accuracy,
// double-tap undo, renderer pref, viridis heat, font scaling, overlap audit.
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { mkdirSync } from 'node:fs';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../../matter-lab-shots/ui-b/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
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
const browser = await puppeteerLaunch();
async function puppeteerLaunch() {
  const puppeteer = (await import('puppeteer-core')).default;
  return puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); console.log(results[results.length - 1]); };

async function newLabPage(w, h) {
  const ctx = await browser.createBrowserContext(); // fresh localStorage per viewport
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(3500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || '')); if (b) b.click(); });
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  return { page, errors };
}
const clickText = (page, re) => page.evaluate((src) => { const rx = new RegExp(src, 'i'); const b = [...document.querySelectorAll('button')].find((x) => rx.test(x.innerText || '') && !x.disabled); if (b) { b.click(); return b.innerText.trim().slice(0, 40); } return null; }, re.source || re);
const ptr = (page, type, x, y, id) => page.evaluate(({ type, x, y, id }) => {
  const cv = document.querySelector('[data-mlroot="1"] canvas');
  cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1 }));
}, { type, x, y, id });

for (const [w, h] of [[360, 800], [412, 915], [768, 1024]]) {
  const tag = `${w}x${h}`;
  const { page, errors } = await newLabPage(w, h);
  const M = (fn, arg) => page.evaluate(fn, arg);

  /* coach marks on first entry */
  const coachSeen = await M(() => !!document.querySelector('[data-coach="1"]'));
  check(`${tag} coach shows on first entry`, coachSeen);
  if (w === 412) await page.screenshot({ path: `${SHOTS}coach-412.png` });
  await clickText(page, /Skip tutorial/);
  await sleep(300);

  /* overlap audit — main screen chrome */
  const audit = await M(() => {
    const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
    const parts = { topbar: rect('[data-topbar="1"]'), canvas: rect('[data-mlroot="1"] canvas'), dock: rect('[data-dock="1"]'), wheel: rect('[data-toolwheel="1"]') };
    const overlap = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    // NOTE: the tool wheel is a DESIGNED floating overlay on the canvas
    // (UI-A) — the no-overlap law is audited between chrome pieces and
    // between overlays and panels, not against the canvas they float on.
    return { parts, ov: { topDock: overlap(parts.topbar, parts.dock), wheelDock: overlap(parts.wheel, parts.dock) }, docW: document.documentElement.scrollWidth, iw: window.innerWidth };
  });
  check(`${tag} no chrome overlap`, !audit.ov.topDock && !audit.ov.wheelDock, JSON.stringify(audit.ov));
  check(`${tag} no horizontal overflow`, audit.docW <= audit.iw + 1, `docW=${audit.docW} iw=${audit.iw}`);
  if (w === 360) await page.screenshot({ path: `${SHOTS}main-360.png` });
  if (w === 768) await page.screenshot({ path: `${SHOTS}main-768.png` });

  /* ---- experiment: boil -> stars ---- */
  await M(() => { window.__matterlab.engine.clear(); return window.__matterlab.startExperiment('boil'); });
  await sleep(600);
  const boil = await M(() => {
    const M2 = window.__matterlab, e = M2.engine;
    let spot = null;
    for (let y = 0; y < e.rows && !spot; y += 2) for (let x = 0; x < e.cols && !spot; x += 2) { const inf = e.inspect(x, y); if (inf && /water/i.test(inf.name)) spot = { x, y }; }
    return spot;
  });
  check(`${tag} boil setup has water`, !!boil, JSON.stringify(boil));
  if (boil) {
    for (let k = 0; k < 6; k++) { await M((s) => { window.__matterlab.setTempAt(s.x, s.y, 160); window.__matterlab.step(20); }, boil); await sleep(350); }
  }
  const stars = await M(() => window.__matterlab.game().stars);
  check(`${tag} boil earned >=1 star`, (stars.boil | 0) >= 1, JSON.stringify(stars));

  /* ---- discovery: sodium + water (named card 'sodium-water'). Engine
     reactions need the pair MIXED: sodium painted into the pool + a stir
     (verified against the raw engine in Node — resting contact alone
     does not mix, which is the engine's own pre-existing rule). ---- */
  const disc = await M(() => {
    const M2 = window.__matterlab, e = M2.engine; e.clear();
    const probe = (keys, x, y, r) => { for (const k of keys) { M2.place(k, x, y, r); if (M2.countKey(k) > 0) return k; } return null; };
    const cx = Math.floor(e.cols * 0.4), wy = Math.floor(e.rows * 0.55);
    const a = probe(['water'], cx, wy, 10);
    const b = probe(['sodium'], cx, wy - 4, 4);
    M2.step(60);
    e.stir(cx, wy - 2, 12);
    M2.step(300);
    return { a, b, game: M2.game() };
  });
  check(`${tag} discovery recorded`, disc.game.discoveryCount >= 1, `pair=${disc.a}+${disc.b} count=${disc.game.discoveryCount} total=${disc.game.namedTotal}`);
  check(`${tag} first-reaction achievement`, !!disc.game.achievements['first-reaction']);

  /* ---- panels: discoveries + achievements (real path: rail -> side panel -> Panels) ---- */
  await page.evaluate(() => { const b = document.querySelector('[data-rail="tools"]'); if (b) b.click(); });
  await sleep(400);
  await clickText(page, /Discoveries \(/); await sleep(400);
  const discPanel = await M(() => { const p = document.querySelector('[data-panel="discoveries"]'); return p ? p.innerText.slice(0, 120) : null; });
  check(`${tag} discovery panel shows count`, !!discPanel && /Discovered/.test(discPanel), discPanel || '');
  if (w === 412) await page.screenshot({ path: `${SHOTS}discoveries-412.png` });
  await clickText(page, /^Close$/); await sleep(200);
  await page.evaluate(() => { const b = document.querySelector('[data-rail="tools"]'); if (b) b.click(); });
  await sleep(400);
  await clickText(page, /^Achievements$/); await sleep(400);
  const achPanel = await M(() => { const p = document.querySelector('[data-panel="achievements"]'); return p ? p.innerText.slice(0, 80) : null; });
  check(`${tag} achievements panel`, !!achPanel && /earned/.test(achPanel), achPanel || '');
  if (w === 360) await page.screenshot({ path: `${SHOTS}achievements-360.png` });
  await clickText(page, /^Close$/); await sleep(200);

  /* ---- experiments sheet: stars + daily card ---- */
  await page.evaluate(() => { const b = document.querySelector('[data-rail="tools"]'); if (b) b.click(); });
  await sleep(400);
  await clickText(page, /^Experiments$/); await sleep(400);
  const expTxt = await M(() => document.body.innerText.includes('Daily challenge') && document.body.innerText.includes('Progress:'));
  check(`${tag} experiments sheet progress + daily`, !!expTxt);
  if (w === 412) await page.screenshot({ path: `${SHOTS}experiments-412.png` });
  await clickText(page, /^Close$/); await sleep(200);

  /* ---- save slot round-trip ---- */
  await M(() => { const e = window.__matterlab.engine; e.clear(); window.__matterlab.place('sand', Math.floor(e.cols / 2), Math.floor(e.rows / 2), 10); window.__matterlab.step(5); });
  await sleep(300);
  const before = await M(() => window.__matterlab.engine.stats().particles);
  await page.evaluate(() => { const b = document.querySelector('[data-rail="tools"]'); if (b) b.click(); });
  await sleep(400);
  await clickText(page, /^Scenes$/); await sleep(400);
  await page.evaluate(() => { const inp = document.querySelector('input[aria-label="Save slot name"]'); if (inp) { inp.focus(); document.execCommand('selectAll', false, null); } });
  await page.keyboard.type('UIB Test Save');
  await clickText(page, /Save current world/); await sleep(400);
  const slotListed = await M(() => document.body.innerText.includes('UIB Test Save'));
  check(`${tag} slot saved + listed`, slotListed);
  if (w === 412) await page.screenshot({ path: `${SHOTS}slots-412.png` });
  await clickText(page, /^Close$/); await sleep(200);
  await M(() => window.__matterlab.engine.clear());
  await sleep(300);
  const cleared = await M(() => window.__matterlab.engine.stats().particles);
  await page.evaluate(() => { const b = document.querySelector('[data-rail="tools"]'); if (b) b.click(); });
  await sleep(400);
  await clickText(page, /^Scenes$/); await sleep(400);
  await page.evaluate(() => { const btns = [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === 'Load'); const b = btns.find((x) => { let n = x; for (let k = 0; k < 5 && n; k++) { if (n.innerText && n.innerText.includes('UIB Test Save')) return true; n = n.parentElement; } return false; }); if (b) b.click(); });
  await sleep(400);
  const after = await M(() => window.__matterlab.engine.stats().particles);
  check(`${tag} slot round-trip restores particles`, cleared === 0 && after === before, `before=${before} cleared=${cleared} after=${after}`);
  await clickText(page, /^Close$/); await sleep(200);

  /* ---- delta undo/redo census ---- */
  await M(() => window.__matterlab.engine.clear());
  await sleep(300);
  const cvr = await M(() => { const r = document.querySelector('[data-mlroot="1"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const px = cvr.x + cvr.w * 0.5, py = cvr.y + cvr.h * 0.45;
  await ptr(page, 'pointerdown', px, py, 1);
  await ptr(page, 'pointermove', px + 30, py + 10, 1);
  await ptr(page, 'pointerup', px + 30, py + 10, 1);
  await sleep(300);
  const census = () => M(() => { const c = window.__matterlab.census(); return Object.values(c).reduce((a, b) => a + b, 0); });
  const painted = await census();
  const dStats = await M(() => window.__matterlab.deltaStats());
  check(`${tag} painted via pointer`, painted > 0, `cells=${painted}`);
  check(`${tag} delta step << full copy`, dStats.lastStepBytes > 0 && dStats.lastStepBytes < dStats.lastFullBytes * 0.5, `delta=${dStats.lastStepBytes}B full=${dStats.lastFullBytes}B steps=${dStats.undoSteps} stackBytes=${dStats.undoBytes}`);
  await M(() => window.__matterlab.undoOnce()); await sleep(300);
  const undone = await census();
  check(`${tag} undo restores pre-paint census`, undone === 0, `census=${undone}`);
  await M(() => window.__matterlab.redoOnce()); await sleep(300);
  const redone = await census();
  check(`${tag} redo restores paint census`, redone === painted, `census=${redone} vs ${painted}`);

  /* ---- double-tap = undo ---- */
  await ptr(page, 'pointerdown', px, py + 60, 1); await ptr(page, 'pointerup', px, py + 60, 1);
  await sleep(120);
  await ptr(page, 'pointerdown', px, py + 60, 1); // second tap down -> undo fires, tap swallowed
  await ptr(page, 'pointerup', px, py + 60, 1);
  await sleep(300);
  const dtCensus = await census();
  check(`${tag} double-tap undid the tap stroke`, dtCensus === painted, `census=${dtCensus} vs ${painted}`);

  /* ---- pinch zoom + paint accuracy at 2x ---- */
  await ptr(page, 'pointerdown', px - 40, py, 1);
  await ptr(page, 'pointerdown', px + 40, py, 2);
  for (let k = 1; k <= 4; k++) { await ptr(page, 'pointermove', px - 40 - k * 15, py, 1); await ptr(page, 'pointermove', px + 40 + k * 15, py, 2); await sleep(40); }
  await ptr(page, 'pointerup', px - 100, py, 1); await ptr(page, 'pointerup', px + 100, py, 2);
  await sleep(300);
  const zoomZ = await M(() => window.__matterlab.zoomState().z);
  check(`${tag} pinch zoomed`, zoomZ > 1.3, `z=${zoomZ && zoomZ.toFixed(2)}`);
  /* Read the target cell SYNCHRONOUSLY in the same JS turn as the dispatch:
     sand falls within a few frames, so a delayed read measures gravity,
     not pointer accuracy. */
  const acc = await M(() => {
    const M2 = window.__matterlab, e = M2.engine, g = M2.geom();
    const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect();
    const cx = r.width * 0.62, cy = r.height * 0.38;
    const gx = Math.floor((cx - g.ox) / g.s), gy = Math.floor((cy - g.oy) / g.s);
    const before = e.el[gy * e.cols + gx];
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: r.x + cx, clientY: r.y + cy, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
    const after = e.el[gy * e.cols + gx];
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: r.x + cx, clientY: r.y + cy, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true }));
    return { gx, gy, before, after };
  });
  check(`${tag} paint at zoom lands on the finger cell`, acc.after !== 0 && acc.after !== acc.before, `cell(${acc.gx},${acc.gy}) ${acc.before}->${acc.after}`);
  if (w === 412) await page.screenshot({ path: `${SHOTS}zoom-412.png` });
  await M(() => window.__matterlab.setZoom(1));

  /* ---- renderer pref + viridis + font scale via side panel ---- */
  await page.evaluate(() => { const b = document.querySelector('[data-rail="tools"]'); if (b) b.click(); });
  await sleep(400);
  await page.evaluate(() => { const grp = document.querySelector('[aria-label="View mode"]'); const b = grp && [...grp.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Heat'); if (b) b.click(); });
  await sleep(200);
  await clickText(page, /Colour-blind safe/); await sleep(300);
  const rampOk = await M(() => localStorage.getItem('matterlab:heat-ramp'));
  check(`${tag} viridis ramp persisted + heat view`, rampOk === '"viridis"', String(rampOk));
  if (w === 412) await page.screenshot({ path: `${SHOTS}heat-viridis-412.png` });
  await clickText(page, /^2D$/); await sleep(300);
  const rend = await M(() => window.__matterlab.rendererState());
  check(`${tag} renderer pref 2d applies`, rend.pref === '2d' && rend.glEnabled === false, JSON.stringify(rend));
  await clickText(page, /^Auto$/); await sleep(200);
  const smBefore = await M(() => { const el = document.querySelector('[data-sidepanel="1"] .dim.sm'); return el ? parseFloat(getComputedStyle(el).fontSize) : 0; });
  await clickText(page, /^XL$/); await sleep(300);
  const smAfter = await M(() => { const el = document.querySelector('[data-sidepanel="1"] .dim.sm'); return el ? parseFloat(getComputedStyle(el).fontSize) : 0; });
  check(`${tag} font scale XL grows small text`, smAfter > smBefore, `${smBefore}px -> ${smAfter}px`);
  if (w === 768) await page.screenshot({ path: `${SHOTS}sidepanel-768.png` });

  check(`${tag} zero page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

/* home progress surface (fresh profile has honest zeros; seeded profile shows real progress) */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(3000);
  const prog = await page.evaluate(() => { const el = document.querySelector('[data-progress="1"]'); return el ? el.innerText : null; });
  check('home progress surface', !!prog && /Discovery log/.test(prog) && /challenge/i.test(prog), (prog || '').replace(/\n/g, ' | ').slice(0, 160));
  await page.screenshot({ path: `${SHOTS}home-progress-412.png` });
  await page.close();
}

console.log('\n==== ' + results.filter((r) => r.startsWith('FAIL')).length + ' FAILURES ====');
await browser.close();
srv.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
