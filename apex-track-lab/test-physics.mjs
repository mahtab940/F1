import assert from 'node:assert/strict';
import * as THREE from './dist/assets/three.module.js';
import {RaceEngine,getTrackStats} from './dist/engine.js';
import {PRESETS,validateTrack} from './dist/track-editor.js';
import {CARS} from './dist/cars.js';
for(const p of PRESETS){assert(validateTrack(p.points,22).valid,p.name);assert(Math.abs(validateTrack(p.points).length-getTrackStats(p.points).length)<3,'Editor and scene length match');}
assert(!validateTrack([{x:.1,y:.1},{x:.9,y:.9},{x:.9,y:.1},{x:.1,y:.9},{x:.05,y:.5}]).valid);
assert.equal(new Set(CARS.map(c=>c.id)).size,CARS.length);
for(let y=2000;y<=2026;y++)assert(CARS.some(c=>c.year===y),String(y));
assert.equal(CARS.filter(c=>c.year===2026).length,11);
function fixture(){const e=Object.create(RaceEngine.prototype);Object.assign(e,{keys:{},touch:{},pos:new THREE.Vector3(),velocity:new THREE.Vector3(),yaw:0,steer:0,yawRate:0,speed:0,elapsed:0,trackWidth:14,carData:{year:2026},car:new THREE.Group(),carBody:new THREE.Group(),wheels:[],frontWheels:[],lapTime:0,lapTimes:[],raceTime:0,lap:1,checkpoint:0,lastTrackProgress:0,bestLap:null,sampleCount:1000,samples:Array.from({length:1000},(_,i)=>new THREE.Vector3(0,0,i)),tangents:Array.from({length:1000},()=>new THREE.Vector3(0,0,1)),nearest(){return {distance:0,index:((Math.floor(this.pos.z)%1000)+1000)%1000};}});return e;}
let e=fixture();e.touch.throttle=1;for(let i=0;i<450;i++)e.stepPhysics(1/90);assert(e.speed>150&&e.pos.z>100,'Accelerates and moves');const speed=e.speed;e.touch={brake:1};for(let i=0;i<90;i++)e.stepPhysics(1/90);assert(e.speed<speed*.7,'Braking slows car');
e=fixture();e.touch={throttle:1,steer:1};for(let i=0;i<120;i++)e.stepPhysics(1/90);assert(e.yaw<0&&e.pos.x<0,'Right steering turns right in forward +Z convention');
for(const input of ['touch','keys','gamepadInput']){
  e=fixture();e[input]=input==='keys'?{s:true}:{brake:1};
  for(let i=0;i<900;i++){e.stepPhysics(1/90);assert(e.speed<=50.001,'Reverse never exceeds 50 km/h');}
  assert(e.pos.z<-100,'Reverse keeps moving');assert(Math.abs(e.speed-50)<.01,`${input} reaches 50 km/h in reverse`);
}
e=fixture();e.velocity.z=10;e.touch={brake:1};
for(let i=0;i<900;i++)e.stepPhysics(1/90);
assert(e.velocity.z<0&&Math.abs(e.speed-50)<.01,'Holding brake transitions from forward motion into sustained reverse');
e=fixture();let laps=0;e.onLap=()=>laps++;e.velocity.z=10;e.lapTime=30;e.lastTrackProgress=.96;e.nearest=()=>({distance:0,index:0});e.stepPhysics(.01);assert.equal(laps,0,'Cannot earn lap without checkpoints');e.checkpoint=3;e.lastTrackProgress=.96;e.stepPhysics(.01);assert.equal(laps,1,'Complete ordered lap is counted');assert(e.bestLap>0&&e.lap===2);
console.log(`PASS: ${CARS.length} cars, 27 seasons, 4 track presets, matching spline lengths, crossings, acceleration, braking, steering, reverse, checkpoint laps.`);

const grid=Array.from({length:4},(_,slot)=>{const driver=fixture();driver.gridSlot=slot;driver.reset();return driver;});
assert.equal(grid[0].pos.z,grid[1].pos.z,'First two drivers start side by side');
assert.equal(grid[2].pos.z,grid[3].pos.z,'Next two drivers share the second row');
for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)assert(grid[i].pos.distanceTo(grid[j].pos)>5,'Grid cars do not overlap');
const spawn=grid[1].pos.clone();grid[1].pos.set(100,0,100);grid[1].reset();assert(grid[1].pos.equals(spawn),'Reset preserves the assigned grid position');
assert(grid[1].car.position.equals(spawn),'Car mesh starts at its assigned position');
grid[1].gridSlot=null;grid[1].reset();assert.equal(grid[1].pos.x,0,'Solo racing returns to center');
console.log('PASS: side-by-side multiplayer grid, separated rows, reset and solo positions.');
e=fixture();e.lapLimit=2;let finishes=0;e.onStatus=s=>{if(s.type==='finished')finishes++;};
function crossLine(){e.velocity.z=10;e.checkpoint=3;e.lastTrackProgress=.96;e.lapTime=30;e.nearest=()=>({distance:0,index:0});e.stepPhysics(.01);}
crossLine();assert(!e.finished,'Race continues before selected lap count');crossLine();assert(e.finished&&e.paused,'Race finishes at selected count');assert.equal(finishes,1);assert.equal(e.lapTimes.length,2);assert(e.raceTime>0);assert(e.lapTimes.every(t=>t>=30));const finishPosition=e.pos.clone();e.touch.throttle=1;e.stepPhysics(1);e.pause(false);assert(e.pos.equals(finishPosition)&&e.paused,'Finished race cannot resume driving');e.reset();assert(!e.finished&&e.lap===1,'Reset clears finish');assert.deepEqual(e.lapTimes,[]);assert.equal(e.raceTime,0);
e=fixture();e.lapLimit=0;crossLine();assert(!e.finished,'Unlimited race continues');
console.log('PASS: lap limit, finish freeze, reset and unlimited racing.');
