import assert from 'node:assert/strict';
import * as THREE from './dist/assets/three.module.js';
import {RaceEngine} from './dist/engine.js';
function fixture(){const e=Object.create(RaceEngine.prototype);Object.assign(e,{keys:{},touch:{},pos:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,steer:0,yawRate:0,speed:0,elapsed:0,trackWidth:14,carData:{year:2026},car:new THREE.Group(),carBody:new THREE.Group(),wheels:[],frontWheels:[],lapTime:0,lap:1,checkpoint:0,lastTrackProgress:0,bestLap:null,sampleCount:1000,samples:Array.from({length:1000},(_,i)=>new THREE.Vector3(0,0,i)),tangents:Array.from({length:1000},()=>new THREE.Vector3(0,0,1)),nearest(){return {distance:0,index:((Math.floor(this.pos.z)%1000)+1000)%1000};}});return e;}
let e;
// Browsers may return a new controller snapshot on every poll.
const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
let pads=[];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>pads}});
try {
  const pad=(r2=0,l2=0,steer=0)=>({index:0,axes:[steer],buttons:Array.from({length:16},(_,i)=>({value:i===7?r2:i===6?l2:0,pressed:false}))});
  e=fixture();pads=[pad(1)];e.updateGamepad();
  for(let i=0;i<450;i++)e.stepPhysics(1/90);
  assert(e.speed>150,'R2 accelerates the car');
  const controllerSpeed=e.speed;
  pads=[pad(0,.7,.5)];e.updateGamepad();
  assert.equal(e.gamepadInput.throttle,0,'Releasing R2 is read from the latest snapshot');
  assert.equal(e.gamepadInput.brake,.7,'L2 preserves analog brake pressure');
  assert(e.gamepadInput.steer>0,'Left stick steers');
  for(let i=0;i<90;i++)e.stepPhysics(1/90);
  assert(e.speed<controllerSpeed*.7,'L2 slows the car');
  pads=[];e.updateGamepad();assert.deepEqual(e.gamepadInput,{throttle:0,brake:0,steer:0},'Disconnect clears input');
  pads=[pad(.35)];e.updateGamepad();assert.equal(e.gamepadInput.throttle,.35,'Reconnect and partial R2 pressure work');
} finally {
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);
  else delete globalThis.navigator;
}
console.log('PASS: controller R2 acceleration, L2 braking, analog pressure, steering, fresh snapshots and reconnect.');
