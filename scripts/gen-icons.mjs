// Generate the PWA icons (original flask artwork, matching the index.html
// favicon concept) by rendering an inline SVG in headless Chrome and
// screenshotting it at exact sizes. Run: node scripts/gen-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './chrome-path.mjs';

const flask = (liquid = '#2dd4ee') => `
  <path d="M26 8h12v5.5L48 32c2.2 4-.8 10-6.2 10H22.2C16.8 42 13.8 36 16 32L26 13.5z"
        fill="#0b2231" stroke="#2dd4ee" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M22.5 31h19l3.4 6.2c.9 1.7-.3 3.8-2.3 3.8H21.4c-2 0-3.2-2.1-2.3-3.8z" fill="${liquid}"/>
  <circle cx="29" cy="36" r="2" fill="#dffaff"/>
  <circle cx="36" cy="33.5" r="1.4" fill="#dffaff"/>`;

const svgPage = (size, { maskable = false } = {}) => {
  // Maskable: full-bleed background, flask kept inside the ~80% safe zone.
  const scale = maskable ? 0.78 : 0.92;
  const inner = Math.round(64 * scale);
  const off = Math.round((64 - inner) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <rect width="64" height="64" fill="#060d12"/>
    <g transform="translate(${off} ${off}) scale(${scale})">${flask()}</g>
  </svg>`;
  return `<!doctype html><html><body style="margin:0;background:#060d12">${svg}</body></html>`;
};

const outDir = new URL('../public/icons/', import.meta.url).pathname;
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: resolveChromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});
try {
  const jobs = [
    ['icon-192.png', 192, {}],
    ['icon-512.png', 512, {}],
    ['icon-maskable-512.png', 512, { maskable: true }],
  ];
  for (const [name, size, opts] of jobs) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size });
    await page.setContent(svgPage(size, opts), { waitUntil: 'load' });
    const buf = await page.screenshot({ type: 'png' });
    await writeFile(outDir + name, buf);
    console.log('wrote', name, buf.length, 'bytes');
    await page.close();
  }
} finally {
  await browser.close();
}
