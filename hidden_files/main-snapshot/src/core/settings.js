/**
 * User settings that live only in this browser.
 *
 * The one that matters is the custom proxy. Audio resolution has to pass
 * through a CORS hop, and the free public ones have become unreliable —
 * measured across 25 of them: one permanent 401, four rate-limited, three
 * 403, several timeouts, and a single slow survivor. Pointing the app at a
 * personal Cloudflare Worker (worker/omni-proxy.js, free tier, 100k req/day)
 * removes that whole class of problem.
 */

const KEY = 'omni:settings';

/**
 * The relay that ships with the app.
 *
 * Audio resolution and the Deezer catalogue both need a CORS hop. The free
 * public relays turned out to be unusable — measured across 25 of them: one
 * permanent 401, four rate-limited, three 403, several timeouts, and a single
 * survivor at 7-19 s. This Worker is deployed for the app: measured 0.06-0.1 s
 * warm versus 6.9 s on the best public relay, with a host allow-list so it
 * cannot be repurposed as an open proxy.
 *
 * A user can still point `proxyUrl` at their own Worker; that takes priority.
 */
export const BUILTIN_PROXY = 'https://omni-proxy.omni-jackbhai.workers.dev';

const DEFAULTS = {
  proxyUrl: '',          // user's own relay; blank means use BUILTIN_PROXY
  useBuiltin: true,      // fall back to the bundled relay
  autoRadio: true,       // keep the queue topped up so playback never ends
  fancyLyrics: true,     // karaoke word highlighting + sweep in the player (ui/PlayerUI.jsx)
  autoCache: true,       // keep the last 50 played songs on-device (core/auto-cache.js)
  sfx: true,             // travel-panel sounds, synthesised locally (core/sfx.js)
  /* UI-audit additions (consumed by src/ui/readerkit.jsx + Settings >
     Reading): one text size shared by every book reader, a paper reading
     surface, and an explicit save-data mode. Defaults keep behaviour
     exactly as before for existing users. */
  textSize: 1,           // reader text scale, 0.85–1.35
  readerPaper: false,    // warm paper surface inside the book readers
  lowData: false,        // save-data mode: fewer images, no channel index
  /* W31 Phase 6 personalisation (§5). All guarded by applyPersonalisation
     below: hostile stored values are clamped and the clamp is logged to
     guardLog so the Settings page can surface it (item 5.13). */
  uiText: 1,             // §5.7 app text step — one of TEXT_STEPS
  density: 'comfortable',// §5.3 'comfortable' | 'compact'
  iconStyle: 'line',     // §5.6 'line' | 'bold' | 'duotone'
  motionPref: 'full',    // §5.8 'full' | 'soft' | 'off' (OS reduce wins)
  accent: null,          // §5.2 { g, c } hex stops or null = theme accent
  themeMood: {},         // §5.1 per-theme 'lively' | 'calm' overrides
  themeSchedule: null,   // §5.11 { darkAt:'HH:MM', lightAt:'HH:MM' } | null
  lang: 'en',            // §7.20 chrome language 'en' | 'hi'
};

let cache = null;

export function getSettings() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

const subs = new Set();
export function onSettings(fn) { subs.add(fn); return () => subs.delete(fn); }

export function setSetting(k, v) {
  const s = { ...getSettings(), [k]: v };
  cache = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  for (const f of subs) { try { f(s); } catch {} }
  /* W31 P6: personalisation keys take effect the moment they are
     written, from any writer (Settings, AI, readers). */
  if (['uiText', 'density', 'iconStyle', 'motionPref', 'accent', 'themeMood', 'themeSchedule', 'lang']
    .includes(k)) { try { applyPersonalisation(); } catch { /* ignore */ } }
  return s;
}

/**
 * The relay to use: the user's own if they set one, otherwise the bundled
 * Worker. Returns '' only if the user has explicitly turned the built-in off
 * and not supplied their own — in which case callers fall back to the public
 * proxy pool.
 */
export function proxyBase() {
  const s = getSettings();
  const own = (s.proxyUrl || '').trim();
  if (own) return own.replace(/\/+$/, '');
  return s.useBuiltin === false ? '' : BUILTIN_PROXY;
}

const enc = encodeURIComponent;

/**
 * Route an upstream API call through the app's own relay, so the browser
 * only ever talks to this app's Worker. Relative URLs, blob:/data: URLs
 * and anything already pointing at the relay pass through untouched. When
 * the user has turned the relay off entirely, the URL is returned as-is —
 * that is their explicit choice, not a silent fallback.
 */
export function via(url) {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return u;
  const b = proxyBase();
  if (!b || u.startsWith(b)) return u;
  return `${b}/?url=${enc(u)}`;
}

/**
 * Route media bytes — audio, video, images, playlists — through the
 * Worker's media route, which passes Range requests through and rewrites
 * playlists so their segments stay on the Worker too. A custom relay of
 * the user's own predates the media route, so with one of those the plain
 * relay wrap is used instead.
 */
