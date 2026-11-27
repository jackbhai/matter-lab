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
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
page.on('pageerror', (e) => console.log('PAGEERROR STACK:\n', e.stack || e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (re, label) => {
  const hit = await page.evaluate((s) => { const b = [...document.querySelectorAll('button')].find((x) => new RegExp(s, 'i').test(x.innerText || x.getAttribute('aria-label') || '')); if (b) { b.click(); return b.innerText.slice(0, 30); } return null; }, re);
  console.log('click', label, '->', hit); await sleep(900);
};
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: 'load', timeout: 60000 });
await sleep(4000);
await clickText('Enter Free Sandbox', 'enter');
await page.waitForSelector('[data-mlroot="1"] canvas', { timeout: 20000 }).catch(() => {});
await sleep(1500);
await clickText('Skip tutorial', 'skip');
await clickText('tap to change', 'selbar->picker');
await clickText('Close picker', 'close-picker');
await page.evaluate(() => { const b = document.querySelector('[data-docktab="liquids"]'); if (b) b.click(); });
await sleep(900); console.log('strip opened');
await clickText('Expand grid', 'expand');
await page.mouse.click(8, 8); await sleep(600);
await clickText('^Menu', 'menu');
await clickText('Tools & controls panel', 'panel');
await clickText('Menu', 'menu2');
await sleep(500);
console.log('done');
await browser.close(); srv.close();
