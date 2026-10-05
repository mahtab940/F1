import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateTrack} from './dist/track-editor.js';
import {CARS} from './dist/cars.js';
const rooms=new Map(), tokens=new Map();
const id=()=>randomBytes(18).toString('hex');
const fail=(message)=>{throw Error(message);};
function snapshot(r){return {code:r.code,host:r.host,started:r.started,messages:r.messages,track:r.track,players:[...r.players.values()].map(({token,stream,seen,lastChat,...p})=>p)};}
function broadcast(r){const data=`data: ${JSON.stringify(snapshot(r))}\n\n`;for(const p of r.players.values())if(p.stream&&!p.stream.write(data))p.stream.destroy();}
function leave(r,p){p.stream?.end();r.players.delete(p.id);tokens.delete(p.token);if(!r.players.size)rooms.delete(r.code);else{if(r.host===p.id)r.host=r.players.keys().next().value;broadcast(r);}}
export const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
 res.setHeader('Cache-Control','no-store');
 if(req.headers.origin&&req.headers.origin!==`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`)return res.writeHead(403).end();
 if(req.method==='GET'&&url.pathname==='/api/events'){
 const entry=tokens.get(url.searchParams.get('token'));if(!entry)return res.writeHead(401).end();const {r,p}=entry;
 p.stream?.end();res.writeHead(200,{'Content-Type':'text/event-stream','X-Accel-Buffering':'no','Connection':'keep-alive'});p.stream=res;p.seen=Date.now();broadcast(r);req.on('close',()=>{if(p.stream===res)p.stream=null;});return;
 }
 if(req.method!=='POST')return res.writeHead(405).end();
 let body='';for await(const chunk of req){body+=chunk;if(body.length>30000)fail('Request too large');}const b=JSON.parse(body||'{}');let result={ok:true};
 if(url.pathname==='/api/create'||url.pathname==='/api/join'){
 let r;if(url.pathname==='/api/create'){
 if(rooms.size>=200)fail('Server full. Try again later.');const t=b.track;
 if(!t||!Array.isArray(t.points)||t.points.length>160||!Number.isFinite(t.width)||t.width<10||t.width>22||t.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)||!validateTrack(t.points,t.width).valid)fail('Invalid circuit');
 let code;do{code=randomBytes(4).toString('hex').toUpperCase();}while(rooms.has(code));r={code,host:null,started:false,messages:[],track:{points:t.points,width:t.width,laps:Number.isInteger(t.laps)&&t.laps>=0&&t.laps<=99?t.laps:0,name:String(t.name||'Friend circuit').slice(0,48)},players:new Map()};rooms.set(code,r);
 }else{r=rooms.get(String(b.code).toUpperCase());if(!r)fail('Room not found');if(r.started)fail('Race already started');if(r.players.size>=4)fail('Room is full (4 players maximum)');}
 const p={id:id(),token:id(),name:String(b.name||'Driver').trim().slice(0,24)||'Driver',car:CARS.find(c=>c.id===b.car)?.id||CARS[0].id,state:null,seen:Date.now(),stream:null};r.players.set(p.id,p);r.host??=p.id;tokens.set(p.token,{r,p});result={token:p.token,id:p.id,room:snapshot(r)};broadcast(r);
 }else{
 const entry=tokens.get(req.headers.authorization?.replace(/^Bearer /,''));if(!entry)return res.writeHead(401).end();const {r,p}=entry;p.seen=Date.now();
 if(url.pathname==='/api/leave')leave(r,p);
 else if(url.pathname==='/api/start'){if(r.host!==p.id)fail('Only the host can start');if(r.players.size<2)fail('Wait for at least one friend');if(!r.started){r.started=true;broadcast(r);}}
 else if(url.pathname==='/api/state'){const s=b.state;if(r.started&&s){if(!['x','z','yaw','speed','lap'].every(k=>Number.isFinite(s[k]))||Math.abs(s.x)>3000||Math.abs(s.z)>3000||Math.abs(s.yaw)>1e6||s.lap<1||s.lap>1e6||Math.abs(s.speed)>1000)fail('Invalid position');const times=s.lapTimes??[];
 if(!Array.isArray(times)||times.length>10000||times.some(t=>!Number.isFinite(t)||t<=0)||s.raceTime!=null&&(!Number.isFinite(s.raceTime)||s.raceTime<0)||s.currentLapTime!=null&&(!Number.isFinite(s.currentLapTime)||s.currentLapTime<0))fail('Invalid race stats');
 p.state={x:s.x,z:s.z,yaw:s.yaw,speed:s.speed,lap:Math.floor(s.lap),paused:!!s.paused,lapTimes:times,raceTime:s.raceTime??0,currentLapTime:s.currentLapTime??0,finished:!!s.finished&&r.track.laps>0&&times.length===r.track.laps};}result={ok:true,room:snapshot(r)};}
 else if(url.pathname==='/api/chat'){
 const text=typeof b.text==='string'?b.text.trim():'';
 if(!text||text.length>300)fail('Write a message between 1 and 300 characters.');
 if(p.lastChat&&Date.now()-p.lastChat<750)fail('Please wait a moment before sending another message.');
 p.lastChat=Date.now();r.messages.push({id:id(),playerId:p.id,name:p.name,text,time:p.lastChat});r.messages=r.messages.slice(-50);result={ok:true,messages:r.messages};broadcast(r);
 }
 else fail('Unknown action');
 }
 res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));return;
 }
 const path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);if(path.includes('..')||! /^(?:[\w-]+\.(?:html|js|css|webmanifest)|assets\/[\w.-]+)$/.test(path))return res.writeHead(404).end();
 const data=await readFile(new URL('./dist/'+path,import.meta.url));res.setHeader('Cache-Control','no-cache');res.writeHead(200,{'Content-Type':({'html':'text/html','js':'text/javascript','css':'text/css','txt':'text/plain','webmanifest':'application/manifest+json','png':'image/png'})[path.split('.').pop()]||'application/octet-stream'}).end(data);
 }catch(e){if(!res.headersSent)res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.code==='ENOENT'?'Not found':e.message}));else res.end();}});
const ticker=setInterval(()=>{for(const r of rooms.values()){for(const p of r.players.values())if(Date.now()-p.seen>15000)leave(r,p);if(r.players.size)broadcast(r);}},100);ticker.unref();server.on('close',()=>clearInterval(ticker));
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT)||4173,process.env.HOST||'0.0.0.0',()=>console.log('APEX multiplayer server ready'));
