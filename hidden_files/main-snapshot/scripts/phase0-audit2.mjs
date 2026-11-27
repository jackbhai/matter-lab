import { resolveChromePath } from './chrome-path.mjs';
import {createServer} from 'node:http'; import {readFile,mkdir} from 'node:fs/promises'; import {extname,join,normalize} from 'node:path'; import puppeteer from 'puppeteer-core';
const DIST='/home/hatch/workspace/matter-lab/dist'; const SHOTS='/home/hatch/workspace/matter-lab-shots/phase0'; await mkdir(SHOTS,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png'};
const CHROME = resolveChromePath();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p==='/'||p==='/matter-lab/'||p==='/matter-lab')p='/index.html'; p=p.replace(/^\/matter-lab/,''); const f=join(DIST,normalize(p).replace(/^(\.\.[/\\])+/ ,'')); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${srv.address().port}/index.html`;
const browser=await puppeteer.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:120000});
async function tapText(page,txt,exact=false){const box=await page.evaluate((t,ex)=>{const els=[...document.querySelectorAll('button,[role=button],a')].filter(e=>{const s=(e.innerText||e.getAttribute('aria-label')||'').trim();return ex?s===t:s.includes(t);}); if(!els.length)return null; els.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length); const e=els[0]; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};},txt,exact); if(!box)return false; await sleep(300); await page.touchscreen.tap(box.x,box.y); return box;}
async function tapSel(page,sel,attr,val){const box=await page.evaluate((s,a,v)=>{const e=document.querySelector(`${s}[${a}="${v}"]`); if(!e)return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};},sel,attr,val); if(!box)return false; await sleep(300); await page.touchscreen.tap(box.x,box.y); return box;}
const R={};
for(const vp of [{w:412,h:915},{w:360,h:740}]){
 const tag=vp.w; const page=await browser.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await page.setViewport({width:vp.w,height:vp.h,hasTouch:true,isMobile:true}); await page.goto(base,{waitUntil:'load'}); await sleep(2000);
 R['counts'+tag]=await page.evaluate(()=>({subs:window.__matterlab?null:document.body.innerText.match(/1,392|1,822/)?.[0], home:document.body.innerText.slice(0,200)}));
 const enter=await tapText(page,'Enter Free Sandbox'); R['enterBtn'+tag]=enter; await sleep(2500);
 R['mounted'+tag]=await page.evaluate(()=>!!document.querySelector('[data-mlroot="1"] canvas'));
 // dismiss demo offer
 await tapText(page,'Skip'); await sleep(500);
 // measure top chip row buttons + selected bar
 R['chrome'+tag]=await page.evaluate(()=>{const btns=[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height>0); return btns.map(e=>{const r=e.getBoundingClientRect();return{t:(e.innerText||e.getAttribute('aria-label')||'').slice(0,24),h:Math.round(r.height),w:Math.round(r.width)}});});
 await page.screenshot({path:`${SHOTS}/before-1-tool-clean-${tag}.png`});
 // open side panel via rail tools
 const rb=await tapSel(page,'button','data-rail','tools'); R['railTools'+tag]=rb; await sleep(800);
 R['side'+tag]=await page.evaluate(()=>{const p=document.querySelector('[data-sidepanel]'); if(!p)return null; const btns=[...p.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return{t:(e.innerText||'').slice(0,20),h:Math.round(r.height)}}); return {btns, small:btns.filter(b=>b.h<44).length, total:btns.length, pw:Math.round(p.getBoundingClientRect().width)};});
 await page.screenshot({path:`${SHOTS}/before-2-sidepanel-${tag}.png`});
 await tapSel(page,'button','data-rail','tools'); await sleep(500);
 // open picker via bottom bar (tap text of selected substance bar) -> rail menu
 await tapSel(page,'button','data-rail','menu'); await sleep(1000);
 R['picker'+tag]=await page.evaluate(()=>{const sh=document.querySelector('[data-panel="tiles"]'); if(!sh)return null; const tiles=[...sh.querySelectorAll('[data-tile],[data-gear]')].slice(0,6).map(e=>{const r=e.getBoundingClientRect();return{k:e.getAttribute('data-tile')||e.getAttribute('data-gear'),w:Math.round(r.width),h:Math.round(r.height)};}); const vs=[...sh.querySelectorAll('button')].map(e=>{const r=e.getBoundingClientRect();return{t:(e.innerText||'').slice(0,20),h:Math.round(r.height)}}); return {tiles, sheetH:Math.round(sh.getBoundingClientRect().height), btnSmall:vs.filter(b=>b.h<44), gearCount:sh.querySelectorAll('[data-gear]').length, text:sh.innerText.slice(0,300)};});
 await page.screenshot({path:`${SHOTS}/before-3-picker-${tag}.png`});
 // search water via real typing
 const inp=await page.$('[data-panel="tiles"] input'); if(inp){await inp.tap(); await page.keyboard.type('water'); await sleep(800);}
 R['search'+tag]=await page.evaluate(()=>{const sh=document.querySelector('[data-panel="tiles"]'); return sh?{hits:sh.querySelectorAll('[data-tile]').length, first:[...sh.querySelectorAll('[data-tile]')].slice(0,5).map(e=>e.getAttribute('data-tile'))}:null;});
 await page.screenshot({path:`${SHOTS}/before-4-search-${tag}.png`});
 if(inp){await inp.tap(); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await sleep(600);}
 // set vessel XL then place beaker-l
 await tapText(page,'XL',true); await sleep(300);
 const bk=await tapSel(page,'div','data-gear','beaker-l'); R['beakerTile'+tag]=bk; await sleep(800);
 R['beakerPlaced'+tag]=await page.evaluate(()=>{const ml=window.__matterlab; const e=ml.engine; let o=null; e.objects.forEach(x=>{if(x.kind==='beaker-l')o=x}); const cv=document.querySelector('canvas'); const r=cv.getBoundingClientRect(); const s=r.width/e.cols; return o?{wCells:o.w,hCells:o.h,pxW:Math.round(o.w*s),screenPct:Math.round(o.w/e.cols*100),level:o.level}:null;});
 await page.screenshot({path:`${SHOTS}/before-5-beakerXL-${tag}.png`});
 // place burner via picker
 await tapSel(page,'button','data-rail','menu'); await sleep(800);
 const bu=await tapSel(page,'div','data-gear','burner'); R['burnerTile'+tag]=bu; await sleep(800);
 R['burnerPlaced'+tag]=await page.evaluate(()=>{const e=window.__matterlab.engine; let o=null; e.objects.forEach(x=>{if(x.kind==='burner')o=x}); return o?{kind:o.kind,level:o.level,w:o.w,h:o.h}:null;});
 R['sideAfterBurner'+tag]=await page.evaluate(()=>{const p=document.querySelector('[data-sidepanel]'); return p?p.innerText.slice(0,400):null;});
 await page.screenshot({path:`${SHOTS}/before-6-burner-${tag}.png`});
 // place ALL gear kinds, catch crashes
 R['allGear'+tag]=await page.evaluate(async()=>{const ml=window.__matterlab; const e=ml.engine; const kinds=['beaker-s','beaker-m','beaker-l','flask','testtube','roundflask','cylinder','funnel','lid-s','lid-m','lid-l','burner','battery','electrode-carbon','electrode-copper','electrode-platinum','thermometer','sensor','switch','wire','cooling-coil','heater-coil','stirrer','hotplate','condenser','filterstand','ph-probe','tripod','ice-bath','fan']; const res={}; for(const k of kinds){try{const d=ml.stampDims(k); const id=ml.placeObject(k, 10+Math.floor(Math.random()*40), 10+Math.floor(Math.random()*40)); res[k]=id==null?'null':'ok';}catch(err){res[k]='ERR:'+err.message.slice(0,60);}} return res;});
 // sheets cycle via top buttons
 for(const s of ['Scenes','Experiments','Recipes','Menu','Help','Messages']){ const b=await tapText(page,s); await sleep(600); R['sheet-'+s+tag]=await page.evaluate(()=>document.body.innerText.slice(0,120)); await tapText(page,'Close'); await sleep(400); }
 // perf spot check
 R['perf'+tag]=await page.evaluate(async()=>{const ml=window.__matterlab; const e=ml.engine; e.clear(); for(let x=20;x<e.cols-20;x+=9){ml.place('sand',x,30,7); ml.place('water',x,90,7);} ml.place('fire',Math.floor(e.cols/2),e.rows-60,16); ml.step(60); const d=[]; await new Promise(done=>{let last=performance.now(),n=0; const f=t=>{d.push(t-last); last=t; if(++n<240)requestAnimationFrame(f); else done();}; requestAnimationFrame(f);}); d.sort((a,b)=>a-b); return {median:Math.round(d[120]*10)/10, particles:e.stats().particles};});
 R['errs'+tag]=errs; await page.close();
}
console.log(JSON.stringify(R,null,1).slice(0,16000));
await browser.close(); srv.close();
