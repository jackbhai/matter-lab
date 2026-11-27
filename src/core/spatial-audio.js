/* Camera-aware 2.5D/3D audio geometry for the falling-sand world.
   Sources arrive in normalized world coordinates; the active camera turns
   them into a listener-relative PannerNode position plus a graceful stereo,
   distance and air-absorption fallback for browsers without 3D Web Audio. */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const unit = (v, fallback = 0.5) => clamp(Number.isFinite(Number(v)) ? Number(v) : fallback, 0, 1);

export function normalizeAudioListener(view = {}) {
  const cols = clamp(Math.floor(Number(view.cols) || 480), 1, 4096);
  const rows = clamp(Math.floor(Number(view.rows) || 270), 1, 4096);
  const zoom = clamp(Number(view.zoom) || 1, 1, 6);
  const fx = Number.isFinite(view.fx) ? view.fx : (cols - 1) / 2;
  const fy = Number.isFinite(view.fy) ? view.fy : (rows - 1) / 2;
  return {
    cols,
    rows,
    zoom,
    // setListener stores an already-normalized snapshot; accept it again so
    // spatializeSource can safely normalize both raw camera state and that
    // cached listener without losing its pan/focus.
    focusX: Number.isFinite(view.focusX) ? clamp(view.focusX, 0, 1) : (cols <= 1 ? 0.5 : clamp(fx / (cols - 1), 0, 1)),
    focusY: Number.isFinite(view.focusY) ? clamp(view.focusY, 0, 1) : (rows <= 1 ? 0.5 : clamp(fy / (rows - 1), 0, 1)),
  };
}

/**
 * Maps a source to the listener's visible scene. Camera zoom/pan changes the
 * apparent azimuth and distance; vertical screen position maps to elevation.
 * PannerNode receives an actual XYZ point (listener faces down -Z), while
 * `pan`, `gain` and `cutoff` give a deterministic fallback and test surface.
 */
export function spatializeSource(source = {}, listener = {}, { centered = false } = {}) {
  const view = normalizeAudioListener(listener);
  const positioned = !centered && Number.isFinite(Number(source.x));
  if (!positioned) {
    return {
      positioned: false,
      pan: 0,
      elevation: 0,
      radial: 0,
      distance: 2,
      gain: 1,
      cutoff: 18000,
      x: 0,
      y: 0,
      z: -2,
    };
  }
  const sx = unit(source.x);
  const sy = unit(source.y, 0.5);
  const halfW = 0.5 / view.zoom;
  const halfH = 0.5 / view.zoom;
  const nx = (sx - view.focusX) / Math.max(0.025, halfW);
  const ny = (view.focusY - sy) / Math.max(0.025, halfH); // positive = above the listener
  const pan = clamp(nx * 0.82, -0.92, 0.92);
  const elevation = clamp(ny * 0.72, -0.82, 0.82);
  const radial = Math.hypot(nx, ny);
  const depth = Number.isFinite(Number(source.depth)) ? unit(source.depth) : 0.5;
  const distance = 2 + radial * 7 + Math.abs(depth - 0.5) * 2;
  const gain = clamp(1 / (1 + 0.28 * radial + 0.35 * Math.abs(depth - 0.5)), 0.28, 1);
  // Air absorption removes high frequencies with distance; elevation adds a
  // subtle spectral shade rather than making vertical position only a pan.
  const cutoff = clamp(18000 / (1 + 0.72 * radial + 0.2 * Math.abs(elevation)), 2200, 18000);
  return {
    positioned: true,
    pan,
    elevation,
    radial,
    distance,
    gain,
    cutoff,
    x: pan * 8,
    y: elevation * 5,
    z: -distance,
  };
}

export function setPannerPosition(panner, position, time = 0) {
  if (!panner || !position) return false;
  try {
    const axes = [['positionX', position.x], ['positionY', position.y], ['positionZ', position.z]];
    if (axes.every(([name]) => panner[name] && typeof panner[name].setTargetAtTime === 'function')) {
      for (const [name, value] of axes) panner[name].setTargetAtTime(value, time, 0.08);
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(position.x, position.y, position.z);
    } else return false;
    return true;
  } catch { return false; }
}
