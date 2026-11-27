import { resolveChromePath } from './chrome-path.mjs';
import {createServer} from 'node:http'; import {readFile,mkdir} from 'node:fs/promises'; import {extname,join,normalize} from 'node:path'; import puppeteer from 'puppeteer-core';
const DIST='/home/hatch/workspace/matter-lab/dist'; const SHOTS='/home/hatch/workspace/matter-lab-shots/phase0'; await mkdir(SHOTS,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png'};
const CHROME = resolveChromePath();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p==='/'||p==='/matter-lab/'||p==='/matter-lab')p='/index.html'; p=p.replace(/^\/matter-lab/,''); const f=join(DIST,normalize(p).replace(/^(\.\.[/\\])+/ ,'')); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${srv.address().port}/index.html`;
const browser=await puppeteer.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:120000});
async function tapText(page,txt,exact=false){const box=await page.evaluate((t,ex)=>{const els=[...document.querySelectorAll('button,[role=button],a')].filter(e=>{const r=e.getBoundingClientRect(); if(r.height===0)return false; const s=(e.innerText||e.getAttribute('aria-label')||'').trim(); return ex?s===t:s.includes(t);}); if(!els.length)return null; els.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length); const e=els[0]; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};},txt,exact); if(!box)return false; await sleep(300); await page.touchscreen.tap(box.x,box.y); return box;}
async function tapSel(page,attr,val){const box=await page.evaluate((a,v)=>{const e=document.querySelector(`[${a}="${v}"]`); if(!e)return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};},attr,val); if(!box)return false; await sleep(300); await page.touchscreen.tap(box.x,box.y); return box;}
const R={};
for(const vp of [{w:412,h:915},{w:360,h:740}]){
 const tag=vp.w; const page=await browser.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await page.setViewport({width:vp.w,height:vp.h,hasTouch:true,isMobile:true}); await page.goto(base,{waitUntil:'load'}); await sleep(2000);
 R['home'+tag]=await page.evaluate(()=>{const t=document.body.innerText; const btns=[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height>0).map(e=>Math.round(e.getBoundingClientRect().height)); return {c1822:t.includes('1,822'), c34775:t.includes('34,775'), minBtn:Math.min(...btns), overflow:document.scrollingElement.scrollWidth};});
 await page.screenshot({path:`${SHOTS}/after-5-home-counts-${tag}.png`});
 await tapText(page,'Enter Free Sandbox'); await sleep(2500);
 await tapText(page,'Skip'); await sleep(400);
 // side panel heights
 await tapSel(page,'data-rail','tools'); await sleep(700);
 R['side'+tag]=await page.evaluate(()=>{const p=document.querySelector('[data-sidepanel]'); if(!p)return null; const hs=[...p.querySelectorAll('button')].map(e=>Math.round(e.getBoundingClientRect().height)); return {min:Math.min(...hs), under44:hs.filter(h=>h<44).length, total:hs.length};});
 await page.screenshot({path:`${SHOTS}/after-1-sidepanel-${tag}.png`});
 await tapSel(page,'data-rail','tools'); await sleep(400);
 // picker: common row + heights
 await tapSel(page,'data-rail','menu'); await sleep(900);
 R['picker'+tag]=await page.evaluate(()=>{const sh=document.querySelector('[data-panel="tiles"]'); if(!sh)return null; const hs=[...sh.querySelectorAll('button')].map(e=>Math.round(e.getBoundingClientRect().height)); const common=[...sh.querySelectorAll('[data-tile]')].slice(0,12).map(e=>e.getAttribute('data-tile')); return {minBtn:Math.min(...hs), under44:hs.filter(h=>h<44).length, commonFirst:common[0], commonCount:common.length, hasCommonLabel:sh.innerText.includes('Common — start here')};});
 await page.screenshot({path:`${SHOTS}/after-2-picker-common-${tag}.png`});
 // place Beaker L (intrinsic) -> floor check
 await tapSel(page,'data-gear','beaker-l'); await sleep(700);
 R['beaker'+tag]=await page.evaluate(()=>{const e=window.__matterlab.engine; let o=null; e.objects.forEach(x=>{if(x.kind==='beaker-l')o=x}); const cv=document.querySelector('canvas'); const s=cv.getBoundingClientRect().width/e.cols; return o?{w:o.w,h:o.h,bottom:o.anchor.y+o.h,rows:e.rows,pxW:Math.round(o.w*s),pct:Math.round(o.w/e.cols*100)}:null;});
 await page.screenshot({path:`${SHOTS}/after-3-beaker-floor-${tag}.png`});
 // place burner -> floor + size + level
 await tapSel(page,'data-rail','menu'); await sleep(700);
 await tapSel(page,'data-gear','burner'); await sleep(700);
 R['burner'+tag]=await page.evaluate(()=>{const e=window.__matterlab.engine; let o=null; e.objects.forEach(x=>{if(x.kind==='burner')o=x}); const cv=document.querySelector('canvas'); const s=cv.getBoundingClientRect().width/e.cols; return o?{w:o.w,h:o.h,level:o.level,bottom:o.anchor.y+o.h,rows:e.rows,pxW:Math.round(o.w*s)}:null;});
 await page.screenshot({path:`${SHOTS}/after-4-burner-${tag}.png`});
 // hero boil: clear, build bench-like scene via API (placement flow already tap-proven), step + realtime wait
 R['boil'+tag]=await page.evaluate(()=>{const ml=window.__matterlab; const e=ml.engine; e.clear(); const dims=ml.stampDims('beaker-l',{size:'XL'}); const bx=Math.floor((e.cols-dims.w)/2), by=e.rows-dims.h-20; const bk=ml.placeObject('beaker-l',bx,by,{size:'XL'}); const bu=ml.placeObject('burner',bx+Math.floor(dims.w/2)-8,by+dims.h); if(bu!=null)e.setObjectLevel(bu,3); const cx=bx+Math.floor(dims.w/2); for(let k=0;k<26;k++)ml.place('water',cx,by+Math.floor(dims.h*0.45),Math.floor(dims.w*0.30)); ml.step(240); return {bk,bu,burnerDims:ml.stampDims('burner')};});
 await sleep(5000);
 R['boilTemp'+tag]=await page.evaluate(()=>{const e=window.__matterlab.engine; let mx=0; for(let i=0;i<e.temp.length;i+=7)if(e.temp[i]>mx)mx=e.temp[i]; return Math.round(mx);});
 await page.screenshot({path:`${SHOTS}/after-6-boil-${tag}.png`});
 // sheets cycle (top row may be hidden in fs; use side panel route) - open tools panel then Panels buttons
 await tapSel(page,'data-rail','tools'); await sleep(600);
 for(const s of ["Experiments","Scenes","Recipes","Menu","Messages"]){ await tapSel(page,"data-rail","tools"); await sleep(500); const ok=await tapText(page,s); await sleep(700); const has=await page.evaluate(()=>!!document.querySelector('.sheet')); R['sheet-'+s+tag]={tap:!!ok,open:has}; const c=await tapText(page,'Close',true); if(!c){await page.touchscreen.tap(20,20);} await sleep(500); const still=await page.evaluate(()=>!!document.querySelector('.sheet')); if(still){await tapSel(page,'data-rail','tools'); await sleep(400);} }
 // custom form typing
 await tapSel(page,'data-rail','menu'); await sleep(700);
 await tapText(page,'Create substance'); await sleep(500);
 const nameInp=await page.$('[data-panel="tiles"] input[placeholder="e.g. Dragon Dust"]');
 let typed=false; if(nameInp){await nameInp.tap(); await page.keyboard.type('Phase0 Dust'); typed=await page.evaluate(()=>document.querySelector('[data-panel="tiles"] input[placeholder="e.g. Dragon Dust"]').value);}
 R['custom'+tag]={typed};
 await tapText(page,'Add substance'); await sleep(600);
 R['customAdded'+tag]=await page.evaluate(()=>document.body.innerText.includes('Phase0 Dust')||document.body.innerText.includes('Custom'));
 // pause/play + clear + undo via rail
 await page.touchscreen.tap(20,20); await sleep(500);
 const paused1=await tapSel(page,'data-rail','play'); await sleep(300); const paused2=await tapSel(page,'data-rail','play'); await sleep(300);
 R['pausePlay'+tag]={t1:!!paused1,t2:!!paused2};
 // perf
 R['perf'+tag]=await page.evaluate(async()=>{const ml=window.__matterlab; const e=ml.engine; e.clear(); for(let x=20;x<e.cols-20;x+=9){ml.place('sand',x,30,7); ml.place('water',x,90,7);} ml.place('fire',Math.floor(e.cols/2),e.rows-60,16); ml.step(60); const d=[]; await new Promise(done=>{let last=performance.now(),n=0; const f=t=>{d.push(t-last); last=t; if(++n<240)requestAnimationFrame(f); else done();}; requestAnimationFrame(f);}); d.sort((a,b)=>a-b); return {median:Math.round(d[120]*10)/10, particles:e.stats().particles};});
 R['errs'+tag]=errs; await page.close();
}
console.log(JSON.stringify(R,null,1).slice(0,12000));
await browser.close(); srv.close();
