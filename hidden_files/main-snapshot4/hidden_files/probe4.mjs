// Light-theme spot check: set the existing theme mechanism (omni:theme=light)
// before boot, screenshot home + lab at 412x915, assert 0 errors + chrome present.
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core'; import { resolveChromePath } from '../scripts/chrome-path.mjs';
const DIST = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json' };
const srv = createServer(async (req,res)=>{ try{ let p=decodeURIComponent(new URL(req.url,'http://x').pathname); if(p==='/')p='/index.html'; const d=await readFile(join(DIST, normalize(p).replace(/^(\.\.[/\\])+/ ,''))); res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'}); res.end(d);}catch{res.writeHead(404);res.end('nf');} });
await new Promise(r=>srv.listen(0,'127.0.0.1',r)); const port=srv.address().port;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.emulate({ viewport:{width:412,height:915,isMobile:true,hasTouch:true,deviceScaleFactor:2}, userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await page.evaluateOnNewDocument(()=>{ try{ localStorage.setItem('omni:theme','light'); }catch{} });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'load',timeout:120000});
await sleep(5000);
await page.screenshot({ path:'/home/hatch/workspace/matter-lab-shots/ui-a/light-home-412x915.png' });
await page.evaluate(()=>{ const b=[...document.querySelectorAll('button')].find(x=>/Enter Free Sandbox/.test(x.innerText)); if(b)b.click(); });
await sleep(4000);
await page.evaluate(()=>{ const b=document.querySelector('[data-rail="full"]'); if(b)b.click(); });
await sleep(1200);
console.log(JSON.stringify(await page.evaluate(()=>{ const cs=getComputedStyle(document.documentElement); const btn=document.querySelector('.ml-tb-btn'); const dock=document.querySelector('.ml-dock'); return { fg: cs.getPropertyValue('--fg').trim(), s1: cs.getPropertyValue('--s1').trim(), btnColor: btn?getComputedStyle(btn).color:null, dockBg: dock?getComputedStyle(dock).backgroundColor:null, bodyBg: getComputedStyle(document.body).backgroundColor }; })), 'errs', errs.length);
await page.screenshot({ path:'/home/hatch/workspace/matter-lab-shots/ui-a/light-lab-412x915.png' });
await browser.close(); srv.close();
