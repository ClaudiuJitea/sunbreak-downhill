import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';

const preview=process.env.PREVIEW==='1'||process.argv.includes('--preview'), FPS=60, WIDTH=1920, HEIGHT=1080;
const TOTAL_FRAMES=45*FPS;
const directory='captures/showcase',output='media/SUNBREAK-45s-showcase.mp4';
const ffmpeg=process.env.FFMPEG_PATH||'/private/tmp/sunbreak-video-tools/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg';
await fs.mkdir(directory,{recursive:true});await fs.mkdir('media',{recursive:true});
const camera=(side,height,back,look=1,fov=51)=>({side,height,back,look,fov});
const pack=(pace=35)=>[{gap:-5,lane:-2.0,speed:pace+2,target:pace+2},{gap:7,lane:2.0,speed:pace,target:pace},{gap:13,lane:-.2,speed:pace+1,target:pace+1}];
const shots=[
  {id:'opening',duration:2,mode:'cinematic',title:'ALL IN. ALL THE WAY.',kicker:'SUNBREAK / FULL SEND',stage:{progress:.045,speed:34,lane:.3,camera:camera(-7.5,3.5,9,3,64),rivals:pack(35)}},
  {id:'battle',duration:6,mode:'race',title:'THEY WANT YOUR LINE.',kicker:'FOUR RIDERS / FULL ATTACK',stage:{progress:.09,speed:31,lane:.2,camera:camera(-.9,1.8,5.8,1.7,64),rivals:[{gap:-2.5,lane:-2,speed:38,target:40},{gap:-4,lane:2.1,speed:39,target:41},{gap:6,lane:-.4,speed:35,target:36}]}},
  {id:'brake-cut',duration:2,mode:'cinematic',title:'BRAKE LATE. CUT INSIDE.',kicker:'BRAKE SLIDE / DIRT SPRAY',stage:{progress:.24,speed:36,lane:1.3,camera:camera(-3.6,1.45,4.1,.8,60),rivals:pack(34)}},
  {id:'switchbacks',duration:4,mode:'race',title:'DEFEND. SWITCH. ATTACK.',kicker:'INSIDE LINE / OUTSIDE PRESSURE',stage:{progress:.285,speed:34,lane:-1,camera:camera(.8,1.75,5.8,1.6,65),rivals:pack(36)}},
  {id:'tabletop',duration:5,mode:'cinematic',title:'SEND THE WHOLE PACK.',kicker:'TABLETOP / TAKEOFF TO TOUCHDOWN',stage:{progress:.423,speed:30,lane:.2,trick:1,camera:camera(5.2,2.3,4.8,.5,58),rivals:[{gap:-4,lane:-1.8,speed:31,target:31},{gap:4,lane:1.8,speed:30,target:31},{gap:10,lane:-.2,speed:31,target:32}]}},
  {id:'rock-cut',duration:3,mode:'race',title:'THREAD THE NEEDLE.',kicker:'ROCK GARDEN / LINE CHANGES',stage:{progress:.35,speed:32,lane:3.0,camera:camera(-.8,1.7,5.7,1.8,64),rivals:[{gap:-5,lane:-3,speed:35,target:35},{gap:8,lane:.4,speed:33,target:34},{gap:16,lane:-3,speed:33,target:34}]}},
  {id:'forest-duel',duration:4,mode:'race',title:'NO FREE POSITIONS.',kicker:'SIDE BY SIDE / FULL BOOST',stage:{progress:.61,speed:35,lane:.5,camera:camera(-1.3,1.6,5.9,1.5,66),rivals:pack(38)}},
  {id:'ravine',duration:6,mode:'cinematic',title:'NOTHING BUT AIR.',kicker:'THE DIVIDE / BACKFLIP / PACK JUMP',stage:{progress:.71,speed:30,lane:.1,trick:6,record:true,camera:camera(5.4,2.4,5.1,.4,61),rivals:[{gap:-5,lane:-1.8,speed:31,target:31},{gap:4,lane:1.9,speed:30,target:31},{gap:10,lane:-.3,speed:31,target:32}]}},
  {id:'rain',duration:4,mode:'race',title:'RAIN DOESN’T SLOW THIS DOWN.',kicker:'WET VISOR / SPRAY / OVERTAKES',stage:{progress:.86,speed:36,lane:.2,camera:camera(-1.0,1.65,5.7,1.5,66),rivals:pack(39)}},
  {id:'finish',duration:8,mode:'race',title:'EVERYTHING LEFT. RIGHT NOW.',kicker:'FINAL SPRINT / FULL BOOST',stage:{progress:1-300/2310.04603983636,speed:34,lane:-.6,camera:camera(-1.3,1.7,5.9,1.8,66),rivals:[{gap:22,lane:-2.2,speed:36,target:35},{gap:14,lane:1.8,speed:37,target:35},{gap:-5,lane:2.9,speed:38,target:36}]}},
  {id:'winner',duration:1,mode:'winner',title:'FIRST TO THE SUN.',kicker:'RIN / YOU / RACE WINNER',stage:{progress:0,preserve:true,camera:camera(-3.8,1.6,-4.1,0,46)}},
];
if(Math.round(shots.reduce((sum,s)=>sum+s.duration,0)*FPS)!==TOTAL_FRAMES)throw new Error('Storyboard must total exactly 45 seconds.');
let server,browser,encoder,encoderError='';
const log={revision:3,resolution:[WIDTH,HEIGHT],fps:FPS,duration:45,staged:true,shots:[],frames:[],errors:[]};
try {
  let url=process.env.GAME_URL;
  if(!url){server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4178','--strictPort'],{stdio:'pipe'});let serverError='';server.stderr.on('data',d=>serverError+=d);
    url='http://127.0.0.1:4178/?capture=1&showcase=1';
    for(let n=0;n<100;n++){if(server.exitCode!==null)throw new Error(serverError);try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  }
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(120000);
  page.on('pageerror',e=>log.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|THREE|shader|GL_INVALID/.test(m.text()))log.errors.push(m.text());});
  await page.goto(url);await page.waitForFunction(()=>window.__SUNBREAK?.ready&&window.__SUNBREAK?.showcase);
  await page.addStyleTag({content:`
    #hud .frame-top,#hud .effects-controls,.race-controls,.corner,#results-panel,#pause-panel,#title-panel,#title-bottom{display:none!important}
    .race-left{top:120px;left:64px}.position>b{font-size:80px}.race-top{top:115px}.speed-panel{right:66px;bottom:88px}.progress-panel{left:64px;bottom:88px}.score-panel{bottom:92px}
    body[data-demo-mode=cinematic] #race-hud,body[data-demo-mode=winner] #race-hud,body[data-demo-mode=winner] .player-label,body[data-demo-mode=cinematic] .player-label{display:none!important}
    #trailer{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:Arial,Helvetica,sans-serif;color:#fff0cf}
    #trailer:before,#trailer:after{content:'';position:absolute;left:0;right:0;height:44px;background:#102c2a}#trailer:before{top:0}#trailer:after{bottom:0}
    #trailer-brand{position:absolute;left:66px;top:62px;font-weight:900;font-size:22px;letter-spacing:-1px;text-shadow:1px 2px #173d37}
    #trailer-brand span{font-size:8px;letter-spacing:3px;margin-left:17px;vertical-align:middle}#trailer-label{position:absolute;right:66px;top:69px;font-size:9px;font-weight:800;letter-spacing:2px;text-shadow:1px 1px #173d37}
    #trailer-caption{position:absolute;left:68px;bottom:238px;text-shadow:2px 3px #163d37;max-width:1100px}#trailer-caption small{font-size:12px;font-weight:800;letter-spacing:4px;color:#ffcc80;display:block;margin-bottom:15px}#trailer-caption h1{font-size:54px;line-height:1;letter-spacing:-2px;font-style:italic;margin:0;font-weight:1000}
    body[data-demo-mode=cinematic] #trailer-caption{bottom:115px}body[data-demo-id=opening] #trailer-caption h1{font-size:86px;max-width:720px}body[data-demo-id=opening] #trailer-caption{bottom:175px}
    #champion{display:none;position:absolute;left:90px;top:220px;width:800px;text-shadow:3px 4px #173d37}body[data-demo-mode=winner] #champion{display:block}body[data-demo-mode=winner] #trailer-caption{display:none}
    #champion .place{font-size:160px;font-weight:1000;letter-spacing:-10px;color:#ffc779;line-height:.9}#champion h2{font-size:84px;line-height:.95;letter-spacing:-4px;margin:24px 0}#champion p{font-size:17px;font-weight:900;letter-spacing:4px}#champion .stats{font-size:15px;letter-spacing:3px;color:#ffcc80;margin-top:30px}
    #fade{position:absolute;inset:0;background:#102c2a;opacity:0;z-index:50}
  `});
  await page.evaluate(()=>{const el=document.createElement('div');el.id='trailer';el.innerHTML='<div id="trailer-brand">SUNBREAK<span>DOWNHILL CLUB</span></div><div id="trailer-label">45 SECONDS / NO SECOND THOUGHTS</div><div id="trailer-caption"><small></small><h1></h1></div><div id="champion"><div class="place">01</div><p>RIN / YOU / RACE WINNER</p><h2>FIRST TO<br>THE SUN.</h2><div class="stats"></div></div><div id="fade"></div>';document.body.append(el);});
  if(!preview){encoder=spawn(ffmpeg,['-y','-f','image2pipe','-vcodec','mjpeg','-r',String(FPS),'-i','pipe:0','-an','-vf','eq=contrast=1.035:saturation=1.10','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-r',String(FPS),'-movflags','+faststart',`${directory}/video-only.mp4`],{stdio:['pipe','ignore','pipe']});encoder.stderr.on('data',d=>{encoderError=(encoderError+d).slice(-6000);});encoder.stdin.on('error',()=>{});}
  let frame=0;
  for(const [index,shot] of shots.entries()){
    console.log(`${preview?'Preview':'Rendering'} ${index+1}/${shots.length}: ${shot.id} (${shot.duration}s)`);
    await page.evaluate(shot=>{const g=window.__SUNBREAK;g.showcase.stage(shot.stage);g.showcase.weather(shot.id==='rain');document.body.dataset.demoMode=shot.mode;document.body.dataset.demoId=shot.id;document.querySelector('#trailer-caption small').textContent=shot.kicker;document.querySelector('#trailer-caption h1').textContent=shot.title;},shot);
    const startFrame=frame;
    for(let local=0;local<Math.round(shot.duration*FPS);local++,frame++){
      const captureFrame=!preview||local===Math.floor(shot.duration*FPS*.5)||local===Math.round(shot.duration*FPS)-1||(['tabletop','ravine','brake-cut'].includes(shot.id)&&local%(FPS/2)===0);
      const state=await page.evaluate(({id,t,frame,duration,captureFrame,mount,fps,total})=>{
        const g=window.__SUNBREAK,d=g.showcase;
        const controls={pedal:true,brake:false,crouch:false,boost:false,manual:false};
        if(id==='opening'){controls.boost=true;d.camera({...mount,side:mount.side+t*.8,back:mount.back-t*.65});}
        if(id==='battle'){
          controls.boost=t>1.8;controls.lane=.2+Math.sin(t*1.2)*.6;
          d.rivals([{lane:-2+Math.sin(t)*.25},{lane:2.1-Math.sin(t*.7)*.35},{lane:t>2.8?1.4:-.4}]);
          if(t>1.8){document.querySelector('#trailer-caption h1').textContent='TAKE IT BACK.';document.querySelector('#trailer-caption small').textContent='FULL BOOST / THE COUNTERATTACK';}
        }
        if(id==='brake-cut'){controls.brake=t<.32;controls.boost=t>.38;controls.lane=t<.6?-1.4:.25;}
        if(id==='switchbacks'){
          controls.boost=t>.4;controls.lane=Math.sin(t*1.5-1)*1.15;
          d.rivals([{lane:-2.5+Math.sin(t*1.1)*.25},{lane:2.4-Math.sin(t)*.35},{lane:t>1.4?-1.4:1.4}]);
        }
        if(id==='tabletop'){controls.boost=t>2.7;controls.lane=.2;}
        if(id==='rock-cut'){controls.boost=true;controls.lane=2.85+Math.sin(t*1.7)*.25;}
        if(id==='forest-duel'){
          controls.boost=t>.55;controls.lane=Math.sin(t*1.6)*.8;
          d.rivals([{lane:-2.2+Math.sin(t)*.25},{lane:2.3-Math.sin(t)*.25},{lane:t>1.6?1.3:-.3}]);
        }
        if(id==='rain'){controls.boost=t>.45;controls.lane=Math.sin(t*1.2)*.5;}
        if(id==='finish'){controls.boost=t>2.3;controls.lane=-.6;if(t<2.3){document.querySelector('#trailer-caption h1').textContent='REEL THEM IN.';}else{document.querySelector('#trailer-caption h1').textContent='EVERYTHING LEFT. RIGHT NOW.';}}
        if(id==='ravine'){controls.boost=t>4.0;controls.lane=.1;d.camera({...mount,side:mount.side*Math.cos(t*.12),back:mount.back+Math.sin(t*.2)});if(t>4.7){document.querySelector('#trailer-caption h1').textContent='LAND IT. KEEP IT PINNED.';document.querySelector('#trailer-caption small').textContent='LANDING / DIRT BURST / FULL THROTTLE';}}
        if(id==='winner')d.camera({...mount,side:mount.side+t*.25,back:mount.back-t*.2});
        d.controls(controls);g.step(60/fps,captureFrame);
        const s=g.state();
        if(id==='finish'&&s.player.finished){document.querySelector('#trailer-caption h1').textContent='FIRST ACROSS THE LINE.';document.querySelector('#trailer-caption small').textContent='RIN / YOU / 1ST PLACE';}
        document.querySelector('#champion .stats').textContent=`${Math.floor(s.player.finishTime/60)}:${(s.player.finishTime%60).toFixed(2).padStart(5,'0')}  /  FIRST OF FOUR`;
        const fadeFrames=Math.round(fps/3);
        document.getElementById('fade').style.opacity=String(frame<fadeFrames?1-frame/fadeFrames:frame>total-fadeFrames?(frame-(total-fadeFrames))/(fadeFrames-1):0);
        return {...s,riders:d.riders(),controls};
      },{id:shot.id,t:local/FPS,frame,duration:shot.duration,captureFrame,mount:shot.stage.camera,fps:FPS,total:TOTAL_FRAMES});
      log.frames.push({...state,frame,time:frame/FPS,raceTime:state.time,shot:shot.id});
      if(captureFrame){
        const jpg=await page.screenshot({type:'jpeg',quality:96});
        if(preview||local===Math.floor(shot.duration*FPS*.5))await fs.writeFile(`${directory}/${String(index).padStart(2,'0')}-${shot.id}${preview?`-preview-${local}`:''}.jpg`,jpg);
        if(!preview){if(encoder.exitCode!==null)throw new Error(encoderError);if(!encoder.stdin.write(jpg))await once(encoder.stdin,'drain');}
      }
      if(!preview&&frame%(FPS*3)===0)console.log(`  Frame ${frame}/${TOTAL_FRAMES} · ${(frame/TOTAL_FRAMES*100).toFixed(0)}%`);
    }
    log.shots.push({id:shot.id,start:startFrame/FPS,duration:shot.duration,title:shot.title});
  }
  const finish=log.frames.filter(f=>f.shot==='finish'&&f.player.finished);
  const winning=finish.some(f=>f.riders.every(r=>r.id===0||r.s<f.player.s));
  const battle=log.frames.filter(f=>f.shot==='battle');
  const overtaken=battle.some(f=>f.riders.filter(r=>r.id!==0&&r.s>f.player.s).length>=2);
  log.validation={winningFinish:winning,opponentsOvertake:overtaken,frameCount:frame,shaderErrors:log.errors.length};
  const racing=log.frames.filter(f=>f.shot!=='winner'&&!f.player.finished);
  log.validation.averageSpeedKmh=racing.reduce((sum,f)=>sum+f.player.speed*3.6,0)/racing.length;
  log.validation.fastRidingFraction=racing.filter(f=>f.player.speed>25).length/racing.length;
  log.validation.rivalFastFraction=racing.flatMap(f=>f.riders.slice(1)).filter(r=>r.speed>25).length/(racing.length*3);
  log.validation.rivalCrashes=racing.reduce((sum,f)=>sum+f.riders.slice(1).filter(r=>r.crash>0).length,0);
  log.validation.brakeSlide=log.frames.some(f=>f.shot==='brake-cut'&&f.controls.brake&&Math.abs(f.player.lean)>.1);
  log.validation.jumps=['tabletop','ravine'].map(id=>{
    const frames=log.frames.filter(f=>f.shot===id),air=frames.filter(f=>f.player.airborne);
    return {id,maxHeight:Math.max(...frames.map(f=>f.player.y)),airSeconds:air.length/FPS,landed:air.length>0&&!frames.at(-1).player.airborne,crashed:frames.some(f=>f.player.crash>0),packAirborne:Math.max(...frames.map(f=>f.riders.filter(r=>r.airborne).length))};
  });
  await fs.writeFile(`${directory}/${preview?'preview':'capture'}-report.json`,JSON.stringify(log,null,2));
  if(log.errors.length)throw new Error(log.errors.join('\n'));
  if(!winning||!overtaken)throw new Error(`Choreography failed: ${JSON.stringify(log.validation)}`);
  if(log.validation.fastRidingFraction<.85||log.validation.rivalFastFraction<.95||log.validation.rivalCrashes||!log.validation.brakeSlide||log.validation.jumps.some(j=>j.maxHeight<4||!j.landed||j.crashed||j.packAirborne<3))throw new Error(`Action choreography failed: ${JSON.stringify(log.validation)}`);
  if(!preview){encoder.stdin.end();const [code]=await once(encoder,'close');encoder=null;if(code!==0)throw new Error(encoderError);
    const audio=spawnSync('python3',['scripts/showcase-audio.py',`${directory}/capture-report.json`,`${directory}/soundtrack.wav`],{encoding:'utf8'});if(audio.status!==0)throw new Error(audio.stderr);
    const mux=spawnSync(ffmpeg,['-y','-i',`${directory}/video-only.mp4`,'-i',`${directory}/soundtrack.wav`,'-c:v','copy','-af','loudnorm=I=-14:TP=-2:LRA=8','-ar','48000','-c:a','aac','-b:a','256k','-t','45','-movflags','+faststart','-metadata','title=SUNBREAK — Full Send','-metadata','comment=Revision 3. Scripted in-engine 60 fps racing showcase. Original 174 BPM synthesized soundtrack.',output],{encoding:'utf8',maxBuffer:8*1024*1024});if(mux.status!==0)throw new Error(mux.stderr);
    await fs.copyFile(`${directory}/01-battle.jpg`,'media/SUNBREAK-showcase-poster.jpg');
    console.log(`COMPLETE: ${output}`);
  }else console.log(`Preview validated: ${JSON.stringify(log.validation)}`);
}finally{if(encoder){encoder.stdin.destroy();encoder.kill('SIGTERM');}if(browser)await browser.close();if(server)server.kill('SIGTERM');}
