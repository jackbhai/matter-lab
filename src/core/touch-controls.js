/* Touch-first input policy for the sandbox.
   These profiles change only touch-pointer comfort/precision; mouse and pen
   input keep the user's exact brush radius and the existing desktop feel. */

export const DEFAULT_TOUCH_LEVEL = 'medium';
export const MAX_TOUCH_STROKE_POINTS = 256;

export const TOUCH_LEVELS = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    label: 'Easy',
    shortLabel: 'Easy',
    description: 'Forgiving strokes: a wider brush, denser stroke fill, and a more forgiving double-tap window.',
    brushScale: 1.3,
    strokeSpacing: 0.62,
    doubleTapMs: 460,
    doubleTapPx: 64,
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Medium',
    shortLabel: 'Med',
    description: 'Balanced touch: the selected brush size, reliable stroke fill, and standard gesture timing.',
    brushScale: 1,
    strokeSpacing: 1,
    doubleTapMs: 350,
    doubleTapPx: 48,
  }),
  hard: Object.freeze({
    id: 'hard',
    label: 'Hard',
    shortLabel: 'Hard',
    description: 'Precision touch: a finer brush, less stroke fill, and tighter double-tap timing.',
    brushScale: 0.72,
    strokeSpacing: 1.45,
    doubleTapMs: 260,
    doubleTapPx: 30,
  }),
});

export const normalizeTouchLevel = (level) => Object.hasOwn(TOUCH_LEVELS, level) ? level : DEFAULT_TOUCH_LEVEL;
export const touchProfile = (level) => TOUCH_LEVELS[normalizeTouchLevel(level)];

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

/** The touch profile intentionally does not change stylus or mouse precision. */
export function effectiveBrushRadius(baseRadius, level = DEFAULT_TOUCH_LEVEL, pointerType = 'touch') {
  const numeric = Number(baseRadius);
  const base = clamp(Number.isFinite(numeric) ? Math.round(numeric) : 1, 1, 64);
  if (pointerType !== 'touch') return base;
  return clamp(Math.round(base * touchProfile(level).brushScale), 1, 64);
}

/** Scale per-event interpolation work down for wide brushes on low-end phones. */
export function touchStrokePointBudget(radius) {
  const numeric = Number(radius);
  const r = clamp(Number.isFinite(numeric) ? Math.round(numeric) : 1, 1, 64);
  const footprint = (r * 2 + 1) ** 2;
  return clamp(Math.floor(24000 / footprint), 4, MAX_TOUCH_STROKE_POINTS);
}

/**
 * Fill gaps between touch move events so a slow or high-latency screen cannot
 * leave holes in a stroke. Results are integer world cells, omit `from`,
 * include `to`, and are bounded even if a pointer jumps across the full world.
 */
export function interpolateTouchStroke(from, to, level = DEFAULT_TOUCH_LEVEL, maxPoints = MAX_TOUCH_STROKE_POINTS) {
  if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return [];
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [];
  const spacing = touchProfile(level).strokeSpacing;
  const desired = Math.max(1, Math.ceil(distance / spacing));
  const cap = clamp(Number.isFinite(maxPoints) ? Math.floor(maxPoints) : MAX_TOUCH_STROKE_POINTS, 1, MAX_TOUCH_STROKE_POINTS);
  const count = Math.min(desired, cap);
  const out = [];
  let lastX = Math.round(from.x), lastY = Math.round(from.y);
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    const x = Math.round(from.x + dx * t), y = Math.round(from.y + dy * t);
    if (x === lastX && y === lastY) continue;
    out.push({ x, y });
    lastX = x; lastY = y;
  }
  const endX = Math.round(to.x), endY = Math.round(to.y);
  if (!out.length || out[out.length - 1].x !== endX || out[out.length - 1].y !== endY) out.push({ x: endX, y: endY });
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/** A profile-aware double tap predicate, shared by the canvas and tests. */
export function isTouchDoubleTap(previous, next, level = DEFAULT_TOUCH_LEVEL) {
  if (!previous || !next || previous.fingers !== next.fingers) return false;
  if (previous.pointerType && next.pointerType && previous.pointerType !== next.pointerType) return false;
  if (!Number.isFinite(previous.t) || !Number.isFinite(next.t) || next.t < previous.t) return false;
  const elapsed = next.t - previous.t;
  const distance = Math.hypot((next.x || 0) - (previous.x || 0), (next.y || 0) - (previous.y || 0));
  const profile = touchProfile(level);
  return elapsed <= profile.doubleTapMs && distance <= profile.doubleTapPx;
}
