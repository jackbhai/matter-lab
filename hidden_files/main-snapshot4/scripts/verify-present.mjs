// P0-REOPEN gate: the watchdog must judge the PRESENTED canvas and the
// app must never sit in a silent black void.
//  A) Normal desktop UA: paint -> world visible, no gfx notice.
//  B) Fault injection (sabotagePresent): the visible canvas presents black
//     while the offscreen world stays correct -> watchdog must engage the
//     fallback, then escalate to the "failed" notice (never silent).
//  C) WebView UA ('; wv)' — the failing device class): env pre-emption must
//     start the session on the plain present path WITH the fallback notice,
//     and the world must still draw.
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const data = await readFile(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${srv.address().port}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function enterLab(page) {
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  await sleep(4500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox|Open the lab/i.test(x.innerText || '')); if (b) b.click(); });
  await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 });
  await sleep(2000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Skip tutorial/i.test(x.innerText || '')); if (b) b.click(); });
  await sleep(400);
  await page.evaluate(() => { const M = window.__matterlab; const e = M.engine; M.place('sand', Math.floor(e.cols / 2), Math.floor(e.rows / 3), 12); M.step(10); });
  await sleep(1500);
}
const gfx = (page) => page.evaluate(() => (window.__matterlab && window.__matterlab.gfx) ? window.__matterlab.gfx() : null);
const canvasLit = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-mlroot="1"] canvas'); if (!c) return false;
  const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && !(Math.abs(d[i] - 10) <= 2 && Math.abs(d[i + 1] - 12) <= 2 && Math.abs(d[i + 2] - 18) <= 2)) { lit++; if (lit > 200) return true; } }
  return false;
});

// A) normal
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await enterLab(page);
  check('A world visible on canvas', await canvasLit(page));
  const g = await gfx(page);
  check('A no gfx notice in healthy run', g && g.notice === null, JSON.stringify(g));
  check('A no page errors', errs.length === 0, errs.join('; '));
  await page.close();
}

// B) fault injection — presented black, offscreen fine
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await enterLab(page);
  await page.evaluate(() => window.__matterlab.sabotagePresent(true));
  let g = null;
  for (let i = 0; i < 24; i++) { await sleep(500); g = await gfx(page); if (g && g.notice === 'failed') break; }
  check('B watchdog escalated to failed notice', g && g.notice === 'failed', JSON.stringify(g));
  check('B fallback latched en route', g && g.fallback === true);
  const dom = await page.evaluate(() => !!document.querySelector('[data-gfxnotice="failed"]'));
  check('B failed notice visible in DOM (not a silent void)', dom);
  check('B no page errors', errs.length === 0, errs.join('; '));
  await page.close();
}

// C) WebView UA pre-emption
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.43 Mobile Safari/537.36');
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await enterLab(page);
  const g = await gfx(page);
  check('C env detected as risky', g && g.envSimple === true, JSON.stringify(g));
  check('C session starts on plain path (fallback latched)', g && g.fallback === true);
  check('C fallback notice shown from the start', g && g.notice === 'fallback');
  check('C world still draws on the plain path', await canvasLit(page));
  check('C no page errors', errs.length === 0, errs.join('; '));
  await page.close();
}

// D) Geometry plumbing: --ml-vh tracks the visual viewport and sizes the shell
{
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await enterLab(page);
  const d = await page.evaluate(() => {
    const varH = getComputedStyle(document.documentElement).getPropertyValue('--ml-vh').trim();
    const tw = document.querySelector('.ml-toolwrap');
    const cv = document.querySelector('[data-mlroot="1"] canvas');
    const r = cv ? cv.getBoundingClientRect() : null;
    const vv = window.visualViewport;
    return { varH, vvH: vv ? Math.round(vv.height) : null, twH: tw ? Math.round(tw.getBoundingClientRect().height) : null, cvBottom: r ? Math.round(r.bottom) : null, cvTop: r ? Math.round(r.top) : null };
  });
  check('D --ml-vh set from visualViewport', d.varH === `${d.vvH}px`, JSON.stringify(d));
  check('D toolwrap height == visual viewport height', d.twH === d.vvH, JSON.stringify(d));
  check('D canvas fully inside the visual viewport', d.cvBottom !== null && d.cvBottom <= d.vvH + 1 && d.cvTop >= -1, JSON.stringify(d));
  check('D no page errors', errs.length === 0, errs.join('; '));
  await page.close();
}

await browser.close(); srv.close();
console.log(fails ? `VERIFY-PRESENT: FAIL (${fails})` : 'VERIFY-PRESENT: PASS');
process.exit(fails ? 1 : 0);
