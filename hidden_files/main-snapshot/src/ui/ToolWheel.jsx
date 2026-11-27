/* UI-A: floating tool wheel/cluster. The CURRENT tool is always visible
   on the collapsed button; one tap opens the wheel: primary ring first,
   every remaining tool in a scrolling secondary section. Selecting a tool
   calls the same setTool the side panel uses — one behaviour, two doors. */
import React, { useState } from 'react';

/* The brief's nine primary slots, mapped to REAL tool values from
   sandlab's TOOLS list. Note: Stir and Poke are one engine tool
   ('stir', labelled "Stir/Poke" in TOOLS — a drag stirs, a directional
   push pokes via engine.poke), so they share one wheel entry; Fill
   takes the ninth slot. No fake duplicate buttons. */
const PRIMARY = [
  ['paint', 'Paint'], ['spray', 'Spray'], ['eraser', 'Erase'], ['stir', 'Stir/Poke'],
  ['heat', 'Heat'], ['cool', 'Cool'], ['spark', 'Spark'], ['interact', 'Move gear'], ['fill', 'Fill'],
];

export default function ToolWheel({ tools, tool, onSelect }) {
  const [open, setOpen] = useState(false);
  const labelOf = (v) => (tools.find(([tv]) => tv === v) || [v, v])[1];
  const primaryVals = new Set(PRIMARY.map(([v]) => v));
  const secondary = tools.filter(([v]) => !primaryVals.has(v));
  const pick = (v) => { onSelect(v); setOpen(false); };
  return (
    <div className="ml-wheel" data-toolwheel="1">
      {open && (
        <div className="ml-wheel-pop glass" role="group" aria-label="Tools">
          <div className="seclabel">Tools</div>
          <div className="ml-wheel-grid">
            {PRIMARY.map(([v, l], i) => (
              <button key={v + i} type="button" className={`btn sm ${tool === v ? '' : 'ghost'}`} aria-label={l} aria-pressed={tool === v} onClick={() => pick(v)}>{l}</button>
            ))}
          </div>
          <div className="seclabel" style={{ marginTop: 8 }}>More tools</div>
          <div className="ml-wheel-more">
            {secondary.map(([v, l]) => (
              <button key={v} type="button" className={`btn sm ${tool === v ? '' : 'ghost'}`} aria-label={l} aria-pressed={tool === v} onClick={() => pick(v)}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <button type="button" className="ml-wheel-btn" aria-label={`Current tool: ${labelOf(tool)} — tap to change tool`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ml-wheel-cur">{labelOf(tool)}</span><span aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}
