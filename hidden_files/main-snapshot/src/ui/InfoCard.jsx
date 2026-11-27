/* UI-A: substance info card (long-press a tile/chip to open). Presentational
   shell extracted from sandlab.jsx — data + handlers arrive as props;
   the "Reacts with…" profile block is passed through as children. */
import React from 'react';
import { Icon } from './icons';

export default function InfoCard({ rec, rgb, isFav, onToggleFav, onClose, onUse, children }) {
  if (!rec) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" data-infocard="1" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 20, height: 20, borderRadius: 5, background: `rgb(${rgb.join(',')})` }} />
          <b style={{ flex: 1 }}>{rec.name}{rec.formula ? ` · ${rec.formula}` : ''}</b>
          <button type="button" className="btn ghost sm" aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'} onClick={onToggleFav}>{isFav ? '★ Favourite' : '☆ Favourite'}</button>
          <button type="button" className="btn ghost sm" aria-label="Close details" onClick={onClose}><Icon n="x" size={14} /></button>
        </div>
        <p className="sm" style={{ margin: '10px 0 0' }}>{rec.desc || 'No description.'}</p>
        <p className="dim sm" style={{ margin: '8px 0 0', lineHeight: 1.7 }}>
          Class: {rec.cls} · Density: {rec.density}
          {rec.meltPoint != null ? ` · Melts ${rec.meltPoint}°C` : ''}{rec.boilPoint != null ? ` · Boils ${rec.boilPoint}°C` : ''}
          {rec.ph != null ? ` · pH ${rec.ph}` : ''}
          <br />Burns: {rec.flammability > 0 ? `yes${rec.ignitionTemp != null ? ` (ignites ${rec.ignitionTemp}°C)` : ''}` : 'no'} · Conducts heat: {Math.round((rec.conductivity || 0) * 100)}% · Conducts electricity: {Math.round((rec.electric || 0) * 100)}%
        </p>
        {children}
        <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={onUse}>Use {rec.name}</button>
      </div>
    </div>
  );
}
