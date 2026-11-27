/* UI-A split: gear sprite painters (extracted verbatim from sandlab.jsx).
   Sprites are baked once per (kind,bucketed size) into offscreen canvases;
   the render loop only blits. Glass sprites carry the reflection streak +
   numbered graduations. */

const SPR = new Map();
const mkC = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const sprGet = (key, maker) => { let v = SPR.get(key); if (!v) { try { v = maker(); } catch { v = null; } if (v) SPR.set(key, v); } return v; };
export const bucket = (v) => Math.max(12, Math.round(v / 8) * 8);
export function glassSprite(kind, bw, bh) {
  return sprGet('glass|' + kind + '|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    const wall = Math.max(1.5, bw * 0.038);
    x.lineWidth = wall; x.strokeStyle = 'rgba(215,244,252,0.95)'; x.fillStyle = 'rgba(175,225,242,0.16)';
    const path = () => {
      x.beginPath();
      if (kind === 'flask') { const nw = bw * 0.30; x.moveTo(bw / 2 - nw / 2, 2); x.lineTo(bw / 2 + nw / 2, 2); x.lineTo(bw - 3, bh - 3); x.lineTo(3, bh - 3); x.closePath(); }
      else if (kind === 'roundflask') { x.moveTo(bw * 0.38, 2); x.lineTo(bw * 0.62, 2); x.lineTo(bw * 0.60, bh * 0.30); x.arc(bw / 2, bh * 0.62, bw * 0.40, -0.4, Math.PI + 0.4); x.lineTo(bw * 0.38, 2); }
      else if (kind === 'testtube') { x.moveTo(3, 2); x.lineTo(3, bh - bw / 2); x.arc(bw / 2, bh - bw / 2, bw / 2 - 3, Math.PI, 0, true); x.lineTo(bw - 3, 2); }
      else if (kind === 'funnel') { x.moveTo(2, 2); x.lineTo(bw - 2, 2); x.lineTo(bw * 0.56, bh * 0.55); x.lineTo(bw * 0.56, bh - 2); x.lineTo(bw * 0.44, bh - 2); x.lineTo(bw * 0.44, bh * 0.55); x.closePath(); }
      else if (kind.startsWith('lid')) { x.rect(1, bh * 0.30, bw - 2, bh * 0.34); }
      else { x.rect(wall / 2 + 1, 2, bw - wall - 2, bh - 4); }
    };
    path(); x.fill();
    /* FEEL fix10: dark outer keyline first so the glass silhouette reads
       instantly against the black world, then the bright rim on top. */
    x.save(); x.lineWidth = wall + 2.2; x.strokeStyle = 'rgba(6,14,20,0.85)'; x.stroke(); x.restore();
    x.lineWidth = wall; x.strokeStyle = 'rgba(215,244,252,0.95)'; x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.fillRect(2, 1, bw - 4, Math.max(1.4, wall * 0.6));
    x.fillStyle = 'rgba(200,240,252,0.55)'; x.fillRect(bw - 4, 3, 2, bh - 6); // right-edge rim light
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
      x.fillStyle = 'rgba(255,255,255,1)'; x.font = '700 ' + Math.max(7, Math.round(bh * 0.068)) + 'px sans-serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
      for (let i = 1; i <= 5; i++) { const gy = bh - 4 - (bh - 10) * i / 6; x.fillRect(bw - wall - (i % 2 ? 8 : 12), gy, i % 2 ? 7 : 11, 1.6); x.fillText(String(i * unit), bw - wall - 14, gy); }
    }
    return c;
  });
}
export function burnerSprite(bw, bh) {
  return sprGet('burner|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    x.fillStyle = '#14181f'; x.beginPath(); x.ellipse(bw / 2, bh - bh * 0.10, bw * 0.48, bh * 0.12, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(230,238,248,0.85)'; x.beginPath(); x.ellipse(bw / 2, bh - bh * 0.16, bw * 0.46, bh * 0.05, 0, 0, 7); x.fill(); // base rim light
    x.fillStyle = '#7d8798'; x.fillRect(bw * 0.28, bh * 0.55, bw * 0.44, bh * 0.36);
    x.fillStyle = '#aeb8c8'; x.fillRect(bw * 0.28, bh * 0.55, bw * 0.44, bh * 0.07); // body top edge
    const g = x.createLinearGradient(bw * 0.40, 0, bw * 0.60, 0); g.addColorStop(0, '#8b95a6'); g.addColorStop(0.5, '#e8eef7'); g.addColorStop(1, '#8b95a6');
    x.fillStyle = g; x.fillRect(bw * 0.40, bh * 0.08, bw * 0.20, bh * 0.54);
    x.fillStyle = '#2e3541'; x.fillRect(bw * 0.35, bh * 0.44, bw * 0.30, bh * 0.11);
    x.fillStyle = '#d9a514'; x.fillRect(bw * 0.05, bh * 0.64, bw * 0.28, bh * 0.11); // brass gas tap
    x.fillStyle = '#f4c542'; x.beginPath(); x.arc(bw * 0.13, bh * 0.695, Math.max(1.2, bw * 0.035), 0, 7); x.fill(); // tap knob glint
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(bw * 0.455, bh * 0.10, bw * 0.035, bh * 0.48);
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
