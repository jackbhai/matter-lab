import { resolveChromePath } from './chrome-path.mjs';
// V2 verification: homepage + modes + realistic pack + Part E messages + perf.
// Serves dist/ locally; optional LIVE phase compares busy-scene frame times
// against the currently deployed (pre-v2) build.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import http from 'node:http';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = process.env.SHOTS_DIR || '/home/hatch/workspace/matter-lab-shots';
await mkdir(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const CHROME = resolveChromePath();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

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
const base = `http://127.0.0.1:${srv.address().port}/index.html`;

function proxyArgs() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  const proxyEnv = process.env.https_proxy || process.env.HTTPS_PROXY || '';
  return { args, proxyEnv };
}
async function launchRelay() {
  const { proxyEnv } = proxyArgs();
  if (!proxyEnv) return ['--no-sandbox', '--disable-dev-shm-usage'];
  const up = new URL(proxyEnv);
  if (!(up.username || up.password)) return ['--no-sandbox', '--disable-dev-shm-usage', `--proxy-server=${up.protocol}//${up.host}`];
  const authH = 'Basic ' + Buffer.from(decodeURIComponent(up.username) + ':' + decodeURIComponent(up.password)).toString('base64');
  const relay = http.createServer((q, r) => { r.writeHead(405); r.end(); });
  relay.on('connect', (req, client, head) => {
    const upstream = net.connect(+up.port, up.hostname, () => { upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${authH}\r\nProxy-Connection: keep-alive\r\n\r\n`); });
    let buf = Buffer.alloc(0);
    const onData = (chunk) => { buf = Buffer.concat([buf, chunk]); const idx = buf.indexOf('\r\n\r\n'); if (idx === -1) return; upstream.off('data', onData); if (!/ 200 /.test(buf.slice(0, buf.indexOf('\r\n')).toString())) { client.destroy(); upstream.destroy(); return; } client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); const rest = buf.slice(idx + 4); if (rest.length) client.write(rest); if (head && head.length) upstream.write(head); upstream.pipe(client); client.pipe(upstream); };
    upstream.on('data', onData); upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy());
  });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  return ['--no-sandbox', '--disable-dev-shm-usage', `--proxy-server=http://127.0.0.1:${relay.address().port}`, '--proxy-bypass-list=127.0.0.1;localhost'];
}

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 120000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 412, height: 915 });
await page.goto(base, { waitUntil: 'load', timeout: 120000 });
await sleep(2500);

const homeProbe = await page.evaluate(() => {
  const t = document.body.innerText;
  return { hasTitle: /Matter Lab/.test(t), has1392: t.includes('1,392'), has22500: t.includes('22,500'), cards: ['Free Sandbox', 'Experiments', 'Scene Gallery', 'Custom Lab'].filter((s) => t.includes(s)), overflow: document.scrollingElement.scrollWidth };
});
check('homepage renders with stats + 4 mode cards', homeProbe.hasTitle && homeProbe.has1392 && homeProbe.has22500 && homeProbe.cards.length === 4, JSON.stringify(homeProbe));
await page.screenshot({ path: `${SHOTS}/home-412.png` });

const clickByText = async (txt) => page.evaluate((s) => {
  const els = [...document.querySelectorAll('button, a, [role="button"], div, article, section, span')].filter((e) => (e.innerText || '').includes(s));
  if (!els.length) return false;
  els.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
  const el = els[0];
  el.scrollIntoView({ block: 'center' }); el.click(); return true;
}, txt);
const railClick = async (label) => page.evaluate((s) => {
  const btns = [...document.querySelectorAll('[data-rail]')];
  const b = btns.find((x) => (x.getAttribute('aria-label') || '') === s) || btns.find((x) => (x.getAttribute('aria-label') || '').includes(s));
  if (!b) return btns.map((x) => x.getAttribute('aria-label'));
  b.click(); return true;
}, label);
const toolMounted = () => page.evaluate(() => !!document.querySelector('[data-mlroot="1"] canvas') && !!window.__matterlab);

// --- Gallery mode (Volcano & Lake scene card's "Open scene" button) ---
const galClick = await page.evaluate(() => {
  const card = [...document.querySelectorAll('article')].find((a) => (a.innerText || '').includes('Volcano'));
  const btn = card && card.querySelector('button');
  if (!btn) return false; btn.scrollIntoView({ block: 'center' }); btn.click(); return true;
});
check('click Volcano & Lake scene card', galClick);
await sleep(3500);
const gal = await page.evaluate(() => { const ml = window.__matterlab; return { mounted: !!document.querySelector('[data-mlroot="1"] canvas'), particles: ml && ml.engine ? ml.engine.stats().particles : -1, sheet: document.body.innerText.includes('Built-in showcase') }; });
check('gallery mode launches + scene built + scenes sheet open', gal.mounted && gal.particles > 100 && gal.sheet, JSON.stringify(gal));
await page.screenshot({ path: `${SHOTS}/gallery-golden-412.png` });
const railHome = await railClick('Home');
check('rail Home button exists + returns home', railHome === true, JSON.stringify(railHome));
await sleep(1500);
check('back on homepage', await page.evaluate(() => document.body.innerText.includes('Free Sandbox') && !document.querySelector('[data-mlroot="1"]')));

// --- Experiments mode (per-experiment launch button on the card) ---
check('click Boil Water experiment button', await clickByText('Boil Water'));
await sleep(3000);
const exp = await page.evaluate(() => { const t = document.body.innerText; return { mounted: !!document.querySelector('[data-mlroot="1"] canvas'), guided: t.includes('guided, with real checks'), boil: t.includes('Boil Water'), electro: t.includes('Electrolysis'), golden: t.includes('Golden Rain'), chill: t.includes('Chill') }; });
check('experiments mode opens guided panel with 4 experiments', exp.mounted && exp.guided && exp.boil && exp.electro && exp.golden && exp.chill, JSON.stringify(exp));
await page.screenshot({ path: `${SHOTS}/experiments-412.png` });
await railClick('Home'); await sleep(1200);

// --- Custom Lab mode ---
check('click Custom Lab card', await clickByText('Custom Lab'));
await sleep(3000);
const cust = await page.evaluate(() => { const t = document.body.innerText; return { mounted: !!document.querySelector('[data-mlroot="1"] canvas'), form: t.includes('Create a custom substance') }; });
check('custom mode opens picker with create form expanded', cust.mounted && cust.form, JSON.stringify(cust));
await page.screenshot({ path: `${SHOTS}/custom-412.png` });
await railClick('Home'); await sleep(1200);

// --- Free Sandbox + HERO realism scene ---
check('click Free Sandbox', await clickByText('Free Sandbox'));
await sleep(3000);
check('free sandbox mounted', await toolMounted());
const hero = await page.evaluate(() => {
  const ml = window.__matterlab; const e = ml.engine; e.clear();
  const dims = ml.stampDims('beaker-l', { size: 'XL' });
  const bx = Math.floor((e.cols - dims.w) / 2), by = e.rows - dims.h - 14;
  const bk = ml.placeObject('beaker-l', bx, by, { size: 'XL' });
  const bu = ml.placeObject('burner', bx + Math.floor(dims.w / 2) - 7, by + dims.h);
  if (bu != null && typeof e.setObjectLevel === 'function') e.setObjectLevel(bu, 3);
  const cx = bx + Math.floor(dims.w / 2);
  for (let k = 0; k < 26; k++) ml.place('water', cx, by + Math.floor(dims.h * 0.45), Math.floor(dims.w * 0.30));
  return { dims, bk, bu, cols: e.cols, rows: e.rows, burnerLevel: bu != null && e.getObject ? (e.getObject(bu) || {}).level : null };
});
check('hero scene: XL beaker + burner L3 placed', hero.bk != null && hero.bu != null, JSON.stringify(hero));
await page.evaluate(() => window.__matterlab.step(240));
await sleep(4000); // real-time heating/boiling + flame animation
const heroHot = await page.evaluate(() => { const e = window.__matterlab.engine; let mx = 0; for (let i = 0; i < e.temp.length; i += 7) if (e.temp[i] > mx) mx = e.temp[i]; return Math.round(mx); });
check('hero: water is heating (max temp > 90C)', heroHot > 90, `maxTemp=${heroHot}`);
await page.screenshot({ path: `${SHOTS}/hero-xl-burner-412.png` });
// flame close-up clip around the burner
const burnerPx = await page.evaluate(() => {
  const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect();
  const e = window.__matterlab.engine; let bo = null; e.objects.forEach((o) => { if (o.kind === 'burner') bo = o; });
  if (!bo) return null;
  const s = Math.min(r.width / e.cols, r.height / e.rows);
  const ox = (r.width - e.cols * s) / 2, oy = (r.height - e.rows * s) / 2;
  return { x: r.x + ox + (bo.anchor.x + bo.w / 2) * s, y: r.y + oy + bo.anchor.y * s };
});
if (burnerPx) {
  await page.evaluate(() => { const e = window.__matterlab.engine; e.objects.forEach((o) => { if (o.kind === 'burner' && typeof e.setObjectLevel === 'function') e.setObjectLevel(o.id, 1); }); });
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/flame-L1.png`, clip: { x: Math.max(0, burnerPx.x - 110), y: Math.max(0, burnerPx.y - 190), width: 220, height: 240 } });
  await page.evaluate(() => { const e = window.__matterlab.engine; e.objects.forEach((o) => { if (o.kind === 'burner' && typeof e.setObjectLevel === 'function') e.setObjectLevel(o.id, 3); }); });
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/flame-L3.png`, clip: { x: Math.max(0, burnerPx.x - 110), y: Math.max(0, burnerPx.y - 190), width: 220, height: 240 } });
  check('flame L1 + L3 screenshots captured', true);
} else check('flame L1 + L3 screenshots captured', false, 'burner not found');

