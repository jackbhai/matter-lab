// Focused T2 re-test: burner centre-tap toggle via the app's own live
// geom() mapping (cellToXY), with coverage probes at the tap point.
import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/' || p.startsWith('/matter-lab')) p = '/index.html'; const file = join(DIST, normalize(p).replace(/^(\\.\\.[/\\\\])+/, '')); const data = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
async function rectOf(fn, arg) { return page.evaluate((src, a) => { const f = eval(src); const el = f(a); if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, fn.toString(), arg); }
const byText = (a) => [...document.querySelectorAll('button, [role="button"]')].find((x) => new RegExp(a, 'i').test(x.innerText || x.getAttribute('aria-label') || ''));
const bySel = (a) => document.querySelector(a);
async function tap(fn, arg, label) { const r = await rectOf(fn, arg); if (!r) { console.log('MISS', label); return; } await page.mouse.click(r.cx, r.cy); }
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 120000 });
await sleep(5000);
await tap(byText, 'Enter Free Sandbox|Open the lab', 'enter');
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 30000 }).catch(() => {});
await sleep(2500);
await tap(byText, 'Skip tutorial', 'skip'); await sleep(600);
let last = '', stable = 0;
for (let i = 0; i < 25 && stable < 3; i++) { const d = await page.evaluate(() => window.__matterlab.engine.cols + 'x' + window.__matterlab.engine.rows); if (d === last) stable++; else { stable = 0; last = d; } await sleep(1000); }
await sleep(3000);
console.log('grid:', await page.evaluate(() => window.__matterlab.engine.cols + 'x' + window.__matterlab.engine.rows));
const objs = () => page.evaluate(() => [...window.__matterlab.engine.objects.values()].map((o) => ({ kind: o.kind, x: o.anchor.x, y: o.anchor.y, w: o.w, h: o.h, level: o.level })));
await tap(byText, '^Gear$', 'gear'); await sleep(900);
await page.evaluate(() => { const t = document.querySelector('[data-gear="burner"]'); if (t) t.scrollIntoView({ block: 'center' }); });
await sleep(400);
await tap(bySel, '[data-gear="burner"]', 'burner tile'); await sleep(900);
let bu = (await objs()).find((o) => o.kind === 'burner');
console.log('burner placed:', JSON.stringify(bu));
// select Move gear tool
await tap(bySel, '[data-toolwheel="1"] button', 'wheel'); await sleep(600);
await tap(byText, '^Move gear$', 'move gear'); await sleep(500);
// dismiss selbar (placement selection) via its Done button rect
await page.evaluate(() => { const bar = document.querySelector('[data-selbar="1"]'); return !!bar; }).then(async (open) => { if (open) { const f = () => { const bar = document.querySelector('[data-selbar="1"]'); return bar ? [...bar.querySelectorAll('button')].find((b) => /done/i.test(b.innerText || '')) : null; }; await tap(f, null, 'done'); await sleep(600); } });
const centreXY = () => page.evaluate(() => { const M = window.__matterlab; const e = M.engine; const bu2 = [...e.objects.values()].find((o) => o.kind === 'burner'); const cv = document.querySelector('[data-mlroot="1"] canvas'); const r = cv.getBoundingClientRect(); const g = M.geom(); const cx = bu2.anchor.x + bu2.w / 2, cy = bu2.anchor.y + bu2.h / 2; return { x: r.left + (g.ox + (cx + 0.5) * g.s) * (r.width / cv.width), y: r.top + (g.oy + (cy + 0.5) * g.s) * (r.height / cv.height), level: bu2.level }; });
let c = await centreXY();
console.log('burner centre via geom:', JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y), level: c.level }));
const probe = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 40) : null; }, c);
console.log('element at burner centre:', JSON.stringify(probe));
await page.mouse.click(c.x, c.y); await sleep(800);
bu = (await objs()).find((o) => o.kind === 'burner');
console.log('T2 after tap 1: level', bu && bu.level);
// dismiss selbar if the tap opened it
{ const f = () => { const bar = document.querySelector('[data-selbar="1"]'); return bar ? [...bar.querySelectorAll('button')].find((b) => /done/i.test(b.innerText || '')) : null; }; await tap(f, null, 'done2'); await sleep(600); }
c = await centreXY();
const probe2 = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 40) : null; }, c);
console.log('element at burner centre before tap 2:', JSON.stringify(probe2));
await page.mouse.click(c.x, c.y); await sleep(800);
bu = (await objs()).find((o) => o.kind === 'burner');
console.log('T2 after tap 2: level', bu && bu.level);
await page.screenshot({ path: '/home/hatch/workspace/matter-lab-shots/feel-tests/t2-focused-toggle.png' });
await browser.close(); srv.close(); console.log('T2 FOCUSED DONE');
