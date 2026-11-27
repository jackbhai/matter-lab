/**
 * Palette validation + the contrast guard for AI-created themes.
 *
 * A generated theme must never be unreadable — that is a hard rule, not
 * a hope. The model proposes colours; this module is the proof step:
 * only whitelisted CSS vars with real hex values survive, missing vars
 * are filled from the theme currently on screen, and then the guard
 * walks any too-low-contrast text/accent colour toward readability in
 * small HSL lightness steps until it passes (or reaches pure black /
 * white trying). Whatever was adjusted is reported, so the chat card
 * can say so honestly.
 */

export const THEME_VARS = [
  '--bg', '--s1', '--s2', '--s3', '--line', '--line2',
  '--green', '--green-dim', '--cyan', '--cyan-dim', '--grad',
  '--fg', '--fg2', '--fg3', '--warn', '--bad',
];
const HEX_VARS = THEME_VARS.filter((v) => v !== '--grad');

export const isHex = (v) => typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

export function normHex(v) {
  let h = String(v).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  return h;
}

function hexToRgb(hex) {
  const h = normHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export const isDarkBg = (hex) => luminance(hex) < 0.32;

function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const f = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
  }
  const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/* Keep only whitelisted vars with valid values; fill the rest from
   `base` (the palette currently applied). --grad passes through only
   when it is a plain two-stop linear-gradient of hex colours; anything
   fancier is dropped and re-derived by the theme applier. */
export function validatePalette(input, base) {
  const out = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const k of HEX_VARS) {
    if (isHex(src[k])) out[k] = normHex(src[k]);
    else if (base && isHex(base[k])) out[k] = normHex(base[k]);
  }
  const grad = typeof src['--grad'] === 'string' ? src['--grad'].trim() : '';
  if (/^linear-gradient\(135deg,\s*#[0-9a-f]{6}\s+0%,\s*#[0-9a-f]{6}\s+100%\)$/i.test(grad)) {
    out['--grad'] = grad;
  } else if (base && typeof base['--grad'] === 'string') {
    out['--grad'] = base['--grad'];
  }
  return out;
}

/* [var, minimum ratio against --bg] — body text is held to the WCAG AA
   bar; secondary text and accents to the large-text/UI bar. */
const GUARD_RULES = [
  ['--fg', 4.5],
  ['--fg2', 3.0],
  ['--fg3', 2.5],
  ['--green', 3.0],
  ['--cyan', 3.0],
];

export function guardPalette(varsIn) {
  const vars = { ...varsIn };
  const adjusted = [];
  const bg = vars['--bg'];
  if (!isHex(bg)) return { vars, adjusted };
  const lighten = isDarkBg(bg);
  for (const [key, min] of GUARD_RULES) {
    const val = vars[key];
    if (!isHex(val)) continue;
    if (contrast(val, bg) >= min) continue;
    const [h, s, l0] = hexToHsl(val);
    let l = l0;
    let next = val;
    for (let i = 0; i < 25; i++) {
      l = lighten ? Math.min(1, l + 0.04) : Math.max(0, l - 0.04);
      next = hslToHex(h, s, l);
      if (contrast(next, bg) >= min) break;
      if (l <= 0 || l >= 1) break;
    }
    if (contrast(next, bg) < min && key === '--fg') {
      next = lighten ? '#ffffff' : '#000000';
    }
    if (next !== val) {
      vars[key] = next;
      adjusted.push({ key, from: val, to: next });
    }
  }
  return { vars, adjusted };
}
