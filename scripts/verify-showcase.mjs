import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

// Verify the encoded deliverable as well as the simulation that produced it.
const ffprobe=process.env.FFPROBE_PATH||'/private/tmp/sunbreak-video-tools/node_modules/@ffprobe-installer/darwin-arm64/ffprobe';
const file='media/SUNBREAK-45s-showcase.mp4';
const result=spawnSync(ffprobe,['-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels','-of','json',file],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr||result.error?.message);
const metadata=JSON.parse(result.stdout);
const video=metadata.streams.find(s=>s.codec_name==='h264');
const audio=metadata.streams.find(s=>s.codec_name==='aac');
assert.ok(video&&audio,'H.264 video and AAC audio must both exist.');
assert.ok(Math.abs(Number(metadata.format.duration)-45)<.05,'Duration must be 45 seconds.');
assert.equal(video.width,1920);assert.equal(video.height,1080);
assert.equal(video.r_frame_rate,'60/1');assert.equal(Number(video.nb_frames),2700);
assert.equal(audio.channels,2);assert.equal(Number(audio.sample_rate),48000);
const report=JSON.parse(await fs.readFile('captures/showcase/capture-report.json','utf8'));
assert.equal(report.revision,3);assert.equal(report.fps,60);assert.equal(report.frames.length,2700);
assert.deepEqual(report.errors,[]);
const v=report.validation;
assert.ok(v.winningFinish&&v.opponentsOvertake&&v.brakeSlide);
assert.ok(v.fastRidingFraction>.95&&v.rivalFastFraction>.95);
assert.equal(v.rivalCrashes,0);
assert.ok(v.jumps.every(j=>j.maxHeight>4&&j.landed&&!j.crashed&&j.packAirborne===4));
const passes=[];
for(let i=1;i<report.frames.length;i++){
  const now=report.frames[i],before=report.frames[i-1];
  assert.equal(now.frame,i);
  if(now.shot!==before.shot)continue;
  for(let id=1;id<4;id++){
    const a=now.riders[id].s-now.player.s,b=before.riders[id].s-before.player.s;
    if(a*b<0)passes.push({time:now.time,shot:now.shot,rider:id,direction:a>0?'rival passes player':'player passes rival',side:now.riders[id].lateral<now.player.lateral?'left':'right'});
  }
}
assert.ok(passes.some(p=>p.direction==='rival passes player'));
assert.ok(passes.some(p=>p.direction==='player passes rival'&&p.shot==='finish'));
const finish=report.frames.find(f=>f.shot==='finish'&&f.player.finished);
assert.ok(finish.player.boost>0,'The final acceleration must last through the line.');
const verification={revision:3,...metadata,gameplayValidation:v,passes,finishTimeInVideo:finish.time,boostAtFinish:finish.player.boost};
await fs.writeFile('media/verification.json',JSON.stringify(verification,null,2));
console.log(`Verified ${file}: 45 seconds, 1080p60, stereo audio, ${passes.length} passes, both four-rider jumps, and a boosted first-place finish.`);
