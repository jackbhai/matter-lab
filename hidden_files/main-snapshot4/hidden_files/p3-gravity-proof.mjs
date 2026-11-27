import { MatterEngine as Cur, GEAR as GEAR_CUR } from './cur/matter-engine.js';
import { MatterEngine as Pri, GEAR as GEAR_PRI } from './pri/matter-engine.js';
import { BY_KEY, SUBSTANCES } from './cur/matter-elements.js';
const id = k => BY_KEY.get(k).id, keyOf = i => SUBSTANCES[i].key;
function census(e){ const c={}; for(let i=0;i<e.el.length;i++){ if(e.el[i]) c[keyOf(e.el[i])]=(c[keyOf(e.el[i])]||0)+1; } return c; }
function eq(a,b){ const ks=new Set([...Object.keys(a),...Object.keys(b)]); for(const k of ks) if((a[k]||0)!==(b[k]||0)) return k+': '+(a[k]||0)+' vs '+(b[k]||0); return null; }
function scene(E, kind){
  const e=new E(120,90); e._rngState=1234567;
  const floor=84;
  if(kind!=='boil') for(let x=0;x<120;x++) for(let y=floor;y<90;y++) e.paint(x,y,0,'glass');
  if(kind==='sand'){ for(let x=45;x<75;x++) for(let y=20;y<38;y++) e.paint(x,y,0,'sand'); }
  if(kind==='water'){ for(let x=10;x<50;x++) for(let y=55;y<84;y++) e.paint(x,y,0,'glass'); for(let x=70;x<110;x++) for(let y=55;y<84;y++) e.paint(x,y,0,'glass'); for(let x=11;x<109;x++) for(let y=70;y<84;y++) e.paint(x,y,0,'water'); }
  if(kind==='gas'){ for(let x=40;x<80;x++) for(let y=60;y<75;y++) e.paint(x,y,0,'hydrogen'); }
  if(kind==='boil'){ for(let x=0;x<120;x++) for(let y=84;y<90;y++) e.paint(x,y,0,'glass'); e.placeObject('beaker-m',30,44); const b=[...e.objects.values()].find(o=>o.kind==='beaker-m'); const inCells=((b&&b.interior)||[]).filter(i=>((i/120)|0)>62); for(const i of inCells) e.paint(i%120,(i/120)|0,0,'water'); const top=((b&&b.interior)||[]).filter(i=>((i/120)|0)>=46&&((i/120)|0)<=48); for(const i of top) e.paint(i%120,(i/120)|0,0,'lava'); }
  return e;
}
let fail=0;
for(const kind of ['sand','water','gas','boil']){
  const a=scene(Pri,kind), b=scene(Cur,kind);
  const steps = kind==='boil'?1200:300;
  for(let t=0;t<steps;t++){ a.step(); b.step(); }
  const d=eq(census(a),census(b));
  console.log(kind, d?('MISMATCH '+d):'EXACT MATCH', JSON.stringify(census(b)));
  if(d) fail=1;
}
// GEAR smoke
console.log('GEAR cur',GEAR_CUR.length,'pri',GEAR_PRI.length);
{ const e=new Cur(200,140); e._rngState=99; let bad=[];
  for(const g of GEAR_CUR){ try{ const o=e.placeObject(g.kind,100,120); if(o==null&&false) bad.push(g.kind+':null'); for(let t=0;t<60;t++) e.step(); }catch(err){ bad.push(g.kind+': '+err.message); } }
  console.log('GEAR smoke', bad.length?('FAIL '+bad.join('; ')):'ALL PLACE+STEP OK'); if(bad.length) fail=1; }
// diagonal gravity: centroid shift
function centroid(E,vx,vy){ const e=new E(120,90); e._rngState=777; for(let x=0;x<120;x++) for(let y=84;y<90;y++) e.paint(x,y,0,'glass'); for(let x=0;x<120;x++) e.paint(x,0,0,'glass'); for(let y=0;y<90;y++){ e.paint(0,y,0,'glass'); e.paint(119,y,0,'glass'); } for(let x=50;x<70;x++) for(let y=15;y<30;y++) e.paint(x,y,0,'sand'); if(vx!=null) e.setGravityVector(vx,vy,1); for(let t=0;t<400;t++) e.step(); let sx=0,sy=0,n=0; const sid=id('sand'); for(let i=0;i<e.el.length;i++) if(e.el[i]===sid){ sx+=i%120; sy+=(i/120)|0; n++; } return {x:+(sx/n).toFixed(2), y:+(sy/n).toFixed(2), n}; }
const down=centroid(Cur,null), diag=centroid(Cur,Math.sin(Math.PI/6),Math.cos(Math.PI/6));
console.log('centroid down(0,1):',JSON.stringify(down),' diag30°:',JSON.stringify(diag),' shift dx=',+(diag.x-down.x).toFixed(2),' dy=',+(diag.y-down.y).toFixed(2));
if(!(diag.x>down.x+1)) fail=1;
// inverted gravity
const up=centroid(Cur,0,-1);
console.log('centroid up(0,-1):',JSON.stringify(up),'(ceiling pile => small y)');
if(!(up.y<30)) fail=1;
// soak
{ const e=new Cur(160,120); e._rngState=4242; for(let x=20;x<140;x+=7) e.paint(x,20,4,'sand'); for(let x=30;x<130;x+=9) e.paint(x,50,4,'water'); e.paint(80,80,6,'fire'); e.placeObject('beaker-m',60,110); let nan=0; const t0=Date.now(); for(let t=0;t<20000;t++){ e.step(); if(t%2000===0){ for(let i=0;i<e.temp.length;i+=97) if(!Number.isFinite(e.temp[i])) nan++; } } console.log('soak 20000 ticks OK in',Date.now()-t0,'ms; NaN temps:',nan,'particles:',e.stats().particles); if(nan) fail=1; }
console.log(fail?'PROOF: FAIL':'PROOF: ALL PASS'); process.exit(fail);
