// Standalone circuit sketcher. Routes are normalized control nodes and close implicitly.
const WORLD = 640;
const MINT = '#c2fa77';
const copy = points => points.map(({ x, y }) => ({ x, y }));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const PRESETS = [
  { id: 'grand-loop', name: 'Grand loop', points: [
    {x:.19,y:.76},{x:.14,y:.55},{x:.16,y:.30},{x:.27,y:.18},
    {x:.46,y:.15},{x:.70,y:.17},{x:.85,y:.28},{x:.85,y:.44},
    {x:.72,y:.53},{x:.66,y:.69},{x:.78,y:.81},{x:.63,y:.87},
    {x:.46,y:.79},{x:.33,y:.86},
  ] },
  { id: 'coastal-sprint', name: 'Coastal sprint', points: [
    {x:.13,y:.73},{x:.11,y:.49},{x:.19,y:.27},{x:.37,y:.16},
    {x:.54,y:.20},{x:.64,y:.34},{x:.82,y:.29},{x:.91,y:.41},
    {x:.83,y:.55},{x:.73,y:.67},{x:.66,y:.83},{x:.49,y:.88},
    {x:.39,y:.71},{x:.26,y:.81},
  ] },
  { id: 'technical-ring', name: 'Technical ring', points: [
    {x:.15,y:.79},{x:.13,y:.57},{x:.16,y:.30},{x:.29,y:.15},
    {x:.45,y:.16},{x:.48,y:.36},{x:.60,y:.41},{x:.72,y:.17},
    {x:.86,y:.23},{x:.88,y:.47},{x:.82,y:.68},{x:.84,y:.84},
    {x:.64,y:.87},{x:.53,y:.64},{x:.40,y:.62},{x:.32,y:.83},
  ] },
  { id: 'high-speed-oval', name: 'High-speed oval', points: [
    {x:.20,y:.77},{x:.10,y:.61},{x:.10,y:.39},{x:.20,y:.23},
    {x:.39,y:.18},{x:.61,y:.18},{x:.80,y:.23},{x:.90,y:.39},
    {x:.90,y:.61},{x:.80,y:.77},{x:.61,y:.82},{x:.39,y:.82},
  ] },
];

// The uniform closed spline is also easy for the driving scene to reproduce.
export function sampleTrack(points, steps = 12) {
  const samples = [];
  const n = points.length;
  if (n < 3) return copy(points);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i];
    const p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      samples.push({
        x: .5 * (2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
        y: .5 * (2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
        segment: i,
      });
    }
  }
  return samples;
}

function project(point, a, b) {
  const dx = b.x-a.x, dy = b.y-a.y;
  const t = clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy || 1), 0, 1);
  return { x:a.x+t*dx, y:a.y+t*dy, t };
}
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function segmentsCross(a,b,c,d) {
  const a1=cross(a,b,c), a2=cross(a,b,d), b1=cross(c,d,a), b2=cross(c,d,b);
  return ((a1>1e-10 && a2< -1e-10)||(a1< -1e-10 && a2>1e-10)) &&
    ((b1>1e-10 && b2< -1e-10)||(b1< -1e-10 && b2>1e-10));
}
function segmentDistance(a,b,c,d) {
  if (segmentsCross(a,b,c,d)) return 0;
  return Math.min(distance(a,project(a,c,d)),distance(b,project(b,c,d)),
    distance(c,project(c,a,b)),distance(d,project(d,a,b)));
}

