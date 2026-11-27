/* UI-A: bottom dock + picker chip strip.
   Dock = 5 category tabs (Solids, Liquids, Gases, Lab Gear, Favourites)
   + Search. A tab opens the picker filtered to that category: a one-row
   horizontally scrolling chip strip (Recents first), expandable to the
   full grid sheet. Presentational — picking behaviour stays in sandlab. */
import React from 'react';
import { MiniTile } from '../tools/sandlab-tiles.jsx';

export const DOCK_TABS = [
  ['solids', 'Solids', 'Solids'],
  ['liquids', 'Liquids', 'Liquids'],
  ['gases', 'Gases', 'Gases'],
  ['gear', 'Lab Gear', 'Gear'],
  ['favs', 'Favourites', 'Favs'],
];

export function Dock({ active, onTab, onSearch }) {
  return (
    <nav className="ml-dock" data-dock="1" aria-label="Substance categories">
      {DOCK_TABS.map(([id, label, short]) => (
        <button key={id} type="button" className="ml-dock-tab" aria-label={label} aria-pressed={active === id} data-docktab={id} onClick={() => onTab(id)}>
          <span className="ml-dock-dot" data-tab={id} aria-hidden="true" />
          <span>{short}</span>
        </button>
      ))}
      <button type="button" className="ml-dock-tab" aria-label="Search substances" onClick={onSearch}>
        <span aria-hidden="true">🔍</span><span>Search</span>
      </button>
    </nav>
  );
}

/* One-row chip strip: recents first, then the category items. */
export function PickerStrip({ title, recents, items, colsOf, selId, onPick, onInfo, expanded, onToggleExpand }) {
  const seen = new Set();
  const ordered = [...(recents || []), ...(items || [])].filter((s) => s && !seen.has(s.id) && seen.add(s.id));
  return (
    <div data-dockpanel="1">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="seclabel" style={{ flex: 1 }}>{title}</div>
        <button type="button" className="btn ghost sm" aria-label={expanded ? 'Collapse to chip strip' : 'Expand to full grid'} onClick={onToggleExpand}>{expanded ? 'Show strip' : 'Expand grid'}</button>
      </div>
      {!expanded ? (
        <div className="ml-chipstrip" role="list" aria-label={title}>
          {ordered.slice(0, 80).map((s) => <MiniTile key={s.id} s={s} cols={colsOf(s.id)} selected={s.id === selId} onPick={onPick} onInfo={onInfo} />)}
          {ordered.length === 0 && <span className="dim sm">{/favourite/i.test(title) ? 'No favourites yet — long-press any substance, then tap ★ Favourite on its card.' : 'Nothing here yet.'}</span>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 10, marginTop: 8 }}>
          {ordered.slice(0, 160).map((s) => <MiniTile key={s.id} s={s} cols={colsOf(s.id)} selected={s.id === selId} onPick={onPick} onInfo={onInfo} />)}
        </div>
      )}
      <p className="dim sm" style={{ margin: '6px 0 0' }}>Long-press a chip = details</p>
    </div>
  );
}
