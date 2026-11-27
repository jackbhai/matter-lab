import { resolveChromePath } from './chrome-path.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const DIST = new URL('../dist', import.meta.url).pathname;
const SHOTS = new URL('../../matter-lab-shots/ui-b/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html'; const data = await readFile(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''))); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end('nf'); } });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3500));
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Enter Free Sandbox/i.test(x.innerText || '')); if (b) b.click(); });
await page.waitForSelector('[data-mlroot="1"] canvas');
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Skip tutorial/i.test(x.innerText || '')); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 300));

/* busy world for the auto-safeguard sampler (Auto is the default pref) */
const busy = await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine;
  for (let x = 20; x < e.cols - 20; x += 7) for (let y = 30; y < 90; y += 7) M.place('sand', x, y, 3);
  for (let x = 20; x < e.cols - 20; x += 9) M.place('water', x, Math.floor(e.rows * 0.7), 4);
  return { parts: e.stats().particles, gl: M.gl(), pref: M.rendererState().pref };
});
console.log('BUSY', JSON.stringify(busy));
await new Promise((r) => setTimeout(r, 7000));
const rend = await page.evaluate(() => ({ state: window.__matterlab.rendererState(), gl: window.__matterlab.gl() }));
console.log('RENDERER AFTER 7s BUSY', JSON.stringify(rend));

/* busy-scene delta bytes: paint a stroke on this live, drifting world */
const cvr = await page.evaluate(() => { const r = document.querySelector('[data-mlroot="1"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const ptr = (type, x, y, id) => page.evaluate(({ type, x, y, id }) => { const cv = document.querySelector('[data-mlroot="1"] canvas'); cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true })); }, { type, x, y, id });
await ptr('pointerdown', cvr.x + cvr.w * 0.3, cvr.y + cvr.h * 0.3, 1);
await ptr('pointermove', cvr.x + cvr.w * 0.45, cvr.y + cvr.h * 0.34, 1);
await ptr('pointerup', cvr.x + cvr.w * 0.45, cvr.y + cvr.h * 0.34, 1);
await new Promise((r) => setTimeout(r, 400));
console.log('DELTA BUSY stroke1 (base)', JSON.stringify(await page.evaluate(() => window.__matterlab.deltaStats())));
await new Promise((r) => setTimeout(r, 2500)); // let the busy world drift/react
await ptr('pointerdown', cvr.x + cvr.w * 0.6, cvr.y + cvr.h * 0.3, 1);
await ptr('pointermove', cvr.x + cvr.w * 0.7, cvr.y + cvr.h * 0.33, 1);
await ptr('pointerup', cvr.x + cvr.w * 0.7, cvr.y + cvr.h * 0.33, 1);
await new Promise((r) => setTimeout(r, 300));
console.log('DELTA BUSY stroke2 (delta)', JSON.stringify(await page.evaluate(() => window.__matterlab.deltaStats())));
await page.evaluate(() => window.__matterlab.undoOnce());
await new Promise((r) => setTimeout(r, 300));
console.log('DELTA BUSY after undo', JSON.stringify(await page.evaluate(() => window.__matterlab.deltaStats())));

/* feed result card: sodium + water, open Messages, expand */
await page.evaluate(() => {
  const M = window.__matterlab, e = M.engine; e.clear();
  const cx = Math.floor(e.cols * 0.4), wy = Math.floor(e.rows * 0.55);
  M.place('water', cx, wy, 10); M.place('sodium', cx, wy - 4, 4);
  M.step(60); e.stir(cx, wy - 2, 12); M.step(300);
});
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => { const b = document.querySelector('[data-rail="messages"]'); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Result card/.test(x.innerText || '')); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 400));
const cardTxt = await page.evaluate(() => { const c = document.querySelector('[data-rxcard="1"]'); return c ? c.innerText : null; });
console.log('RXCARD', JSON.stringify(cardTxt));
await page.screenshot({ path: `${SHOTS}feed-result-card-412.png` });
console.log('ERRORS', errors.length, errors.slice(0, 2).join('|'));
await browser.close(); srv.close();
