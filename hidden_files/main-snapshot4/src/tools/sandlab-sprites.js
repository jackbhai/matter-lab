/* UI-A split: gear sprite painters (extracted verbatim from sandlab.jsx).
   Sprites are baked once per (kind,bucketed size) into offscreen canvases;
   the render loop only blits. Glass sprites carry the reflection streak +
   numbered graduations. */

const SPR = new Map();
const mkC = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const sprGet = (key, maker) => { let v = SPR.get(key); if (!v) { try { v = maker(); } catch { v = null; } if (v) SPR.set(key, v); } return v; };
export const bucket = (v) => Math.max(12, Math.round(v / 8) * 8);
/* A real laboratory beaker: tapered flute + beaded rim + thicker bottom,
   with a light gradient, a reflection streak and real graduation numbers. */
function drawBeakerFlute(x, kind, bw, bh) {
  const yTop = Math.max(4, Math.round(bh * 0.04));
  const be = Math.max(3, Math.round(bh * 0.055)); // beading lip height
  // Slightly tapered flute body (narrower at top, wider below the rim)
  const t = kind === 'beaker-l' ? 0.10 : kind === 'beaker-m' ? 0.07 : 0.04;
  x.beginPath();
  x.moveTo(bw * 0.50, yTop - 0.5);
  x.lineTo(bw * 0.50, bh - 2.5);
  x.bezierCurveTo(bw * 0.50, bh - 2.5, bw * (0.5 - t / 2), bh - 1.5, bw * 0.28, bh - 2);
  x.bezierCurveTo(bw * 0.28, bh - 2, bw * 0.25, bh - 2.2, bw * 0.25, bh * 0.96);
  x.lineTo(bw * 0.25, bh - 2);
  x.bezierCurveTo(bw * 0.25, bh - 2, bw * (0.5 + t / 2), bh - 2.5, bw * 0.75, bh - 2);
  x.bezierCurveTo(bw * 0.75, bh - 2, bw * 0.78, bh - 1.5, bw * 0.50, bh - 2.5);
  x.closePath();
  x.fill();
  // gradient: brighter at the top edge, thinner wall below
  const g = x.createLinearGradient(bw * 0.45, 0, bw * 0.55, bh * 0.45);
  g.addColorStop(0, 'rgba(230,250,255,0.25)'); g.addColorStop(0.6, 'rgba(205,238,248,0.42)');
  g.addColorStop(1, 'rgba(175,225,242,0.12)');
  const outer = x.createLinearGradient(0, yTop, 0, bh * 0.7);
  outer.addColorStop(0, 'rgba(205,238,248,0.9)'); outer.addColorStop(0.75, 'rgba(175,225,242,0.75)');
  outer.addColorStop(1, 'rgba(150,205,220,0.5)');
  // Beading lip above the rim
  x.fillStyle = 'rgba(200,232,242,0.85)'; x.beginPath(); x.moveTo(bw * 0.20, yTop - 0.3); x.lineTo(bw * 0.30, yTop - be - 0.5); x.lineTo(bw * 0.80, yTop - be - 0.5); x.lineTo(bw * 0.90, yTop - 0.3); x.lineTo(bw * 0.50, yTop); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(150,200,215,0.9)'; x.lineWidth = Math.max(1, bw * 0.006); x.beginPath(); x.moveTo(bw * 0.55, yTop - be); x.lineTo(bw * 0.55, yTop - 0.5); x.stroke();
  // Reflection streak (light stripe near the left wall)
  x.fillStyle = g;
  x.beginPath(); x.moveTo(bw * 0.38, yTop + 8); x.lineTo(bw * 0.46, yTop + 3); x.lineTo(bw * 0.52, yTop + 40); x.lineTo(bw * 0.30, yTop + 45); x.closePath(); x.fill();
  // Mild highlight along the rim edge
  const rim = x.createLinearGradient(bw * 0.38, 0, bw * 0.62, 0);
  rim.addColorStop(0, 'rgba(235,250,255,0.6)'); rim.addColorStop(1, 'rgba(200,232,242,0.1)');
  x.fillStyle = rim; x.fillRect(bw * 0.38, yTop - 1.5, bw * 0.24, 1.6);
  // Bottom beading
  x.fillStyle = 'rgba(205,238,248,0.8)'; x.beginPath(); x.moveTo(bw * 0.22, bh - 3); x.bezierCurveTo(bw * 0.22, bh - 3 - bh * 0.006, bw * 0.5, bh - 3 - bh * 0.004, bw * 0.78, bh - 3); x.stroke();
}
export function glassSprite(kind, bw, bh) {
  return sprGet('glass|' + kind + '|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    const wall = Math.max(1.5, bw * 0.038);
    x.lineWidth = wall; x.strokeStyle = 'rgba(205,238,248,0.60)'; x.fillStyle = 'rgba(175,225,242,0.10)';
    const path = () => {
      x.beginPath();
      if (kind === 'flask') { const nw = bw * 0.30; x.moveTo(bw / 2 - nw / 2, 2); x.lineTo(bw / 2 + nw / 2, 2); x.lineTo(bw - 3, bh - 3); x.lineTo(3, bh - 3); x.closePath(); }
      else if (kind === 'roundflask') { x.moveTo(bw * 0.38, 2); x.lineTo(bw * 0.62, 2); x.lineTo(bw * 0.60, bh * 0.30); x.arc(bw / 2, bh * 0.62, bw * 0.40, -0.4, Math.PI + 0.4); x.lineTo(bw * 0.38, 2); }
      else if (kind === 'testtube') { x.moveTo(3, 2); x.lineTo(3, bh - bw / 2); x.arc(bw / 2, bh - bw / 2, bw / 2 - 3, Math.PI, 0, true); x.lineTo(bw - 3, 2); }
      else if (kind === 'funnel') { x.moveTo(2, 2); x.lineTo(bw - 2, 2); x.lineTo(bw * 0.56, bh * 0.55); x.lineTo(bw * 0.56, bh - 2); x.lineTo(bw * 0.44, bh - 2); x.lineTo(bw * 0.44, bh * 0.55); x.closePath(); }
      else if (kind.startsWith('lid')) { x.rect(1, bh * 0.30, bw - 2, bh * 0.34); }
      else if (kind.startsWith('beaker')) drawBeakerFlute(x, kind, bw, bh);
      else { x.rect(wall / 2 + 1, 2, bw - wall - 2, bh - 4); }
    };
    path(); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(2, 1, bw - 4, Math.max(1, wall * 0.5));
    x.fillStyle = 'rgba(220,245,252,0.62)'; x.fillRect(2, bh - Math.max(3, bh * 0.055), bw - 4, Math.max(2.5, bh * 0.05)); // visibly thicker base glass
    x.fillStyle = 'rgba(160,210,228,0.35)'; x.fillRect(2, bh - Math.max(3, bh * 0.055) - 1.5, bw - 4, 1.5); // base inner edge
    if (kind.startsWith('beaker')) { // pouring spout lip: small flared V at the rim
      x.fillStyle = 'rgba(215,242,250,0.8)'; x.beginPath(); x.moveTo(1, 3); x.lineTo(bw * 0.13, 0.5); x.lineTo(bw * 0.16, 3.5); x.lineTo(bw * 0.06, 2.2); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1; x.beginPath(); x.moveTo(1, 3); x.lineTo(bw * 0.13, 0.5); x.stroke();
    }
    const g = x.createLinearGradient(bw * 0.16, 0, bw * 0.30, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.34)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(bw * 0.16, 4, bw * 0.14, bh - 8);
    if (kind.startsWith('beaker') || kind === 'cylinder') {
      // graduations WITH numbers, baked into the sprite (scaled to the vessel)
      const unit = kind === 'cylinder' ? 10 : 50;
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '600 ' + Math.max(6, Math.round(bh * 0.052)) + 'px sans-serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
      for (let i = 1; i <= 5; i++) { const gy = bh - 4 - (bh - 10) * i / 6; x.fillRect(bw - wall - (i % 2 ? 7 : 11), gy, i % 2 ? 6 : 10, 1.2); x.fillText(String(i * unit), bw - wall - 13, gy); }
    }
    return c;
  });
}
export function burnerSprite(bw, bh) {
  return sprGet('burner|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    const cx = bw / 2;
    // Pedestal + base plate (the horizontal bit the beaker sits on)
    x.fillStyle = '#2c313a'; x.beginPath(); x.ellipse(cx, bh - bh * 0.10, bw * 0.46, bh * 0.11, 0, 0, 7); x.fill();
    x.fillStyle = '#4a5260'; x.beginPath(); x.ellipse(cx, bh - bh * 0.22, bw * 0.40, bh * 0.06, 0, 0, 7); x.fill();
    x.fillStyle = '#596270'; x.beginPath(); x.ellipse(cx, bh * 0.55, bw * 0.36, bh * 0.05, 0, 0, 7); x.fill();
    // Burner tube: vertical pipe with the hot nozzle
    x.fillStyle = '#3a4150'; x.beginPath(); x.ellipse(cx, bh * 0.47, bw * 0.42, bh * 0.025, 0, 0, 7); x.fill();
    x.fillStyle = '#596270'; x.beginPath(); x.ellipse(cx, bh * 0.42, bw * 0.34, bh * 0.03, 0, 0, 7); x.fill();
    // The outlet (rounded hole on top of the tube)
    x.fillStyle = '#2c313a'; x.beginPath(); x.ellipse(cx, bh * 0.33, bw * 0.30, bh * 0.012, 0, 0, 7); x.fill();
    // Burner ring (the hex ring around the chamber) with a swirly band
    x.strokeStyle = '#c7cedb'; x.lineWidth = Math.max(1.5, bh * 0.13);
    x.beginPath(); x.ellipse(cx, bh * 0.32, bw * 0.40, bh * 0.13, 0, 0, 7); x.stroke();
    x.strokeStyle = '#a2acc0'; x.lineWidth = Math.max(1.5, bh * 0.09); x.beginPath(); x.ellipse(cx, bh * 0.30, bw * 0.46, bh * 0.10); x.stroke();
    x.fillStyle = '#e0d4b8'; x.beginPath(); x.ellipse(cx, bh * 0.31, bw * 0.065, bh * 0.07, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(bw * 0.44, bh * 0.10, bw * 0.03, bh * 0.46); // pilot tube highlight
    return c;
  });
}
export function coilSprite(kind, bw, bh) {
  return sprGet('coil|' + kind + '|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    x.strokeStyle = kind === 'cooling-coil' ? '#7fd4f2' : '#e8e2d4'; x.lineWidth = Math.max(1.5, bh * 0.20); x.lineJoin = 'round';
    x.beginPath(); const seg = 6, sw = bw / seg;
    for (let i = 0; i <= seg; i++) { const px = i * sw, py = (i % 2 === 0) ? bh * 0.22 : bh * 0.78; if (i === 0) x.moveTo(px, py); else x.lineTo(px, py); }
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = Math.max(1, bh * 0.07); x.stroke();
    return c;
  });
}
export function flameFrame(i) {
  return sprGet('flame|' + i, () => {
    const W = 64, H = 96, c = mkC(W, H), x = c.getContext('2d');
    const lean = Math.sin(i * 1.7) * 3.5, hs = 0.90 + 0.10 * Math.sin(i * 2.3 + 1), ws = 1 + 0.07 * Math.sin(i * 3.1);
    const tear = (cx, base, w, h, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx - w / 2, base); x.bezierCurveTo(cx - w / 2, base - h * 0.45, cx - w * 0.14 + lean * 0.4, base - h * 0.8, cx + lean, base - h); x.bezierCurveTo(cx + w * 0.14 + lean * 0.4, base - h * 0.8, cx + w / 2, base - h * 0.45, cx + w / 2, base); x.closePath(); x.fill(); };
    tear(W / 2, H - 2, 44 * ws, 88 * hs, 'rgba(64,120,255,0.50)');
    tear(W / 2, H - 2, 27 * ws, 62 * hs, 'rgba(110,195,255,0.80)');
    tear(W / 2, H - 2, 13 * ws, 32 * hs, 'rgba(245,252,255,0.95)');
    return c;
  });
}
export function haloSprite() {
  return sprGet('halo', () => {
    const c = mkC(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(140,190,255,0.55)'); g.addColorStop(0.5, 'rgba(110,160,255,0.16)'); g.addColorStop(1, 'rgba(110,160,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  });
}
export function frostSprite(bw, bh) {
  return sprGet('frost|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    let sd = (bw * 131 + bh * 17) | 0; const rnd = () => { sd = (Math.imul(sd ^ (sd >>> 15), 2246822519) + 3266489917) | 0; return ((sd ^ (sd >>> 13)) >>> 0) / 4294967296; };
    x.strokeStyle = 'rgba(235,248,255,0.85)'; x.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      const cx = rnd() * bw, cy = rnd() * bh, a = rnd() * Math.PI * 2, L = 3 + rnd() * Math.min(9, bw * 0.2);
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
      x.moveTo(cx + Math.cos(a) * L * 0.55, cy + Math.sin(a) * L * 0.55); x.lineTo(cx + Math.cos(a + 0.7) * L * 0.8, cy + Math.sin(a + 0.7) * L * 0.8);
      x.moveTo(cx + Math.cos(a) * L * 0.55, cy + Math.sin(a) * L * 0.55); x.lineTo(cx + Math.cos(a - 0.7) * L * 0.8, cy + Math.sin(a - 0.7) * L * 0.8); x.stroke();
    }
    x.fillStyle = 'rgba(225,242,252,0.20)'; x.fillRect(0, 0, bw, bh);
    return c;
  });
}
const HEAT_TINTS = [null, 'rgba(190,45,0,0.28)', 'rgba(255,95,10,0.42)', 'rgba(255,175,45,0.55)'];
export function heatTinted(baseKey, sprite, band) {
  if (!sprite || band <= 0) return sprite;
  return sprGet('heat|' + baseKey + '|' + band, () => {
    const c = mkC(sprite.width, sprite.height), x = c.getContext('2d');
    x.drawImage(sprite, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = HEAT_TINTS[band]; x.fillRect(0, 0, c.width, c.height);
    return c;
  });
}
