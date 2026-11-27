/* Matter Lab Ultra — Winzy-style right-side glass settings rail.
   FEEL fix12 wiring repair: main's panels.css ships the rail styling under
   `.mz-shell` + `[data-open="1"]` (fixed, off-canvas translateX(100%) when
   closed), but this component rendered class "toolwrap" with the name only
   as an id — no positioning matched, so the SETTINGS panel rendered in
   normal flow, always visible, covering the world. The markup now uses the
   classes the shipped CSS expects; content is unchanged. When `open` is
   undefined (App.jsx mounts it conditionally), mounted means open. */
export default function GlassShell({ open, setGlass }) {
  const isOpen = open === undefined ? true : !!open;
  return (
    <div className="mz-shell" data-open={isOpen ? '1' : undefined} id="mz-shell">
      <div className="mz-shell-hdr">
        <span className="mz-shell-title">SETTINGS</span>
        <button className="close" onClick={() => setGlass(false)}>X</button>
      </div>
      <div className="body" id="mz-scroll">
        <div className="glass"><span>Fast (fire off)</span><span>Default</span></div>
        <div className="glass"><span>Dense Piping</span><span>Off</span></div>
        <div className="glass"><span>Thin Borders</span><span>Off</span></div>
        <div className="glass"><span>Vignette</span><span>Off</span></div>
        <div className="glass"><span>Tile Scale</span><span>Auto</span></div>
      </div>
      <div className="body"><button className="close" onClick={() => setGlass(false)}>Close</button></div>
    </div>
  );
}
