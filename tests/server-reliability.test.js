'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
process.env.PORT = '0';
const {server, rooms, streams, startRound, publicState, maintainRooms, closeRoom, logMove, LIMITS, ROOM_TTL_MS} = require('../server');
let base;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('Condition did not settle'); await delay(10); }
}
async function post(path, token, body = {}, extraHeaders = {}) {
  const response = await fetch(base + path, {method:'POST',headers:{'content-type':'application/json',...(token ? {'x-player-token':token}:{}),...extraHeaders},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
async function create(mode = 'classic') {
  const result = await post('/api/rooms', null, {mode,name:'Host'});
  assert.equal(result.status, 201);
  return {...result.body, code:result.body.state.code};
}
async function open(data) {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/events?room=${data.code}&token=${data.token}`, {signal:controller.signal});
  assert.equal(response.status, 200);
  return {response,controller};
}
test.before(async () => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterEach(() => {for (const room of rooms.values())closeRoom(room);});
test.after(async () => {server.closeAllConnections();await new Promise(resolve => server.close(resolve));});

test('UTF-8 body size is limited in bytes and oversized requests receive JSON 413', async () => {
  const response = await post('/api/rooms', null, {name:'🦊'.repeat(600)});
  assert.equal(response.status, 413);
  assert.match(response.body.error, /too large/i);
  assert.equal(rooms.size, 0);
  const data = Buffer.from(JSON.stringify({name:'Zoë 🦊'}));
  const split = data.indexOf(Buffer.from('🦊')) + 2;
  const result = await new Promise((resolve,reject) => {
    const req = http.request(base+'/api/rooms',{method:'POST'},res=>{
      let raw='';res.on('data',chunk=>{raw+=chunk;});res.on('end',()=>resolve(JSON.parse(raw)));
    });
    req.on('error',reject);req.write(data.subarray(0,split));req.end(data.subarray(split));
  });
  assert.equal(result.state.you.name, 'Zoë 🦊');
});

test('unfinished request bodies time out with JSON 408', async () => {
  const status = await new Promise((resolve,reject) => {
    const req=http.request(base+'/api/rooms',{method:'POST'},res=>{
      let raw='';res.on('data',chunk=>{raw+=chunk;});res.on('end',()=>{req.destroy();resolve({code:res.statusCode,body:JSON.parse(raw)});});
    });
    req.on('error',reject);req.write('{"name":');
  });
  assert.equal(status.code,408);assert.match(status.body.error,/timed out/i);
});

test('cross-origin room creation and SSE access are rejected', async () => {
  const denied = await post('/api/rooms',null,{}, {origin:'https://evil.example'});
  assert.equal(denied.status,403);assert.equal(rooms.size,0);
  const data=await create();
  const response=await fetch(`${base}/api/events?room=${data.code}&token=${data.token}`,{headers:{origin:'https://evil.example'}});
  assert.equal(response.status,403);assert.equal(streams.size,0);
});

test('room capacity is bounded without overwriting existing rooms', async () => {
  for(let i=0;i<LIMITS.rooms;i++)rooms.set(String(i),{code:String(i),phase:'lobby',lastActivityAt:Date.now()});
  const result=await post('/api/rooms',null,{});
  assert.equal(result.status,503);assert.equal(rooms.size,LIMITS.rooms);
});

test('idle playing rooms expire even after automatic timeouts and cancel AI timers', async () => {
  const data=await create('computer');const room=rooms.get(data.code);
  room.round=1;startRound(room);
  const humanActivity=Date.now()-ROOM_TTL_MS+100;
  room.lastActivityAt=humanActivity;room.turnDeadline=Date.now()-1;
  maintainRooms();
  assert.ok(rooms.has(data.code));assert.equal(room.lastActivityAt,humanActivity);
  assert.ok(room.aiTimer,'Bot turn was scheduled after timeout');
  maintainRooms(humanActivity+ROOM_TTL_MS+1);
  assert.equal(rooms.has(data.code),false);
  assert.equal(room.aiTimer._destroyed,true);
});

test('event logs are bounded without forgetting used words or the current ladder', async () => {
  const data=await create();const room=rooms.get(data.code);
  room.used=new Set(['dogs','dots']);room.history=['dogs','dots'];room.current='dots';
  for(let i=0;i<LIMITS.moves+20;i++)logMove(room,{reason:'timeout',sequence:i});
  assert.equal(room.moves.length,LIMITS.moves);assert.equal(room.moves[0].sequence,20);
  assert.deepEqual([...room.used],['dogs','dots']);assert.deepEqual(room.history,['dogs','dots']);
});

test('SSE presence respects two tabs and reconnects without invalidating a move version', async () => {
  const data=await create();const room=rooms.get(data.code);const version=room.version;
  const one=await open(data),two=await open(data);
  try {
    assert.equal(publicState(room,room.players[0]).players[0].connected,true);
    assert.equal(room.version,version);
    const denied=await fetch(`${base}/api/events?room=${data.code}&token=${data.token}`);
    assert.equal(denied.status,429);assert.equal(denied.headers.get('retry-after'),'15');
    one.controller.abort();await until(()=>streams.get(data.code)?.size===1);
    assert.equal(publicState(room,room.players[0]).players[0].connected,true);
    two.controller.abort();await until(()=>!streams.has(data.code));
    assert.equal(publicState(room,room.players[0]).players[0].connected,false);
    const restored=await open(data);
    restored.controller.abort();await until(()=>!streams.has(data.code));
    assert.equal(room.version,version);
  } finally {one.controller.abort();two.controller.abort();}
});

test('expiry tells connected clients to stop reconnecting and removes room streams', async () => {
  const data=await create();const stream=await open(data);
  try {
    const room=rooms.get(data.code);room.lastActivityAt=Date.now()-ROOM_TTL_MS-1;
    maintainRooms();
    const body=await stream.response.text();
    assert.match(body,/event: expired/);assert.equal(rooms.has(data.code),false);assert.equal(streams.has(data.code),false);
  } finally {stream.controller.abort();}
});

test('host handoff waits for the grace period and keeps the disconnected player seat', async () => {
  const data=await create();
  const guest=await post(`/api/rooms/${data.code}/join`,null,{name:'Guest'});
  const active=await open({...guest.body,code:data.code});
  try {
    const room=rooms.get(data.code),originalHost=room.hostId;
    maintainRooms();assert.equal(room.hostId,originalHost);
    room.hostDisconnectedAt=Date.now()-15_001;maintainRooms();
    assert.equal(room.hostId,guest.body.state.you.id);assert.equal(room.players.length,2);
    assert.equal(room.players[0].id,originalHost);
  } finally {active.controller.abort();}
});

test('aborting a partial request does not crash the server or create a room', async () => {
  await new Promise(resolve => {
    const req=http.request(base+'/api/rooms',{method:'POST'});
    req.on('error',()=>{});
    req.write('{"name":',()=>setTimeout(()=>{req.destroy();resolve();},20));
  });
  const health=await fetch(base+'/api/health');
  assert.equal(health.status,200);assert.equal(rooms.size,0);
});