// --- Frost: cooling coil ---
await page.evaluate(() => { const ml = window.__matterlab; const e = ml.engine; e.clear(); const x = Math.floor(e.cols / 2) - 10, y = Math.floor(e.rows / 2); const id = ml.placeObject('cooling-coil', x, y); if (id != null && typeof e.setObjectLevel === 'function') e.setObjectLevel(id, 3); for (let k = 0; k < 10; k++) ml.place('water', x + 10, y - 14, 16); ml.step(200); });
await sleep(1500);
const frost = await page.evaluate(() => { const e = window.__matterlab.engine; let mn = 999; for (let i = 0; i < e.temp.length; i++) if (e.el[i] && e.temp[i] < mn) mn = e.temp[i]; return Math.round(mn); });
check('cooling coil drives cells below 0C', frost < 0, `minTemp=${frost}`);
await page.screenshot({ path: `${SHOTS}/frost-coil-412.png` });

// --- Part E: Messages badge + panel ---
const partE = await page.evaluate(() => {
  const ml = window.__matterlab; const e = ml.engine; e.clear();
  const cx = Math.floor(e.cols / 2), cy = Math.floor(e.rows / 2);
  for (let k = 0; k < 8; k++) { ml.place('zinc', cx - 14, cy, 10); ml.place('copper-sulfate-sol', cx + 14, cy, 10); }
  // push them together: paint overlapping boundary
  for (let k = 0; k < 8; k++) { ml.place('zinc', cx, cy, 8); ml.place('copper-sulfate-sol', cx + 3, cy, 8); }
  ml.step(300);
  return { zn: ml.countKey('zinc'), cu: ml.countKey('copper') };
});
await sleep(1500);
const badgeState = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-rail]')];
  const mb = btns.find((x) => /message/i.test(x.getAttribute('aria-label') || ''));
  const badgeEl = mb ? (mb.querySelector('[data-badge]') || [...mb.querySelectorAll('span')].find((s) => /^\d+$/.test((s.textContent || '').trim()))) : null;
  const badge = badgeEl ? badgeEl.textContent.trim() : '';
  return { found: !!mb, badgeText: badge, bottomCard: document.body.innerText.includes('What just happened'), hasRawTemplate: /\{a\}|\{b\}/.test(document.body.innerText) };
});
check('Part E: Messages rail button present', badgeState.found, JSON.stringify(badgeState));
check('Part E: no bottom reaction card, no raw templates', !badgeState.bottomCard && !badgeState.hasRawTemplate, JSON.stringify(badgeState));
await page.screenshot({ path: `${SHOTS}/messages-badge-412.png` });
await railClick('Messages');
await sleep(1500);
const panelState = await page.evaluate(() => { const t = document.body.innerText; return { zinc: t.includes('Zinc'), copper: t.includes('Copper'), raw: /\{a\}|\{b\}/.test(t) }; });
check('Part E: panel opens with real names (Zinc/Copper), no raw templates', panelState.zinc && panelState.copper && !panelState.raw, JSON.stringify(panelState));
await page.screenshot({ path: `${SHOTS}/messages-panel-412.png` });

