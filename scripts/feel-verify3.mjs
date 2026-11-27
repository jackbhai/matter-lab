/* FEEL fix9 check: flood the reaction feed with repeated entries (lit
   burner + boiling water), open Messages, assert consecutive duplicates
   render grouped with a ×N chip. */
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/webmanifest' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT = '/home/hatch/workspace/matter-lab-shots/feel-after/';
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
const clickText = (re) => page.evaluate((src) => { const b = [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(src, 'i').test(x.innerText || x.getAttribute('aria-label') || '')); if (b) { b.click(); return true; } return false; }, re.source);
const placeGear = async (kind) => { await clickText(/^Gear$/); await sleep(900); const ok = await page.evaluate((k) => { const t = document.querySelector(`[data-gear="${k}"]`); if (t) { t.click(); return true; } return false; }, kind); await sleep(900); return ok; };
await placeGear('beaker-m');
await placeGear('burner');
/* fill the beaker with water via the test hook (fill only; stacking was by hand) */
await page.evaluate(() => { const M = window.__matterlab; const o = [...M.engine.objects.values()].find((x) => x.kind.startsWith('beaker')); const e = M.engine; for (let y = o.anchor.y + 3; y < o.anchor.y + o.h - 2; y++) for (let x = o.anchor.x + 2; x < o.anchor.x + o.w - 2; x++) M.place(x, y, 'water'); });
await sleep(20000);
/* open Messages (log sheet) */
const opened = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /messages/i.test(x.getAttribute('aria-label') || '') || /💬|🔔/.test(x.innerText || '')); if (b) { b.click(); return b.getAttribute('aria-label') || b.innerText; } return null; });
await sleep(1000);
const opened2 = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Messages/i.test((x.innerText || '').trim())); if (b) { b.click(); return b.innerText; } return null; });
await sleep(1200);
const feed = await page.evaluate(() => { const sh = document.querySelector('.sheet'); if (!sh) return { open: false }; const txt = sh.innerText; const chips = [...sh.querySelectorAll('*')].filter((el) => el.children.length === 0 && /×\s*\d+/.test(el.textContent || '')).map((el) => el.textContent.trim()); return { open: true, chips: chips.slice(0, 8), sample: txt.slice(0, 300) }; });
console.log('FIX9 messages opened via:', JSON.stringify(opened), '->', JSON.stringify(opened2));
console.log('FIX9 grouped chips:', JSON.stringify(feed));
await page.screenshot({ path: SHOT + 'messages-grouped.png' });
await browser.close(); srv.close();
