/* UI-A: main-screen top bar. One home for the global chrome — Home,
   Undo/Redo, Pause, Speed, Menu — every control labelled, ≥44px targets.
   Presentational only: all behaviour is passed in as props (single source
   of behaviour stays in sandlab.jsx). */
import React from 'react';

export default function TopBar({ onHome, onUndo, onRedo, paused, onTogglePause, speedLabel, onCycleSpeed, onMenu, menuBadge, stats }) {
  return (
    <div className="ml-topbar2" data-topbar="1">
      {onHome && <button type="button" className="ml-tb-btn" aria-label="Home" onClick={onHome}>⌂<span>Home</span></button>}
      <button type="button" className="ml-tb-btn" aria-label="Undo" onClick={onUndo}>↩<span>Undo</span></button>
      <button type="button" className="ml-tb-btn" aria-label="Redo" onClick={onRedo}>↪<span>Redo</span></button>
      <button type="button" className="ml-tb-btn" aria-label={paused ? 'Play' : 'Pause'} aria-pressed={paused} onClick={onTogglePause}>{paused ? '▶' : '❚❚'}<span>{paused ? 'Play' : 'Pause'}</span></button>
      <button type="button" className="ml-tb-btn" aria-label={`Speed ${speedLabel} — tap to change speed`} onClick={onCycleSpeed}>⏩<span>{speedLabel}</span></button>
      {stats && <span className="ml-tb-stats" aria-hidden="true">{stats}</span>}
      <span style={{ flex: 1 }} />
      <button type="button" className="ml-tb-btn" aria-label={menuBadge ? `Menu — ${menuBadge} new reaction messages` : 'Menu'} onClick={onMenu} style={{ position: 'relative' }}>☰<span>Menu</span>{menuBadge ? <span className="ml-tb-badge" aria-hidden="true">{menuBadge > 99 ? '99+' : menuBadge}</span> : null}</button>
    </div>
  );
}