export function validateTrack(points, width = 14) {
  const fail = (error, length = 0, corners = 0) => ({ valid:false, error, length, corners });
  if (!Array.isArray(points) || points.length < 5) return fail('Draw a full loop with at least five control points.');
  if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return fail('The track contains an invalid point.');
  const samples = sampleTrack(points, Math.max(6, Math.min(16, Math.ceil(240/points.length))));
  const n = samples.length;
  const lengths = [0];
  for (let i=0; i<n; i++) lengths.push(lengths[i]+distance(samples[i], samples[(i+1)%n])*WORLD);
  const length = lengths[n];
  let corners = 0;
  for (let i=0; i<points.length; i++) {
    const a=points[(i-1+points.length)%points.length], b=points[i], c=points[(i+1)%points.length];
    const v1={x:b.x-a.x,y:b.y-a.y}, v2={x:c.x-b.x,y:c.y-b.y};
    const angle=Math.acos(clamp((v1.x*v2.x+v1.y*v2.y)/(Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y)||1),-1,1));
    if (angle > .37) corners++;
    if (distance(b,c)*WORLD < .8) return fail('Space the control points farther apart.',length,corners);
  }
  if (length < 250) return fail('Make the circuit larger — the minimum length is 250 m.',length,corners);
  if (samples.some(p => p.x < -.035 || p.x > 1.035 || p.y < -.035 || p.y > 1.035)) return fail('Keep the circuit inside the drawing area.',length,corners);
  let area=0;
  for(let i=0;i<n;i++) area+=cross({x:0,y:0},samples[i],samples[(i+1)%n]);
  if(Math.abs(area)*WORLD*WORLD*.5 < width*width*2) return fail('Give the loop more room; this circuit is too narrow.',length,corners);
  const minGap=Math.max(5,Number(width)||14)*.78;
  for (let i=0;i<n;i++) {
    const a=samples[i], b=samples[(i+1)%n];
    for (let j=i+2;j<n;j++) {
      if(i===0 && j===n-1) continue;
      const c=samples[j], d=samples[(j+1)%n];
      if (segmentsCross(a,b,c,d)) return fail('The track crosses itself. Redraw the crossing or move its points.',length,corners);
      const along=lengths[j]-lengths[i], separation=Math.min(along,length-along);
      if (separation < Math.max(38,minGap*4)) continue;
      if (segmentDistance(a,b,c,d)*WORLD < minGap) return fail('Two sections are too close. Leave more space between them.',length,corners);
    }
  }
  return { valid:true, error:null, length, corners };
}

function simplify(points, epsilon) {
  if(points.length<3) return copy(points);
  let best=0,index=0;
  for(let i=1;i<points.length-1;i++) {
    const d=distance(points[i],project(points[i],points[0],points[points.length-1]));
    if(d>best) {best=d;index=i;}
  }
  if(best <= epsilon) return [points[0],points[points.length-1]];
  return [...simplify(points.slice(0,index+1),epsilon).slice(0,-1),...simplify(points.slice(index),epsilon)];
}

export class TrackEditor {
  constructor(canvas, {onChange=()=>{}, onStatus=()=>{}} = {}) {
    this.canvas=canvas;
    this.ctx=canvas.getContext('2d');
    this.onChange=onChange;
    this.onStatus=onStatus;
    this.points=[];
    this.history=[];
    this.width=14;
    this.mode='draw';
    this.hover=-1;
    this.selected=-1;
    this.gesture=null;
    this.draft=[];
    this.destroyed=false;
    canvas.style.touchAction='none';
    canvas.style.cursor='crosshair';
    canvas.setAttribute('aria-label','Circuit drawing area. Draw a loop, or use Edit points to reshape the circuit.');
    this.listeners={
      pointerdown:e=>this.pointerDown(e),pointermove:e=>this.pointerMove(e),
      pointerup:e=>this.pointerUp(e),pointercancel:()=>this.cancel(),
      dblclick:e=>{ if(this.mode==='edit') {e.preventDefault();this.addPoint(this.eventPoint(e));} },
      pointerleave:()=>{if(!this.gesture){this.hover=-1;this.render();}},
    };
    for(const [name,handler] of Object.entries(this.listeners)) canvas.addEventListener(name,handler);
    this.observer=typeof ResizeObserver!=='undefined' ? new ResizeObserver(()=>this.resize()) : null;
    this.observer?.observe(canvas);
    this.resize();
  }

