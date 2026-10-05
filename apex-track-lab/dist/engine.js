import * as THREE from './assets/three.module.js';
import { CARS } from './cars.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const WORLD = 640;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const material = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .15, ...opts });

function normalizePoints(points) {
  const clean = [];
  for (const p of points || []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const q = new THREE.Vector3((clamp(p.x, 0, 1) - .5) * WORLD, 0, (clamp(p.y, 0, 1) - .5) * WORLD);
    if (!clean.length || q.distanceTo(clean[clean.length - 1]) > 2) clean.push(q);
  }
  if (clean.length > 2 && clean[0].distanceTo(clean[clean.length - 1]) < 3) clean.pop();
  if (clean.length < 3) return [new THREE.Vector3(-170,0,-120),new THREE.Vector3(170,0,-120),new THREE.Vector3(190,0,100),new THREE.Vector3(-170,0,140)];
  return clean;
}

function makeCurve(points) {
  const c = new THREE.CatmullRomCurve3(normalizePoints(points), true, 'catmullrom', .5);
  c.arcLengthDivisions = 3000;
  return c;
}

export function getTrackStats(points, width = 14) {
  const c = makeCurve(points);
  const samples = c.getSpacedPoints(240);
  let corners = 0, turning = false;
  for (let i = 2; i < samples.length - 2; i++) {
    const a = samples[i].clone().sub(samples[i-2]).normalize();
    const b = samples[i+2].clone().sub(samples[i]).normalize();
    const sharp = Math.acos(clamp(a.dot(b),-1,1)) > .2;
    if (sharp && !turning) corners++;
    turning = sharp;
  }
  return { length: c.getLength(), lengthKm: c.getLength()/1000, corners, width };
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function noiseTexture(color, amount) {
  return canvasTexture(256,256,(ctx,w,h) => {
    const data = ctx.createImageData(w,h);
    let seed = 17823;
    for (let i=0;i<data.data.length;i+=4) {
      seed = (seed*16807)%2147483647;
      const n = (seed/2147483647-.5)*amount;
      data.data[i]=color[0]+n;data.data[i+1]=color[1]+n;data.data[i+2]=color[2]+n;data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
  });
}

function disposeGroup(group) {
  if (!group) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for(const key of ['map','bumpMap','roughnessMap','normalMap'])if(m[key])textures.add(m[key]);
    m.dispose();
  }
  for (const t of textures) t.dispose();
  group.removeFromParent();
}

export class RaceEngine {
  constructor(container, {onTelemetry, onLap, onStatus} = {}) {
    this.container=container;this.onTelemetry=onTelemetry;this.onLap=onLap;this.onStatus=onStatus;
    this.disposed=false;this.racing=false;this.paused=false;this.cameraMode='orbit';this.weather='sunset';
    this.keys={};this.touch={throttle:0,brake:0,steer:0};this.gamepadInput={throttle:0,brake:0,steer:0};this.gamepad=null;this.pos=new THREE.Vector3();this.velocity=new THREE.Vector3();
    this.yaw=0;this.steer=0;this.yawRate=0;this.speed=0;this.finished=false;this.lap=1;this.lapTime=0;this.bestLap=null;this.progress=0;
    this.elapsed=0;this.lastTime=0;this.emitElapsed=0;this.soundEnabled=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xa8bfc3);
    this.scene.fog=new THREE.FogExp2(0xb2b8b0,.00078);
    this.camera=new THREE.PerspectiveCamera(58,1,.12,5000);
    try {
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.7));
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.92;
      this.renderer.domElement.setAttribute('aria-label','3D racing circuit');
      this.renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;';
      container.appendChild(this.renderer.domElement);
    } catch(error) {
      this.onStatus?.({type:'error',message:'Your browser could not start 3D graphics. Try a browser with WebGL enabled.'});
      throw error;
    }
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.paused=true;this.onStatus?.({type:'error',message:'3D graphics were interrupted. Reload to return to the circuit.'});});
    this.buildWorld();
    this.buildDust();
    this.setCar({year:2024,team:'Apex',model:'Formula',color:'#ed292f',accent:'#ffffff'});
    this.setTrack([{x:.2,y:.2},{x:.65,y:.16},{x:.85,y:.4},{x:.65,y:.56},{x:.82,y:.8},{x:.35,y:.84},{x:.16,y:.55}]);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.keyDown=e=>{
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName) || e.target?.isContentEditable) return;
      const key=e.key.toLowerCase();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) e.preventDefault();
      this.keys[key]=true;
      if(e.repeat)return;
      if(key==='r')this.reset();
      if(key==='c')this.setCamera(this.cameraMode==='chase'?'cockpit':this.cameraMode==='cockpit'?'orbit':'chase');
      if(key==='escape' && this.racing)this.pause(!this.paused);
    };
    this.keyUp=e=>{this.keys[e.key.toLowerCase()]=false;};
    this.blur=()=>{this.keys={};this.touch={throttle:0,brake:0,steer:0};if(this.racing&&!this.paused)this.pause(true);};
    this.gamepadConnected=e=>{if(!this.gamepad)this.gamepad=e.gamepad;this.onStatus?.({type:'gamepad',connected:true});};
    this.gamepadDisconnected=e=>{if(this.gamepad?.index===e.gamepad.index)this.gamepad=null;};
    window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);window.addEventListener('blur',this.blur);
    window.addEventListener('gamepadconnected',this.gamepadConnected);window.addEventListener('gamepaddisconnected',this.gamepadDisconnected);
    this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  }

  setQuality(mode) {
    const mobile=window.matchMedia('(pointer: coarse)').matches;
    this.quality=mode==='auto'?(mobile?'performance':'high'):mode;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.quality==='high'?2:1.15));
    const size=this.quality==='high'?4096:1024;
    this.sun.shadow.mapSize.set(size,size);
    this.sun.shadow.map?.dispose();this.sun.shadow.map=null;
    this.resize();
  }

  buildDust() {
    // Fixed-size particle pool: no per-frame mesh allocation or physics changes.
    this.dustAge=new Float32Array(96).fill(2);
    this.dustPositions=new Float32Array(96*3);
    this.dustColors=new Float32Array(96*3);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(this.dustPositions,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(this.dustColors,3));
    const map=canvasTexture(32,32,(c)=>{const g=c.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,32,32);});
    this.dust=new THREE.Points(geometry,new THREE.PointsMaterial({size:1.5,map,transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,opacity:.35}));
    this.dust.frustumCulled=false;this.scene.add(this.dust);this.dustCursor=0;this.dustSpawn=0;
  }

  updateDust(dt) {
    if(this.paused)return;
    this.dustSpawn+=dt;
    const emitting=this.racing&&this.offTrack&&this.speed>25;
    if(emitting&&this.dustSpawn>.035){
      this.dustSpawn=0;
      for(const side of [-1,1]){
        const i=this.dustCursor++%96,j=i*3;this.dustAge[i]=0;
        this.dustPositions[j]=this.pos.x-Math.sin(this.yaw)*1.7+Math.cos(this.yaw)*side*.8;
        this.dustPositions[j+1]=.22;
        this.dustPositions[j+2]=this.pos.z-Math.cos(this.yaw)*1.7-Math.sin(this.yaw)*side*.8;
      }
    }
    for(let i=0;i<96;i++){
      this.dustAge[i]+=dt;const j=i*3,fade=Math.max(0,1-this.dustAge[i]/1.2);
      this.dustPositions[j+1]+=dt*.65;
      this.dustColors[j]=fade*.65;this.dustColors[j+1]=fade*.5;this.dustColors[j+2]=fade*.28;
    }
    this.dust.visible=this.racing;
    this.dust.geometry.attributes.position.needsUpdate=true;this.dust.geometry.attributes.color.needsUpdate=true;
  }

  resize() {
    if(!this.renderer)return;
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }

  buildWorld() {
    this.world=new THREE.Group();this.scene.add(this.world);
    this.hemi=new THREE.HemisphereLight(0xcbddec,0x384328,2.15);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xffe3b7,3.2);this.sun.position.set(-160,210,120);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:650});
    this.sun.shadow.normalBias=.025;this.sun.shadow.bias=-.00012;this.scene.add(this.sun,this.sun.target);
    this.fill=new THREE.DirectionalLight(0x9bbde0,.4);this.fill.position.set(60,60,-90);this.scene.add(this.fill);
    const grass=noiseTexture([69,82,44],36);grass.wrapS=grass.wrapT=THREE.RepeatWrapping;grass.repeat.set(950,950);grass.anisotropy=8;
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),material(0xffffff,{map:grass,bumpMap:grass,bumpScale:.07,roughness:1,metalness:0}));
    // World-space variation keeps the grass from reading as a tiled flat carpet.
    this.ground.material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGroundPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundPosition = position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vGroundPosition;').replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p = vGroundPosition.xy;
        float patches = sin(p.x*.019 + sin(p.y*.028)*2.0)*sin(p.y*.024) * .13;
        float mowing = sin(p.x*.24+p.y*.06)*.035;
        diffuseColor.rgb *= .91 + patches + mowing;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.17,.135,.066), smoothstep(.5,.92,sin(p.x*.041)*sin(p.y*.033))*.22);
      `);
    };
    this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.08;this.ground.receiveShadow=true;this.world.add(this.ground);
    const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#537687')},horizon:{value:new THREE.Color('#d7c9ad')},sunDir:{value:new THREE.Vector3(-.5,.3,.4).normalize()}},vertexShader:'varying vec3 vPosition; void main(){ vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPosition;uniform vec3 top;uniform vec3 horizon;uniform vec3 sunDir;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}float cloud(vec2 p){float n=0.0,a=.5;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.03+13.1;a*=.5;}return n;}void main(){vec3 d=normalize(vPosition);float h=clamp(d.y,0.0,1.0);vec3 col=mix(horizon,top,pow(h,.48));float s=max(dot(d,sunDir),0.0);col+=vec3(1.0,.66,.3)*pow(s,32.0)*.24;col+=vec3(1.0,.9,.6)*smoothstep(.9994,.9998,s)*3.0;if(d.y>.015 && sunDir.y>0.0){vec2 p=d.xz/(d.y+.18)*3.0;float cover=smoothstep(.49,.72,cloud(p));float edge=smoothstep(.015,.16,d.y);vec3 light=mix(vec3(.61,.66,.69),vec3(1.0,.96,.88),cloud(p+2.0));col=mix(col,light,cover*edge*.65);}gl_FragColor=vec4(col,1.0);}'});
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(3800,32,16),skyMat);this.world.add(this.sky);
    // Continuous rolling terrain, with a flat circuit basin and distant ridgelines.
    const terrain=new THREE.PlaneGeometry(5600,5600,128,128);terrain.rotateX(-Math.PI/2);
    const terrainPositions=terrain.attributes.position, terrainColors=[];
    for(let i=0;i<terrainPositions.count;i++){
      const x=terrainPositions.getX(i),z=terrainPositions.getZ(i),r=Math.hypot(x,z);
      const blend=clamp((r-620)/600,0,1);
      const elevation=(105+Math.sin(x*.004+z*.002)*65+Math.sin(z*.007-x*.003)*37+Math.sin(x*.014)*Math.cos(z*.012)*14)*blend;
      terrainPositions.setY(i,blend>0?elevation-2:-2);
      const tint=new THREE.Color().setHSL(.245,.16, .23+elevation*.00035);
      terrainColors.push(tint.r,tint.g,tint.b);
    }
    terrain.setAttribute('color',new THREE.Float32BufferAttribute(terrainColors,3));terrain.computeVertexNormals();
    const hills=new THREE.Mesh(terrain,material(0xffffff,{vertexColors:true,roughness:1,metalness:0}));hills.receiveShadow=true;this.world.add(hills);
    this.pmrem=new THREE.PMREMGenerator(this.renderer);
    this.setWeather('clear');
  }

  setWeather(mode='sunset') {
    this.weather=mode;
    const clear=mode==='clear',cloud=mode==='overcast',night=mode==='night';
    this.sky?.material.uniforms.top.value.set(clear?'#467baf':cloud?'#7a888e':'#567d96');
    this.sky?.material.uniforms.horizon.value.set(clear?'#c4dcea':cloud?'#c0c7c8':'#dfc8a7');
    this.scene.fog.color.set(clear?'#bfd0cc':cloud?'#b8c2c1':'#c4c7b8');
    this.scene.fog.density=cloud?.00115:.00075;
    this.sun.color.set(clear?'#fff6de':cloud?'#e1e7ee':'#ffd6a0');this.sun.intensity=cloud?1.0:clear?3.4:3.6;
    this.hemi.intensity=cloud?1.35:clear?.95:1.05;
    this.renderer.toneMappingExposure=night?1.05:cloud?.98:clear?1.02:.94;
    this.sunOffset=new THREE.Vector3(clear?-180:-230,clear?300:cloud?260:95,160);
    this.sky?.material.uniforms.sunDir.value.copy(this.sunOffset).normalize();
    if(night){
      this.sky.material.uniforms.top.value.set('#172c46');this.sky.material.uniforms.horizon.value.set('#42566b');
      this.scene.fog.color.set('#202d3c');this.scene.fog.density=.0014;
      this.sun.color.set('#dbeaff');this.sun.intensity=.3;this.hemi.intensity=.45;
      this.sunOffset.set(-130,290,90);this.sky.material.uniforms.sunDir.value.set(0,-1,0);
    }
    this.fill.intensity=night?.65:.4;
    if(this.floodLights)for(const light of this.floodLights)light.intensity=night?1600:0;
    if(this.lampMaterial)this.lampMaterial.emissiveIntensity=night?5:.15;
    // Capture sky and a neutral circuit ground for a credible reflection horizon.
    if(this.pmrem){
      const environmentScene=new THREE.Scene();
      environmentScene.add(new THREE.Mesh(this.sky.geometry,this.sky.material));
      const reflectionGround=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),new THREE.MeshBasicMaterial({color:night?0x10151d:0x343b32}));
      reflectionGround.rotation.x=-Math.PI/2;reflectionGround.position.y=-3;environmentScene.add(reflectionGround);
      const previous=this.environmentTarget;
      this.environmentTarget=this.pmrem.fromScene(environmentScene,.06,.1,4500);
      this.scene.environment=this.environmentTarget.texture;
      previous?.dispose();reflectionGround.geometry.dispose();reflectionGround.material.dispose();
    }
  }

  setTrack(points,width=14) {
    this.trackPoints=points;this.trackWidth=clamp(width,8,30);this.curve=makeCurve(points);this.trackLength=this.curve.getLength();
    this.sampleCount=clamp(Math.ceil(this.trackLength/1.8),400,1800);
    this.samples=this.curve.getSpacedPoints(this.sampleCount).slice(0,-1);
    this.normals=[];this.tangents=[];
    for(let i=0;i<this.sampleCount;i++){
      const t=this.samples[(i+1)%this.sampleCount].clone().sub(this.samples[(i-1+this.sampleCount)%this.sampleCount]).normalize();
      this.tangents.push(t);this.normals.push(new THREE.Vector3(t.z,0,-t.x));
    }
    disposeGroup(this.trackGroup);this.trackGroup=new THREE.Group();this.scene.add(this.trackGroup);
    const roadTexture=noiseTexture([91,94,97],38);roadTexture.wrapS=roadTexture.wrapT=THREE.RepeatWrapping;roadTexture.anisotropy=8;
    this.roadMaterial=material(0xb0b0b0,{map:roadTexture,bumpMap:roadTexture,bumpScale:.012,roughness:.86,metalness:0});
    // World-space aggregate, resurfacing variation and fine directional wear.
    this.roadMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadPosition = position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vRoadPosition;
        float roadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float roadNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),f.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1,1)),f.x),f.y);}
      `).replace('#include <color_fragment>',`#include <color_fragment>
        vec2 rp=vRoadPosition.xz;
        float broad=roadNoise(rp*.17);
        float grain=roadNoise(rp*38.0);
        float grainFade=1.0-smoothstep(15.0,65.0,length(vViewPosition));
        diffuseColor.rgb *= .84+broad*.28+(grain-.5)*.24*grainFade;
      `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=clamp(.77+broad*.17+(grain-.5)*.1*grainFade,.65,.98);
      `);
    };
    const gravel=noiseTexture([140,128,106],75);gravel.wrapS=gravel.wrapT=THREE.RepeatWrapping;gravel.repeat.set(3,3);gravel.anisotropy=8;
    this.ribbon(-this.trackWidth/2-5,this.trackWidth/2+5,.007,material(0xc2b9a2,{map:gravel,bumpMap:gravel,bumpScale:.065,roughness:1,metalness:0}));
    this.ribbon(-this.trackWidth/2,this.trackWidth/2,.025,this.roadMaterial);
    this.ribbon(-this.trackWidth/2+.14,-this.trackWidth/2+.29,.032,material(0xcaccc2,{roughness:1}));
    this.ribbon(this.trackWidth/2-.29,this.trackWidth/2-.14,.032,material(0xcaccc2,{roughness:1}));
    // Subtle rubber laid into the racing line, with irregular translucent edges.
    const rubberLine=canvasTexture(128,512,(ctx,w,h)=>{
      const fade=ctx.createLinearGradient(0,0,0,h);
      fade.addColorStop(0,'rgba(12,14,16,0)');fade.addColorStop(.25,'rgba(12,14,16,.17)');
      fade.addColorStop(.7,'rgba(12,14,16,.23)');fade.addColorStop(1,'rgba(12,14,16,0)');
      ctx.fillStyle=fade;ctx.fillRect(0,0,w,h);
      for(let i=0;i<65;i++){ctx.fillStyle=`rgba(9,10,12,${.015+(i%5)*.008})`;ctx.fillRect(0,(i*73)%h,w,1+(i%3));}
    });
    rubberLine.wrapS=THREE.RepeatWrapping;
    const racingLine=this.ribbon(-2.8,2.8,.029,new THREE.MeshStandardMaterial({map:rubberLine,transparent:true,depthWrite:false,roughness:.82,polygonOffset:true,polygonOffsetFactor:-1}));
    const lineUV=racingLine.geometry.attributes.uv;
    for(let i=0;i<lineUV.count;i++)lineUV.setY(i,i%2);
    this.buildCircuitDetails();this.buildTrackWear();this.buildCurbs();this.buildBarriers();this.buildGrid();this.buildScenery();this.buildPaddock();this.buildNightCircuit();this.buildFans();
    this.racing=false;this.paused=false;this.reset();
    this.onStatus?.({type:'ready',message:'Circuit ready',length:this.trackLength});
  }

  ribbon(left,right,height,mat) {
    const positions=[],uv=[],indices=[];
    for(let i=0;i<=this.sampleCount;i++){
      const p=this.samples[i%this.sampleCount],n=this.normals[i%this.sampleCount];
      for(const off of [left,right]){positions.push(p.x+n.x*off,height,p.z+n.z*off);uv.push(i/this.sampleCount*this.trackLength/5,off/5);}
      if(i<this.sampleCount){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;this.trackGroup.add(mesh);return mesh;
  }

  buildCircuitDetails() {
    // Repeated geometry follows the user's circuit; all signs stay off the road.
    const paint=material(0x427f79,{roughness:.96,metalness:0});
    for(const side of [-1,1])this.ribbon(side*(this.trackWidth/2+1.1),side*(this.trackWidth/2+2.7),.019,paint).material.side=THREE.DoubleSide;
    const signs=new Map();
    const signMaterial=(text)=>{
      if(signs.has(text))return signs.get(text);
      const map=canvasTexture(512,256,(c,w,h)=>{
        c.fillStyle='#eef0e8';c.fillRect(0,0,w,h);c.fillStyle='#101820';c.fillRect(0,0,18,h);
        c.textAlign='center';c.font='bold 165px Arial';c.fillText(text,w/2,h*.75);
      });
      const m=material(0xffffff,{map,roughness:.85,side:THREE.DoubleSide});signs.set(text,m);return m;
    };
    let last=-200;
    for(let i=0;i<this.sampleCount;i+=8){
      const next=this.tangents[(i+18)%this.sampleCount];
      if(this.tangents[i].dot(next)>.96 || i*this.trackLength/this.sampleCount-last<180)continue;
      last=i*this.trackLength/this.sampleCount;
      for(const distance of [150,100,50]){
        const k=(i-Math.round(distance/this.trackLength*this.sampleCount)+this.sampleCount)%this.sampleCount;
        const p=this.samples[k].clone().addScaledVector(this.normals[k],this.trackWidth/2+4);
        if(this.nearest(p).distance<this.trackWidth/2+2)continue;
        const board=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.95),signMaterial(String(distance)));
        board.position.copy(p).y=1.1;board.rotation.y=Math.atan2(this.tangents[k].x,this.tangents[k].z)+Math.PI;
        board.castShadow=true;this.trackGroup.add(board);
      }
    }
    const bannerMap=canvasTexture(1024,128,(c,w,h)=>{
      c.fillStyle='#10151e';c.fillRect(0,0,w,h);c.fillStyle='#ef343f';c.fillRect(0,h-12,w,12);
      c.fillStyle='#ffffff';c.font='italic bold 65px Arial';c.textAlign='center';c.fillText('APEX  /  RACING',w/2,86);
    });
    const bannerMat=material(0xffffff,{map:bannerMap,roughness:.65,side:THREE.DoubleSide});
    for(let i=0;i<this.sampleCount;i+=Math.max(1,Math.floor(65/this.trackLength*this.sampleCount))){
      const p=this.samples[i].clone().addScaledVector(this.normals[i],this.trackWidth/2+8.15);
      if(this.nearest(p).distance<this.trackWidth/2+6)continue;
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(10,1.25),bannerMat);
      panel.position.copy(p).y=1.1;panel.rotation.y=Math.atan2(this.normals[i].x,this.normals[i].z)+Math.PI;
      this.trackGroup.add(panel);
    }
  }

  buildTrackWear() {
    // Curved paired tyre deposits become stronger in braking and cornering zones.
    const positions=[],colors=[],indices=[];
    for(let i=0;i<=this.sampleCount;i++){
      const k=i%this.sampleCount,t=this.tangents[k],next=this.tangents[(k+10)%this.sampleCount];
      const bend=clamp((t.x*next.z-t.z*next.x)*8,-1,1);
      const center=-bend*this.trackWidth*.18;
      for(const wheel of [-.82,.82])for(const edge of [-.12,.12]){
        const off=center+wheel+edge,p=this.samples[k],n=this.normals[k];
        positions.push(p.x+n.x*off,.037,p.z+n.z*off);
        const shade=.18+Math.abs(bend)*.16;colors.push(shade,shade,shade);
      }
      if(i<this.sampleCount){const a=i*4;for(const w of [0,2])indices.push(a+w,a+w+4,a+w+1,a+w+1,a+w+4,a+w+5);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    this.trackGroup.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x333333,vertexColors:true,transparent:true,opacity:.24,depthWrite:false,roughness:.95,polygonOffset:true,polygonOffsetFactor:-1})));
  }

  buildCurbs() {
    const positions=[],colors=[],indices=[],red=new THREE.Color('#b82724'),white=new THREE.Color('#d2cdc0');
    for(let i=0;i<this.sampleCount;i++)for(const side of [-1,1]){
      const col=Math.floor(i/this.sampleCount*this.trackLength/4)%2?white:red;
      const start=positions.length/3;
      for(const j of [i,(i+1)%this.sampleCount])for(const off of [this.trackWidth/2,this.trackWidth/2+1.05]){
        const p=this.samples[j],n=this.normals[j];positions.push(p.x+n.x*off*side,.055+(off===this.trackWidth/2?0:.035),p.z+n.z*off*side);colors.push(col.r,col.g,col.b);
      }
      indices.push(start,start+2,start+1,start+1,start+2,start+3);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const wear=noiseTexture([200,200,200],70);wear.wrapS=wear.wrapT=THREE.RepeatWrapping;
    const uv=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]*1.7,positions[i+2]*1.7);
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const curb=new THREE.Mesh(geo,material(0xffffff,{map:wear,bumpMap:wear,bumpScale:.018,vertexColors:true,side:THREE.DoubleSide,roughness:.92}));curb.receiveShadow=true;this.trackGroup.add(curb);
  }

  buildBarriers() {
    const postCount=Math.floor(this.sampleCount/4)*2;
    const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.15,1.05,.15),material(0x8e9693,{metalness:.75,roughness:.45}),postCount);
    const dummy=new THREE.Object3D();let index=0;
    for(let i=0;i<this.sampleCount-3;i+=4)for(const side of [-1,1]){
      const p=this.samples[i],n=this.normals[i];dummy.position.set(p.x+n.x*(this.trackWidth/2+8)*side,.51,p.z+n.z*(this.trackWidth/2+8)*side);dummy.updateMatrix();posts.setMatrixAt(index++,dummy.matrix);
    }
    posts.count=index;this.trackGroup.add(posts);
    for(const side of [-1,1])for(const height of [.35,.65,.9]){
      const positions=[],indices=[];
      for(let i=0;i<=this.sampleCount;i++){
        const p=this.samples[i%this.sampleCount],n=this.normals[i%this.sampleCount],off=(this.trackWidth/2+8)*side;
        positions.push(p.x+n.x*off,height-.075,p.z+n.z*off,p.x+n.x*off,height+.075,p.z+n.z*off);
        if(i<this.sampleCount){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
      this.trackGroup.add(new THREE.Mesh(geo,material(0xb0b5b2,{side:THREE.DoubleSide,metalness:.65,roughness:.35})));
    }
  }

  buildNightCircuit() {
    this.lampPositions=[];
    const step=Math.max(1,Math.round(34/this.trackLength*this.sampleCount));
    const count=Math.ceil(this.sampleCount/step)*2;
    const steel=material(0x9ca7af,{metalness:.75,roughness:.38});
    this.lampMaterial=material(0xeeffff,{emissive:0xdcefff,emissiveIntensity:this.weather==='night'?5:.15});
    const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.095,.17,13,8),steel,count);
    const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(1.5,.16,.8),this.lampMaterial,count);
    const d=new THREE.Object3D();let k=0;
    for(let i=0;i<this.sampleCount;i+=step)for(const side of [-1,1]){
      const p=this.samples[i].clone().addScaledVector(this.normals[i],side*(this.trackWidth/2+5.5));
      d.position.copy(p).setY(6.5);d.updateMatrix();poles.setMatrixAt(k,d.matrix);
      d.position.y=13;d.updateMatrix();lamps.setMatrixAt(k++,d.matrix);
      this.lampPositions.push(p.setY(12.7));
    }
    poles.count=lamps.count=k;this.trackGroup.add(poles,lamps);
    // A bounded moving light pool keeps custom circuits affordable to render.
    if(!this.floodLights){this.floodLights=Array.from({length:6},()=>{
      const light=new THREE.PointLight(0xe5efff,1600,62,2);this.scene.add(light);return light;
    });}
    for(const light of this.floodLights)light.intensity=this.weather==='night'?1600:0;
    const guideMat=new THREE.MeshBasicMaterial({color:0x8aef61,transparent:true,opacity:.24,depthWrite:false});
    const markerCount=Math.floor(this.trackLength/7);
    const markers=new THREE.InstancedMesh(new THREE.PlaneGeometry(.95,2.3),guideMat,markerCount);
    for(let i=0;i<markerCount;i++){
      const n=Math.floor(i/markerCount*this.sampleCount),p=this.samples[n],t=this.tangents[n];
      d.position.copy(p).setY(.045);d.rotation.set(-Math.PI/2,0,Math.atan2(t.x,t.z));d.updateMatrix();markers.setMatrixAt(i,d.matrix);
    }
    this.trackGroup.add(markers);
    // Trackside safety mesh, supported by the existing guardrail posts.
    const fenceTex=canvasTexture(64,64,(c,w,h)=>{
      c.clearRect(0,0,w,h);c.strokeStyle='rgba(178,192,203,.65)';c.lineWidth=1.5;
      for(let x=-64;x<128;x+=16){c.beginPath();c.moveTo(x,0);c.lineTo(x+64,64);c.stroke();c.beginPath();c.moveTo(x,0);c.lineTo(x-64,64);c.stroke();}
    });
    fenceTex.wrapS=fenceTex.wrapT=THREE.RepeatWrapping;
    const fenceMat=new THREE.MeshStandardMaterial({map:fenceTex,transparent:true,alphaTest:.12,side:THREE.DoubleSide,roughness:.6,metalness:.4});
    for(const side of [-1,1]){
      const vertices=[],uv=[],indices=[];
      for(let i=0;i<=this.sampleCount;i++){
        const p=this.samples[i%this.sampleCount],n=this.normals[i%this.sampleCount],off=side*(this.trackWidth/2+8);
        for(const y of [1,3.5]){vertices.push(p.x+n.x*off,y,p.z+n.z*off);uv.push(i/this.sampleCount*this.trackLength*2,y*2);}
        if(i<this.sampleCount){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();this.trackGroup.add(new THREE.Mesh(g,fenceMat));
    }
  }

  buildGrid() {
    const p=this.samples[0],t=this.tangents[0],n=this.normals[0];
    const tex=canvasTexture(256,64,(ctx,w,h)=>{ctx.fillStyle='#e6e5d9';ctx.fillRect(0,0,w,h);ctx.fillStyle='#242a28';for(let x=0;x<16;x++)for(let y=0;y<2;y++)if((x+y)%2===0)ctx.fillRect(x*16,y*32,16,32);});
    const line=new THREE.Mesh(new THREE.PlaneGeometry(this.trackWidth,1.5),material(0xffffff,{map:tex,roughness:1}));
    line.rotation.x=-Math.PI/2;line.rotation.z=Math.atan2(t.x,t.z);line.position.copy(p).y=.052;this.trackGroup.add(line);
    const white=material(0xd0d1c5,{roughness:1});
    for(let k=1;k<=5;k++)for(const side of [-1,1]){
      // Follow the actual road behind the line, including a curved starting sector.
      const distance=k*8-(side===1?3:0);
      const index=(this.sampleCount-Math.round(distance/this.trackLength*this.sampleCount)%this.sampleCount)%this.sampleCount;
      const gridNormal=this.normals[index],gridTangent=this.tangents[index];
      const center=this.samples[index].clone().addScaledVector(gridNormal,side*this.trackWidth*.23);
      for(const dx of [-1.05,1.05]){
        const mark=new THREE.Mesh(new THREE.BoxGeometry(.08,.025,2.7),white);mark.position.copy(center).addScaledVector(gridNormal,dx);mark.position.y=.049;mark.rotation.y=Math.atan2(gridTangent.x,gridTangent.z);this.trackGroup.add(mark);
      }
    }
    // A restrained start gantry gives custom circuits a recognizable pit straight.
    const gantry=new THREE.Group();gantry.position.copy(p);gantry.rotation.y=Math.atan2(t.x,t.z);
    const steel=material(0x313b3e,{metalness:.8,roughness:.4});
    for(const x of [-this.trackWidth/2-3,this.trackWidth/2+3]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(.5,7,.5),steel);post.position.set(x,3.5,0);post.castShadow=true;gantry.add(post);
    }
    const beam=new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth+6.5,1.35,.65),steel);beam.position.y=6.5;beam.castShadow=true;gantry.add(beam);
    const title=canvasTexture(1024,128,(ctx,w,h)=>{ctx.fillStyle='#17282b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e9f0e4';ctx.font='bold 64px Arial';ctx.textAlign='center';ctx.fillText('APEX  /  CIRCUIT LAB',w/2,87);ctx.fillStyle='#d7ff65';ctx.fillRect(0,h-7,w,7);});
    const board=new THREE.Mesh(new THREE.PlaneGeometry(this.trackWidth+4,1.15),new THREE.MeshBasicMaterial({map:title,side:THREE.DoubleSide}));board.position.set(0,6.5,-.34);board.rotation.y=Math.PI;gantry.add(board);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(2.6,.65,.25),material(0x14191b));panel.position.set(0,5.45,0);gantry.add(panel);
    for(let i=0;i<5;i++){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),material(0x851a13,{emissive:0xc42c11,emissiveIntensity:.4}));lamp.position.set((i-2)*.47,5.45,-.15);gantry.add(lamp);}
    this.trackGroup.add(gantry);
  }

  nearest(position, stride=1) {
    let best=Infinity,index=0;
    for(let i=0;i<this.samples.length;i+=stride){const p=this.samples[i],dx=position.x-p.x,dz=position.z-p.z,d=dx*dx+dz*dz;if(d<best){best=d;index=i;}}
    return {index,distance:Math.sqrt(best)};
  }

  buildScenery() {
    let seed=72517;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    const trees=[];
    for(let i=0;i<650;i++){
      const p=new THREE.Vector3((random()-.5)*1700,0,(random()-.5)*1700);
      if(this.nearest(p,8).distance<40)continue;
      trees.push({p,s:4+random()*8,rot:random()*TAU});
    }
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.23,1,5),material(0x524633,{roughness:1}),trees.length);
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.58,2),material(0x344a31,{roughness:1,metalness:0}),trees.length*3);
    const dummy=new THREE.Object3D();
    trees.forEach((tree,i)=>{
      dummy.position.copy(tree.p);dummy.position.y=tree.s*.34;dummy.scale.set(tree.s*.55,tree.s*.7,tree.s*.55);dummy.rotation.set(0,tree.rot,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      for(let k=0;k<3;k++){dummy.position.set(tree.p.x+Math.sin(tree.rot+k*2)*tree.s*.19,tree.s*(.60+k*.15),tree.p.z+Math.cos(tree.rot+k*2)*tree.s*.19);dummy.scale.set(tree.s*(.85-k*.12),tree.s*.64,tree.s*(.8-k*.09));dummy.updateMatrix();crowns.setMatrixAt(i*3+k,dummy.matrix);crowns.setColorAt(i*3+k,new THREE.Color().setHSL(.23+random()*.05,.23+random()*.15,.17+random()*.10));}
    });
    crowns.castShadow=true;this.trackGroup.add(trunks,crowns);
    const boardMat=material(0xe3e6dc,{roughness:.7});
    for(let j=1;j<8;j++){
      const idx=Math.floor(j/8*this.sampleCount),pt=this.samples[idx],nm=this.normals[idx],tg=this.tangents[idx];
      const b=new THREE.Mesh(new THREE.BoxGeometry(.15,.85,3),boardMat);b.position.copy(pt).addScaledVector(nm,this.trackWidth/2+6);b.position.y=.6;b.rotation.y=Math.atan2(tg.x,tg.z);this.trackGroup.add(b);
    }
  }

  buildFans() {
    disposeGroup(this.fanGroup);
    this.fanGroup=new THREE.Group();this.trackGroup.add(this.fanGroup);
    this.fanYear=Number(this.carData.year);
    const teams=[...new Map(CARS.filter(c=>c.year===this.fanYear).map(c=>[c.team,c])).values()];
    if(!teams.length)return;
    const fans=[],sites=[],dummy=new THREE.Object3D();
    const concrete=material(0x9b9c94,{roughness:1}),poleMat=material(0xb9c3c8,{metalness:.7});
    // Compact terraces follow both sides of the entire lap. Check the whole
    // footprint so a custom circuit's return leg never runs through a stand.
    const count=Math.max(teams.length*2,Math.min(90,Math.floor(this.trackLength/24)));
    for(let k=0;k<count;k++)for(const side of [-1,1]){
      const i=Math.floor(k/count*this.sampleCount),n=this.normals[i],t=this.tangents[i];
      let center;
      for(const setback of [19,31,45]){
        const candidate=this.samples[i].clone().addScaledVector(n,side*(this.trackWidth/2+setback));
        let clear=true;
        for(const x of [-3,0,3])for(const z of [-8,0,8]){
          if(this.nearest(candidate.clone().addScaledVector(n,x).addScaledVector(t,z)).distance<this.trackWidth/2+12)clear=false;
        }
        // Keep the start/paddock area free of overlapping terraces.
        if(k/count<.08 || k/count>.96)clear=false;
        if(clear){center=candidate;break;}
      }
      if(!center)continue;
      sites.push({center,n,t});
      for(let row=0;row<4;row++){
        const slab=new THREE.Mesh(new THREE.BoxGeometry(1.3,.55,15),concrete);
        slab.position.copy(center).addScaledVector(n,side*row*1.25);slab.position.y=row*.55+.275;
        slab.rotation.y=Math.atan2(t.x,t.z);slab.receiveShadow=true;this.fanGroup.add(slab);
        for(let col=0;col<18;col++){
          const p=center.clone().addScaledVector(n,side*row*1.25).addScaledVector(t,(col-8.5)*.79);
          p.y=(row+1)*.55;
          fans.push({p,color:teams[(k+col+row)%teams.length].color,height:.85+((col*7+row*3+k)%5)*.07});
        }
      }
    }
    const shirts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.29,1,5),material(0xffffff,{roughness:1}),fans.length);
    const heads=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,1),material(0xffffff,{roughness:1}),fans.length);
    const skin=[0xf0c5a3,0xc99068,0x875638,0x593e30];
    fans.forEach((f,i)=>{
      dummy.position.copy(f.p);dummy.position.y+=f.height/2;dummy.scale.set(1,f.height,1);dummy.updateMatrix();shirts.setMatrixAt(i,dummy.matrix);shirts.setColorAt(i,new THREE.Color(f.color));
      dummy.position.y=f.p.y+f.height+.18;dummy.scale.setScalar(1);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);heads.setColorAt(i,new THREE.Color(skin[i%skin.length]));
    });
    this.fanGroup.add(shirts,heads);this.flags=[];
    const flagMaterials=teams.map(team=>material(0xffffff,{side:THREE.DoubleSide,roughness:.9,map:canvasTexture(512,256,(c,w,h)=>{
      c.fillStyle=team.color;c.fillRect(0,0,w,h);c.fillStyle=team.accent;c.fillRect(0,h-40,w,25);
      c.fillStyle='#111820';c.fillRect(15,65,w-30,100);c.fillStyle='#ffffff';c.font='bold 44px Arial';c.textAlign='center';c.fillText(team.team.toUpperCase(),w/2,130,w-48);
    })}));
    // Cycle every constructor before repeating, including historical seasons.
    sites.forEach((site,i)=>{
      const p=site.center.clone().addScaledVector(site.t,7.5);
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.065,.095,8,6),poleMat);pole.position.copy(p).y=4;this.fanGroup.add(pole);
      const cloth=new THREE.Mesh(new THREE.PlaneGeometry(3.8,1.9,12,3),flagMaterials[i%teams.length]);
      cloth.position.copy(p).y=6.8;cloth.geometry.translate(1.9,0,0);cloth.rotation.y=Math.atan2(site.t.x,site.t.z);
      cloth.userData.phase=i*.73;this.flags.push(cloth);this.fanGroup.add(cloth);
    });
  }

  buildPaddock() {
    const concrete=material(0x9b9c95,{roughness:.94,metalness:0});
    const steel=material(0x454c51,{roughness:.48,metalness:.65});
    const cladding=material(0xd0d2cf,{roughness:.7,metalness:.22});
    const glass=new THREE.MeshPhysicalMaterial({color:0x436376,roughness:.16,metalness:.35,clearcoat:1});
    const dark=material(0x24282a,{roughness:.9,metalness:0});
    const box=(group,w,h,d,mat,x,y,z)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);
      mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
    };
    // Validate the whole footprint against custom circuits, including nearby return legs.
    const place=(fraction,width,depth)=>{
      const i=Math.floor(fraction*this.sampleCount),t=this.tangents[i],n=this.normals[i];
      for(const side of [-1,1])for(const setback of [24,42,64]){
        const center=this.samples[i].clone().addScaledVector(n,side*(this.trackWidth/2+setback+width/2));
        let clear=true;
        for(let x=-width/2;x<=width/2;x+=width/4)for(let z=-depth/2;z<=depth/2;z+=depth/8){
          const probe=center.clone().addScaledVector(n,x).addScaledVector(t,z);
          if(this.nearest(probe).distance<this.trackWidth/2+12)clear=false;
        }
        if(clear){const g=new THREE.Group();g.position.copy(center);g.rotation.y=Math.atan2(t.x,t.z)+(side<0?Math.PI:0);this.trackGroup.add(g);return g;}
      }
      return null;
    };
    const pit=place(.0,16,64);
    if(pit){
      box(pit,20,.14,68,concrete,0,0,0);
      box(pit,12,5.8,60,cladding,1,2.9,0);
      box(pit,12.8,.3,62,steel,1,6,0);
      box(pit,.12,1.7,57,glass,-5.07,4.6,0);
      for(let k=0;k<10;k++){
        const z=(k-4.5)*5.8;
        box(pit,.16,2.8,4.8,dark,-5.1,1.5,z);
        box(pit,.3,3.4,.22,concrete,-5.25,1.7,z-2.55);
        const sign=canvasTexture(128,64,(c)=>{c.fillStyle=['#9d3d2f','#305b73','#6b7549'][k%3];c.fillRect(0,0,128,64);c.fillStyle='#f1f0e9';c.font='bold 38px Arial';c.textAlign='center';c.fillText(String(k+1).padStart(2,'0'),64,45);});
        const plaque=new THREE.Mesh(new THREE.PlaneGeometry(2,.7),material(0xffffff,{map:sign,roughness:.8}));plaque.rotation.y=-Math.PI/2;plaque.position.set(-5.2,3.35,z);pit.add(plaque);
        for(let rib=0;rib<7;rib++)box(pit,.04,.025,4.7,steel,-5.21,.4+rib*.32,z);
      }
      // Roof hospitality terrace, balustrade and glazing mullions.
      box(pit,11,.12,59,dark,1,6.24,0);
      for(let z=-28;z<=28;z+=2.8){
        box(pit,.07,1.75,.07,steel,-5.17,4.6,z);
        box(pit,.07,1.15,.07,steel,-5,6.8,z);
      }
      box(pit,.05,.06,59,steel,-5,7.37,0);
      box(pit,.03,.8,59,glass,-5,6.78,0);
      for(let z=-24;z<=24;z+=12){
        box(pit,5,.10,4,cladding,0,8.6,z);
        box(pit,.10,2.3,.10,steel,0,7.45,z);
        for(const offset of [-1.2,1.2])box(pit,.8,.45,2,dark,offset,6.5,z);
      }
      box(pit,4,.18,63,cladding,-5.7,3.8,0);
      for(const z of [-29,0,29])box(pit,.16,3.8,.16,steel,-7.2,1.9,z);
    }
    const tower=place(.06,12,13);
    if(tower){
      box(tower,10,13,11,cladding,0,6.5,0);
      for(let level=0;level<4;level++){
        box(tower,10.4,1.65,11.4,glass,0,2.4+level*2.8,0);
        box(tower,10.8,.16,11.8,steel,0,3.3+level*2.8,0);
      }
      box(tower,12,.35,13,cladding,0,13.2,0);
      box(tower,.14,5,.14,steel,0,15.5,0);
    }
    for(const fraction of [.17,.39,.72,.91]){
      const post=place(fraction,4,5);if(!post)continue;
      box(post,3,1.1,4,concrete,0,.55,0);
      box(post,3.4,.15,4.4,cladding,0,3.1,0);
      for(const x of [-1.4,1.4])for(const z of [-1.9,1.9])box(post,.1,2,.1,steel,x,2,z);
      const orange=material(0xf16a16,{roughness:.9});
      for(const z of [-.8,.8]){
        box(post,.48,.75,.3,orange,0,1.65,z);
        const head=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),material(0xe1bc9b));head.position.set(0,2.18,z);post.add(head);
      }
    }
    for(const fraction of [.28,.61,.83]){
      const stand=place(fraction,14,38);if(!stand)continue;
      for(let row=0;row<7;row++){
        box(stand,1.6,.55,36,concrete,row*1.5-5,.35+row*.62,0);
        for(let section=0;section<3;section++)box(stand,.65,.38,10.5,section%2?steel:glass,row*1.5-5,.8+row*.62,(section-1)*12);
      }
      box(stand,15,.23,40,cladding,0,7.2,0);
      for(const z of [-18,-6,6,18])box(stand,.2,7.2,.2,steel,5.5,3.6,z);
    }
  }

  setCar(car) {
    this.carData={year:2024,color:'#ed292f',accent:'#ffffff',...car};
    if(this.trackGroup && this.fanYear!==Number(this.carData.year))this.buildFans();
    disposeGroup(this.car);this.car=new THREE.Group();this.carBody=new THREE.Group();this.car.add(this.carBody);this.scene.add(this.car);
    this.wheels=[];this.frontWheels=[];
    const contact=canvasTexture(128,256,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,8,w/2,h/2,h/2);g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(.5,'rgba(0,0,0,.38)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.7,5.5),new THREE.MeshBasicMaterial({map:contact,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.042;this.car.add(shadow);
    const year=Number(this.carData.year),modern=year>=2022,wide=year>=2017,old=year<=2008;
    const body=new THREE.MeshPhysicalMaterial({color:this.carData.color||'#ee2631',metalness:.48,roughness:.22,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.35});
    const accent=new THREE.MeshPhysicalMaterial({color:this.carData.accent||'#ffffff',metalness:.25,roughness:.3,clearcoat:.9,clearcoatRoughness:.18});
    const weave=canvasTexture(64,64,(c)=>{c.fillStyle='#35383a';c.fillRect(0,0,64,64);for(let y=0;y<64;y+=8)for(let x=0;x<64;x+=8){c.fillStyle=(x/8+y/8)%2?'#232628':'#484b4c';c.fillRect(x,y,7,7);c.fillStyle='#55585a';c.fillRect(x,y,6,1);}});
    weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(8,8);weave.anisotropy=4;
    const carbon=material(0x52595d,{map:weave,bumpMap:weave,bumpScale:.002,metalness:.22,roughness:.42});
    const tyreTexture=noiseTexture([115,115,112],34);tyreTexture.wrapS=tyreTexture.wrapT=THREE.RepeatWrapping;tyreTexture.repeat.set(3,14);tyreTexture.anisotropy=4;
    const rubber=material(0x262829,{map:tyreTexture,bumpMap:tyreTexture,bumpScale:.003,metalness:0,roughness:.96});
    const metal=material(0x69706e,{metalness:.9,roughness:.26});
    const mesh=(geo,mat,x=0,y=0,z=0,parent=this.carBody)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
    const box=(w,h,d,mat,x=0,y=0,z=0,parent)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent);
    const rod=(a,b,r=.025,mat=carbon,parent=this.carBody)=>{const delta=b.clone().sub(a),m=mesh(new THREE.CylinderGeometry(r,r,delta.length(),7),mat,0,0,0,parent);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,delta.normalize());return m;};
    const loft=(sections,mat)=>{
      // Subdivide longitudinally with bounded cubic interpolation to keep highlights continuous.
      const source=sections;sections=[];
      for(let i=0;i<source.length-1;i++)for(let k=0;k<8;k++){
        const t=k/8,a=source[Math.max(0,i-1)],b=source[i],c=source[i+1],d=source[Math.min(source.length-1,i+2)];
        sections.push(b.map((v,j)=>j===0?v+(c[j]-v)*t:clamp(.5*((2*v)+(-a[j]+c[j])*t+(2*a[j]-5*v+4*c[j]-d[j])*t*t+(-a[j]+3*v-3*c[j]+d[j])*t*t*t),Math.min(v,c[j]),Math.max(v,c[j]))));
      }
      sections.push(source[source.length-1]);
      const vertices=[],indices=[],uv=[],segments=48;
      // Elliptical cross-sections remove the old four-sided box silhouette.
      sections.forEach(([z,w,bottom,top])=>{
        for(let j=0;j<segments;j++){
          const a=j/segments*TAU;
          vertices.push(Math.cos(a)*w,(bottom+top)/2+Math.sin(a)*(top-bottom)/2,z);uv.push(j/segments,z*.3);
        }
      });
      for(let i=0;i<sections.length-1;i++)for(let j=0;j<segments;j++){
        const a=i*segments+j,b=i*segments+(j+1)%segments;
        indices.push(a,b,a+segments,b,b+segments,a+segments);
      }
      for(let j=1;j<segments-1;j++){
        indices.push(0,j+1,j);
        const a=(sections.length-1)*segments;indices.push(a,a+j,a+j+1);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat);
    };
    const track=wide?.91:.81,wheelR=modern?.36:.325,rearZ=-1.5,frontZ=1.46;
    // Carbon floor, sculpted chassis, raised nose, and tapered engine cover.
    box(wide?1.76:1.5,.07,3.28,carbon,0,.19,-.15);
    loft([[-2.05,.15,.24,.42],[-1.48,.42,.22,.62],[-.85,.46,.23,.77],[.15,.37,.25,.76],[.75,.28,.28,old?.72:.61],[1.55,old?.17:.12,old?.48:.25,old?.65:.39],[2.18,.08,.25,.32]],body);
    loft([[-1.9,.09,.42,.48],[-1.24,.24,.45,.99],[-.7,.28,.54,1.12],[-.38,.25,.63,1.04]],body);
    const intake=mesh(new THREE.TorusGeometry(.115,.047,8,16),carbon,0,1.055,-.55);intake.rotation.x=Math.PI/2;
    for(const s of [-1,1]){
      const side=loft([[-1.58,.08,.27,.35],[-1.18,.21,.25,.44],[-.65,modern?.31:.29,modern?.38:.26,.59],[-.12,modern?.35:.28,modern?.44:.33,modern?.73:.66],[.34,.25,modern?.47:.38,modern?.73:.65],[.47,.20,modern?.49:.41,modern?.66:.58]],body);side.position.x=s*(wide?.55:.46);
      const inlet=mesh(new THREE.SphereGeometry(1,14,8),carbon,s*(wide?.54:.48),modern?.585:.49,.475);inlet.scale.set(.19,modern?.064:.13,.022);
      box(.045,.04,1.8,accent,s*(wide?.78:.64),.49,-.55);
      if(modern){const fin=box(.055,.22,1.18,carbon,s*.82,.3,-.55);fin.rotation.z=s*.16;}
      else {const barge=box(.035,.39,.46,carbon,s*.58,.39,.55);barge.rotation.y=s*-.2;}
    }
    if(modern)for(const side of [-1,1]){
      // Cooling louvres and floor fences add close-range silhouette detail.
      for(let k=0;k<9;k++){
        const vent=box(.19,.012,.023,carbon,side*.52,.645-k*.009,-.12-k*.085);vent.rotation.z=side*.15;
      }
      for(let k=0;k<3;k++){
        const fence=box(.023,.12,.42,carbon,side*(.61+k*.105),.25,.43);fence.rotation.y=-side*.22;
      }
    }
    // A recessed cockpit, steering wheel, seat and driver make close views legible.
    const cockpit=mesh(new THREE.SphereGeometry(1,18,12),carbon,0,.76,-.02);cockpit.scale.set(.29,.1,.55);
    box(.38,.35,.3,carbon,0,.71,-.31);
    const helmet=mesh(new THREE.SphereGeometry(.17,20,16),material(0xf1d56d,{metalness:.3,roughness:.28}),0,.93,-.12);helmet.scale.set(1,1.06,1.02);
    const visor=mesh(new THREE.SphereGeometry(.174,20,12,0,Math.PI*2,Math.PI*.36,Math.PI*.25),material(0x10242c,{metalness:.85,roughness:.15}),0,.95,-.10);
    visor.rotation.y=0;this.driverHead=[helmet,visor];
    this.steeringAssembly=new THREE.Group();this.steeringAssembly.position.set(0,.83,.365);this.steeringAssembly.rotation.x=.2;this.carBody.add(this.steeringAssembly);
    const steeringShape=new THREE.Shape();
    steeringShape.moveTo(-.21,-.065);steeringShape.lineTo(-.23,.08);steeringShape.quadraticCurveTo(-.18,.14,-.12,.09);steeringShape.lineTo(.12,.09);steeringShape.quadraticCurveTo(.18,.14,.23,.08);steeringShape.lineTo(.21,-.065);steeringShape.lineTo(.12,-.09);steeringShape.lineTo(-.12,-.09);steeringShape.closePath();
    mesh(new THREE.ExtrudeGeometry(steeringShape,{depth:.035,bevelEnabled:true,bevelSize:.012,bevelThickness:.009,bevelSegments:3,steps:1}),carbon,0,0,0,this.steeringAssembly);
    for(const side of [-1,1]){
      const grip=mesh(new THREE.CapsuleGeometry(.035,.12,5,10),rubber,side*.195,0,-.014,this.steeringAssembly);grip.rotation.z=-side*.18;
      for(let k=0;k<3;k++){
        const button=mesh(new THREE.CylinderGeometry(.013,.013,.008,12),material([0xe63838,0x3bd1ff,0xf1d047][k]),side*(.13+k%2*.023),.053-k*.047,-.02,this.steeringAssembly);button.rotation.x=Math.PI/2;
      }
      const dial=mesh(new THREE.CylinderGeometry(.024,.024,.018,16),metal,side*.073,-.052,-.025,this.steeringAssembly);dial.rotation.x=Math.PI/2;
      box(.003,.024,.002,accent,side*.073,-.047,-.036,this.steeringAssembly);
      box(.04,.14,.018,metal,side*.16,0,.05,this.steeringAssembly);
    }
    this.dashTexture=canvasTexture(256,128,(c,w,h)=>{c.fillStyle='#061016';c.fillRect(0,0,w,h);});
    const dash=mesh(new THREE.PlaneGeometry(.20,.095),new THREE.MeshBasicMaterial({map:this.dashTexture}),0,.02,-.018,this.steeringAssembly);dash.rotation.y=Math.PI;
    for(let k=0;k<11;k++)mesh(new THREE.SphereGeometry(.006,6,4),material(k<4?0x34ed79:k<8?0xe74b38:0x4a7aff,{emissive:k<4?0x34ed79:k<8?0xe74b38:0x4a7aff,emissiveIntensity:.8}),-.075+k*.015,.082,-.023,this.steeringAssembly);
    if(year>=2018){
      const haloPoints=[new THREE.Vector3(-.29,.91,-.40),new THREE.Vector3(-.31,1.13,-.11),new THREE.Vector3(-.22,1.15,.39),new THREE.Vector3(0,1.13,.54),new THREE.Vector3(.22,1.15,.39),new THREE.Vector3(.31,1.13,-.11),new THREE.Vector3(.29,.91,-.40)];
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPoints),34,.032,7,false),carbon);
      rod(new THREE.Vector3(0,.66,.63),new THREE.Vector3(0,1.13,.54),.026,carbon);
    }
    // Front and rear wings with individual flaps, end plates and supports.
    const frontWidth=wide?2:old?1.68:1.8;
    const aerofoil=(width,chord,mat,x,y,z,sweep=0)=>{
      const vertices=[],indices=[],span=32,profile=12;
      for(let i=0;i<=span;i++)for(let j=0;j<=profile;j++){
        const u=i/span*2-1,a=j/profile*TAU;
        vertices.push(u*width/2,Math.sin(a)*.018+Math.pow(Math.abs(u),3)*.07,Math.cos(a)*chord/2+u*u*sweep);
      }
      for(let i=0;i<span;i++)for(let j=0;j<profile;j++){
        const a=i*(profile+1)+j,b=a+profile+1;indices.push(a,b,a+1,a+1,b,b+1);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
      return mesh(g,mat,x,y,z);
    };
    for(let j=0;j<(modern?4:3);j++){
      const wing=aerofoil(frontWidth-j*.08,.23,j%2?body:carbon,0,.20+j*.045,2.18-j*.16,-.13);wing.rotation.x=.12;
    }
    for(const s of [-1,1]){
      const end=box(.05,modern?.31:.24,.71,body,s*(frontWidth/2-.02),.33,1.95);end.rotation.z=s*-.05;
      rod(new THREE.Vector3(s*.11,.34,1.93),new THREE.Vector3(s*.17,.19,1.97),.034,carbon);
    }
    const rearWidth=old?1.02:wide?1.12:.88;
    if(modern){
      for(const side of [-1,1]){
        const path=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.43,.57,-2),new THREE.Vector3(side*.58,.81,-2),new THREE.Vector3(side*.57,1.10,-2),new THREE.Vector3(side*.44,1.22,-2)]);
        const vertices=[],uv=[],indices=[];
        for(let i=0;i<=24;i++){
          const p=path.getPoint(i/24);
          for(const z of [-.23,.23]){vertices.push(p.x,p.y,p.z+z);uv.push(i/24,z+.23);}
          if(i<24){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
        }
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const endMaterial=body.clone();endMaterial.side=THREE.DoubleSide;mesh(g,endMaterial);
      }
      for(const side of [-1,1]){
        const brow=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.83,.68,1.73),new THREE.Vector3(side*.91,.77,1.47),new THREE.Vector3(side*.91,.66,1.2)]);
        mesh(new THREE.TubeGeometry(brow,20,.022,8,false),carbon);
        rod(new THREE.Vector3(side*.72,.37,1.44),new THREE.Vector3(side*.83,.68,1.48),.018,carbon);
      }
    }else for(const s of [-1,1])box(.055,.67,.58,body,s*rearWidth/2,.85,-1.99);
    for(let j=0;j<3;j++){const wing=aerofoil(rearWidth,.26,j===2?accent:carbon,0,1.13+j*.055,-2.13+j*.16,.035);wing.rotation.x=-.12;}
    for(const s of [-1,1])rod(new THREE.Vector3(s*.2,.36,-1.73),new THREE.Vector3(s*.2,1.15,-1.93),.025,carbon);
    box(1.05,.12,.47,carbon,0,.23,-1.94);
    for(let i=-2;i<=2;i++){const diffuser=box(.035,.18,.45,carbon,i*.2,.19,-1.94);diffuser.rotation.x=-.15;}
    const exhaust=mesh(new THREE.CylinderGeometry(.054,.062,.34,12),metal,0,.6,-1.94);exhaust.rotation.x=Math.PI/2;
    const rainLight=box(.105,.08,.04,material(0x910c0c,{emissive:0xff2211,emissiveIntensity:.85}),0,.34,-2.20);
    // Curved sidewall typography and wear marks, shared across all four tyres.
    const sidewallMap=canvasTexture(512,512,(c,w,h)=>{
      c.clearRect(0,0,w,h);c.translate(w/2,h/2);c.fillStyle='#d9bb50';
      c.font='bold 30px Arial';c.textAlign='center';c.textBaseline='middle';
      for(const [word,start] of [['APEX',-.32],['P ZERO',Math.PI-.5]])for(let i=0;i<word.length;i++){
        c.save();c.rotate(start+i*.18);c.translate(0,-201);c.fillText(word[i],0,0);c.restore();
      }
      c.strokeStyle='rgba(155,157,150,.23)';c.lineWidth=2;
      for(const r of [157,233]){c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();}
    });
    const sidewallMaterial=new THREE.MeshStandardMaterial({map:sidewallMap,transparent:true,depthWrite:false,roughness:.9,polygonOffset:true,polygonOffsetFactor:-1});
    // Exposed suspension, brake ducts, sidewall lettering and grooved early-era tyres.
    for(const z of [frontZ,rearZ])for(const s of [-1,1]){
      const front=z===frontZ,ww=front?(modern?.29:.245):(modern?.4:.34);
      const wheelGroup=new THREE.Group();wheelGroup.position.set(s*track,wheelR,z);this.carBody.add(wheelGroup);
      const spinGroup=new THREE.Group();wheelGroup.add(spinGroup);this.wheels.push(spinGroup);if(front)this.frontWheels.push(wheelGroup);
      const disc=mesh(new THREE.CylinderGeometry(wheelR*.55,wheelR*.55,.035,32),material(0x777774,{metalness:.8,roughness:.55}),0,0,0,spinGroup);disc.rotation.z=Math.PI/2;
      const tire=mesh(new THREE.LatheGeometry([new THREE.Vector2(wheelR*.59,-ww/2),new THREE.Vector2(wheelR*.9,-ww/2),new THREE.Vector2(wheelR*.99,-ww*.37),new THREE.Vector2(wheelR,0),new THREE.Vector2(wheelR*.99,ww*.37),new THREE.Vector2(wheelR*.9,ww/2),new THREE.Vector2(wheelR*.59,ww/2)],48),rubber,0,0,0,spinGroup);tire.rotation.z=Math.PI/2;
      for(const side of [-1,1]){
        const rim=mesh(new THREE.CylinderGeometry(wheelR*.60,wheelR*.60,.025,24),modern?carbon:metal,side*(ww/2+.008),0,0,spinGroup);rim.rotation.z=Math.PI/2;
        const hub=mesh(new THREE.CylinderGeometry(.064,.064,.035,12),material(s===1?0xe53925:0x427bd4,{metalness:.7}),side*(ww/2+.029),0,0,spinGroup);hub.rotation.z=Math.PI/2;
        const lettering=mesh(new THREE.PlaneGeometry(wheelR*2,wheelR*2),sidewallMaterial,side*(ww/2+.021),0,0,spinGroup);lettering.rotation.y=side*Math.PI/2;
        const ring=mesh(new THREE.TorusGeometry(wheelR*.82,.003,5,48),material(0xeacb46,{roughness:.65}),side*(ww/2+.016),0,0,spinGroup);ring.rotation.y=Math.PI/2;
        if(!modern)for(let k=0;k<10;k++){
          const a=k/10*TAU,spoke=box(.023,.025,wheelR*1.07,metal,side*(ww/2+.022),0,0,spinGroup);spoke.rotation.x=a;
        }
      }
      if(old)for(let k=-1;k<=1;k++){
        const groove=mesh(new THREE.TorusGeometry(wheelR+.0005,.006,5,32),material(0x30332f,{roughness:1}),k*ww*.21,0,0,spinGroup);groove.rotation.y=Math.PI/2;
      }
      for(const sy of [.27,.49])for(const dz of [-.36,.3])rod(new THREE.Vector3(s*.28,sy,z+dz),new THREE.Vector3(s*(track-.08),wheelR,z),.018,carbon);
      rod(new THREE.Vector3(s*.20,.64,z-.2),new THREE.Vector3(s*(track-.1),wheelR-.06,z+.08),.022,carbon);
      const brake=mesh(new THREE.SphereGeometry(.14,12,8),carbon,s*(track-.17),wheelR,z+.03);brake.scale.set(.45,1,1);
    }
    for(const s of [-1,1]){
      rod(new THREE.Vector3(s*.23,.71,.24),new THREE.Vector3(s*.51,.8,.34),.014,carbon);
      const mirror=mesh(new THREE.SphereGeometry(1,10,8),body,s*.53,.81,.35);mirror.scale.set(.12,.053,.062);
    }
    const label=canvasTexture(512,128,(ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle=this.carData.accent||'#fff';ctx.textAlign='center';ctx.font='italic bold 64px Arial';ctx.fillText(String(this.carData.team||'APEX').toUpperCase().slice(0,15),w/2,84);});
    for(const s of [-1,1]){
      const decal=new THREE.Mesh(new THREE.PlaneGeometry(.35,1.34),new THREE.MeshBasicMaterial({map:label,transparent:true,depthWrite:false,side:THREE.DoubleSide}));decal.rotation.x=-Math.PI/2;decal.rotation.z=s*Math.PI/2;decal.position.set(s*(wide?.57:.48),.647,-.57);this.carBody.add(decal);
    }
    const number=canvasTexture(128,128,(ctx,w,h)=>{ctx.fillStyle=this.carData.accent||'#fff';ctx.font='italic bold 94px Arial';ctx.textAlign='center';ctx.fillText(String(year).slice(-2),w/2,100);});
    const num=new THREE.Mesh(new THREE.PlaneGeometry(.28,.39),new THREE.MeshBasicMaterial({map:number,transparent:true,depthWrite:false}));num.rotation.x=-Math.PI/2;num.position.set(0,old?.728:.63,.74);this.carBody.add(num);
    this.car.position.copy(this.pos);this.car.rotation.y=this.yaw;
  }

  setOpponents(players) {
    this.opponents??=new Map();
    const ids=new Set(players.map(p=>p.id));
    for(const [id,other] of this.opponents)if(!ids.has(id)){disposeGroup(other.car);this.opponents.delete(id);}
    for(const p of players){
      let other=this.opponents.get(p.id);
      if(!other){other={scene:this.scene,pos:new THREE.Vector3(),yaw:0};RaceEngine.prototype.setCar.call(other,p.car);this.opponents.set(p.id,other);}
      other.target=p.state;other.car.visible=!!p.state;
    }
  }

  start() {
    if(!this.racing){this.reset();this.racing=true;}
    this.paused=false;if(this.cameraMode==='orbit')this.setCamera('cockpit');
    if(this.soundEnabled)this.setSound(true);
    this.onStatus?.({type:'racing',message:'Go!'});
  }

  pause(value=true) {
    if(this.finished)return;
    this.paused=!!value;this.keys={};this.touch={throttle:0,brake:0,steer:0};
    this.onStatus?.({type:this.paused?'paused':'racing',paused:this.paused,message:this.paused?'Paused':'Back on track'});
  }

  reset() {
    const p=this.samples[0],t=this.tangents[0];this.pos.copy(p).addScaledVector(t,3.2);
    if(Number.isInteger(this.gridSlot)){
      const slot=this.gridSlot,side=slot%2===0?-1:1;
      const lateral=new THREE.Vector3(t.z,0,-t.x);
      this.pos.addScaledVector(lateral,side*this.trackWidth*.23).addScaledVector(t,-Math.floor(slot/2)*7);
    }
    this.pos.y=0;
    this.yaw=Math.atan2(t.x,t.z);this.velocity.set(0,0,0);this.speed=0;this.steer=0;this.yawRate=0;
    this.finished=false;this.lapTimes=[];this.raceTime=0;this.lap=1;this.lapTime=0;this.progress=0;this.checkpoint=0;this.lastTrackProgress=0;this.offTrack=false;
    this.keys={};this.touch={throttle:0,brake:0,steer:0};
    if(this.car){this.car.position.copy(this.pos);this.car.rotation.set(0,this.yaw,0);this.carBody.rotation.set(0,0,0);}
    this.cameraSnap=true;
    if(this.racing){this.paused=false;this.onStatus?.({type:'racing'});}
    this.onTelemetry?.({speed:0,gear:1,lap:1,currentLapTime:0,bestLap:this.bestLap,progress:0,offTrack:false,paused:this.paused,racing:this.racing});
  }

  setCamera(mode='chase') {
    this.cameraMode=['chase','cockpit','orbit'].includes(mode)?mode:'chase';this.cameraSnap=true;
    this.onStatus?.({type:'camera',camera:this.cameraMode,message:this.cameraMode+' camera'});
  }

  setInput(input) { Object.assign(this.touch,input); }

  updateGamepad() {
    this.gamepadInput={throttle:0,brake:0,steer:0};
    if(!navigator.getGamepads)return;
    const pads=navigator.getGamepads();
    // Read the latest snapshot each frame so trigger and stick changes reach the car.
    this.gamepad=pads[this.gamepad?.index]||[...pads].find(Boolean)||null;
    const pad=this.gamepad;
    if(!pad){this.gamepadInput={throttle:0,brake:0,steer:0};return;}
    const axis=Number(pad.axes?.[0])||0;
    const stick=Math.abs(axis)<.08?0:clamp((Math.abs(axis)-.08)/.92,0,1)*Math.sign(axis);
    const buttonValue=index=>Math.max(0,Math.min(1,Number(pad.buttons?.[index]?.value)||0));
    const dpadLeft=pad.buttons?.[14]?.pressed?1:0,dpadRight=pad.buttons?.[15]?.pressed?1:0;
    const dpadUp=pad.buttons?.[12]?.pressed?1:0,dpadDown=pad.buttons?.[13]?.pressed?1:0;
    // Standard controller mapping: R2 / RT accelerates; L2 / LT brakes.
    this.gamepadInput={steer:stick||dpadRight-dpadLeft,throttle:Math.max(buttonValue(7),dpadUp),brake:Math.max(buttonValue(6),dpadDown)};
  }

  stepPhysics(dt) {
    if(this.finished)return;
    const keys=this.keys;
    const gamepad=this.gamepadInput||{};
    const throttle=Math.max(this.touch.throttle||0,gamepad.throttle||0,keys.w||keys.arrowup?1:0);
    const brake=Math.max(this.touch.brake||0,gamepad.brake||0,keys.s||keys.arrowdown||keys[' ']?1:0);
    const steerInput=clamp((this.touch.steer||0)+(gamepad.steer||0)+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),-1,1);
    const nearest=this.nearest(this.pos);this.offTrack=nearest.distance>this.trackWidth/2+.65;
    const forward=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    let longitudinal=this.velocity.dot(forward);
    const previousLongitudinal=longitudinal;
    const absolute=Math.abs(longitudinal);
    this.steer+=(steerInput-this.steer)*Math.min(1,dt*7);
    const maxAngle=.47/(1+absolute*.036);
    const targetYaw=-longitudinal*Math.tan(this.steer*maxAngle)/3.15;
    this.yawRate+=(targetYaw-this.yawRate)*Math.min(1,dt*(this.offTrack?3.8:8));
    this.yaw+=clamp(this.yawRate,-1.35,1.35)*dt;
    const year=Number(this.carData.year),power=year<2006?12.2:year<2014?10.8:13.2;
    let acceleration=throttle*power*(1-clamp(longitudinal/105,0,1)*.35);
    if(brake){if(longitudinal>.7)acceleration-=brake*26;else if(!throttle)acceleration-=brake*4.2;}
    acceleration-=longitudinal*.035+longitudinal*Math.abs(longitudinal)*.00115;
    if(this.offTrack)acceleration-=longitudinal*.38;
    if(!throttle && !brake && absolute<.25){this.velocity.multiplyScalar(Math.exp(-dt*8));acceleration=0;}
    this.velocity.addScaledVector(forward,acceleration*dt);
    const lateral=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    const lateralSpeed=this.velocity.dot(lateral),grip=this.offTrack?2.4:9+absolute*.065;
    this.velocity.addScaledVector(lateral,-lateralSpeed*(1-Math.exp(-grip*dt)));
    longitudinal=this.velocity.dot(forward);
    const reverseLimit=50/3.6; // Physics uses metres per second; the HUD uses km/h.
    if(longitudinal < -reverseLimit)this.velocity.addScaledVector(forward,-reverseLimit-longitudinal);
    if(brake && !throttle && previousLongitudinal>0 && longitudinal<0)this.velocity.set(0,0,0);
    this.pos.addScaledVector(this.velocity,dt);
    this.speed=this.velocity.length()*3.6;
    // The safety rail slows and redirects the car without trapping it on contact.
    const barrierDist=this.trackWidth/2+7.2;
    if(nearest.distance>barrierDist && nearest.distance<barrierDist+8){
      const center=this.samples[nearest.index],out=this.pos.clone().sub(center).setY(0).normalize();
      const outward=this.velocity.dot(out);
      if(outward>0)this.velocity.addScaledVector(out,-outward*.92);
      this.velocity.multiplyScalar(Math.exp(-dt*2));
      this.pos.copy(center).addScaledVector(out,barrierDist-.05);
    }
    if(Math.abs(this.pos.x)>2500||Math.abs(this.pos.z)>2500)this.reset();
    this.car.position.copy(this.pos);
    const bump=this.offTrack?Math.sin(this.elapsed*48)*clamp(this.speed/250,0,.026):Math.sin(this.elapsed*55)*clamp(this.speed/5000,0,.006);
    this.car.position.y=bump;this.car.rotation.y=this.yaw;
    this.carBody.rotation.z+=(clamp(this.yawRate*this.speed*.00085,-.048,.048)-this.carBody.rotation.z)*Math.min(1,dt*8);
    this.carBody.rotation.x+=(clamp(-acceleration*.0013,-.028,.032)-this.carBody.rotation.x)*Math.min(1,dt*8);
    for(const wheel of this.wheels)wheel.rotation.x+=longitudinal*dt/.35;
    for(const wheel of this.frontWheels)wheel.rotation.y=-this.steer*maxAngle;
    if(this.steeringAssembly)this.steeringAssembly.rotation.z=this.steer*.65;
    this.lapTime+=dt;this.raceTime+=dt;
    const prog=nearest.index/this.sampleCount;
    const signedForward=this.velocity.dot(this.tangents[nearest.index]);
    const onCourse=nearest.distance<this.trackWidth/2+3;
    if(onCourse && signedForward>1){
      if(this.checkpoint<3 && prog>=(this.checkpoint+1)*.25 && prog<(this.checkpoint+1)*.25+.12)this.checkpoint++;
      if(this.checkpoint===3&&this.lastTrackProgress>.9&&prog<.1&&this.lapTime>8){
        const time=this.lapTime;this.lapTimes.push(time);this.bestLap=this.bestLap===null?time:Math.min(time,this.bestLap);this.lap++;this.lapTime=0;this.checkpoint=0;
        this.onLap?.({time,bestLap:this.bestLap,lap:this.lap-1});
        if(this.lapLimit>0 && this.lap>this.lapLimit){
          this.finished=true;this.paused=true;this.speed=0;this.velocity.set(0,0,0);
          this.keys={};this.touch={throttle:0,brake:0,steer:0};
          this.onStatus?.({type:'finished',message:`Finished ${this.lapLimit} laps!`});
        }
      }
    }
    this.lastTrackProgress=prog;this.progress=prog;this.throttle=throttle;
  }

  updateCamera(dt) {
    const forward=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    let targetPosition,targetLook,fov;
    if(this.cameraMode==='orbit'){
      const a=this.elapsed*.075+this.yaw+.9;
      targetPosition=this.pos.clone().add(new THREE.Vector3(Math.sin(a)*11.5,4.4,Math.cos(a)*11.5));
      targetLook=this.pos.clone().add(new THREE.Vector3(0,.52,0));fov=49;
    }else if(this.cameraMode==='cockpit'){
      targetPosition=this.pos.clone().addScaledVector(forward,-.23).add(new THREE.Vector3(0,1.17,0));
      targetLook=this.pos.clone().addScaledVector(forward,30).add(new THREE.Vector3(0,1.42,0));fov=88;
    }else{
      targetPosition=this.pos.clone().addScaledVector(forward,-8.4).add(new THREE.Vector3(0,3.1,0));
      targetLook=this.pos.clone().addScaledVector(forward,5.5).add(new THREE.Vector3(0,.8,0));fov=58;
    }
    // Driving cameras are rigidly mounted: no speed-dependent trailing or zoom.
    const blend=this.cameraMode!=='orbit'||this.cameraSnap?1:1-Math.exp(-dt*6);
    this.camera.position.lerp(targetPosition,blend);this.cameraLook=this.cameraLook||targetLook.clone();this.cameraLook.lerp(targetLook,blend);this.camera.lookAt(this.cameraLook);
    this.camera.fov+=(fov-this.camera.fov)*(this.cameraSnap?1:Math.min(1,dt*3));this.camera.updateProjectionMatrix();this.cameraSnap=false;
    if(this.driverHead)for(const part of this.driverHead)part.visible=this.cameraMode!=='cockpit';
    if(this.floodLights && this.weather==='night'){
      const nearby=this.lampPositions.slice().sort((a,b)=>a.distanceToSquared(this.pos)-b.distanceToSquared(this.pos));
      this.floodLights.forEach((light,i)=>{if(nearby[i])light.position.copy(nearby[i]);});
    }
    this.sun.position.copy(this.pos).add(this.sunOffset);this.sun.target.position.copy(this.pos);
  }

  setSound(enabled) {
    this.soundEnabled=!!enabled;
    if(!enabled){if(this.audio)this.audio.gain.gain.setTargetAtTime(0,this.audio.context.currentTime,.1);return;}
    try{
      if(!this.audio){
        const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
        const context=new AudioContext(),gain=context.createGain(),filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1700;
        gain.gain.value=0;filter.connect(gain);gain.connect(context.destination);
        const oscillators=[];
        for(const [ratio,level] of [[1,.6],[2,.2],[3,.09],[.5,.15]]){
          const osc=context.createOscillator(),mix=context.createGain();osc.type='sawtooth';osc.frequency.value=90*ratio;mix.gain.value=level;osc.connect(mix);mix.connect(filter);osc.start();oscillators.push({osc,ratio});
        }
        this.audio={context,gain,filter,oscillators};
      }
      if(this.audio.context.state==='suspended')this.audio.context.resume().catch(()=>{});
    }catch(error){this.soundEnabled=false;this.onStatus?.({type:'sound',message:'Sound is unavailable in this browser.'});}
  }

  updateAudio() {
    if(!this.audio)return;
    const {context,gain,filter,oscillators}=this.audio;
    const gear=Math.max(1,Math.min(Number(this.carData.year)<2014?7:8,Math.floor(this.speed/43)+1));
    const rpm=.28+(this.speed%43)/43*.55+(this.throttle||0)*.1;
    const freq=(Number(this.carData.year)<2014?150:94)+rpm*(Number(this.carData.year)<2014?350:220);
    for(const {osc,ratio} of oscillators)osc.frequency.setTargetAtTime(freq*ratio,context.currentTime,.06);
    filter.frequency.setTargetAtTime(800+rpm*1900,context.currentTime,.06);
    gain.gain.setTargetAtTime(this.soundEnabled&&this.racing&&!this.paused?.033+(this.throttle||0)*.016:0,context.currentTime,.06);
    return gear;
  }

  tick(time) {
    if(this.disposed)return;
    this.raf=requestAnimationFrame(this.tick);
    const dt=Math.min(.05,Math.max(0,(time-(this.lastTime||time))/1000));this.lastTime=time;this.elapsed+=dt;
    if(this.racing&&!this.paused){this.updateGamepad();let remain=dt;while(remain>0){const step=Math.min(remain,1/90);this.stepPhysics(step);remain-=step;}}
    for(const other of this.opponents?.values()||[]){const s=other.target;if(!s)continue;const a=1-Math.exp(-dt*14);other.car.position.lerp(new THREE.Vector3(s.x,0,s.z),a);other.car.rotation.y+=Math.atan2(Math.sin(s.yaw-other.car.rotation.y),Math.cos(s.yaw-other.car.rotation.y))*a;}
    for(const flag of this.flags||[]){
      const positions=flag.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){const x=positions.getX(i);positions.setZ(i,Math.sin(x*2.3-this.elapsed*4+flag.userData.phase)*.24*x/3.8);}
      positions.needsUpdate=true;flag.geometry.computeVertexNormals();
    }
    this.updateDust(dt);this.updateCamera(dt);this.updateAudio();this.renderer.render(this.scene,this.camera);
    this.emitElapsed+=dt;
    if(this.emitElapsed>.075){
      this.emitElapsed=0;
      if(this.dashTexture){
        const c=this.dashTexture.image.getContext('2d');c.fillStyle='#061016';c.fillRect(0,0,256,128);
        c.fillStyle='#8dff52';c.fillRect(12,8,Math.min(232,35+this.speed*.65),10);
        c.font='bold 70px monospace';c.textAlign='center';c.fillStyle='#ffffff';c.fillText(String(Math.max(1,Math.min(8,Math.floor(this.speed/43)+1))),65,91);
        c.font='bold 28px monospace';c.fillText(String(Math.round(this.speed)),180,65);c.font='14px monospace';c.fillStyle='#9aafb8';c.fillText('KM/H',180,91);this.dashTexture.needsUpdate=true;
      }
      this.onTelemetry?.({speed:Math.round(this.speed),gear:this.velocity.dot(new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw)))<-.5?'R':Math.max(1,Math.min(Number(this.carData.year)<2014?7:8,Math.floor(this.speed/43)+1)),lap:this.lap,currentLapTime:this.lapTime,bestLap:this.bestLap,progress:this.progress,offTrack:this.offTrack,paused:this.paused,racing:this.racing});
    }
  }

  dispose() {
    this.disposed=true;cancelAnimationFrame(this.raf);this.resizeObserver?.disconnect();
    window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.blur);window.removeEventListener('gamepadconnected',this.gamepadConnected);window.removeEventListener('gamepaddisconnected',this.gamepadDisconnected);
    this.environmentTarget?.dispose();this.pmrem?.dispose();this.audio?.context.close().catch(()=>{});disposeGroup(this.scene);this.renderer?.dispose();this.renderer?.domElement.remove();
  }
}
