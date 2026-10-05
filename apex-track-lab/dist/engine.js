import * as THREE from './assets/three.module.js';

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
    this.keys={};this.touch={throttle:0,brake:0,steer:0};this.pos=new THREE.Vector3();this.velocity=new THREE.Vector3();
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
    window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);window.addEventListener('blur',this.blur);
    this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  }

  setQuality(mode) {
    const mobile=window.matchMedia('(pointer: coarse)').matches;
    this.quality=mode==='auto'?(mobile?'performance':'high'):mode;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.quality==='high'?2:1.15));
    const size=this.quality==='high'?2048:1024;
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
    this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.08;this.ground.receiveShadow=true;this.world.add(this.ground);
    const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#537687')},horizon:{value:new THREE.Color('#d7c9ad')},sunDir:{value:new THREE.Vector3(-.5,.3,.4).normalize()}},vertexShader:'varying vec3 vPosition; void main(){ vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPosition;uniform vec3 top;uniform vec3 horizon;uniform vec3 sunDir;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}float cloud(vec2 p){float n=0.0,a=.5;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.03+13.1;a*=.5;}return n;}void main(){vec3 d=normalize(vPosition);float h=clamp(d.y,0.0,1.0);vec3 col=mix(horizon,top,pow(h,.48));float s=max(dot(d,sunDir),0.0);col+=vec3(1.0,.66,.3)*pow(s,32.0)*.24;col+=vec3(1.0,.9,.6)*smoothstep(.9994,.9998,s)*3.0;if(d.y>.015 && sunDir.y>0.0){vec2 p=d.xz/(d.y+.18)*3.0;float cover=smoothstep(.49,.72,cloud(p));float edge=smoothstep(.015,.16,d.y);vec3 light=mix(vec3(.61,.66,.69),vec3(1.0,.96,.88),cloud(p+2.0));col=mix(col,light,cover*edge*.65);}gl_FragColor=vec4(col,1.0);}'});
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(3800,32,16),skyMat);this.world.add(this.sky);
    const hillMat=material(0x64705d,{roughness:1,metalness:0});
    for(let ring=0;ring<3;ring++){
      const verts=[],indices=[],count=128;
      for(let i=0;i<=count;i++){
        const a=i/count*TAU,r=1000+ring*380;
        const h=85+ring*40+Math.sin(a*5+ring)*40+Math.sin(a*13)*22+Math.sin(a*21)*12;
        verts.push(Math.sin(a)*r,-8,Math.cos(a)*r,Math.sin(a)*r,h,Math.cos(a)*r);
        if(i<count){const p=i*2;indices.push(p,p+1,p+2,p+1,p+3,p+2);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();
      const hills=new THREE.Mesh(geo,hillMat.clone());hills.material.side=THREE.DoubleSide;hills.material.color.setHex([0x64755c,0x748576,0x8a9990][ring]);this.world.add(hills);
    }
    this.pmrem=new THREE.PMREMGenerator(this.renderer);
    this.setWeather('night');
  }

  setWeather(mode='sunset') {
    this.weather=mode;
    const clear=mode==='clear',cloud=mode==='overcast',night=mode==='night';
    this.sky?.material.uniforms.top.value.set(clear?'#467baf':cloud?'#7a888e':'#567d96');
    this.sky?.material.uniforms.horizon.value.set(clear?'#c4dcea':cloud?'#c0c7c8':'#dfc8a7');
    this.scene.fog.color.set(clear?'#bfd0cc':cloud?'#b8c2c1':'#c4c7b8');
    this.scene.fog.density=cloud?.00115:.00075;
    this.sun.color.set(clear?'#fff6de':cloud?'#e1e7ee':'#ffd6a0');this.sun.intensity=cloud?1.0:clear?3.4:3.6;
    this.hemi.intensity=cloud?1.65:clear?1.4:1.3;
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
    // Capture only the sky: soft, weather-matched reflections on paint and metal.
    if(this.pmrem){
      const environmentScene=new THREE.Scene();
      environmentScene.add(new THREE.Mesh(this.sky.geometry,this.sky.material));
      const previous=this.environmentTarget;
      this.environmentTarget=this.pmrem.fromScene(environmentScene,.06,.1,4500);
      this.scene.environment=this.environmentTarget.texture;
      previous?.dispose();
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
    const roadTexture=noiseTexture([76,79,81],30);roadTexture.wrapS=roadTexture.wrapT=THREE.RepeatWrapping;roadTexture.anisotropy=8;
    this.roadMaterial=material(0xb0b0b0,{map:roadTexture,bumpMap:roadTexture,bumpScale:.012,roughness:.86,metalness:0});
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
    this.buildTrackWear();this.buildCurbs();this.buildBarriers();this.buildGrid();this.buildScenery();this.buildNightCircuit();
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
    // Low, repeating grandstand architecture on the outside of the opening bend.
    const i=Math.min(this.sampleCount-1,Math.floor(this.sampleCount*.06)),p=this.samples[i],n=this.normals[i],t=this.tangents[i];
    const stand=new THREE.Group();stand.position.copy(p).addScaledVector(n,this.trackWidth/2+23);stand.rotation.y=Math.atan2(t.x,t.z);
    const concrete=material(0x989b94,{roughness:.9,metalness:0}),seats=material(0x354d59,{roughness:.65}),roof=material(0xd5d7d1,{metalness:.45,roughness:.55});
    for(let row=0;row<6;row++){
      const slab=new THREE.Mesh(new THREE.BoxGeometry(1.5,.7,48),concrete);slab.position.set(row*1.4,row*.72,.0);slab.castShadow=true;slab.receiveShadow=true;stand.add(slab);
      const bench=new THREE.Mesh(new THREE.BoxGeometry(.48,.3,46),seats);bench.position.set(row*1.4,row*.72+.51,0);stand.add(bench);
    }
    const top=new THREE.Mesh(new THREE.BoxGeometry(11,.2,52),roof);top.position.set(4,7.1,0);top.rotation.z=.07;top.castShadow=true;stand.add(top);
    for(const z of [-24,-8,8,24]){const post=new THREE.Mesh(new THREE.BoxGeometry(.22,7,.22),roof);post.position.set(8,3.5,z);stand.add(post);}
    this.trackGroup.add(stand);
    const boardMat=material(0xe3e6dc,{roughness:.7});
    for(let j=1;j<8;j++){
      const idx=Math.floor(j/8*this.sampleCount),pt=this.samples[idx],nm=this.normals[idx],tg=this.tangents[idx];
      const b=new THREE.Mesh(new THREE.BoxGeometry(.15,.85,3),boardMat);b.position.copy(pt).addScaledVector(nm,this.trackWidth/2+6);b.position.y=.6;b.rotation.y=Math.atan2(tg.x,tg.z);this.trackGroup.add(b);
    }
  }

  setCar(car) {
    this.carData={year:2024,color:'#ed292f',accent:'#ffffff',...car};
    disposeGroup(this.car);this.car=new THREE.Group();this.carBody=new THREE.Group();this.car.add(this.carBody);this.scene.add(this.car);
    this.wheels=[];this.frontWheels=[];
    const contact=canvasTexture(128,256,(c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,8,w/2,h/2,h/2);g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(.5,'rgba(0,0,0,.38)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.7,5.5),new THREE.MeshBasicMaterial({map:contact,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.042;this.car.add(shadow);
    const year=Number(this.carData.year),modern=year>=2022,wide=year>=2017,old=year<=2008;
    const body=new THREE.MeshPhysicalMaterial({color:this.carData.color||'#ee2631',metalness:.42,roughness:.26,clearcoat:1,clearcoatRoughness:.16,envMapIntensity:1.15});
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
      const vertices=[],indices=[],segments=16;
      // Elliptical cross-sections remove the old four-sided box silhouette.
      sections.forEach(([z,w,bottom,top])=>{
        for(let j=0;j<segments;j++){
          const a=j/segments*TAU;
          vertices.push(Math.cos(a)*w,(bottom+top)/2+Math.sin(a)*(top-bottom)/2,z);
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
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat);
    };
    const track=wide?.91:.81,wheelR=modern?.36:.325,rearZ=-1.5,frontZ=1.46;
    // Carbon floor, sculpted chassis, raised nose, and tapered engine cover.
    box(wide?1.76:1.5,.07,3.28,carbon,0,.19,-.15);
    loft([[-2.05,.15,.24,.42],[-1.48,.42,.22,.62],[-.85,.46,.23,.77],[.15,.37,.25,.76],[.75,.28,.28,old?.72:.61],[1.55,old?.17:.12,old?.48:.25,old?.65:.39],[2.18,.08,.25,.32]],body);
    loft([[-1.9,.09,.42,.48],[-1.24,.24,.45,.99],[-.7,.28,.54,1.12],[-.38,.25,.63,1.04]],body);
    const intake=mesh(new THREE.TorusGeometry(.115,.047,8,16),carbon,0,1.055,-.55);intake.rotation.x=Math.PI/2;
    for(const s of [-1,1]){
      const pod=loft([[-1.5,.0,.22,.26],[-.85,.0,.23,.54],[.18,.0,.25,.64],[.51,.0,.3,.53]],body);
      // Curved sidepods use a scaled sphere to soften the mechanical silhouette.
      this.carBody.remove(pod);pod.geometry.dispose();
      const side=loft([[-1.58,.08,.27,.35],[-1.18,.21,.25,.44],[-.65,modern?.34:.29,.26,.59],[-.12,modern?.33:.28,.33,.66],[.34,.25,.38,.65],[.47,.20,.41,.58]],body);side.position.x=s*(wide?.55:.46);
      const inlet=mesh(new THREE.SphereGeometry(1,14,8),carbon,s*(wide?.54:.48),.49,.36);inlet.scale.set(.24,.13,.045);
      box(.045,.04,1.8,accent,s*(wide?.78:.64),.49,-.55);
      if(modern){const fin=box(.055,.22,1.18,carbon,s*.82,.3,-.55);fin.rotation.z=s*.16;}
      else {const barge=box(.035,.39,.46,carbon,s*.58,.39,.55);barge.rotation.y=s*-.2;}
    }
    // A recessed cockpit, steering wheel, seat and driver make close views legible.
    const cockpit=mesh(new THREE.SphereGeometry(1,18,12),carbon,0,.76,-.02);cockpit.scale.set(.29,.1,.55);
    box(.38,.35,.3,carbon,0,.71,-.31);
    const helmet=mesh(new THREE.SphereGeometry(.17,20,16),material(0xf1d56d,{metalness:.3,roughness:.28}),0,.93,-.12);helmet.scale.set(1,1.06,1.02);
    const visor=mesh(new THREE.SphereGeometry(.174,20,12,0,Math.PI*2,Math.PI*.36,Math.PI*.25),material(0x10242c,{metalness:.85,roughness:.15}),0,.95,-.10);
    visor.rotation.y=0;this.driverHead=[helmet,visor];
    const steering=mesh(new THREE.TorusGeometry(.135,.027,8,16),carbon,0,.83,.39);steering.rotation.x=.23;
    this.dashTexture=canvasTexture(256,128,(c,w,h)=>{c.fillStyle='#061016';c.fillRect(0,0,w,h);});
    const dash=mesh(new THREE.PlaneGeometry(.24,.12),new THREE.MeshBasicMaterial({map:this.dashTexture}),0,.87,.365);
    dash.rotation.y=Math.PI;dash.rotation.x=-.2;
    if(year>=2018){
      const haloPoints=[new THREE.Vector3(-.29,.91,-.40),new THREE.Vector3(-.31,1.13,-.11),new THREE.Vector3(-.22,1.15,.39),new THREE.Vector3(0,1.13,.54),new THREE.Vector3(.22,1.15,.39),new THREE.Vector3(.31,1.13,-.11),new THREE.Vector3(.29,.91,-.40)];
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPoints),34,.032,7,false),carbon);
      rod(new THREE.Vector3(0,.66,.63),new THREE.Vector3(0,1.13,.54),.026,carbon);
    }
    // Front and rear wings with individual flaps, end plates and supports.
    const frontWidth=wide?2:old?1.68:1.8;
    for(let j=0;j<(modern?4:3);j++){
      const wing=box(frontWidth-j*.08,.045,.19, j%2?body:carbon,0,.20+j*.045,2.18-j*.16);wing.rotation.x=.12;
    }
    for(const s of [-1,1]){
      const end=box(.05,modern?.31:.24,.71,body,s*(frontWidth/2-.02),.33,1.95);end.rotation.z=s*-.05;
      rod(new THREE.Vector3(s*.11,.34,1.93),new THREE.Vector3(s*.17,.19,1.97),.034,carbon);
    }
    const rearWidth=old?1.02:wide?1.12:.88;
    for(const s of [-1,1])box(.055,.67,.58,body,s*rearWidth/2,.85,-1.99);
    for(let j=0;j<3;j++){const wing=box(rearWidth,.055,.23,j===2?accent:carbon,0,1.13+j*.055,-2.13+j*.16);wing.rotation.x=-.12;}
    for(const s of [-1,1])rod(new THREE.Vector3(s*.2,.36,-1.73),new THREE.Vector3(s*.2,1.15,-1.93),.025,carbon);
    box(1.05,.12,.47,carbon,0,.23,-1.94);
    for(let i=-2;i<=2;i++){const diffuser=box(.035,.18,.45,carbon,i*.2,.19,-1.94);diffuser.rotation.x=-.15;}
    const exhaust=mesh(new THREE.CylinderGeometry(.054,.062,.34,12),metal,0,.6,-1.94);exhaust.rotation.x=Math.PI/2;
    const rainLight=box(.105,.08,.04,material(0x910c0c,{emissive:0xff2211,emissiveIntensity:.85}),0,.34,-2.20);
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
        const ring=mesh(new THREE.TorusGeometry(wheelR*.82,.0065,5,32),material(0xeacb46,{roughness:.65}),side*(ww/2+.016),0,0,spinGroup);ring.rotation.y=Math.PI/2;
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
    this.finished=false;this.lap=1;this.lapTime=0;this.progress=0;this.checkpoint=0;this.lastTrackProgress=0;this.offTrack=false;
    this.keys={};this.touch={throttle:0,brake:0,steer:0};
    if(this.car){this.car.position.copy(this.pos);this.car.rotation.set(0,this.yaw,0);this.carBody.rotation.set(0,0,0);}
    this.cameraSnap=true;
    this.onTelemetry?.({speed:0,gear:1,lap:1,currentLapTime:0,bestLap:this.bestLap,progress:0,offTrack:false,paused:this.paused,racing:this.racing});
  }

  setCamera(mode='chase') {
    this.cameraMode=['chase','cockpit','orbit'].includes(mode)?mode:'chase';this.cameraSnap=true;
    this.onStatus?.({type:'camera',camera:this.cameraMode,message:this.cameraMode+' camera'});
  }

  setInput(input) { Object.assign(this.touch,input); }

  stepPhysics(dt) {
    if(this.finished)return;
    const keys=this.keys;
    const throttle=Math.max(this.touch.throttle||0,keys.w||keys.arrowup?1:0);
    const brake=Math.max(this.touch.brake||0,keys.s||keys.arrowdown||keys[' ']?1:0);
    const steerInput=clamp((this.touch.steer||0)+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),-1,1);
    const nearest=this.nearest(this.pos);this.offTrack=nearest.distance>this.trackWidth/2+.65;
    const forward=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    let longitudinal=this.velocity.dot(forward);
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
    if(longitudinal < -7)this.velocity.addScaledVector(forward,-7-longitudinal);
    if(brake && !throttle && absolute>.7 && longitudinal<0)this.velocity.set(0,0,0);
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
    this.lapTime+=dt;
    const prog=nearest.index/this.sampleCount;
    const signedForward=this.velocity.dot(this.tangents[nearest.index]);
    const onCourse=nearest.distance<this.trackWidth/2+3;
    if(onCourse && signedForward>1){
      if(this.checkpoint<3 && prog>=(this.checkpoint+1)*.25 && prog<(this.checkpoint+1)*.25+.12)this.checkpoint++;
      if(this.checkpoint===3&&this.lastTrackProgress>.9&&prog<.1&&this.lapTime>8){
        const time=this.lapTime;this.bestLap=this.bestLap===null?time:Math.min(time,this.bestLap);this.lap++;this.lapTime=0;this.checkpoint=0;
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
    if(this.racing&&!this.paused){let remain=dt;while(remain>0){const step=Math.min(remain,1/90);this.stepPhysics(step);remain-=step;}}
    for(const other of this.opponents?.values()||[]){const s=other.target;if(!s)continue;const a=1-Math.exp(-dt*14);other.car.position.lerp(new THREE.Vector3(s.x,0,s.z),a);other.car.rotation.y+=Math.atan2(Math.sin(s.yaw-other.car.rotation.y),Math.cos(s.yaw-other.car.rotation.y))*a;}
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
    window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.blur);
    this.environmentTarget?.dispose();this.pmrem?.dispose();this.audio?.context.close().catch(()=>{});disposeGroup(this.scene);this.renderer?.dispose();this.renderer?.domElement.remove();
  }
}