  getPoints() {return copy(this.points);}
  setPoints(points) {
    const next=Array.isArray(points)?points.filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)).map(p=>({x:clamp(p.x,0,1),y:clamp(p.y,0,1)})):[];
    if(next.length>1 && distance(next[0],next[next.length-1])<.001) next.pop();
    if(this.points.length) this.remember();
    this.points=next;
    this.selected=-1;
    this.gesture=null;
    this.draft=[];
    this.changed();
  }
  setMode(mode) {
    this.cancel();
    this.mode=mode==='edit'?'edit':'draw';
    this.canvas.style.cursor=this.mode==='draw'?'crosshair':'default';
    this.onStatus(this.mode==='draw'?'Drag to draw a new loop. Release to close the circuit.':'Drag the points to reshape. Shift-click or double-click to add a point.');
    this.render();
  }
  clear() {
    this.cancel();
    if(this.points.length) this.remember();
    this.points=[];
    this.selected=-1;
    this.changed('A blank canvas. Draw your next circuit.');
  }
  undo() {
    this.cancel();
    if(!this.history.length) {this.onStatus('Nothing to undo yet.');return false;}
    this.points=this.history.pop();
    this.selected=-1;
    this.changed('Previous circuit restored.');
    return true;
  }
  setWidth(width) {
    const next=clamp(Number(width)||14,6,28);
    if(this.width===next) return;
    this.width=next;
    this.changed();
  }
  remember() {
    this.history.push(copy(this.points));
    if(this.history.length>40) this.history.shift();
  }
  changed(message) {
    const stats=validateTrack(this.points,this.width);
    this.onChange(this.getPoints(),stats);
    this.onStatus(message || (stats.valid?'Circuit ready. Edit its shape or head to the starting grid.':stats.error));
    this.render();
  }
  resize() {
    if(this.destroyed) return;
    const box=this.canvas.getBoundingClientRect();
    this.w=box.width || this.canvas.clientWidth || 600;
    this.h=box.height || this.canvas.clientHeight || 440;
    this.dpr=Math.min(3,globalThis.devicePixelRatio||1);
    this.canvas.width=Math.round(this.w*this.dpr);
    this.canvas.height=Math.round(this.h*this.dpr);
    const padding=this.w<420?24:32;
    this.size=Math.max(24,Math.min(this.w-padding*2,this.h-padding*2));
    this.ox=(this.w-this.size)/2;
    this.oy=(this.h-this.size)/2;
    this.render();
  }
  eventPoint(event) {
    const rect=this.canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left)*(this.w/(rect.width||1));
    const y=(event.clientY-rect.top)*(this.h/(rect.height||1));
    return {x:clamp((x-this.ox)/this.size,.015,.985),y:clamp((y-this.oy)/this.size,.015,.985)};
  }
  screen(p) {return {x:this.ox+p.x*this.size,y:this.oy+p.y*this.size};}
  nearestHandle(p) {
    let best=16/this.size,index=-1;
    this.points.forEach((q,i)=>{const d=distance(p,q);if(d<best){best=d;index=i;}});
    return index;
  }
  pointerDown(event) {
    if(event.button!==0 || this.gesture) return;
    event.preventDefault();
    const p=this.eventPoint(event);
    if(this.mode==='edit' && event.shiftKey){this.addPoint(p);return;}
    const index=this.mode==='edit'?this.nearestHandle(p):-1;
    if(this.mode==='edit' && index<0) return;
    this.canvas.setPointerCapture?.(event.pointerId);
    this.gesture={id:event.pointerId,start:p,original:copy(this.points),index,moved:false};
    this.selected=index;
    if(this.mode==='draw')this.draft=[p];
    this.render();
  }
  pointerMove(event) {
    const p=this.eventPoint(event);
    if(!this.gesture) {
      if(this.mode==='edit') {
        const index=this.nearestHandle(p);
        if(index!==this.hover){this.hover=index;this.canvas.style.cursor=index>=0?'grab':'default';this.render();}
      }
      return;
    }
    if(event.pointerId!==this.gesture.id) return;
    event.preventDefault();
    if(distance(p,this.gesture.start)*this.size>5)this.gesture.moved=true;
    if(this.mode==='draw') {
      if(distance(p,this.draft[this.draft.length-1])*this.size>=3) this.draft.push(p);
    } else {
      this.points[this.gesture.index]=p;
      this.canvas.style.cursor='grabbing';
    }
    this.render();
  }
  pointerUp(event) {
    const gesture=this.gesture;
    if(!gesture || event.pointerId!==gesture.id)return;
    if(this.canvas.hasPointerCapture?.(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    this.gesture=null;
    if(!gesture.moved){this.points=gesture.original;this.draft=[];this.render();return;}
    let next;
    if(this.mode==='draw') {
      const last=this.eventPoint(event);
      if(distance(last,this.draft[this.draft.length-1])>.004)this.draft.push(last);
      const strokeLength=this.draft.slice(1).reduce((sum,p,i)=>sum+distance(p,this.draft[i]),0)*this.size;
      if(strokeLength<40) {this.draft=[];this.onStatus('Keep dragging to draw a complete loop.');this.render();return;}
      next=simplify(this.draft,.006);
      if(next.length>1 && distance(next[0],next[next.length-1])<.035)next.pop();
      next=next.filter((p,i,all)=>!i||distance(p,all[i-1])>.014);
      if(next.length>72)next=next.filter((_,i)=>i%Math.ceil(next.length/72)===0);
    } else next=copy(this.points);
    this.draft=[];
    const stats=validateTrack(next,this.width);
    this.points=gesture.original;
    if(stats.valid){this.remember();this.points=copy(next);this.changed();}
    else {this.onStatus(stats.error+' Your previous circuit is preserved.');this.render();}
    this.canvas.style.cursor=this.mode==='draw'?'crosshair':'grab';
  }
  addPoint(p) {
    if(this.points.length<3){this.onStatus('Draw a circuit before adding control points.');return;}
    if(this.nearestHandle(p)>=0){this.onStatus('Drag this point to move it, or add a point between existing ones.');return;}
    const samples=sampleTrack(this.points,20);
    let best=Infinity,position=null,segment=-1;
    for(let i=0;i<samples.length;i++){
      const a=samples[i],b=samples[(i+1)%samples.length],projection=project(p,a,b),d=distance(p,projection);
      if(d<best){best=d;position=projection;segment=a.segment;}
    }
    if(best*this.size>45){this.onStatus('Add a point closer to the track.');return;}
    const next=copy(this.points);
    next.splice(segment+1,0,{x:position.x,y:position.y});
    const stats=validateTrack(next,this.width);
    if(!stats.valid){this.onStatus(stats.error);return;}
    this.remember();this.points=next;this.selected=segment+1;this.changed('Point added. Drag it to shape the circuit.');
  }
  cancel() {
    if(this.gesture){this.points=this.gesture.original;this.gesture=null;}
    this.draft=[];
    this.render();
  }
  path(samples,close=true) {
    const ctx=this.ctx;
    ctx.beginPath();
    samples.forEach((p,i)=>{const s=this.screen(p);if(i)ctx.lineTo(s.x,s.y);else ctx.moveTo(s.x,s.y);});
    if(close)ctx.closePath();
  }
  render() {
    if(this.destroyed || !this.ctx || !this.w)return;
    const c=this.ctx;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    c.clearRect(0,0,this.w,this.h);
    c.fillStyle='#11161a';c.fillRect(0,0,this.w,this.h);
    c.lineWidth=1;c.strokeStyle='rgba(155,180,164,.065)';c.beginPath();
    for(let x=(this.w%25)/2;x<this.w;x+=25){c.moveTo(x,0);c.lineTo(x,this.h);}
    for(let y=(this.h%25)/2;y<this.h;y+=25){c.moveTo(0,y);c.lineTo(this.w,y);}
    c.stroke();
    const gradient=c.createRadialGradient(this.w*.5,this.h*.5,0,this.w*.5,this.h*.5,this.w*.65);
    gradient.addColorStop(0,'rgba(61,86,60,.08)');gradient.addColorStop(1,'rgba(0,0,0,.14)');
    c.fillStyle=gradient;c.fillRect(0,0,this.w,this.h);
    c.strokeStyle='rgba(194,250,119,.13)';c.lineWidth=1;
    for(const [x,y,dx,dy] of [[this.ox,this.oy,1,1],[this.ox+this.size,this.oy,-1,1],[this.ox,this.oy+this.size,1,-1],[this.ox+this.size,this.oy+this.size,-1,-1]]){
      c.beginPath();c.moveTo(x+dx*10,y);c.lineTo(x,y);c.lineTo(x,y+dy*10);c.stroke();
    }
    if(this.points.length>=3){
      const samples=sampleTrack(this.points,18),road=Math.max(7,this.width/WORLD*this.size);
      c.lineJoin='round';c.lineCap='round';
      this.path(samples);c.strokeStyle='#080c0e';c.lineWidth=road+12;c.shadowColor='rgba(0,0,0,.45)';c.shadowBlur=15;c.shadowOffsetY=4;c.stroke();c.shadowBlur=0;c.shadowOffsetY=0;
      this.path(samples);c.strokeStyle='#35453a';c.lineWidth=road+8;c.stroke();
      let traveled=0;
      for(let i=0;i<samples.length;i++){
        const a=samples[i],b=samples[(i+1)%samples.length];
        const sa=this.screen(a),sb=this.screen(b);
        c.beginPath();c.moveTo(sa.x,sa.y);c.lineTo(sb.x,sb.y);c.lineWidth=road+3.7;
        c.strokeStyle=Math.floor(traveled/(9/WORLD))%2?'#d4d5cc':'#c44c45';c.stroke();
        traveled+=distance(a,b);
      }
      this.path(samples);c.lineWidth=road;c.strokeStyle='#353b3e';c.stroke();
      this.path(samples);c.lineWidth=Math.max(1,road*.55);c.strokeStyle='#3d4346';c.stroke();
      this.path(samples);c.setLineDash([4,7]);c.lineWidth=1.15;c.strokeStyle='rgba(194,250,119,.66)';c.stroke();c.setLineDash([]);
      const start=this.screen(samples[0]),ahead=this.screen(samples[2]);
      c.save();c.translate(start.x,start.y);c.rotate(Math.atan2(ahead.y-start.y,ahead.x-start.x));
      const tile=road/6;
      for(let x=0;x<2;x++)for(let y=0;y<6;y++) {c.fillStyle=(x+y)%2?'#18221b':'#eff5e8';c.fillRect((x-1)*tile,(y-3)*tile,tile+.15,tile+.15);}
      c.restore();
      // The short forward arrow makes the lap direction clear at a glance.
      const arrowIndex=Math.min(10,samples.length-2),arrow=this.screen(samples[arrowIndex]);
      const arrowNext=this.screen(samples[arrowIndex+1]),angle=Math.atan2(arrowNext.y-arrow.y,arrowNext.x-arrow.x);
      c.save();c.translate(arrow.x,arrow.y);c.rotate(angle);c.fillStyle=MINT;c.beginPath();c.moveTo(4,0);c.lineTo(-3,-2.5);c.lineTo(-1,0);c.lineTo(-3,2.5);c.closePath();c.fill();c.restore();
      if(this.mode==='edit') this.points.forEach((point,i)=>{
        const p=this.screen(point),active=i===this.selected||i===this.hover;
        if(active){c.beginPath();c.arc(p.x,p.y,10,0,Math.PI*2);c.fillStyle='rgba(194,250,119,.14)';c.fill();}
        c.beginPath();c.arc(p.x,p.y,active?5:3.8,0,Math.PI*2);c.fillStyle=active?MINT:'#131a17';c.fill();c.strokeStyle=MINT;c.lineWidth=1.5;c.stroke();
      });
    } else if(!this.draft.length) {
      c.textAlign='center';c.fillStyle='#75817a';c.font='13px system-ui, sans-serif';
      c.fillText('DRAW YOUR RACING LINE',this.w/2,this.h/2-5);
      c.fillStyle='#4f5d55';c.font='11px system-ui, sans-serif';c.fillText('Drag to sketch a loop. We’ll smooth the corners.',this.w/2,this.h/2+18);
    }
    if(this.draft.length>1 && this.gesture?.moved){
      if(this.points.length){c.fillStyle='rgba(17,22,26,.64)';c.fillRect(0,0,this.w,this.h);}
      this.path(this.draft,false);c.lineCap='round';c.lineJoin='round';c.lineWidth=3;c.strokeStyle=MINT;c.shadowColor='rgba(194,250,119,.3)';c.shadowBlur=12;c.stroke();c.shadowBlur=0;
      const start=this.screen(this.draft[0]),last=this.screen(this.draft[this.draft.length-1]);
      c.beginPath();c.setLineDash([4,6]);c.moveTo(last.x,last.y);c.lineTo(start.x,start.y);c.strokeStyle='rgba(194,250,119,.3)';c.lineWidth=1;c.stroke();c.setLineDash([]);
      c.beginPath();c.arc(start.x,start.y,6,0,Math.PI*2);c.strokeStyle=MINT;c.lineWidth=1.5;c.stroke();
    }
  }
  dispose() {
    this.destroyed=true;this.observer?.disconnect();
    for(const [name,handler] of Object.entries(this.listeners))this.canvas.removeEventListener(name,handler);
  }
}
