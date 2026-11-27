// UI-redesign compliance audit harness (point 9 evidence).
// Serves dist/, drives the real app like a user at 3 viewports, captures
// screenshots + DOM probes (chrome visibility, overlaps, touch targets,
// aria coverage) into ../matter-lab-shots/redesign/<phase>/.
// Usage: node scripts/audit-shots.mjs <phase-label>
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const PHASE = process.argv[2] || 'before';
const OUT = new URL(`../../matter-lab-shots/redesign/${PHASE}/`, import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/matter-lab/' || p === '/matter-lab') p = '/index.html';
    p = p.replace(/^\/matter-lab/, '');
    const file = join(DIST, normalize(p).replace(/^(\\.\\.[/\\\\])+/, ''));
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const report = {};

async function probeChrome(page) {
  return page.evaluate(() => {
    const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return (r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden') ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; };
    const q = (sel) => document.querySelector(sel);
    const chrome = {
      topbar: vis(q('[data-topbar="1"]')), dock: vis(q('[data-dock="1"]')),
      dockpanel: vis(q('[data-dockpanel="1"]')), wheel: vis(q('[data-toolwheel="1"]')),
      rail: vis(q('[data-mlroot="1"] .rail, [data-mlroot="1"] [class*="rail"]')),
      canvas: vis(q('[data-mlroot="1"] canvas')),
    };
    // overlaps among visible chrome boxes
    const boxes = Object.entries(chrome).filter(([, v]) => v && v.w > 0);
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [an, a] = boxes[i]; const [bn, b] = boxes[j];
      if (an === 'canvas' || bn === 'canvas') continue; // chrome legitimately floats over canvas
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) overlaps.push(`${an}×${bn} ${ox}x${oy}`);
    }
    // touch targets: visible buttons inside lab root smaller than 44px in either dim
    const small = [];
    document.querySelectorAll('[data-mlroot="1"] button').forEach((b) => {
      const r = b.getBoundingClientRect(); const s = getComputedStyle(b);
      if (r.width > 0 && s.display !== 'none' && (r.width < 43 || r.height < 43)) small.push(`${(b.getAttribute('aria-label') || b.innerText || '?').slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    const aria = document.querySelectorAll('[aria-label]').length;
    return { chrome, overlaps, smallTargets: small.slice(0, 30), smallCount: small.length, ariaLabels: aria, fs: !!document.fullscreenElement };
  });
}

async function clickByText(page, re, sel = 'button') {
  return page.evaluate((res, s) => {
    const el = [...document.querySelectorAll(s)].find((x) => new RegExp(res, 'i').test(x.innerText || x.getAttribute('aria-label') || ''));
    if (el) { el.click(); return (el.innerText || el.getAttribute('aria-label') || '').slice(0, 40); }
    return null;
  }, re.source, sel);
}

const VIEWPORTS = [[360, 800], [412, 915], [768, 1024]];
for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`;
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  await page.screenshot({ path: `${OUT}${tag}-01-home.png` });
  report[tag] = { errors };

  // enter the lab
  const entered = await clickByText(page, /Enter Free Sandbox|Launch Free Sandbox|Open the lab/);
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  // dismiss onboarding if present
  const skipped = await clickByText(page, /Skip tutorial/);
  if (skipped) await sleep(600);
  await page.screenshot({ path: `${OUT}${tag}-02-lab.png` });
  report[tag].entered = entered; report[tag].tutorialSkipped = skipped;
  report[tag].lab = await probeChrome(page);

  // paint something so the world isn't empty in later shots
  const cv = await page.evaluate(() => { const c = document.querySelector('[data-mlroot="1"] canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (cv) {
    await page.mouse.move(cv.x + cv.w * 0.4, cv.y + cv.h * 0.3); await page.mouse.down();
    await page.mouse.move(cv.x + cv.w * 0.6, cv.y + cv.h * 0.35, { steps: 6 }); await page.mouse.up();
    await sleep(800);
  }

  // dock: open Liquids strip (inline, above the dock)
  const tabClicked = await page.evaluate(() => { const b = document.querySelector('[data-docktab="liquids"]'); if (b) { b.click(); return true; } return false; });
  if (tabClicked) { await sleep(700); await page.screenshot({ path: `${OUT}${tag}-03-strip.png` }); report[tag].strip = await probeChrome(page); }
  // long-press a chip in the strip -> info card
  const chip = await page.evaluate(() => { const c = document.querySelector('[data-dockpanel="1"] [role="list"] > *'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (chip) {
    await page.mouse.move(chip.x, chip.y); await page.mouse.down(); await sleep(900); await page.mouse.up(); await sleep(600);
    await page.screenshot({ path: `${OUT}${tag}-05-infocard.png` });
    report[tag].infoCard = await page.evaluate(() => !!document.querySelector('[data-infocard="1"], [role="dialog"]'));
    await clickByText(page, /Close/); await sleep(400);
  }
  // expand strip -> grid sheet
  const exp = await clickByText(page, /Expand grid/);
  if (exp) { await sleep(700); await page.screenshot({ path: `${OUT}${tag}-04-grid.png` }); report[tag].grid = await probeChrome(page); await page.mouse.click(8, 8); await sleep(500); }
  // tool wheel open
  const wheelBtn = await page.evaluate(() => { const b = document.querySelector('[data-toolwheel="1"] > button'); if (b) { b.click(); return true; } return false; });
  if (wheelBtn) { await sleep(600); await page.screenshot({ path: `${OUT}${tag}-06-wheel.png` }); report[tag].wheel = await probeChrome(page); await page.evaluate(() => { const b = document.querySelector('[data-toolwheel="1"] > button'); if (b) b.click(); }); await sleep(300); }

  // menu sheet via TopBar Menu, then the Tools & controls (side) panel
  const menuBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Menu/.test(x.getAttribute('aria-label') || '')); if (b) { b.click(); return true; } return false; });
  if (menuBtn) {
    await sleep(700); await page.screenshot({ path: `${OUT}${tag}-08-menu.png` });
    const panelBtn = await clickByText(page, /Tools & controls panel/);
    if (panelBtn) { await sleep(800); await page.screenshot({ path: `${OUT}${tag}-07-panel.png` }); report[tag].panel = await probeChrome(page); }
  }
  report[tag].errors = errors;
  await page.close();
}

// light-theme home at 412 (theme choice persists via localStorage 'light')
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('omni:theme', 'light'); localStorage.setItem('matterlab:theme', 'light'); } catch {} });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await sleep(5000);
  await page.screenshot({ path: `${OUT}412x915-09-home-light.png` });
  report['light'] = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme || null, bg: getComputedStyle(document.body).backgroundColor }));
  await page.close();
}

await writeFile(`${OUT}probe.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
srv.close();
