import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
// Hardware WebGL path: intentionally no SwiftShader override. This measures the
// available machine, not a claim about every M5 Pro or Chrome configuration.
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  await page.goto(process.env.GAME_URL||'http://localhost:5173/');
  await page.waitForFunction(()=>window.__SUNBREAK?.ready,{timeout:120000});
  await page.evaluate(()=>{window.__SUNBREAK.start();window.__SUNBREAK.input({pedal:true});});
  await page.waitForTimeout(6000);
  const report=await page.evaluate(()=>new Promise(resolve=>{
    const frames=[];let last=performance.now();
    function sample(now){frames.push(now-last);last=now;if(frames.length<300){requestAnimationFrame(sample);return;}
      frames.sort((a,b)=>a-b);const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
      resolve({frameMilliseconds:{p50:frames[150],p95:frames[285],p99:frames[297],worst:frames[299]},gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),state:window.__SUNBREAK.state()});
    }requestAnimationFrame(sample);
  }));
  await fs.mkdir('captures',{recursive:true});await fs.writeFile('captures/performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
