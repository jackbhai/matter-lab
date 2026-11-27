/* REDESIGN (brief pt.8): the substance picker sheet, extracted from
   sandlab.jsx into its own component (the brief's "Picker" piece) —
   search, create-a-substance, Lab Gear grid with vessel sizes, the
   dock-filtered chip strip / grid, favourites + recents, category
   accordions and customs. Presentational: state and handlers arrive
   as props; behaviour stays single-sourced in sandlab.jsx. */
import React from 'react';
import { SUBSTANCES, BY_KEY, CATS } from '../core/matter-elements.js';
import { GEAR } from '../core/matter-engine.js';
import { Empty } from './kit.jsx';
import { Icon } from './icons.jsx';
import { PickerStrip } from './Dock.jsx';
import { MiniTile } from '../tools/sandlab-tiles.jsx';

export default function Picker({ open, onClose, dockTab, setDockTab, searchHits, query, setQuery, showCreate, setShowCreate, cf, setCf, addCustom, customs, lsGet, customsKey, removeCustom, tileGrid, gearVis, placeGear, vesselSize, setVesselSize, recent, cols, selId, pickAndClose, onInfo, dockItems, dockExpanded, setDockExpanded, favs, openCat, setOpenCat, catItems, ensureCols }) {
  if (!open) return null;
  return (
  <div className="sheet-bg" onClick={() => onClose()}>
    <div className="sheet" data-panel="tiles" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '60vh', overflowY: 'auto', width: '100%' }}>
      <div className="sheet-handle" />
      <div className="ml-picker-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b className="ml-picker-title" style={{ flex: 1 }}>Substances &amp; items</b>
        <button className="btn ghost sm" aria-label="Close picker" onClick={() => onClose()}><Icon n="x" size={14} /></button>
        <span className="dim sm ml-picker-hint">Long-press a tile = details</span>
      </div>
      {dockTab && !searchHits && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <span className="chip">Showing: {dockTab === 'gear' ? 'Lab Gear' : dockTab[0].toUpperCase() + dockTab.slice(1)}</span>
          <button className="btn ghost sm" onClick={() => setDockTab(null)}>Show all categories</button>
        </div>
      )}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, formula, alias (ret, paani, namak…)"
        style={{ width: '100%', margin: '10px 0', padding: '9px 10px', borderRadius: 10, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`btn sm ${showCreate ? '' : 'ghost'}`} onClick={() => setShowCreate((v) => !v)}>Create substance</button>
        {customs.length > 0 && <span className="chip">Custom: {customs.length}</span>}
      </div>
      {showCreate && (
        <div className="glass" style={{ padding: 10, borderRadius: 12, marginBottom: 12 }}>
          <b className="sm">Create a custom substance</b>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <label className="sm" style={{ gridColumn: '1 / -1' }}>Name<input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} placeholder="e.g. Dragon Dust" style={{ width: '100%', marginTop: 4, padding: '7px 8px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }} /></label>
            <label className="sm">State<select value={cf.cls} onChange={(e) => setCf({ ...cf, cls: e.target.value })} style={{ width: '100%', marginTop: 4, padding: '7px 8px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }}><option value="powder">Powder</option><option value="liquid">Liquid</option><option value="gas">Gas</option><option value="solid">Solid</option></select></label>
            <label className="sm">Colour<input type="color" value={cf.colour} onChange={(e) => setCf({ ...cf, colour: e.target.value })} style={{ width: '100%', marginTop: 4, height: 34 }} /></label>
            <label className="sm">Density {cf.density}<input type="range" min={0.05} max={8} step={0.05} value={cf.density} onChange={(e) => setCf({ ...cf, density: Number(e.target.value) })} style={{ width: '100%' }} /></label>
            <label className="sm">Flammability {cf.flammability}<input type="range" min={0} max={1} step={0.05} value={cf.flammability} onChange={(e) => setCf({ ...cf, flammability: Number(e.target.value) })} style={{ width: '100%' }} /></label>
            <label className="sm">Acidity {cf.acidity}<input type="range" min={0} max={1} step={0.05} value={cf.acidity} onChange={(e) => setCf({ ...cf, acidity: Number(e.target.value) })} style={{ width: '100%' }} /></label>
            <label className="sm">pH {cf.ph}<input type="range" min={0} max={14} step={0.5} value={cf.ph} onChange={(e) => setCf({ ...cf, ph: Number(e.target.value) })} style={{ width: '100%' }} /></label>
            <label className="sm">Solubility {cf.solubility}<input type="range" min={0} max={1} step={0.05} value={cf.solubility} onChange={(e) => setCf({ ...cf, solubility: Number(e.target.value) })} style={{ width: '100%' }} /></label>
            <label className="sm">Boiling point °C (optional)<input type="number" value={cf.boil} onChange={(e) => setCf({ ...cf, boil: e.target.value })} style={{ width: '100%', marginTop: 4, padding: '7px 8px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }} /></label>
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={addCustom}>Add substance</button>
          {(() => { const saved = lsGet(customsKey, []); if (!Array.isArray(saved) || !saved.length) return null; return (<div style={{ marginTop: 10 }}><div className="seclabel">Saved customs</div>{saved.map((d, i) => (<div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5 }}><span className="sm" style={{ flex: 1 }}>{d.name}</span><button className="btn ghost sm" onClick={() => removeCustom(d)}>Remove</button></div>))}</div>); })()}
        </div>
      )}
      {searchHits ? (
        searchHits.length ? tileGrid(searchHits.slice(0, 120)) : <Empty t="No substance matches that search" icon="search" />
      ) : dockTab === 'gear' ? (
        <div style={{ marginTop: 10 }}>
          <div className="seclabel">Lab Gear — items (not substances)</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }} role="group" aria-label="Vessel size">
            <span className="dim sm">Vessel size — applies to flasks, tubes, cylinders and funnels when placed. Beakers, lids and burners use their own sizes below.</span>
            {['S', 'M', 'L', 'XL'].map((v) => (
              <button key={v} className={`btn sm ${vesselSize === v ? '' : 'ghost'}`} onClick={() => setVesselSize(v)}>{v}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 10, marginTop: 8 }}>
            {GEAR.map((g) => { const vis = gearVis[g.kind]; return (
              <div key={g.kind} role="button" data-gear={g.kind} aria-label={g.name} onClick={() => { placeGear(g.kind); onClose(); }} style={{ cursor: 'pointer', minWidth: 0 }}>
                <div style={{ height: 48, borderRadius: 11, background: vis ? vis.bg : 'linear-gradient(135deg, var(--s3), var(--s2))', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', position: 'relative' }}>
                  {vis ? <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.5, color: vis.fg || '#fff', textShadow: vis.fg ? 'none' : '0 1px 3px rgba(0,0,0,.55)' }}>{vis.label2}</span> : <Icon n="flask" size={20} />}
                  <span className="chip" style={{ position: 'absolute', top: 3, right: 3, fontSize: 8, padding: '1px 4px' }}>Item</span>
                </div>
                <div className="sm" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.25 }}>{g.name}</div>
              </div>
            ); })}
          </div>
        </div>
      ) : dockTab ? (
        <div style={{ marginTop: 10 }}>
          <PickerStrip
            title={dockTab === 'favs' ? '★ Favourites' : dockTab[0].toUpperCase() + dockTab.slice(1)}
            recents={recent.map((id) => SUBSTANCES[id]).filter(Boolean)}
            items={dockItems(dockTab)}
            colsOf={(id) => cols[id]}
            selId={selId}
            onPick={pickAndClose}
            onInfo={onInfo}
            expanded={dockExpanded}
            onToggleExpand={() => setDockExpanded((v) => !v)}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(favs.length > 0 || recent.length > 0) && (
            <div>
              {favs.length > 0 && (<><div className="seclabel">★ Favourites</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0 2px', WebkitOverflowScrolling: 'touch' }}>
                  {favs.map((id) => SUBSTANCES[id]).filter(Boolean).map((s) => <MiniTile key={s.id} s={s} cols={cols[s.id]} selected={s.id === selId} onPick={pickAndClose} onInfo={onInfo} />)}
                </div></>)}
              {recent.length > 0 && (<><div className="seclabel" style={{ marginTop: 6 }}>Recent</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0 2px', WebkitOverflowScrolling: 'touch' }}>
                  {recent.map((id) => SUBSTANCES[id]).filter(Boolean).map((s) => <MiniTile key={s.id} s={s} cols={cols[s.id]} selected={s.id === selId} onPick={pickAndClose} onInfo={onInfo} />)}
                </div></>)}
            </div>
          )}
          <div>
            <div className="seclabel">Common — start here</div>
            {tileGrid(['water', 'sand', 'fire', 'olive-oil', 'wood-oak', 'granite', 'lava', 'ice', 'salt', 'sugar', 'baking-powder', 'steam'].map((k) => BY_KEY.get(k)).filter(Boolean))}
          </div>
          <div>
            <div className="seclabel">Lab Gear — items (not substances)</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }} role="group" aria-label="Vessel size">
              <span className="dim sm">Vessel size — applies to flasks, tubes, cylinders and funnels when placed. Beakers, lids and burners use their own sizes below.</span>
              {['S', 'M', 'L', 'XL'].map((v) => (
                <button key={v} className={`btn sm ${vesselSize === v ? '' : 'ghost'}`} onClick={() => setVesselSize(v)}>{v}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 10, marginTop: 8 }}>
              {GEAR.map((g) => { const vis = gearVis[g.kind]; return (
                <div key={g.kind} role="button" data-gear={g.kind} onClick={() => { placeGear(g.kind); onClose(); }} style={{ cursor: 'pointer', minWidth: 0 }}>
                  <div style={{ height: 48, borderRadius: 11, background: vis ? vis.bg : 'linear-gradient(135deg, var(--s3), var(--s2))', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', position: 'relative' }}>
                    {vis ? <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.5, color: vis.fg || '#fff', textShadow: vis.fg ? 'none' : '0 1px 3px rgba(0,0,0,.55)' }}>{vis.label2}</span> : <Icon n="flask" size={20} />}
                    <span className="chip" style={{ position: 'absolute', top: 3, right: 3, fontSize: 8, padding: '1px 4px' }}>Item</span>
                  </div>
                  <div className="sm" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{g.name}</div>
                </div>
              ); })}
            </div>
          </div>
          {(() => { ensureCols(); const customRecs = customs.map((c) => { const key = c && (c.key || (c.def && c.def.key)); const rec = (key && BY_KEY.get(key)) || (c && c.id != null ? c : null); return rec; }).filter(Boolean); if (!customRecs.length) return null; return (<div><div className="seclabel">Custom</div>{tileGrid(customRecs)}</div>); })()}
          {CATS.map((c) => (
            <div key={c.id}>
              <button className="btn ghost sm" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setOpenCat(openCat === c.id ? '' : c.id)}>
                <span>{c.name}</span><span className="dim">{c.count} {openCat === c.id ? '▾' : '▸'}</span>
              </button>
              {openCat === c.id && tileGrid(catItems(c.id))}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
  );
}
