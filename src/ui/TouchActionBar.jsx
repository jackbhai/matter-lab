import React from 'react';
import { TOUCH_LEVELS, normalizeTouchLevel } from '../core/touch-controls.js';

/** Compact, thumb-reachable actions shown on narrow/coarse-pointer layouts. */
export default function TouchActionBar({ level, brush, onBrushChange, onUndo, onRedo, onOpenTouchSettings }) {
  const active = normalizeTouchLevel(level);
  const profile = TOUCH_LEVELS[active];
  const changeBrush = (delta) => onBrushChange((current) => Math.max(1, Math.min(64, current + delta)));
  return (
    <div className="ml-touchbar glass" role="toolbar" aria-label="Quick touch controls" data-touchbar="1">
      <button type="button" className="btn ghost sm" aria-label="Undo last action" title="Undo" onClick={onUndo}>↶ <span>Undo</span></button>
      <button type="button" className="btn ghost sm" aria-label="Decrease brush size" title="Smaller brush" onClick={() => changeBrush(-1)}>−</button>
      <span className="ml-touchbar-brush" aria-live="polite">Brush {brush}</span>
      <button type="button" className="btn ghost sm" aria-label="Increase brush size" title="Larger brush" onClick={() => changeBrush(1)}>＋</button>
      <button type="button" className="btn ghost sm" aria-label="Redo last action" title="Redo" onClick={onRedo}>↷ <span>Redo</span></button>
      <button type="button" className="btn sm ml-touchbar-level" aria-label={`Touch level ${profile.label}. Open touch settings`} title={profile.description} onClick={onOpenTouchSettings}>{profile.shortLabel} <span>Touch</span></button>
    </div>
  );
}
