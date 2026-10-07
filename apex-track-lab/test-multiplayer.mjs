import assert from 'node:assert/strict';
import {server} from './server.mjs';
import {PRESETS} from './dist/track-editor.js';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/api/`;
const proxyHeaders={Origin:`https://${new URL(base).host}`,'X-Forwarded-Proto':'https'};
async function post(action,data={},token){const r=await fetch(base+action,{method:'POST',headers:{...proxyHeaders,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});return {status:r.status,...await r.json()};}
try{
 const page=await fetch(new URL('/',base));assert.equal(page.status,200);assert.match(await page.text(),/app\.js/);
 assert.equal((await fetch(base+'create',{method:'POST',headers:{...proxyHeaders,Origin:'https://unrelated.example'},body:'{}'})).status,403);
 const host=await post('create',{name:'Host',track:{points:PRESETS[0].points,width:14,name:'Test',laps:2}});assert.equal(host.status,200);
 const peers=[];for(let i=0;i<3;i++)peers.push(await post('join',{code:host.room.code,name:`Friend ${i}`}));assert.equal(peers[2].room.players.length,4);
 assert.equal((await post('join',{code:host.room.code})).status,400);
 assert.equal((await post('start',{},peers[0].token)).status,400);
 const chat=await post('chat',{text:'Hello <b>friends</b>',name:'Imposter'},host.token);assert.equal(chat.status,200);assert.equal(chat.messages[0].name,'Host');
 const received=await post('state',{},peers[0].token);assert.equal(received.room.messages[0].text,'Hello <b>friends</b>');
 assert.equal((await post('chat',{text:'Too fast'},host.token)).status,400);
 assert.equal((await post('chat',{text:'   '},peers[0].token)).status,400);
 assert.equal((await post('chat',{text:'x'.repeat(301)},peers[0].token)).status,400);
 assert.equal((await fetch(base+'chat',{method:'POST',body:JSON.stringify({text:'Unauthorized'})})).status,401);
 const other=await post('create',{track:{points:PRESETS[0].points,width:14}});assert.equal((await post('state',{},other.token)).room.messages.length,0);await post('leave',{},other.token);
 const stream=await fetch(base+'events?token='+peers[0].token);const reader=stream.body.getReader();const initial=new TextDecoder().decode((await reader.read()).value);assert.ok(initial.includes(host.room.code));assert.ok(!initial.includes(host.token));
 assert.equal((await post('start',{},host.token)).status,200);
 assert.equal((await post('join',{code:host.room.code})).status,400);
 assert.equal((await post('chat',{text:'Racing chat works'},peers[0].token)).status,200);
 const moved=await post('state',{state:{x:2,z:3,yaw:1,speed:40,lap:2}},host.token);assert.equal(moved.status,200);assert.equal(moved.room.players.find(p=>p.id===host.id).state.x,2);const polled=await post('state',{},peers[0].token);assert.equal(polled.room.players.find(p=>p.id===host.id).state.speed,40);
 assert.equal((await post('state',{state:{x:9000,z:3,yaw:1,speed:40,lap:2}},host.token)).status,400);
 let got=false;for(let i=0;i<12;i++){const text=new TextDecoder().decode((await reader.read()).value);if(text.includes('"speed":40')){got=true;break;}}assert.ok(got,'opponents receive movement');
 const finished=await post('state',{state:{x:2,z:3,yaw:1,speed:0,lap:3,paused:true,finished:true,lapTimes:[30,31],raceTime:61,currentLapTime:0}},host.token);assert.equal(finished.status,200);
 const results=(await post('state',{},peers[0].token)).room.players.find(p=>p.id===host.id).state;assert.equal(results.finished,true);assert.equal(results.raceTime,61);assert.deepEqual(results.lapTimes,[30,31]);
 assert.equal((await post('state',{state:{x:2,z:3,yaw:1,speed:0,lap:3,lapTimes:[-1]}},host.token)).status,400);
 await post('leave',{},host.token);let transfer=false;for(let i=0;i<12;i++){const text=new TextDecoder().decode((await reader.read()).value);if(text.includes(`"host":"${peers[0].id}"`)){transfer=true;break;}}assert.ok(transfer,'host transfers');await reader.cancel();
 for(const peer of peers)await post('leave',{},peer.token);assert.equal((await post('join',{code:host.room.code})).status,400);
 console.log('PASS: four-player cap, invite join, shared track, private tokens, host-only start, movement relay, validation, host transfer, room cleanup, chat delivery, sender identity, room isolation, chat validation and throttling.');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
