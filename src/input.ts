import type { InputState } from './types';
export class Controls {
  keys = new Set<string>();
  trickBuffer = 0;
  trickBufferTimer = 0;
  enabled = true;
  constructor(onAction:(action:string)=>void) {
    window.addEventListener('keydown',e=>{
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      let trickNum = 0;
      if (/^Digit([1-9])$/.test(e.code)) trickNum = parseInt(RegExp.$1, 10);
      else if (/^Numpad([1-9])$/.test(e.code)) trickNum = parseInt(RegExp.$1, 10);
      else if (e.code === 'Digit0' || e.code === 'Numpad0') trickNum = 10;
      else if (/^[1-9]$/.test(e.key)) trickNum = parseInt(e.key, 10);
      else if (e.key === '0') trickNum = 10;
      else if (e.code === 'KeyB') trickNum = 9; // B = Backflip
      else if (e.code === 'KeyX') trickNum = 2; // X = X-Up
      else if (e.code === 'KeyN') trickNum = 5; // N = No-Hander
      if (this.keys.has('Space')) {
        if (e.code === 'KeyS' || e.code === 'ArrowDown') trickNum = 9; // Space + Down = Backflip
        else if (e.code === 'KeyW' || e.code === 'ArrowUp') trickNum = 10; // Space + Up = Frontflip
        else if (e.code === 'KeyA' || e.code === 'ArrowLeft') trickNum = 8; // Space + Left = 360
        else if (e.code === 'KeyD' || e.code === 'ArrowRight') trickNum = 7; // Space + Right = Tailwhip
      }
      if (trickNum > 0) {
        this.trickBuffer = trickNum;
        this.trickBufferTimer = 0.65;
      }
      if(!e.repeat){
        if(e.code==='Enter')onAction('start');
        if(e.code==='Escape'||e.code==='KeyP')onAction('pause');
        if(e.code==='KeyR')onAction('restart');
        if(e.code==='KeyM')onAction('mute');
        if(e.code==='KeyF')onAction('effects');
        if(e.code==='KeyV')onAction('weather');
        if(e.code==='KeyG')onAction('ghost');
        if(e.code==='Space')onAction('space');
        if(e.code==='KeyT')onAction('track');
        if(e.code==='Digit1')onAction('digit1');
        if(e.code==='Digit2')onAction('digit2');
        if(e.code==='Digit3')onAction('digit3');
        if(e.code==='Digit4')onAction('digit4');
        if(e.code==='Digit5')onAction('digit5');
      }
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>{this.keys.clear();onAction('blur');});
  }
  update(dt:number){
    if(this.trickBufferTimer>0){
      this.trickBufferTimer-=dt;
      if(this.trickBufferTimer<=0)this.trickBuffer=0;
    }
  }
  read():InputState {
    const k=this.keys;
    let heldTrick = 0;
    for (let i = 1; i <= 9; i++) {
      if (k.has(`Digit${i}`) || k.has(`Numpad${i}`)) { heldTrick = i; break; }
    }
    if (!heldTrick && (k.has('Digit0') || k.has('Numpad0'))) heldTrick = 10;
    if (!heldTrick && k.has('KeyB')) heldTrick = 9;
    if (!heldTrick && k.has('KeyX')) heldTrick = 2;
    if (!heldTrick && k.has('KeyN')) heldTrick = 5;
    if (!heldTrick && k.has('Space')) {
      if (k.has('KeyS') || k.has('ArrowDown')) heldTrick = 9;
      else if (k.has('KeyW') || k.has('ArrowUp')) heldTrick = 10;
      else if (k.has('KeyA') || k.has('ArrowLeft')) heldTrick = 8;
      else if (k.has('KeyD') || k.has('ArrowRight')) heldTrick = 7;
    }
    const trickNum = heldTrick || (this.trickBufferTimer > 0 ? this.trickBuffer : 0);
    return {
      steer:Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft')),
      pedal:k.has('KeyW')||k.has('ArrowUp'),
      brake:k.has('KeyS')||k.has('ArrowDown'),
      crouch:k.has('Space'),
      hop:false,
      boost:k.has('ShiftLeft')||k.has('ShiftRight'),
      manual:k.has('KeyC'),
      trick:trickNum
    };
  }
}
