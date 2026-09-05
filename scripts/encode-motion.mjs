import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

export async function encodeMotion(directory='captures/motion'){
  let ffmpeg=process.env.FFMPEG_PATH;
  if(!ffmpeg){const cache=process.platform==='darwin'?path.join(os.homedir(),'Library/Caches/ms-playwright'):path.join(os.homedir(),'.cache/ms-playwright');const folder=(await fs.readdir(cache)).find(n=>n.startsWith('ffmpeg-'));if(folder)ffmpeg=path.join(cache,folder,process.platform==='darwin'?'ffmpeg-mac':'ffmpeg-linux');}
  if(!ffmpeg)throw new Error('No Playwright FFmpeg binary found. Run npx playwright install chromium.');
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    for(const name of ['motion','air']){
      const files=(await fs.readdir(directory)).filter(n=>new RegExp(`^${name}-\\d+\\.png$`).test(n)).sort();
      if(!files.length)continue;const frames=[];
      for(const file of files){
        const source='data:image/png;base64,'+(await fs.readFile(path.join(directory,file))).toString('base64');
        const jpeg=await page.evaluate(async source=>{const img=new Image();img.src=source;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL('image/jpeg',.94).split(',')[1];},source);
        frames.push(Buffer.from(jpeg,'base64'));
      }
      // Playwright's minimal FFmpeg supports MJPEG image pipes, but deliberately
      // omits PNG decoding and the numbered-image file demuxer.
      const result=spawnSync(ffmpeg,['-y','-f','image2pipe','-c:v','mjpeg','-r','30','-i','pipe:0','-an','-c:v','libvpx','-b:v','3000k',path.join(directory,`${name}.webm`)],{input:Buffer.concat(frames),maxBuffer:4*1024*1024});
      if(result.status!==0)throw new Error(result.stderr?.toString()||'FFmpeg failed');
      console.log(`Encoded ${name}: ${files.length} frames at 30 fps.`);
    }
  }finally{await browser.close();}
}
if(process.argv[1]?.endsWith('encode-motion.mjs'))await encodeMotion(process.argv[2]);
