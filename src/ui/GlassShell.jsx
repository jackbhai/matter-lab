
import { useEffect } from 'react';

/* Matter Lab Ultra — Winzy-style right-side glass settings rail.
   Opened via a fired flag (window.__mzOpenSetByFire) or localStorage. */
let __mzOpenFired = false;
export const openGlassShell = () => { __mzOpenFired = true; try { globalThis.dispatchEvent(new Event('mzShellOpen')); } catch { /* noop */ } };

export default function GlassShell({ setGlass }) {
  useEffect(() => {
    try {
      if (localStorage.getItem('mzOpen') === '0') setGlass(false);
      const onFired = () => { setGlass(true); try { localStorage.setItem('mzOpen', '1'); } catch { /* noop */ } };
      globalThis.addEventListener('mzShellOpen', onFired);
      return () => { try { globalThis.removeEventListener('mzShellOpen', onFired); } catch { /* noop */ } };
    } catch { /* noop */ }
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
