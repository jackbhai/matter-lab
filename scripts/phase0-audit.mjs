import { resolveChromePath } from './chrome-path.mjs';
import {createServer} from 'node:http'; import {readFile,mkdir} from 'node:fs/promises'; import {extname,join,normalize} from 'node:path'; import puppeteer from 'puppeteer-core';
const DIST='/home/hatch/workspace/matter-lab/dist'; const SHOTS='/home/hatch/workspace/matter-lab-shots/phase0'; await mkdir(SHOTS,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png'};
const CHROME = resolveChromePath();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const srv=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p==='/'||p==='/matter-lab/'||p==='/matter-lab')p='/index.html'; p=p.replace(/^\/matter-lab/,''); const f=join(DIST,normalize(p).replace(/^(\.\.[/\\])+/ ,'')); const d=await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${srv.address().port}/index.html`;
const browser=await puppeteer.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:120000});
const out={};
for(const vp of [{w:412,h:915},{w:360,h:740}]){
 const page=await browser.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await page.setViewport({width:vp.w,height:vp.h,hasTouch:true,isMobile:true}); await page.goto(base,{waitUntil:'load'}); await sleep(2500);
 const tag=vp.w;
 // home audit
 out['home'+tag]=await page.evaluate(()=>{const els=[...document.querySelectorAll('button,a,[role=button]')].map(e=>{const r=e.getBoundingClientRect();return{t:(e.innerText||e.getAttribute('aria-label')||'').slice(0,40),w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)}}); return {small:els.filter(e=>e.h<44||e.w<44), total:els.length, overflow:document.scrollingElement.scrollWidth, text:document.body.innerText.slice(0,600)};});
 await page.screenshot({path:`${SHOTS}/before-home-${tag}.png`});
 // tap Free Sandbox via touchscreen tap on element center
 const el=await page.evaluateHandle(()=>[...document.querySelectorAll('button,a,article,div')].find(e=>(e.innerText||'').trim().startsWith('Free Sandbox')));
 try{await el.asElement().tap();}catch(e){await page.evaluate(()=>{[...document.querySelectorAll('button')].find(e=>(e.innerText||'').includes('Free Sandbox'))?.click()});}
 await sleep(3000);
 out['tool'+tag]=await page.evaluate(()=>{
   const all=[...document.querySelectorAll('button,[data-rail],[role=button]')];
   const info=all.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')||(e.innerText||'').slice(0,30),w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y),vis:r.width>0&&r.height>0}});
   // overlaps among visible fixed-ish controls
   const vis=info.filter(i=>i.vis);
   let overlaps=[]; for(let i=0;i<vis.length;i++)for(let j=i+1;j<vis.length;j++){const a=vis[i],b=vis[j]; if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h) overlaps.push(a.label+' <> '+b.label);}
   const canvas=document.querySelector('canvas'); const cr=canvas?canvas.getBoundingClientRect():null;
   return {small:vis.filter(e=>e.h<44||e.w<40), overlaps:overlaps.slice(0,20), count:vis.length, canvas:cr?{w:Math.round(cr.width),h:Math.round(cr.height)}:null, text:document.body.innerText.slice(0,800)};
 });
 await page.screenshot({path:`${SHOTS}/before-tool-${tag}.png`});
 // Open substances / picker - try rail buttons sequentially screenshot each
 const rails=await page.evaluate(()=>[...document.querySelectorAll('[data-rail]')].map(e=>e.getAttribute('aria-label')));
 out['rails'+tag]=rails;
 for(const label of rails){
   await page.evaluate((s)=>{const b=[...document.querySelectorAll('[data-rail]')].find(x=>x.getAttribute('aria-label')===s); b?.click();},label); await sleep(1200);
   const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,'-');
   await page.screenshot({path:`${SHOTS}/before-panel-${tag}-${slug}.png`});
   out['panel-'+tag+'-'+label]=await page.evaluate(()=>{const els=[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height>0); const small=els.map(e=>{const r=e.getBoundingClientRect();return{t:(e.innerText||'').slice(0,30),w:Math.round(r.width),h:Math.round(r.height)}}).filter(e=>e.h<44); const tiles=[...document.querySelectorAll('[class*=tile],[class*=card],[class*=item]')].slice(0,5).map(e=>{const r=e.getBoundingClientRect();return{c:e.className.slice(0,40),w:Math.round(r.width),h:Math.round(r.height),t:(e.innerText||'').slice(0,40)}}); return {smallCount:small.length, small:small.slice(0,15), tiles, text:document.body.innerText.slice(0,500)};});
   // close via same rail or close button
   await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>/close/i.test(e.getAttribute('aria-label')||'')||(e.innerText||'').trim()==='×'); b?.click();}); await sleep(400);
 }
 out['errs'+tag]=errs;
 await page.close();
}
console.log(JSON.stringify(out,null,1).slice(0,12000));
await browser.close(); srv.close();
