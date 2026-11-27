/* UI-A split: gear sprite painters (extracted verbatim from sandlab.jsx).
   Sprites are baked once per (kind,bucketed size) into offscreen canvases;
   the render loop only blits. Glass sprites carry the reflection streak +
   numbered graduations. */

const SPR = new Map();
const mkC = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const sprGet = (key, maker) => { let v = SPR.get(key); if (!v) { try { v = maker(); } catch { v = null; } if (v) SPR.set(key, v); } return v; };
export const bucket = (v) => Math.max(12, Math.round(v / 8) * 8);
/* A real laboratory beaker: FLARED open rim + near-straight walls +
   thick flat base, with numbered graduations (drawn by glassSprite).
   PHONE-FIX: rewritten as a clean silhouette path — the old flute path
   was self-intersecting and rendered as a bell-shaped ghost outline
   inside the vessel; the user's target drawing asks for exactly this
   shape (flared rim/spout at top, graduations down the side). Pure
   path: glassSprite fills/strokes it and adds the spout lip on top. */
function drawBeakerFlute(x, kind, bw, bh) {
  const yTop = Math.max(2, bh * 0.015);
  const yBot = bh - Math.max(2, bh * 0.012);
  const flare = bw * 0.022;                    // rim flares out past the walls
  const xLT = bw * 0.048, xLB = bw * 0.024;    // left wall: top / bottom
  const xRT = bw - xLT, xRB = bw - xLB;
  const rimBot = yTop + Math.max(3, bh * 0.05);
  const r = Math.max(2, Math.min(7, bw * 0.03, bh * 0.03));
  x.beginPath();
  x.moveTo(xLT - flare, yTop);
  x.lineTo(xLT, rimBot);
  x.lineTo(xLB, yBot - r);
  x.quadraticCurveTo(xLB, yBot, xLB + r, yBot);
  x.lineTo(xRB - r, yBot);
  x.quadraticCurveTo(xRB, yBot, xRB, yBot - r);
  x.lineTo(xRT, rimBot);
  x.lineTo(xRT + flare, yTop);
  x.closePath();
}
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
      else if (kind.startsWith('beaker')) drawBeakerFlute(x, kind, bw, bh);
      else { x.rect(wall / 2 + 1, 2, bw - wall - 2, bh - 4); }
    };
    path(); x.fill();
    /* FEEL fix10: dark outer keyline first so the glass silhouette reads
       instantly against the black world, then the bright rim on top. */
    x.save(); x.lineWidth = wall + 2.2; x.strokeStyle = 'rgba(6,14,20,0.85)'; x.stroke(); x.restore();
    x.lineWidth = wall; x.strokeStyle = 'rgba(215,244,252,0.95)'; x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.fillRect(2, 1, bw - 4, Math.max(1.4, wall * 0.6));
    x.fillStyle = 'rgba(200,240,252,0.55)'; x.fillRect(bw - 4, 3, 2, bh - 6); // right-edge rim light
    /* FEEL fix12: double-edge wall — a second, inset stroke so the glass
       reads THICK-walled (outer rim + inner wall line), not a hairline;
       plus a hard specular core inside the soft streak below. */
    x.save(); x.translate(bw / 2, bh / 2); x.scale(0.90, 0.94); x.translate(-bw / 2, -bh / 2);
    path(); x.lineWidth = Math.max(1, wall * 0.55); x.strokeStyle = 'rgba(170,220,238,0.50)'; x.stroke(); x.restore();
    x.fillStyle = 'rgba(255,255,255,0.30)'; x.fillRect(bw * 0.205, 5, Math.max(1.2, bw * 0.022), Math.max(4, bh - 12));
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
      const tickS = Math.max(5, bw * 0.032), tickL = Math.max(8, bw * 0.052);
      x.fillStyle = 'rgba(255,255,255,1)'; x.font = '700 ' + Math.max(7, Math.round(bh * 0.068)) + 'px sans-serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
      for (let i = 1; i <= 5; i++) { const gy = bh - 4 - (bh - 10) * i / 6; const tk = i % 2 ? tickS : tickL; x.fillRect(bw - wall - tk - 2, gy, tk, Math.max(1.6, bh * 0.006)); x.fillText(String(i * unit), bw - wall - tk - 6, gy); }
    }
    return c;
  });
}
export function burnerSprite(bw, bh) {
  return sprGet('burner|' + bw + '|' + bh, () => {
    const c = mkC(bw, bh), x = c.getContext('2d');
    /* FEEL fix12 (builds on PR #1's composition — pedestal base, barrel,
       top ring): redrawn with real metal form. A horizontal light gradient
       across the barrel gives cylindrical shading (dark edges, bright
       off-centre band = brushed steel), the base plate gets a lit top face
       + dark front face, and a control knob + gas inlet make it read as
       lab equipment, not an icon. Render-side overdraw (see sandlab.jsx)
       gives the body presence beyond its 16-cell stamp; geometry is
       untouched. */
    const cx = bw / 2;
    // ground shadow / keyline (fix10, kept)
    x.fillStyle = 'rgba(3,6,9,0.85)'; x.beginPath(); x.ellipse(cx, bh * 0.96, bw * 0.50, bh * 0.09, 0, 0, 7); x.fill();
    // base plate: lit top face + dark front face
    const baseG = x.createLinearGradient(0, bh * 0.76, 0, bh * 0.99);
    baseG.addColorStop(0, '#7d8593'); baseG.addColorStop(0.25, '#4b525d'); baseG.addColorStop(1, '#22262d');
    x.fillStyle = baseG;
    x.beginPath(); x.moveTo(bw * 0.03, bh * 0.80); x.lineTo(bw * 0.97, bh * 0.80); x.lineTo(bw * 0.93, bh * 0.99); x.lineTo(bw * 0.07, bh * 0.99); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.65)'; x.fillRect(bw * 0.03, bh * 0.785, bw * 0.94, Math.max(1, bh * 0.035)); // plate top edge light
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(bw * 0.07, bh * 0.955, bw * 0.86, Math.max(1, bh * 0.03)); // plate underside shade
    // base bolts
    x.fillStyle = '#aeb6c2'; x.beginPath(); x.arc(bw * 0.13, bh * 0.885, Math.max(0.8, bw * 0.028), 0, 7); x.arc(bw * 0.87, bh * 0.885, Math.max(0.8, bw * 0.028), 0, 7); x.fill();
    // barrel: cylindrical brushed-metal gradient
    const bg = x.createLinearGradient(bw * 0.34, 0, bw * 0.66, 0);
    bg.addColorStop(0, '#20242b'); bg.addColorStop(0.30, '#59626f'); bg.addColorStop(0.48, '#c3cad4'); bg.addColorStop(0.62, '#78818e'); bg.addColorStop(1, '#191d23');
    x.fillStyle = bg; x.fillRect(bw * 0.34, bh * 0.30, bw * 0.32, bh * 0.52);
    // brushed lines on the barrel
    x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(bw * 0.34, bh * 0.44, bw * 0.32, 1); x.fillRect(bw * 0.34, bh * 0.60, bw * 0.32, 1);
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(bw * 0.34, bh * 0.52, bw * 0.32, 1); x.fillRect(bw * 0.34, bh * 0.70, bw * 0.32, 1);
    // gas inlet stub (left of barrel base)
    x.fillStyle = '#3a4049'; x.fillRect(bw * 0.20, bh * 0.68, bw * 0.15, bh * 0.075);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(bw * 0.20, bh * 0.68, bw * 0.15, 1);
    // control knob (right of barrel): radial metal + notch
    const kg = x.createRadialGradient(bw * 0.815, bh * 0.60, 0.5, bw * 0.815, bh * 0.62, bw * 0.115);
    kg.addColorStop(0, '#d7dde6'); kg.addColorStop(0.6, '#79828f'); kg.addColorStop(1, '#2c3038');
    x.fillStyle = kg; x.beginPath(); x.arc(bw * 0.815, bh * 0.62, Math.max(1.2, bw * 0.105), 0, 7); x.fill();
    x.strokeStyle = 'rgba(10,12,16,0.8)'; x.lineWidth = Math.max(1, bw * 0.02);
    x.beginPath(); x.moveTo(bw * 0.815, bh * 0.62); x.lineTo(bw * 0.815, bh * 0.525); x.stroke();
    // collar under the ring
    const cg = x.createLinearGradient(bw * 0.30, 0, bw * 0.70, 0);
    cg.addColorStop(0, '#2a2f37'); cg.addColorStop(0.45, '#aeb6c2'); cg.addColorStop(1, '#23272e');
    x.fillStyle = cg; x.fillRect(bw * 0.30, bh * 0.235, bw * 0.40, bh * 0.085);
    // top ring (PR): bright rim the flame sits in + dark jet hole
    x.strokeStyle = '#d5dbe6'; x.lineWidth = Math.max(1.5, bh * 0.11);
    x.beginPath(); x.ellipse(cx, bh * 0.20, bw * 0.335, bh * 0.105, 0, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(90,98,112,0.9)'; x.lineWidth = Math.max(1, bh * 0.05);
    x.beginPath(); x.ellipse(cx, bh * 0.225, bw * 0.335, bh * 0.105, 0, 0, 7); x.stroke();
    x.fillStyle = '#101216'; x.beginPath(); x.ellipse(cx, bh * 0.20, bw * 0.20, bh * 0.06, 0, 0, 7); x.fill();
    x.fillStyle = '#e8dfc8'; x.beginPath(); x.ellipse(cx, bh * 0.20, bw * 0.055, bh * 0.045, 0, 0, 7); x.fill(); // jet core
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
