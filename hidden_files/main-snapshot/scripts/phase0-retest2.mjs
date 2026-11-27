import { resolveChromePath } from './chrome-path.mjs';
import {createServer} from 'node:http'; import {readFile} from 'node:fs/promises'; import {extname,join,normalize} from 'node:path'; import puppeteer from 'puppeteer-core';
const DIST='/home/hatch/workspace/matter-lab/dist'; const SHOTS='/home/hatch/workspace/matter-lab-shots/phase0';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png'};
const CHROME = resolveChromePath();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p==='/'||p==='/matter-lab/'||p==='/matter-lab')p='/index.html'; p=p.replace(/^\/matter-lab/,''); const f=join(DIST,normalize(p).replace(/^(\.\.[/\\])+/ ,'')); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${srv.address().port}/index.html`;
const browser=await puppeteer.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:120000});
async function tapText(page,txt,exact=false){const box=await page.evaluate((t,ex)=>{const els=[...document.querySelectorAll('button,[role=button],a')].filter(e=>{const r=e.getBoundingClientRect(); if(r.height===0)return false; const s=(e.innerText||e.getAttribute('aria-label')||'').trim(); return ex?s===t:s.includes(t);}); if(!els.length)return null; els.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length); const e=els[0]; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};},txt,exact); if(!box)return false; await sleep(300); await page.touchscreen.tap(box.x,box.y); return box;}
async function tapSel(page,attr,val){const box=await page.evaluate((a,v)=>{const e=document.querySelector(`[${a}="${v}"]`); if(!e)return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};},attr,val); if(!box)return false; await sleep(300); await page.touchscreen.tap(box.x,box.y); return box;}
const R={};
for(const vp of [{w:412,h:915},{w:360,h:740}]){
 const tag=vp.w; const page=await browser.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await page.setViewport({width:vp.w,height:vp.h,hasTouch:true,isMobile:true}); await page.goto(base,{waitUntil:'load'}); await sleep(2000);
 await tapText(page,'Enter Free Sandbox'); await sleep(2500);
 R['stateAfterEnter'+tag]=await page.evaluate(()=>({sheet:!!document.querySelector('.sheet'), picker:!!document.querySelector('[data-panel="tiles"]'), demo:document.body.innerText.includes('Start with a demo scene'), rail:!!document.querySelector('[data-rail="tools"]')}));
 await tapText(page,'Skip'); await sleep(500);
 await tapSel(page,'data-rail','tools'); await sleep(700);
 R['side'+tag]=await page.evaluate(()=>{const p=document.querySelector('[data-sidepanel]'); if(!p)return null; const hs=[...p.querySelectorAll('button')].map(e=>Math.round(e.getBoundingClientRect().height)); return {min:Math.min(...hs), under44:hs.filter(h=>h<44).length, total:hs.length};});
 await tapSel(page,'data-rail','tools'); await sleep(400);
 await tapSel(page,'data-rail','menu'); await sleep(900);
 R['picker'+tag]=await page.evaluate(()=>{const sh=document.querySelector('[data-panel="tiles"]'); return sh?{tiles:sh.querySelectorAll('[data-tile]').length, gear:sh.querySelectorAll('[data-gear]').length}:null;});
 await tapSel(page,'data-gear','beaker-l'); await sleep(700);
 await tapSel(page,'data-rail','menu'); await sleep(700);
 const buTap=await tapSel(page,'data-gear','burner'); await sleep(800);
 R['burner'+tag]={tap:!!buTap, placed:await page.evaluate(()=>{const e=window.__matterlab.engine; let o=null,b=null; e.objects.forEach(x=>{if(x.kind==='burner')o=x; if(x.kind==='beaker-l')b=x}); const cv=document.querySelector('canvas'); const s=cv.getBoundingClientRect().width/e.cols; return o?{w:o.w,h:o.h,level:o.level,bottom:o.anchor.y+o.h,rows:e.rows,pxW:Math.round(o.w*s),beakerBottom:b?b.anchor.y+b.h:null}:null;})};
 await page.screenshot({path:`${SHOTS}/after-4-burner-${tag}.png`});
 // sheets: reopen panel each time
 for(const s of ['Experiments','Scenes','Recipes','Menu','Messages']){
   await tapSel(page,'data-rail','tools'); await sleep(500);
   const ok=await tapText(page,s); await sleep(700);
   const open=await page.evaluate(()=>!!document.querySelector('.sheet'));
   R['sheet-'+s+tag]={tap:!!ok,open};
   await tapText(page,'Close',true); await sleep(500);
 }
 // view modes via side panel
 await tapSel(page,'data-rail','tools'); await sleep(500);
 for(const v of ['Heat','Pressure','Flow','Normal']){ const ok=await tapText(page,v,true); await sleep(400); R['view-'+v+tag]=!!ok; }
 await page.screenshot({path:`${SHOTS}/after-7-sidepanel-views-${tag}.png`});
 R['errs'+tag]=errs; await page.close();
}
console.log(JSON.stringify(R,null,1));
await browser.close(); srv.close();
