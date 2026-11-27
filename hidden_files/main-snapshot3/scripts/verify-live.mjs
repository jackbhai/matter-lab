import { resolveChromePath } from './chrome-path.mjs';
// Live verification: loads the deployed GitHub Pages URL in headless Chrome
// (via the credentialed-egress CONNECT relay Chromium needs in this sandbox)
// and checks mount, canvas, panels and page errors.
import http from 'node:http';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const URL_TO_CHECK = process.argv[2] || 'https://jackbhai.github.io/matter-lab/';
const chromeArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
const proxyEnv = process.env.https_proxy || process.env.HTTPS_PROXY || '';
if (proxyEnv) {
  const up = new URL(proxyEnv);
  if (up.username || up.password) {
    const authH = 'Basic ' + Buffer.from(decodeURIComponent(up.username) + ':' + decodeURIComponent(up.password)).toString('base64');
    const relay = http.createServer((q, r) => { r.writeHead(405); r.end(); });
    relay.on('connect', (req, client, head) => {
      const upstream = net.connect(+up.port, up.hostname, () => {
        upstream.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${authH}\r\nProxy-Connection: keep-alive\r\n\r\n`);
      });
      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        upstream.off('data', onData);
        if (!/ 200 /.test(buf.slice(0, buf.indexOf('\r\n')).toString())) { client.destroy(); upstream.destroy(); return; }
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const rest = buf.slice(idx + 4);
        if (rest.length) client.write(rest);
        if (head && head.length) upstream.write(head);
        upstream.pipe(client); client.pipe(upstream);
      };
      upstream.on('data', onData);
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    chromeArgs.push(`--proxy-server=http://127.0.0.1:${relay.address().port}`, '--proxy-bypass-list=127.0.0.1;localhost');
  } else {
    chromeArgs.push(`--proxy-server=${up.protocol}//${up.host}`);
  }
}

console.log('launching'); const browser = await puppeteer.launch({ protocolTimeout: 90000,
  executablePath: resolveChromePath(),
  args: chromeArgs,
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 915 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const resp = await page.goto(URL_TO_CHECK, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('HTTP', resp && resp.status(), URL_TO_CHECK);
await new Promise((r) => setTimeout(r, 6000));
const probe = await page.evaluate(() => {
  const root = document.querySelector('[data-mlroot="1"]');
  const canvas = document.querySelector('[data-mlroot="1"] canvas');
  return { mounted: !!root, canvas: !!canvas, title: document.title, buttons: root ? root.querySelectorAll('button').length : 0 };
});
console.log('LIVE PROBE', JSON.stringify(probe));
console.log('ERRORS', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
if (errors.length || !probe.mounted || !probe.canvas) { console.log('LIVE VERIFY: FAIL'); process.exit(1); }
console.log('LIVE VERIFY: PASS');
