/** Every sound is synthesized; the noise buffer is generated once at activation. */
export class GameAudio {
  context:AudioContext|null=null; private master:GainNode|null=null;private wind:GainNode|null=null;private tire:GainNode|null=null;private tireFilter:BiquadFilterNode|null=null;private muted=false;private clickClock=0;
  async activate(){
    if(this.context){await this.context.resume();return;}
    const c=this.context=new AudioContext(); const gain=this.master=c.createGain();gain.gain.value=this.muted?0:.35;gain.connect(c.destination);
    const data=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const a=data.getChannelData(0);let last=0;for(let i=0;i<a.length;i++){last=(last+(Math.random()*2-1)*.08)/1.03;a[i]=last*3;}
    const noise=c.createBufferSource();noise.buffer=data;noise.loop=true;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;this.wind=c.createGain();this.wind.gain.value=0;noise.connect(filter).connect(this.wind).connect(gain);
    this.tireFilter=c.createBiquadFilter();this.tireFilter.type='bandpass';this.tireFilter.frequency.value=350;this.tireFilter.Q.value=.7;this.tire=c.createGain();this.tire.gain.value=0;noise.connect(this.tireFilter).connect(this.tire).connect(gain);noise.start();
  }
  mute(){this.muted=!this.muted;if(this.master)this.master.gain.setTargetAtTime(this.muted?0:.35,this.context!.currentTime,.03);return this.muted;}
  tone(freq:number,duration=.15,type:OscillatorType='sine',volume=.12,end=freq){if(!this.context||!this.master)return;const c=this.context,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,c.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),c.currentTime+duration);g.gain.setValueAtTime(volume,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);o.connect(g).connect(this.master);o.start();o.stop(c.currentTime+duration);}
  horn(go=false){this.tone(go?660:440,go?.55:.16,'square',.075);this.tone(go?990:660,go?.55:.16,'sine',.1);}
  impact(force:number){this.tone(90+force*4,.24,'triangle',Math.min(.4,force*.018),28);this.tone(650,.07,'sawtooth',.045,60);}
  bank(){this.tone(660,.12,'sine',.16);setTimeout(()=>this.tone(880,.2,'sine',.12),90);}
  update(dt:number,speed:number,surface:string,airborne:boolean,pedaling:boolean){if(!this.context||!this.wind||!this.tire||!this.tireFilter)return;const t=this.context.currentTime;this.wind.gain.setTargetAtTime(Math.min(.65,speed/55),t,.15);this.tire.gain.setTargetAtTime(airborne?0:Math.min(.5,speed/50),t,.06);this.tireFilter.frequency.setTargetAtTime(surface==='rock'?850:surface==='scree'?1400:400,t,.1);this.clickClock+=dt*(pedaling?8:Math.max(2,speed*.7));if(this.clickClock>1){this.clickClock%=1;if(speed>1)this.tone(pedaling?1400:2200,.009,'square',.013);}}
}