export function viaMedia(url, { dl = false } = {}) {
  const u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return u;
  const b = proxyBase();
  if (!b || u.startsWith(b)) return u;
  if (b === BUILTIN_PROXY) return `${b}/px?url=${enc(u)}${dl ? '&dl=1' : ''}`;
  return `${b}/?url=${enc(u)}`;
}

/* ================= W31 Phase 6 — personalisation (§5) =================
   One apply path for every §5 control. It writes only presentation
   attributes/vars on <html>: --uiscale (text step), data-density,
   data-icons, data-motion (the existing §5.3 attribute path — the
   stricter of the user's Motion choice and the OS setting wins),
   data-mood (per-theme lively/calm, §5.1) and the guarded accent vars.
   Guards (5.13): every value is clamped to its legal set; an accent
   must clear the contrast floor against the live --bg/--s2 through
   the same stepping the palette guard uses (core/palette.js). Every
   clamp is appended to guardLog — surfaced in Settings, never silent. */

import { contrast, isDarkBg } from './palette.js';

export const TEXT_STEPS = [0.875, 0.9375, 1, 1.0625, 1.125];
export const guardLog = [];
const noteGuard = (msg) => { if (!guardLog.includes(msg)) guardLog.push(msg); };

export function clampTextStep(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) { noteGuard(`Text size "${v}" is not a number — reset to 100%.`); return 1; }
  let best = TEXT_STEPS[0];
  for (const s of TEXT_STEPS) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  if (best !== n) noteGuard(`Text size ${n} is outside the five safe steps — clamped to ${Math.round(best * 100)}%.`);
  return best;
}
export function clampDensity(v) {
  if (v === 'comfortable' || v === 'compact') return v;
  noteGuard(`Density "${v}" is not a known setting — reset to Comfortable.`);
  return 'comfortable';
}
export function clampIconStyle(v) {
  if (v === 'line' || v === 'bold' || v === 'duotone') return v;
  noteGuard(`Icon style "${v}" is not a known setting — reset to Line.`);
  return 'line';
}
export function clampMotionPref(v) {
  if (v === 'full' || v === 'soft' || v === 'off') return v;
  noteGuard(`Motion setting "${v}" is not known — reset to Full.`);
  return 'full';
}

/* HSL stepping identical in spirit to palette.js guardPalette: walk
   lightness in 0.04 steps toward readability until the floor clears. */
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : mx === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const f = (p, q, t) => { let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
  }
  const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
const isHex6 = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/* Guard one accent stop against the live surfaces. Floor: 3:1 (the
   WCAG UI/large-text bar the palette guard holds accents to) against
   BOTH --bg and --s2. Returns { hex, adjusted } — adjusted is null
   when the pick passed untouched. */
export function guardAccentStop(hex, bg, s2) {
  if (!isHex6(hex) || !isHex6(bg)) return { hex: isHex6(hex) ? hex.toLowerCase() : '#00ff9c', adjusted: 'not a colour — brand green used' };
  const floor = 3.0;
  if (contrast(hex, bg) >= floor && (!isHex6(s2) || contrast(hex, s2) >= floor)) return { hex: hex.toLowerCase(), adjusted: null };
  const lighten = isDarkBg(bg);
  const [h, s, l0] = hexToHsl(hex);
  let l = l0, next = hex.toLowerCase();
  for (let i = 0; i < 25; i++) {
    l = lighten ? Math.min(1, l + 0.04) : Math.max(0, l - 0.04);
    next = hslToHex(h, s, l);
    if (contrast(next, bg) >= floor && (!isHex6(s2) || contrast(next, s2) >= floor)) break;
    if (l <= 0 || l >= 1) break;
  }
  return { hex: next, adjusted: `${hex} was too close to the background to read — lightened/darkened to ${next} by the contrast guard` };
}

/* A "Surprise me" accent (§5.2): fully random hue, guard does the rest. */
export function randomAccent(bg, s2) {
  const h = Math.random();
  const g = hslToHex(h, 1, isDarkBg(bg || '#000000') ? 0.6 : 0.32);
  const c = hslToHex((h + 0.14) % 1, 1, isDarkBg(bg || '#000000') ? 0.55 : 0.3);
  const gg = guardAccentStop(g, bg, s2), cc = guardAccentStop(c, bg, s2);
  return { g: gg.hex, c: cc.hex, adjusted: [gg.adjusted, cc.adjusted].filter(Boolean) };
}

const MOOD_DEFAULTS = { dark: 'lively', amoled: 'lively', light: 'calm' };
export function themeMoodOf(s, themeId) {
  const m = (s.themeMood && s.themeMood[themeId]) || MOOD_DEFAULTS[themeId];
  return m === 'calm' ? 'calm' : 'lively';
}

