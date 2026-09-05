import type { InputState } from './types';
export class Controls {
  keys = new Set<string>(); enabled=true;
  constructor(onAction:(action:string)=>void) {
    window.addEventListener('keydown',e=>{
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if(!e.repeat){if(e.code==='Enter')onAction('start');if(e.code==='Escape'||e.code==='KeyP')onAction('pause');if(e.code==='KeyR')onAction('restart');if(e.code==='KeyM')onAction('mute');if(e.code==='KeyF')onAction('effects');if(e.code==='KeyV')onAction('weather');}
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>{this.keys.clear();onAction('blur');});
  }
  read():InputState {
    const k=this.keys;
    return {steer:Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft')),pedal:k.has('KeyW')||k.has('ArrowUp'),brake:k.has('KeyS')||k.has('ArrowDown'),crouch:k.has('Space'),hop:false,boost:k.has('ShiftLeft')||k.has('ShiftRight'),manual:k.has('KeyC'),trick:[1,2,3,4,5,6,7].find(n=>k.has(`Digit${n}`))||0};
  }
}
