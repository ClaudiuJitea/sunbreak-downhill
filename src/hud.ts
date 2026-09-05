import type { RiderState, World } from './types';
export type Phase='title'|'countdown'|'racing'|'paused'|'results';
export interface HudState {phase:Phase;player:RiderState;riders:RiderState[];time:number;countdown:number;world:World;best:number;split:string;fps:number;replay:boolean;}
const time=(s:number)=>`${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`;
export class HUD {
  root:HTMLDivElement;private noticeTime=0;private notice='';private lastPhase='';
  constructor(action:(a:string)=>void){
    this.root=document.createElement('div');this.root.id='hud';document.body.append(this.root);
    this.root.innerHTML=`
    <div class="frame-top"><a class="wordmark" href="#" aria-label="Sunbreak home">SUNBREAK<span>DOWNHILL CLUB</span></a><div class="edition">MT. KOMOREBI <i>↗</i><span>35° 21′ N &nbsp; / &nbsp; 138° 43′ E</span></div><button class="sound-btn" data-action="mute" title="Toggle synthesized audio (M)">SOUND <b id="sound-state">ON</b><span>▥</span></button></div>
    <div id="title-panel" class="title-panel"><div class="eyebrow"><span></span> THE MOUNTAIN IS YOURS</div><h1>CHASE<br>THE <em>DAYLIGHT.</em></h1><p>Four riders. One mountain. No second thoughts.</p><div class="course-card"><div class="course-number">01</div><div><b>THE SUNBREAK DESCENT</b><span>SUMMIT → RIVER VALLEY</span></div><span class="course-arrow">↘</span></div><div class="course-stats"><div><b id="course-length">2.4</b><span>KM OF FREEDOM</span></div><div><b id="course-drop">414</b><span>METERS DOWN</span></div><div><b>04</b><span>RIDERS. ONE LINE.</span></div></div><button class="ride-btn" data-action="start">DROP IN <span>↗</span><small>ENTER</small></button><div class="title-hint">BUILT FOR THE DESCENT. &nbsp; MADE OF SUNSHINE & DIRT.</div></div>
    <div class="title-bottom" id="title-bottom"><div><span class="tiny-square"></span> ALPINE FREERIDE SERIES <b>VOL. 001 / DAWN PATROL</b></div><div>100% PROCEDURAL <span class="seal">山</span></div></div>
    <div id="race-hud" class="hidden"><div class="race-left"><div class="position"><b id="position">1</b><span>/ 4<br><small>POSITION</small></span></div><div id="leaderboard" class="leaderboard"></div></div><div class="race-top"><span id="section">SUMMIT RIDGE</span><strong id="timer">0:00.00</strong><small id="split">CHASE THE DAYLIGHT</small></div><div class="corner"><span>NEXT UP</span><b id="corner-icon">↗</b><strong id="corner-label">FIND YOUR FLOW</strong></div><div class="speed-panel"><span class="speed-label">LET IT RUN</span><div><b id="speed">0</b><span>KM/H</span></div><div class="boost-track"><i id="boost-fill"></i></div><small>BOOST <span>HOLD SHIFT</span></small></div><div class="progress-panel"><div><span>SUMMIT <b>▲</b></span><span>VALLEY <b>⚑</b></span></div><svg viewBox="0 0 360 55"><path class="profile-fill" d="M0 4 L25 9 42 7 70 19 100 17 115 24 145 21 180 35 208 29 244 42 280 43 317 50 360 50 L360 55H0Z"/><path class="profile-stroke" d="M0 4 L25 9 42 7 70 19 100 17 115 24 145 21 180 35 208 29 244 42 280 43 317 50 360 50"/><circle id="route-dot" cx="0" cy="4" r="5"/></svg><div><small id="distance">0.00 KM</small><small id="checkpoint">CHECKPOINT 1 / 6</small></div></div><div class="score-panel"><span>STYLE POINTS</span><b id="score">0000</b></div><div id="trick-popup" class="trick-popup"></div><div id="countdown" class="countdown"></div><div class="race-controls">W <span>PEDAL</span> A D <span>STEER</span> S <span>BRAKE</span> SPACE <span>PUMP / HOP</span> 1–7 <span>AIR TRICKS</span> ESC <span>PAUSE</span></div><div id="replay-label" class="replay-label hidden">● &nbsp; YOUR BIGGEST AIR <span>CINEMATIC REPLAY</span></div></div>
    <div id="pause-panel" class="modal hidden"><span class="eyebrow">TAKE A BREATH</span><h2>MOUNTAIN<br>ON HOLD.</h2><button class="ride-btn" data-action="pause">KEEP RIDING <span>↗</span></button><button class="text-btn" data-action="restart">RESTART DESCENT ↻</button><p>W / ↑ pedal · A D / ← → steer · S / ↓ brake<br>Space hold to preload, release to hop · Shift boost<br>C manual · 1 tabletop · 2 x-up · 3 superman<br>4 tailwhip · 5 360 · 6 backflip · 7 frontflip</p></div>
    <div id="results-panel" class="modal results hidden"><span class="eyebrow">THE VALLEY REMEMBERS</span><h2 id="result-title">WHAT A<br>DESCENT.</h2><div id="result-stats" class="result-stats"></div><div id="result-riders"></div><button class="ride-btn" data-action="restart">ONE MORE RUN <span>↗</span><small>R</small></button><button class="text-btn" data-action="replay">REPLAY BIGGEST AIR ↗</button></div>
    <div id="loading" class="loading"><span class="wordmark">SUNBREAK</span><p>CARVING THE MOUNTAIN…</p><div></div></div>`;
    const effectsBar=document.createElement('div');effectsBar.className='effects-controls';
    effectsBar.innerHTML='<button data-action="effects" id="effects-toggle" aria-pressed="true" title="Toggle full/reduced motion effects (F)">FX <b>FULL</b><kbd>F</kbd></button><button data-action="weather" id="weather-toggle" aria-pressed="false" title="Toggle dawn rain (V)">WEATHER <b>DAWN</b><kbd>V</kbd></button>';
    this.root.append(effectsBar);
    this.root.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(button)action(button.dataset.action!);});
  }
  setEffects(enabled:boolean,rain:boolean){
    const fx=this.el('effects-toggle'),weather=this.el('weather-toggle');
    fx.querySelector('b')!.textContent=enabled?'FULL':'REDUCED';fx.setAttribute('aria-pressed',String(enabled));
    weather.querySelector('b')!.textContent=rain?'RAIN':'DAWN';weather.setAttribute('aria-pressed',String(rain));
  }
  ready(){this.el('loading').classList.add('hidden');}
  el(id:string){return document.getElementById(id)!;}
  notify(message:string){this.notice=message;this.noticeTime=3;}
  setMuted(muted:boolean){this.el('sound-state').textContent=muted?'OFF':'ON';}
  update(s:HudState,dt:number){
    const title=s.phase==='title', result=s.phase==='results';
    this.el('title-panel').classList.toggle('hidden',!title);this.el('title-bottom').classList.toggle('hidden',!title);this.el('race-hud').classList.toggle('hidden',title||result&&!s.replay);this.el('pause-panel').classList.toggle('hidden',s.phase!=='paused');this.el('results-panel').classList.toggle('hidden',!result||s.replay);this.el('replay-label').classList.toggle('hidden',!s.replay);
    const order=[...s.riders].sort((a,b)=>b.s-a.s);const p=s.player;
    this.el('course-length').textContent=(s.world.length/1000).toFixed(1);this.el('course-drop').textContent=String(Math.round(s.world.sample(0).position.y-s.world.sample(s.world.length).position.y));
    if(result&&this.lastPhase!==s.phase){this.el('result-title').innerHTML=order[0].id===0?'FIRST TO<br>THE SUN.':'WHAT A<br>DESCENT.';this.el('result-stats').innerHTML=`<div><span>YOUR TIME</span><b>${time(p.finishTime||s.time)}</b></div><div><span>STYLE</span><b>${p.score}</b></div><div><span>PERSONAL BEST</span><b>${s.best?time(s.best):'—'}</b></div>`;this.el('result-riders').innerHTML=order.map((r,i)=>`<div class="result-row"><b>0${i+1}</b><span>${r.name}${r.id===0?' / YOU':''}</span><strong>${r.finished?time(r.finishTime):'ON COURSE'}</strong></div>`).join('');}
    this.lastPhase=s.phase;
    if(title)return;
    this.el('position').textContent=String(order.findIndex(r=>r.id===0)+1);this.el('timer').textContent=time(s.time);this.el('speed').textContent=String(Math.round(p.speed*3.6));this.el('boost-fill').style.width=`${p.boost<=1?p.boost*100:p.boost}%`;this.el('score').textContent=String(p.score).padStart(4,'0');
    const sample=s.world.sample(p.s);this.el('section').textContent=sample.section.toUpperCase();this.el('split').textContent=s.split||'CHASE THE DAYLIGHT';
    this.el('leaderboard').innerHTML=order.map((r,i)=>`<div class="${r.id===0?'you':''}"><i style="background:#${r.color.toString(16).padStart(6,'0')}"></i><span>${r.name}</span><b>${r.id===0?'YOU':`${r.s>p.s?'+':'−'}${(Math.abs(r.s-p.s)/Math.max(p.speed,5)).toFixed(1)}s`}</b></div>`).join('');
    const ahead=s.world.sample(Math.min(s.world.length,p.s+48));this.el('corner-icon').textContent=ahead.jump>.1?'↟':Math.abs(ahead.curvature)>.007?(ahead.curvature>0?'↱':'↰'):'↓';this.el('corner-label').textContent=ahead.jump>.1?'GET READY TO FLY':Math.abs(ahead.curvature)>.007?'BRAKE · LEAN · RELEASE':ahead.section.toUpperCase();
    const progress=p.s/s.world.length;this.el('route-dot').setAttribute('cx',String(progress*360));this.el('route-dot').setAttribute('cy',String(4+progress*46));this.el('distance').textContent=`${(p.s/1000).toFixed(2)} / ${(s.world.length/1000).toFixed(2)} KM`;this.el('checkpoint').textContent=`CHECKPOINT ${s.world.checkpoints.filter(c=>p.s>=c).length} / ${s.world.checkpoints.length}`;
    this.el('countdown').textContent=s.phase==='countdown'?s.countdown>0?String(Math.ceil(s.countdown)):'GO!':'';
    this.noticeTime-=dt;this.el('trick-popup').innerHTML=p.crash>0?'<small>SHAKE IT OFF</small>BACK ON THE BIKE':p.airborne&&p.trick?`<small>HOLD YOUR LINE</small>${p.trick.toUpperCase()}`:this.noticeTime>0?this.notice:'';
  }
}