let lastApplied = '';
export function applyPersonalisation() {
  if (typeof document === 'undefined') return;
  const s = getSettings();
  const root = document.documentElement;
  const uiText = clampTextStep(s.uiText);
  const density = clampDensity(s.density);
  const iconStyle = clampIconStyle(s.iconStyle);
  const motionPref = clampMotionPref(s.motionPref);
  root.style.setProperty('--uiscale', String(uiText));
  root.dataset.density = density;
  root.dataset.icons = iconStyle;
  let themeId = 'dark';
  try { themeId = localStorage.getItem('omni:theme') || 'dark'; } catch { /* ignore */ }
  const mood = themeMoodOf(s, themeId);
  root.dataset.mood = mood;
  /* §5.8: stricter wins — OS reduce > user Off > user Soft / theme
     calm > Full. data-motion="reduced" is the existing §5.3 path. */
  const osReduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const eff = (osReduce || motionPref === 'off') ? 'reduced'
    : (motionPref === 'soft' || mood === 'calm') ? 'soft' : 'full';
  if (eff === 'full') root.removeAttribute('data-motion');
  else root.dataset.motion = eff;
  root.dataset.motionPref = motionPref;
  /* §5.2 accent — through the guard, against the live theme vars. */
  const cs = getComputedStyle(root);
  const bg = (cs.getPropertyValue('--bg') || '').trim();
  const s2 = (cs.getPropertyValue('--s2') || '').trim();
  if (s.accent && isHex6(s.accent.g) && isHex6(s.accent.c)) {
    const gg = guardAccentStop(s.accent.g, bg, s2);
    const cc = guardAccentStop(s.accent.c, bg, s2);
    for (const a of [gg.adjusted, cc.adjusted]) if (a) noteGuard(`Accent guard: ${a}.`);
    root.style.setProperty('--green', gg.hex);
    root.style.setProperty('--cyan', cc.hex);
    root.style.setProperty('--grad', `linear-gradient(135deg, ${gg.hex} 0%, ${cc.hex} 100%)`);
  } else {
    if (s.accent) noteGuard('Saved accent was not a valid colour pair — theme accent restored.');
    root.style.removeProperty('--green');
    root.style.removeProperty('--cyan');
    root.style.removeProperty('--grad');
  }
  lastApplied = `${uiText}|${density}|${iconStyle}|${eff}|${mood}|${s.accent ? s.accent.g + s.accent.c : ''}|${themeId}`;
  return lastApplied;
}

/* §5.11 scheduling: flip Dark/Day at the user's own hours. Only ever
   switches between the two base modes — a colour/AI theme the user
   picked is left alone. Checked on boot and once a minute. */
function scheduleTick() {
  const s = getSettings();
  const sch = s.themeSchedule;
  if (!sch || !sch.darkAt || !sch.lightAt) return;
  let cur = 'dark';
  try { cur = localStorage.getItem('omni:theme') || 'dark'; } catch { /* ignore */ }
  if (cur !== 'dark' && cur !== 'light') return;
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const isDarkHours = sch.darkAt <= sch.lightAt
    ? (hm >= sch.darkAt && hm < sch.lightAt)
    : (hm >= sch.darkAt || hm < sch.lightAt);
  const want = isDarkHours ? 'dark' : 'light';
  if (want !== cur) {
    import('./theme.js').then((m) => { m.applyTheme(want); applyPersonalisation(); }).catch(() => {});
  }
}

/* §5.12 reset-to-brand: every §5 personalisation key back to shipped
   defaults. Pins / My Main Tools / saved themes live in other stores
   and are deliberately NOT touched — they are content, not chrome. */
export function resetPersonalisation() {
  const patch = {
    uiText: 1, density: 'comfortable', iconStyle: 'line', motionPref: 'full',
    accent: null, themeMood: {}, themeSchedule: null, lang: 'en',
    homeBackdrop: 'aurora', quietHome: false, seasonalOff: false,
  };
  let s = getSettings();
  for (const [k, v] of Object.entries(patch)) s = setSetting(k, v);
  applyPersonalisation();
  return Object.keys(patch);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  /* App.jsx imports this module at boot, before main.jsx runs
     initTheme() — so re-apply on the next tick too, once the theme
     vars are on :root and the accent guard can measure them. */
  try { applyPersonalisation(); } catch { /* ignore */ }
  setTimeout(() => { try { applyPersonalisation(); scheduleTick(); } catch { /* ignore */ } }, 0);
  setInterval(() => { try { scheduleTick(); } catch { /* ignore */ } }, 60000);
  try {
    matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', () => { try { applyPersonalisation(); } catch { /* ignore */ } });
  } catch { /* older engines: OS change applies on next setting write */ }
}

/** True when the relay in use is the one that ships with the app. */
export const usingBuiltin = () => !(getSettings().proxyUrl || '').trim() &&
  getSettings().useBuiltin !== false;

/** Wrap a target URL for the user's own proxy. */

/**
 * Check that a pasted Worker URL actually works before we rely on it.
 * Returns { ok, ms, error }.
 */
export async function testProxy(base) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return { ok: false, error: 'Enter a URL first' };
  const probe = 'https://itunes.apple.com/search?term=test&limit=1';
  const t0 = Date.now();
  try {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 15000);
    const r = await fetch(`${b}/?url=${encodeURIComponent(probe)}`, { signal: c.signal });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, error: `Proxy answered HTTP ${r.status}` };
    const j = await r.json();
    if (typeof j.resultCount !== 'number') return { ok: false, error: 'Unexpected response' };
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'Timed out' : e.message };
  }
}
