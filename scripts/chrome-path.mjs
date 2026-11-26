// Shared Chrome resolution for the verification scripts.
// Order: $CHROME_PATH -> puppeteer cache (newest first, full chrome then
// headless-shell) -> common system paths -> legacy hardcoded fallback.
// Behaviour is identical to before when the old hardcoded path exists:
// it is inside the puppeteer cache, so the glob finds it.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LEGACY = '/home/hatch/.cache/puppeteer/chrome-headless-shell/linux-156.0.8078.47/chrome-headless-shell-linux64/chrome-headless-shell';
const SYSTEM = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/snap/bin/chromium', '/usr/bin/google-chrome-unstable',
];

function fromPuppeteerCache() {
  const base = join(homedir(), '.cache', 'puppeteer');
  const found = [];
  for (const kind of ['chrome-headless-shell', 'chrome']) {
    const dir = join(base, kind);
    let versions = [];
    try { versions = readdirSync(dir).sort().reverse(); } catch { continue; }
    for (const v of versions) {
      const sub = kind === 'chrome' ? 'chrome-linux64' : 'chrome-headless-shell-linux64';
      const bin = kind === 'chrome' ? 'chrome' : 'chrome-headless-shell';
      const p = join(dir, v, sub, bin);
      if (existsSync(p)) found.push(p);
    }
  }
  return found[0] || null;
}

export function resolveChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cached = fromPuppeteerCache();
  if (cached) return cached;
  for (const p of SYSTEM) if (existsSync(p)) return p;
  return LEGACY;
}

export const CHROME_PATH = resolveChromePath();
export default CHROME_PATH;
