import * as THREE from 'three';
export interface EnvironmentDef {
  skyHorizon: string;
  skyZenith: string;
  fogColor: string;
  sunshaftColor?: number;
  terrainColors: string[];
  dirtColor: number;
  edgeColor: number;
  wornColor: number;
  ridgeColors: number[];
  trunkColor: number;
  leafColor: number;
  leafLightColor: number;
  rockColor: number;
  flowerColor: number;
  riverColor: number;
  waterGlintColor: number;
}
export interface TrackSample { position: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; slope: number; width: number; surface: 'rock'|'dirt'|'grass'|'scree'; section: string; curvature: number; jump: number; }
export interface World { obstacles?:Array<{s:number;lateral:number;radius:number}>; group: THREE.Group; length: number; sample(s: number, lateral?: number): TrackSample; height(x:number,z:number):number; update(camera:THREE.Camera, dt:number):void; checkpoints:number[]; trackId?:number; trackName?:string; trackSubtitle?:string; environment?:EnvironmentDef; }
export interface InputState { steer:number; pedal:boolean; brake:boolean; crouch:boolean; hop:boolean; boost:boolean; manual:boolean; trick:number; }
export interface RiderState { id:number; name:string; color:number; s:number; lateral:number; speed:number; y:number; vy:number; airborne:boolean; airTime:number; pitch:number; roll:number; yaw:number; lean:number; compression:number; cadence:number; crash:number; boost:number; score:number; trick:string; trickRotation:number; finished:boolean; finishTime:number; position:THREE.Vector3; velocity:THREE.Vector3; }
export interface PhysicsEvent {type:'land'|'crash'|'trick'|'jump';force:number; score?:number;name?:string;}
export type MaterialFactory = (color:number, kind?:string)=>THREE.Material;
export interface RiderVisual {group:THREE.Group;update(state:RiderState,sample:TrackSample,dt:number,time:number):void;setColors?(colors:{frame?:number;jersey?:number;helmet?:number}):void;setNumber?(num:string|number):void;}

