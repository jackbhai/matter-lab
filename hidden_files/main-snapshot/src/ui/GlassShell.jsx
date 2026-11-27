
/* Matter Lab Ultra — Winzy-style right-side glass settings rail. */
export default function GlassShell({ open, setGlass }) {
  return (
    <div className={`toolwrap${open ? ' open' : ''}`} id="mz-shell" style={{ left: open ? 0 : undefined }}>
      <div className="top">
        <h1>SETTINGS</h1>
        <button className="close" onClick={() => setGlass(false)}>X</button>
      </div>
      <div className="body" id="mz-scroll">
        <div className="glass"><span>Fast (fire off)</span><span>Default</span></div>
        <div className="glass"><span>Dense Piping</span><span>Off</span></div>
        <div className="glass"><span>Thin Borders</span><span>Off</span></div>
        <div className="glass"><span>Vignette</span><span>Off</span></div>
        <div className="glass"><span>Tile Scale</span><span>Auto</span></div>
      </div>
      <div className="body"><button className="close">Close</button></div>
    </div>
  );
}
