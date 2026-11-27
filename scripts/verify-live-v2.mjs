import { resolveChromePath } from './chrome-path.mjs';
// Live v2 check: homepage renders, Free Sandbox launches the tool, 0 errors.
import http from 'node:http';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
const CHROME = resolveChromePath();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = ['--no-sandbox', '--disable-dev-shm-usage'];
const proxyEnv = process.env.https_proxy || process.env.HTTPS_PROXY || '';
if (proxyEnv) {
  const up = new URL(proxyEnv);
  if (up.username || up.password) {
    const authH = 'Basic ' + Buffer.from(decodeURIComponent(up.username) + ':' + decodeURIComponent(up.password)).toString('base64');
    const relay = http.createServer((q, r) => { r.writeHead(405); r.end(); });
    relay.on('connect', (req, client, head) => {
      const upstream = net.connect(+up.port, up.hostname, () => { upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${authH}\r\nProxy-Connection: keep-alive\r\n\r\n`); });
      let buf = Buffer.alloc(0);
      const onData = (chunk) => { buf = Buffer.concat([buf, chunk]); const idx = buf.indexOf('\r\n\r\n'); if (idx === -1) return; upstream.off('data', onData); if (!/ 200 /.test(buf.slice(0, buf.indexOf('\r\n')).toString())) { client.destroy(); upstream.destroy(); return; } client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); const rest = buf.slice(idx + 4); if (rest.length) client.write(rest); if (head && head.length) upstream.write(head); upstream.pipe(client); client.pipe(upstream); };
      upstream.on('data', onData); upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy());
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    args.push(`--proxy-server=http://127.0.0.1:${relay.address().port}`, '--proxy-bypass-list=127.0.0.1;localhost');
  } else args.push(`--proxy-server=${up.protocol}//${up.host}`);
}
const browser = await puppeteer.launch({ executablePath: CHROME, args, protocolTimeout: 120000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 412, height: 915 });
const resp = await page.goto('https://jackbhai.github.io/matter-lab/', { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('HTTP', resp && resp.status());
await sleep(5000);
const home = await page.evaluate(() => { const t = document.body.innerText; return { title: t.includes('Matter Lab'), stats: t.includes('1,392') && t.includes('22,500'), cards: ['Free Sandbox', 'Experiments', 'Scene Gallery', 'Custom Lab'].filter((s) => t.includes(s)).length }; });
console.log('HOME', JSON.stringify(home));
await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find((e) => (e.innerText || '').includes('Enter Free Sandbox')); if (el) el.click(); });
await sleep(5000);
const tool = await page.evaluate(() => ({ mounted: !!document.querySelector('[data-mlroot="1"] canvas'), hook: !!window.__matterlab, particles: window.__matterlab ? window.__matterlab.engine.stats().particles : -1 }));
console.log('TOOL', JSON.stringify(tool));
console.log('ERRORS', errors.length ? errors.slice(0, 6) : 'none');
await page.screenshot({ path: '/home/hatch/workspace/matter-lab-shots/live-tool-412.png' });
await browser.close();
const ok = resp && resp.status() === 200 && home.title && home.stats && home.cards === 4 && tool.mounted && errors.length === 0;
console.log(ok ? 'LIVE V2 VERIFY: PASS' : 'LIVE V2 VERIFY: FAIL');
process.exit(ok ? 0 : 1);
