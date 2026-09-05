/** Produce a motion contact sheet and a self-contained frame-sequence viewer.
 * Usage: node scripts/review.mjs captures/review
 * No image-processing package, system encoder, or downloaded assets needed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const directory = process.argv[2] || 'captures/review';
const files = (await fs.readdir(directory)).filter(name => /^motion-\d+\.png$/.test(name)).sort();
if (!files.length) throw new Error(`No motion sequence found in ${directory}. Run npm run capture first.`);
const frames = await Promise.all(files.map(async file => ({file, url:`data:image/png;base64,${(await fs.readFile(path.join(directory,file))).toString('base64')}`})));
const interval = directory.endsWith('motion') ? 1/30 : 0.2; // Capture takes a frame every 12 deterministic 60 Hz steps.
const cards = Array.from({length:Math.min(12,frames.length)},(_,i)=>frames[Math.floor(i*(frames.length-1)/Math.max(1,Math.min(12,frames.length)-1))]);
const sheet = `<!doctype html><html><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#173b43;color:#f3dfae;font:16px system-ui}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 20px}main{display:grid;grid-template-columns:repeat(3,480px);gap:12px}figure{margin:0}img{width:480px;display:block}figcaption{padding:7px;background:#102d34}</style><h1>SUNBREAK / MOTION REVIEW</h1><p>Ordered deterministic frames. Inspect posture, wheel contacts, camera tracking and foliage continuity.</p><main>${cards.map(frame=>`<figure><img src="${frame.url}"><figcaption>${frame.file} · ${(Number(frame.file.match(/\d+/)[0])*(directory.endsWith('motion')?1:1/4)*interval).toFixed(2)} s</figcaption></figure>`).join('')}</main></html>`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1512,height:1500},deviceScaleFactor:1});
await page.setContent(sheet);await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
await page.screenshot({path:path.join(directory,'motion-contact-sheet.png'),fullPage:true});await browser.close();
const viewer=`<!doctype html><html><meta charset="utf-8"><title>SUNBREAK motion review</title><style>body{margin:0;background:#173b43;color:#f3dfae;font:16px system-ui;text-align:center}img{width:min(100vw,1440px);display:block;margin:auto}footer{padding:18px}button{padding:8px 22px;background:#edcb83;border:0;font:inherit}input{width:45vw;vertical-align:middle}</style><img id="frame"><footer><button id="play">Pause</button> <input id="scrub" type="range" min="0" max="${frames.length-1}" value="0"> <span id="time"></span></footer><script>const frames=${JSON.stringify(frames.map(f=>f.url))};let index=0,playing=true;const frame=document.getElementById('frame'),scrub=document.getElementById('scrub'),time=document.getElementById('time'),play=document.getElementById('play');function show(){frame.src=frames[index];scrub.value=index;time.textContent=(index*${interval}).toFixed(2)+' s / '+frames.length+' frames';}play.onclick=()=>{playing=!playing;play.textContent=playing?'Pause':'Play'};scrub.oninput=()=>{index=Number(scrub.value);playing=false;play.textContent='Play';show()};setInterval(()=>{if(playing){index=(index+1)%frames.length;show()}},${interval*1000});show();</script></html>`;
await fs.writeFile(path.join(directory,'motion-review.html'),viewer);
console.log(`Created ${directory}/motion-contact-sheet.png and motion-review.html (${frames.length} frames).`);
