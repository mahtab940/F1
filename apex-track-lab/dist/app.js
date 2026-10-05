import {TrackEditor, PRESETS, validateTrack, sampleTrack} from './track-editor.js';
import {CARS, SOURCES, CATALOGUE_NOTE} from './cars.js';
import {RaceEngine} from './engine.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Browser storage unavailable. Export your circuit to keep it.');return false;}};
const normalizeLaps=value=>Math.max(0,Math.min(99,Math.floor(Number(value)||0)));
$('lapCount').value=normalizeLaps(read('apex-laps',3));
$('lapCount').onchange=()=>{$('lapCount').value=normalizeLaps($('lapCount').value);write('apex-laps',Number($('lapCount').value));};
let toastTimer;function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
let engine=null,ready=false,racing=false,camera='orbit',sound=false,trackName='Grand loop',trackWidth=14,trackTimer,loadingTrack=false;
let currentCar=CARS.find(c=>c.year===2026&&c.team==='Ferrari')||CARS.at(-1);
let points=PRESETS[0].points,stats=validateTrack(points),recordKey='';
const saved=read('apex-last-session',null);if(saved&&Array.isArray(saved.points)&&saved.points.length<=160&&saved.points.every(p=>p&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)&&validateTrack(saved.points,saved.width).valid){points=saved.points;trackWidth=Math.max(10,Math.min(22,Number(saved.width)||14));trackName=String(saved.name||'My circuit').slice(0,48);currentCar=CARS.find(c=>c.id===saved.car)||currentCar;stats=validateTrack(points,trackWidth);}
function storageTracks(){const data=read('apex-circuits',[]);return Array.isArray(data)?data:[];}
function persistSession(){write('apex-last-session',{points,width:trackWidth,name:trackName,car:currentCar.id});}
function recordId(){let h=2166136261;const text=JSON.stringify(points.map(p=>[+p.x.toFixed(4),+p.y.toFixed(4)]))+trackWidth+currentCar.id;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return 'apex-best-'+(h>>>0).toString(36);}
function restoreRecord(){recordKey=recordId();const record=read(recordKey,null);if(engine)engine.bestLap=Number.isFinite(record)&&record>0?record:null;$('bestTime').textContent=formatTime(engine?.bestLap);}
function drawMinimap(){if(!engine||!racing)return;const ctx=$('minimap').getContext('2d');ctx.clearRect(0,0,300,240);const sampled=sampleTrack(points,8);ctx.beginPath();for(let i=0;i<sampled.length;i++){const p=sampled[i];if(!i)ctx.moveTo(30+p.x*240,10+p.y*220);else ctx.lineTo(30+p.x*240,10+p.y*220);}ctx.closePath();ctx.strokeStyle='#09130bb0';ctx.lineWidth=12;ctx.stroke();ctx.strokeStyle='#d7eac2c0';ctx.lineWidth=4;ctx.stroke();const start=points[0];ctx.fillStyle='#c2fa77';ctx.fillRect(27+start.x*240,7+start.y*220,6,6);const x=30+(engine.pos.x/640+.5)*240,y=10+(engine.pos.z/640+.5)*220;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='#c2fa77';ctx.fill();ctx.strokeStyle='#17300d';ctx.lineWidth=2;ctx.stroke();}
function formatTime(sec){if(!Number.isFinite(sec)||sec===null)return '—';const ms=Math.floor(Math.max(0,sec)*1000);return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
function raceStats(){return {finished:engine.finished,raceTime:engine.raceTime||0,lapTimes:engine.lapTimes||[],currentLapTime:engine.lapTime};}
function statsTable(players){
 return '<div class="stats-scroll"><table class="stats-table"><thead><tr><th>Driver</th><th>Status</th><th>Laps</th><th>Total</th><th>Best lap</th></tr></thead><tbody>'+players.map(p=>{const s=p.state,t=s?.lapTimes||[];return `<tr><th>${esc(p.name)}</th><td>${s?.finished?'Finished':s?.paused?'Paused':s?'Racing':'On grid'}</td><td>${t.length}${engine.lapLimit?' / '+engine.lapLimit:''}</td><td>${formatTime(s?.raceTime)}</td><td>${formatTime(t.length?Math.min(...t):null)}</td></tr>`;}).join('')+'</tbody></table></div>';
}
function renderRaceStats(room){
 const players=room?room.players.map(p=>({...p,name:p.name+(p.id===online.id?' (you)':''),state:p.id===online.id?{...raceStats(),paused:engine.paused}:p.state})):[{name:'You',state:{...raceStats(),paused:engine.paused}}];
 if(room){$('friendsStats').innerHTML='<strong>FRIENDS · RACE STATS</strong>'+statsTable(players);$('friendsStats').hidden=!racing;}
 if(engine.finished){
  $('pauseLabel').textContent='CHEQUERED FLAG';$('pauseTitle').textContent='Race finished';$('sceneMode').textContent=room?'● FRIENDS / FINISHED':'● RACE / FINISHED';
  $('raceResults').hidden=false;$('raceResults').innerHTML=statsTable(players)+(room?`<p>${players.every(p=>p.state?.finished)?'All drivers finished.':'Waiting for the other drivers to finish…'}</p>`:'')+'<details><summary>Your lap times</summary><ol>'+engine.lapTimes.map((t,i)=>`<li>Lap ${i+1}: ${formatTime(t)}</li>`).join('')+'</ol></details>';
 }
}
function syncTrack(){clearTimeout(trackTimer);if(!stats.valid||!engine)return;engine.setTrack(points,trackWidth);restoreRecord();engine.setCamera('orbit');persistSession();}
function updateTrack(newPoints,newStats){points=newPoints;stats=newStats;clearTimeout(trackTimer);$('lengthValue').textContent=stats.valid?(stats.length/1000).toFixed(2)+' km':'—';$('cornersValue').textContent=stats.valid?stats.corners:'—';$('raceBtn').disabled=!ready||!stats.valid;for(const b of $('presets').children)b.classList.remove('active');if(!loadingTrack)trackName='Custom circuit';$('circuitTitle').textContent=trackName;if(!stats.valid){$('editorStatus').textContent=stats.error;$('editorStatus').classList.add('error');return;}$('editorStatus').classList.remove('error');$('editorStatus').textContent='Circuit ready. Refine your corners or take it for a lap.';trackTimer=setTimeout(syncTrack,250);}
const editor=new TrackEditor($('trackCanvas'),{onChange:updateTrack,onStatus:message=>{$('editorStatus').textContent=typeof message==='string'?message:message.message;}});
const initialPoints=points.map(p=>({...p}));loadingTrack=true;editor.setWidth(trackWidth);editor.setPoints(initialPoints);loadingTrack=false;
$('trackWidth').value=trackWidth;$('widthValue').textContent=trackWidth+' m';
for(const preset of PRESETS){const b=document.createElement('button');b.innerHTML=`<svg viewBox="0 0 100 65" aria-hidden="true"><path d="M${preset.points.map(p=>(p.x*90+5).toFixed(1)+','+(p.y*58+3).toFixed(1)).join(' L')} Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg><span>${esc(preset.name)}</span>`;b.onclick=()=>{trackName=preset.name;loadingTrack=true;editor.setPoints(preset.points);loadingTrack=false;b.classList.add('active');};$('presets').append(b);if(preset.name===trackName)b.classList.add('active');}
for(const [id,mode]of [['drawBtn','draw'],['editBtn','edit']])$(id).onclick=()=>{editor.setMode(mode);for(const [button,m]of [['drawBtn','draw'],['editBtn','edit']]){$(button).classList.toggle('selected',m===mode);$(button).setAttribute('aria-pressed',String(m===mode));}};
$('undoBtn').onclick=()=>editor.undo();$('clearBtn').onclick=()=>editor.clear();$('trackWidth').oninput=e=>{trackWidth=Number(e.target.value);$('widthValue').textContent=trackWidth+' m';loadingTrack=true;editor.setWidth(trackWidth);loadingTrack=false;};
for(let y=2026;y>=2000;y--){const o=document.createElement('option');o.value=y;o.textContent=y;$('season').append(o);}$('season').value=currentCar.year;
function carArt(c){return `<svg viewBox="0 0 220 70" aria-hidden="true"><ellipse cx="111" cy="59" rx="91" ry="5" fill="#080d07" opacity=".6"/><path d="M24 49h174l3 6H21z" fill="#111711"/><path d="M49 43L93 37l15-24h15l16 26 28 6 18 3v7H47z" fill="${c.color}"/><path d="M85 43l26-4 30 2 17 8H69z" fill="${c.accent}" opacity=".85"/><path d="M104 38v-9h21l10 10" fill="#101610"/>${c.year>=2018?'<path d="M105 29l5-7h16l9 17" fill="none" stroke="#111811" stroke-width="3"/>':''}<path d="M41 45V24h8v23M31 24h33v5H31M164 50h37v6h-39" fill="${c.color}"/><g fill="#111613" stroke="#56614e" stroke-width="1.5"><circle cx="59" cy="49" r="13"/><circle cx="164" cy="49" r="13"/></g><g fill="#303c2c" stroke="#d9c861" stroke-width="1"><circle cx="59" cy="49" r="7"/><circle cx="164" cy="49" r="7"/></g></svg>`;}
function renderCars(){const year=Number($('season').value),q=$('carSearch').value.trim().toLowerCase();const matches=CARS.filter(c=>c.year===year&&(!q||(c.team+' '+c.model).toLowerCase().includes(q)));$('carGrid').innerHTML='';for(const c of matches){const button=document.createElement('button');button.className='car'+(c.id===currentCar.id?' selected':'');button.setAttribute('aria-pressed',String(c.id===currentCar.id));button.setAttribute('aria-label',`${c.year} ${c.team} ${c.model}`);button.innerHTML=`<div class="car-top"><span>${c.year}</span><b>${c.id===currentCar.id?'✓ SELECTED':''}</b></div>${carArt(c)}<span class="team">${esc(c.team)}</span><strong>${esc(c.model)}</strong><span class="engine">${esc(c.engine)}</span>`;button.onclick=()=>{currentCar=c;engine?.setCar(c);restoreRecord();persistSession();renderCars();};$('carGrid').append(button);}$('noCars').hidden=matches.length>0;$('selectedSummary').textContent=`ON THE GRID / ${currentCar.year} ${currentCar.team} ${currentCar.model}`;const start=year>=2026?2026:year>=2022?2022:year>=2014?2014:year>=2006?2006:2000;for(const b of $('eraTabs').children)b.classList.toggle('selected',Number(b.dataset.year)===start);}
$('season').onchange=()=>{$('carSearch').value='';renderCars();};$('carSearch').oninput=renderCars;$('eraTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;$('season').value=b.dataset.year;$('carSearch').value='';renderCars();};renderCars();
$('garageNav').onclick=()=>{if(racing)exitRace();document.body.classList.add('archive-open');$('studioNav').classList.remove('active');$('garageNav').classList.add('active');$('garage').scrollIntoView({behavior:'smooth'});};$('studioNav').onclick=()=>{if(racing)exitRace();document.body.classList.remove('archive-open');$('studioNav').classList.add('active');$('garageNav').classList.remove('active');window.scrollTo({top:0,behavior:'smooth'});};
function openDialog(id){if(racing)engine?.pause(true);$(id).showModal();}
for(const b of document.querySelectorAll('.close'))b.onclick=()=>b.closest('dialog').close();
$('helpBtn').onclick=()=>openDialog('helpDialog');$('aboutBtn').onclick=$('sourcesBtn').onclick=()=>openDialog('aboutDialog');$('catalogSummary').textContent=`Browse ${CARS.length} season/chassis entries. ${CATALOGUE_NOTE}`;for(const s of SOURCES){const li=document.createElement('li');const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=s.title;li.append(a,document.createTextNode(' — '+s.note));$('sourceList').append(li);}
$('saveBtn').onclick=()=>{if(!stats.valid){toast('Draw a valid circuit before saving.');return;}$('trackName').value=trackName;openDialog('saveDialog');};
function trackData(){return {format:'apex-circuit-v1',name:($('trackName').value.trim()||trackName).slice(0,48),width:trackWidth,points:editor.getPoints()};}
$('saveForm').onsubmit=e=>{e.preventDefault();const t=trackData();if(!t.name)return;const all=storageTracks();const existing=all.findIndex(x=>x.name===t.name);const row={...t,id:existing>=0?all[existing].id:Date.now().toString(36),savedAt:Date.now()};if(existing>=0)all[existing]=row;else all.unshift(row);if(write('apex-circuits',all.slice(0,40))){trackName=t.name;$('circuitTitle').textContent=trackName;persistSession();$('saveDialog').close();toast('Circuit saved on this device.');}};
$('exportBtn').onclick=()=>{const t=trackData();const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(t,null,2)],{type:'application/json'}));a.href=url;a.download=(t.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()||'circuit')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function loadTrack(t){if(!t||!Array.isArray(t.points)||t.points.length>160||t.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw new Error('This file does not contain a valid circuit.');const width=Number(t.width)||14;if(width<10||width>22)throw new Error('Track width must be between 10 and 22 m.');const v=validateTrack(t.points,width);if(!v.valid)throw new Error(v.error);loadingTrack=true;trackName=String(t.name||'Imported circuit').slice(0,48);trackWidth=width;$('trackWidth').value=width;$('widthValue').textContent=width+' m';editor.setWidth(width);editor.setPoints(t.points);loadingTrack=false;$('loadDialog').close();toast('Circuit loaded.');}
function renderSaved(){const all=storageTracks();$('savedList').replaceChildren();if(!all.length){const p=document.createElement('p');p.textContent='Your collection is empty. Save your first circuit in the studio.';$('savedList').append(p);}for(const t of all){const row=document.createElement('div');row.className='saved-row';const text=document.createElement('div');const b=document.createElement('strong');b.textContent=t.name;const sm=document.createElement('small');sm.textContent=`${t.width} m wide · saved locally`;text.append(b,sm);const actions=document.createElement('div');actions.className='actions';const load=document.createElement('button');load.textContent='Load';load.onclick=()=>{try{loadTrack(t);}catch(e){$('loadStatus').textContent=e.message;}};const del=document.createElement('button');del.textContent='Delete';del.onclick=()=>{const before=storageTracks();if(write('apex-circuits',before.filter(x=>x.id!==t.id))){renderSaved();toast('Circuit removed from this collection.');}};actions.append(load,del);row.append(text,actions);$('savedList').append(row);}}
$('loadBtn').onclick=()=>{renderSaved();$('loadStatus').textContent='';openDialog('loadDialog');};$('importFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>150000)throw new Error('Circuit files must be smaller than 150 KB.');loadTrack(JSON.parse(await file.text()));}catch(error){$('loadStatus').textContent=error.message||'Unable to load this circuit.';}e.target.value='';};
function setRaceUI(value){racing=value;document.body.classList.toggle('racing',value);$('hud').hidden=!value;$('previewCaption').hidden=value;$('raceToolbar').hidden=!value;$('touchControls').hidden=!value||!(matchMedia('(pointer:coarse)').matches||innerWidth<800);$('sceneMode').textContent=value?'● TIME TRIAL / LIVE':'● LIVE CIRCUIT PREVIEW';$('friendsStats').hidden=true;$('raceResults').hidden=true;if(!value)$('pauseOverlay').hidden=true;requestAnimationFrame(()=>engine?.resize());}
function exitRace(){if(multiplayerActive())leaveOnline();engine?.pause(true);if(engine){engine.racing=false;engine.paused=false;engine.reset();engine.setCamera('orbit');}setRaceUI(false);editor.resize();}
$('raceBtn').onclick=()=>{if(!ready||!stats.valid)return;syncTrack();engine.lapLimit=normalizeLaps($('lapCount').value);setRaceUI(true);engine.start();window.scrollTo({top:0});};$('exitBtn').onclick=$('backBtn').onclick=exitRace;$('pauseBtn').onclick=()=>engine?.pause(true);$('resumeBtn').onclick=()=>engine?.pause(false);$('resetBtn').onclick=()=>{engine?.reset();engine?.pause(false);toast('Back on the grid.');};
$('cameraBtn').onclick=()=>engine?.setCamera(camera==='orbit'?'chase':camera==='chase'?'cockpit':'orbit');$('soundBtn').onclick=()=>{sound=!sound;engine?.setSound(sound);$('soundBtn').textContent=sound?'Sound on':'Sound off';$('soundBtn').setAttribute('aria-pressed',String(sound));};$('weather').onchange=e=>engine?.setWeather(e.target.value);$('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}};
for(const b of document.querySelectorAll('[data-steer],[data-pedal]')){const stop=()=>{if(b.dataset.steer)engine?.setInput({steer:0});else engine?.setInput({[b.dataset.pedal]:0});};b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(b.dataset.steer)engine?.setInput({steer:Number(b.dataset.steer)});else engine?.setInput({[b.dataset.pedal]:1});};b.onpointerup=stop;b.onpointercancel=stop;b.onlostpointercapture=stop;}
try{engine=new RaceEngine($('scene'),{onTelemetry:t=>{$('speed').textContent=t.speed;$('gear').textContent=t.gear;document.querySelectorAll('.rev-strip i').forEach((led,i)=>led.classList.toggle('lit',t.speed>0 && i<Math.round((.28+(t.speed%43)/43*.55)*12)));$('lapNumber').textContent=engine?.lapLimit?`${Math.min(t.lap,engine.lapLimit)} / ${engine.lapLimit}`:String(t.lap).padStart(2,'0');$('lapTime').textContent=formatTime(t.currentLapTime);$('bestTime').textContent=formatTime(t.bestLap);$('offtrack').hidden=!t.offTrack;drawMinimap();},onLap:t=>{write(recordKey,t.bestLap);toast(`Lap ${t.lap}: ${formatTime(t.time)} · Best ${formatTime(t.bestLap)}`);},onStatus:s=>{if(s.type==='camera'){camera=s.camera;$('cameraLabel').textContent=camera[0].toUpperCase()+camera.slice(1)+' camera';}if(s.type==='paused'){$('raceResults').hidden=true;$('pauseLabel').textContent='TAKE A BREATHER';$('pauseTitle').textContent='Session paused';$('resumeBtn').hidden=false;$('pauseOverlay').hidden=false;}if(s.type==='finished'){renderRaceStats(online?.room);$('resumeBtn').hidden=true;$('pauseOverlay').hidden=false;}if(s.type==='racing'){$('sceneMode').textContent=multiplayerActive()?'● FRIENDS / LIVE':'● TIME TRIAL / LIVE';$('pauseOverlay').hidden=true;$('raceResults').hidden=true;}if(s.type==='error'){ready=false;$('raceBtn').disabled=true;toast(s.message);}}});engine.setCar(currentCar);syncTrack();ready=true;$('loading').hidden=true;$('raceBtn').textContent='Go racing ↗';$('raceBtn').disabled=!stats.valid;}catch(error){console.error(error);$('loading').textContent='3D graphics could not start. Enable WebGL or try another browser. The track editor and car archive are still available.';$('raceBtn').textContent='3D unavailable';}
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')&&e.key==='Escape')e.stopImmediatePropagation();},true);
window.addEventListener('pagehide',()=>engine?.dispose());

// Private multiplayer rooms use the same origin as the game server.
let online=null,events=null,onlineTimer=null,sending=false,onlineStarted=false;
function multiplayerActive(){return !!online;}
async function roomRequest(action,data={}){
 const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(online?{Authorization:'Bearer '+online.token}:{})},body:JSON.stringify(data)});
 let result;try{result=await response.json();}catch{throw Error('Multiplayer needs the APEX game server. Open the hosted game link.');}
 if(!response.ok)throw Error(result.error||'Connection lost. Rejoin the room.');return result;
}
function roomMessage(message){$('roomStatus').textContent=message;}
function lockSetup(locked){for(const el of document.querySelectorAll('.editor button,.editor input,.garage button,.garage input,.garage select,#loadBtn,#raceBtn,#lapCount'))el.disabled=locked;if(!locked)$('raceBtn').disabled=!ready||!stats.valid;}
function showRoom(room){
 if(!online)return;renderChat(room.messages||[]);online.room=room;$('lapCount').value=normalizeLaps(room.track.laps);$('roomTitle').textContent=`Room ${room.code} · ${room.players.length}/4 drivers`;
 $('roomPlayers').replaceChildren(...room.players.map(p=>{const li=document.createElement('li');li.textContent=p.name+(p.id===room.host?' (host)':'')+(p.id===online.id?' · you':'')+(p.state?` · Lap ${p.state.lap}${p.state.paused?' · paused':''}`:'');return li;}));
 $('startRoom').hidden=room.host!==online.id||room.started;$('startRoom').disabled=room.players.length<2;
 if(room.started&&!onlineStarted){onlineStarted=true;clearTimeout(trackTimer);syncTrack();engine.setCar(CARS.find(c=>c.id===room.players.find(p=>p.id===online.id).car));engine.lapLimit=normalizeLaps(room.track.laps);engine.gridSlot=room.players.findIndex(p=>p.id===online.id);setRaceUI(true);engine.start();$('sceneMode').textContent='● FRIENDS / LIVE';roomMessage('Race together! Pausing only pauses your car.');}
 if(room.started)renderRaceStats(room);
 engine?.setOpponents(room.players.filter(p=>p.id!==online.id).map(p=>({...p,car:CARS.find(c=>c.id===p.car)})));
}
async function connectRoom(action){
 if(!ready||online)return;if(action==='create'&&!stats.valid){roomMessage('Choose a valid circuit first.');return;}
 $('createRoom').disabled=$('joinRoom').disabled=true;
 try{const result=await roomRequest(action,{name:$('driverName').value,car:currentCar.id,code:$('roomCode').value.trim(),track:{name:trackName,width:trackWidth,points:editor.getPoints(),laps:normalizeLaps($('lapCount').value)}});
 resetChat();online=result;onlineStarted=false;loadTrack(result.room.track);clearTimeout(trackTimer);syncTrack();lockSetup(true);$('roomSetup').hidden=true;$('roomLobby').hidden=false;showRoom(result.room);roomMessage('Waiting for the host to start. Share the invite link with your friends.');
 onlineTimer=setInterval(async()=>{if(sending||!online)return;sending=true;try{const result=await roomRequest('state',{state:onlineStarted?{x:engine.pos.x,z:engine.pos.z,yaw:engine.yaw,speed:engine.speed,lap:engine.lap,paused:engine.paused,...raceStats()}:null});showRoom(result.room);}catch(error){leaveOnline();if(racing)exitRace();roomMessage(error.message);}finally{sending=false;}},100);
 }catch(error){roomMessage(error.message);}finally{$('createRoom').disabled=$('joinRoom').disabled=false;}
}
function leaveOnline(){
 if(!online)return;fetch('/api/leave',{method:'POST',headers:{Authorization:'Bearer '+online.token,'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});events?.close();clearInterval(onlineTimer);online=null;onlineStarted=false;resetChat();engine?.setOpponents([]);if(engine)engine.gridSlot=null;lockSetup(false);$('roomSetup').hidden=false;$('roomLobby').hidden=true;roomMessage('You left the room. Create or join another room anytime.');
}
$('createRoom').onclick=()=>connectRoom('create');$('joinRoom').onclick=()=>connectRoom('join');
$('startRoom').onclick=async()=>{try{await roomRequest('start');}catch(error){roomMessage(error.message);}};
$('leaveRoom').onclick=()=>{leaveOnline();if(racing)exitRace();};
$('copyInvite').onclick=async()=>{if(!online)return;const url=new URL(location.href);url.searchParams.set('room',online.room.code);try{await navigator.clipboard.writeText(url.href);roomMessage('Invite link copied. Send it to up to three friends.');}catch{roomMessage('Share this link: '+url.href);}};
const invite=new URLSearchParams(location.search).get('room');if(invite){$('roomCode').value=invite.slice(0,8);$('multiplayer').scrollIntoView();}
window.addEventListener('pagehide',leaveOnline);

let chatIds=new Set(),chatUnread=0;
function resetChat(){chatIds=new Set();chatUnread=0;$('chatMessages').replaceChildren();$('chatInput').value='';$('chatStatus').textContent='';$('chatUnread').textContent='';}
function renderChat(messages){
 const list=$('chatMessages'),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<40;
 const keep=new Set(messages.map(m=>m.id));
 for(const child of [...list.children])if(!keep.has(child.dataset.id))child.remove();
 for(const m of messages){if(chatIds.has(m.id))continue;const row=document.createElement('p');row.dataset.id=m.id;row.className=m.playerId===online?.id?'chat-own':'';const name=document.createElement('strong');name.textContent=m.name+(m.playerId===online?.id?' (you)':'')+': ';row.append(name,document.createTextNode(m.text));list.append(row);if(!$('roomChat').open&&m.playerId!==online?.id)chatUnread++;}
 chatIds=keep;if(atBottom)list.scrollTop=list.scrollHeight;$('chatUnread').textContent=chatUnread?`(${chatUnread} new)`:'';
}
$('roomChat').ontoggle=()=>{if($('roomChat').open){chatUnread=0;$('chatUnread').textContent='';$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}};
$('chatInput').onfocus=()=>{if(engine){engine.keys={};engine.setInput({throttle:0,brake:0,steer:0});}};
$('chatInput').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();e.target.blur();}};
$('chatForm').onsubmit=async e=>{
 e.preventDefault();const text=$('chatInput').value.trim(),session=online;if(!text||!session)return;$('chatSend').disabled=true;$('chatStatus').textContent='';
 try{const result=await roomRequest('chat',{text});if(online!==session)return;renderChat(result.messages);if($('chatInput').value.trim()===text)$('chatInput').value='';$('chatMessages').scrollTop=$('chatMessages').scrollHeight;$('chatInput').focus();}
 catch(error){if(online===session)$('chatStatus').textContent=error.message;}finally{$('chatSend').disabled=false;}
};

// Install UI also supplies instructions on browsers without a native install prompt.
let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt=event; });
$('installBtn').onclick=async()=>{
  if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();}
  else openDialog('installDialog');
};
window.addEventListener('appinstalled',()=>{$('installBtn').hidden=true;installPrompt=null;});
if(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) $('installBtn').hidden=true;
if('serviceWorker' in navigator && ['https:','http:'].includes(location.protocol)){
  navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
    $('offlineStatus').textContent='Ready for offline single-player racing. Multiplayer and chat require internet.';
  }).catch(()=>{$('offlineStatus').textContent='Offline setup is unavailable. Open the hosted HTTPS version and try again.';});
}else $('offlineStatus').textContent='Open the hosted HTTPS version to enable installation and offline racing.';
$('graphics').value=read('apex-graphics','auto');
if(!['auto','performance','high'].includes($('graphics').value))$('graphics').value='auto';
engine?.setQuality($('graphics').value);
$('graphics').onchange=()=>{engine?.setQuality($('graphics').value);write('apex-graphics',$('graphics').value);};
