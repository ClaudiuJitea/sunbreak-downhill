import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import {encodeMotion} from './encode-motion.mjs';
const dir='captures/motion';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.setDefaultTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.GAME_URL||'http://localhost:5173/?capture=1');await page.waitForFunction(()=>window.__SUNBREAK?.ready);
  const sequences=[];
  for(const [name,progress,angle,trick] of [['motion',.06,'chase',0],['air',.71,'side',6]]){
    if(process.env.AIR_ONLY&&name!=='air')continue;
    await page.evaluate(({progress,angle,trick})=>{const g=window.__SUNBREAK;g.seek(progress);g.camera(angle);g.input({pedal:true,steer:0,brake:false,crouch:false,trick});},{progress,angle,trick});
    const states=[];
    for(let i=0;i<(name==='air'?180:100);i++){
      await page.evaluate(()=>window.__SUNBREAK.step(2));
      await page.screenshot({path:`${dir}/${name}-${String(i).padStart(3,'0')}.png`});
      states.push(await page.evaluate(()=>window.__SUNBREAK.state()));
    }
    sequences.push({name,frames:states});
  }
  await fs.writeFile(`${dir}/states.json`,JSON.stringify({sampleRate:30,errors,sequences}));
}finally{await browser.close();}
await encodeMotion(dir);
console.log(`30 fps simulated sequences captured in ${dir}.`);
