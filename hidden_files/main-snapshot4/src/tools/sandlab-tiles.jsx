/* UI-A split: substance tile components (extracted verbatim from sandlab.jsx).
   Tile = full picker tile; MiniTile = compact chip-strip tile. Long-press
   (550ms) opens the info card; a fired long-press suppresses the click. */
import React, { useRef } from 'react';

export function Tile({ s, cols, selected, onPick, onInfo }) {
  cols = cols || [[136,136,136],[170,170,170]];
  const lp = useRef(null); const fired = useRef(false);
  const grad = `linear-gradient(135deg, rgb(${cols[0].join(',')}), rgb(${cols[1].join(',')}))`;
  return (
    <div role="button" tabIndex={0} data-tile={s.key} aria-label={s.name}
      onClick={() => { if (fired.current) { fired.current = false; return; } onPick(s); }}
      onPointerDown={() => { fired.current = false; lp.current = setTimeout(() => { fired.current = true; onInfo(s); }, 550); }}
      onPointerUp={() => clearTimeout(lp.current)} onPointerLeave={() => clearTimeout(lp.current)}
      style={{ cursor: 'pointer', minWidth: 0 }}>
      <div style={{ height: 48, borderRadius: 11, background: grad, border: selected ? '2px solid var(--cyan)' : '1px solid var(--line)', boxShadow: selected ? '0 0 0 2px var(--cyan), var(--sh-1, 0 2px 8px rgba(0,0,0,.35))' : 'inset 0 1px 0 rgba(255,255,255,.18)' }} />
      <div className="sm" style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.name}</div>
    </div>
  );
}
export function MiniTile({ s, cols, selected, onPick, onInfo }) {
  cols = cols || [[136,136,136],[170,170,170]];
  const lp = useRef(null); const fired = useRef(false);
  const grad = `linear-gradient(135deg, rgb(${cols[0].join(',')}), rgb(${cols[1].join(',')}))`;
  return (
    <div role="button" data-tile={s.key} aria-label={s.name}
      onClick={() => { if (fired.current) { fired.current = false; return; } onPick(s); }}
      onPointerDown={() => { fired.current = false; lp.current = setTimeout(() => { fired.current = true; onInfo(s); }, 550); }}
      onPointerUp={() => clearTimeout(lp.current)} onPointerLeave={() => clearTimeout(lp.current)}
      style={{ cursor: 'pointer', flex: '0 0 auto', width: 64 }}>
      <div style={{ height: 40, borderRadius: 9, background: grad, border: selected ? '2px solid var(--cyan)' : '1px solid var(--line)' }} />
      <div className="sm" style={{ marginTop: 3, fontSize: 10, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.name}</div>
    </div>
  );
}