// --- Perf spot-check (local v2 busy scene) ---
const perfLocal = await page.evaluate(async () => {
  const ml = window.__matterlab; const e = ml.engine; e.clear();
  for (let x = 20; x < e.cols - 20; x += 9) { ml.place('sand', x, 30, 7); ml.place('water', x, 90, 7); }
  ml.place('fire', Math.floor(e.cols / 2), e.rows - 60, 16);
  ml.step(60);
  const deltas = [];
  await new Promise((done) => { let last = performance.now(); let n = 0; const f = (t) => { deltas.push(t - last); last = t; if (++n < 240) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  deltas.sort((a, b) => a - b);
  return { median: Math.round(deltas[120] * 10) / 10, p95: Math.round(deltas[Math.floor(deltas.length * 0.95)] * 10) / 10, particles: e.stats().particles };
});
check('perf local v2 measured', perfLocal.median > 0, JSON.stringify(perfLocal));

check('zero page errors (412 session)', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();

// --- 360x740 pass ---
const browser2 = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 120000 });
const p2 = await browser2.newPage();
const errors2 = [];
p2.on('pageerror', (e) => errors2.push(e.message));
await p2.setViewport({ width: 360, height: 740 });
await p2.goto(base, { waitUntil: 'load', timeout: 120000 });
await sleep(2500);
const ov = await p2.evaluate(() => document.scrollingElement.scrollWidth);
check('360px homepage: no horizontal overflow', ov <= 361, `scrollWidth=${ov}`);
await p2.screenshot({ path: `${SHOTS}/home-360.png` });
await p2.evaluate(() => { const el = [...document.querySelectorAll('button, a')].find((e) => (e.innerText || '').includes('Free Sandbox')); if (el) el.click(); });
await sleep(3000);
check('360px tool mounts, 0 errors', await p2.evaluate(() => !!document.querySelector('[data-mlroot="1"] canvas')) && errors2.length === 0, errors2.slice(0, 3).join(' | '));
await p2.screenshot({ path: `${SHOTS}/tool-360.png` });
await browser2.close();
srv.close();

// --- Perf comparison vs LIVE (pre-v2) build ---
let perfLive = null;
try {
  const args = await launchRelay();
  const b3 = await puppeteer.launch({ executablePath: CHROME, args, protocolTimeout: 120000 });
  const p3 = await b3.newPage();
  await p3.setViewport({ width: 412, height: 915 });
  await p3.goto('https://jackbhai.github.io/matter-lab/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(6000);
  perfLive = await p3.evaluate(async () => {
    const ml = window.__matterlab; if (!ml) return null; const e = ml.engine; e.clear();
    for (let x = 20; x < e.cols - 20; x += 9) { ml.place('sand', x, 30, 7); ml.place('water', x, 90, 7); }
    ml.place('fire', Math.floor(e.cols / 2), e.rows - 60, 16);
    ml.step(60);
    const deltas = [];
    await new Promise((done) => { let last = performance.now(); let n = 0; const f = (t) => { deltas.push(t - last); last = t; if (++n < 240) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
    deltas.sort((a, b) => a - b);
    return { median: Math.round(deltas[120] * 10) / 10, p95: Math.round(deltas[Math.floor(deltas.length * 0.95)] * 10) / 10, particles: e.stats().particles };
  });
  await b3.close();
} catch (err) { console.log('LIVE PERF PHASE FAILED', String(err).slice(0, 200)); }
console.log('PERF local v2:', JSON.stringify(perfLocal));
console.log('PERF live v1:', JSON.stringify(perfLive));
if (perfLive && perfLocal) {
  const reg = ((perfLocal.median - perfLive.median) / perfLive.median) * 100;
  check('perf regression <= 10% vs live v1 (median frame)', reg <= 10, `regression=${reg.toFixed(1)}%`);
}
const fails = results.filter((r) => !r.ok);
console.log(`\nV2 VERIFY: ${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
