import { useEffect } from 'react';

/* Matter Lab Ultra — Winzy-style right-side glass settings rail. */
export default function GlassShell({ setGlass }) {
  useEffect(() => {
    try { if (localStorage.getItem('mzOpen') === '0') setGlass(false); } catch { /* noop */ }
  }, [setGlass]);
  return (
    <div className="mz-shell" data-open="1">
      <div className="mz-shell-hdr"><span className="mz-shell-title">SETTINGS</span></div>
      <div className="mz-scroll" id="mz-scroll">
        <div className="mz-card"><div className="mz-card-row"><span className="mz-card-label">Fast (fire off)</span><span className="mz-card-value">Default</span></div></div>
        <div className="mz-card"><div className="mz-card-row"><span className="mz-card-label">Dense Piping</span><span className="mz-card-value">Off</span></div></div>
        <div className="mz-card"><div className="mz-card-row"><span className="mz-card-label">Thin Borders</span><span className="mz-card-value">Off</span></div></div>
        <div className="mz-card"><div className="mz-card-row"><span className="mz-card-label">Vignette</span><span className="mz-card-value">Off</span></div></div>
        <div className="mz-card"><div className="mz-card-row"><span className="mz-card-label">Tile Scale</span><span className="mz-card-value">Auto</span></div></div>
      </div>
      <button className="mz-open-btn" data-open="1" />
    </div>
  );
}
