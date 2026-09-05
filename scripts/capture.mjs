import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const dir = `captures/${process.env.CAPTURE_NAME || 'review'}`;
await fs.mkdir(dir,{recursive:true});
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,recordVideo:{dir,size:{width:1440,height:900}}});
const page=await context.newPage();page.setDefaultTimeout(120000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(process.env.GAME_URL || 'http://localhost:5173/?capture=1');
await page.waitForFunction(()=>window.__SUNBREAK?.ready,{timeout:120000});
await page.screenshot({path:`${dir}/00-title.png`});
await page.evaluate(()=>window.__SUNBREAK.start());
for(const [label,progress,angle] of [['01-start',0.01,'chase'],['02-switchbacks',0.3,'wide'],['03-rider',0.42,'side'],['04-ravine',0.65,'chase'],['05-valley',0.88,'chase']]){
 await page.evaluate(({progress,angle})=>{window.__SUNBREAK.seek(progress);window.__SUNBREAK.camera(angle);window.__SUNBREAK.step(60);},{progress,angle});
 await page.screenshot({path:`${dir}/${label}.png`});
}
await page.evaluate(()=>{window.__SUNBREAK.seek(.05);window.__SUNBREAK.camera('chase');window.__SUNBREAK.input({pedal:true});});
for(let i=0;i<(process.env.STILLS_ONLY?0:120);i++){
 await page.evaluate(()=>window.__SUNBREAK.step(3));
 if(i%4===0)await page.screenshot({path:`${dir}/motion-${String(i).padStart(3,'0')}.png`});
 await page.waitForTimeout(33);
}
await fs.writeFile(`${dir}/report.json`,JSON.stringify({errors,state:await page.evaluate(()=>window.__SUNBREAK.state())},null,2));
const video=page.video();await context.close();if(video)await video.saveAs(`${dir}/motion.webm`);await browser.close();
console.log(`Capture complete: ${dir}. Errors: ${errors.length}`);if(errors.length)console.error(errors);
