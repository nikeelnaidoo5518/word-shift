'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PORT = '0';
const { server, rooms } = require('../server');

test('room creation, ready gate, authoritative turns, rejected moves and completion', async t => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) });

  const created = await post('/api/rooms', null, { name: 'Host' });
  assert.equal(created.status, 201);
  const hostData = await created.json();
  const code = hostData.state.code;
  const hostToken = hostData.token;

  const joined = await post(`/api/rooms/${code}/join`, null, { name: 'Maya', avatar: '🐸' });
  assert.equal(joined.status, 201);
  const guestData = await joined.json();
  const guestToken = guestData.token;

  const earlyStart = await post(`/api/rooms/${code}/start`, hostToken, { version: guestData.state.version });
  assert.equal(earlyStart.status, 409);
  await post(`/api/rooms/${code}/ready`, guestToken, { ready: true, version: guestData.state.version });

  const start = await post(`/api/rooms/${code}/start`, hostToken, { version: rooms.get(code).version });
  assert.equal(start.status, 200);
  const playing = await start.json();
  assert.equal(playing.phase, 'playing');
  assert.equal(playing.activePlayerId, playing.you.id);

  const sort = await post(`/api/rooms/${code}/move`, hostToken, { word: 'dots', version: playing.version });
  assert.equal(sort.status, 200);
  const afterSort = await sort.json();
  assert.equal(afterSort.current, 'dots');
  assert.equal(afterSort.players.find(p => p.id === playing.you.id).score, 125);
  assert.notEqual(afterSort.activePlayerId, afterSort.you.id);

  const outOfTurn = await post(`/api/rooms/${code}/move`, hostToken, { word: 'sore', version: afterSort.version });
  assert.equal(outOfTurn.status, 403);

  const repeat = await post(`/api/rooms/${code}/move`, guestToken, { word: 'dogs', version: afterSort.version });
  assert.equal(repeat.status, 422);
  assert.match((await repeat.json()).error, /already been used/i);
  assert.equal(rooms.get(code).current, 'dots');

  const stale = await post(`/api/rooms/${code}/move`, hostToken, { word: 'sore', version: afterSort.version });
  assert.equal(stale.status, 409);

  const impossible = await post(`/api/rooms/${code}/move`, hostToken, { word: 'dozs', version: rooms.get(code).version });
  assert.equal(impossible.status, 422);
  assert.match((await impossible.json()).error, /not recognized/i);
  assert.equal(rooms.get(code).current, 'dots');
});

test('the first player to the target wins the round and the next round rotates first turn', async () => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body = {}) => {
    const response = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const created = await post('/api/rooms', null, { name: 'Nia' });
  const code = created.body.state.code;
  const hostToken = created.body.token;
  const joined = await post(`/api/rooms/${code}/join`, null, { name: 'Maya' });
  const guestToken = joined.body.token;
  await post(`/api/rooms/${code}/ready`, guestToken, { ready: true, version: joined.body.state.version });
  let response = await post(`/api/rooms/${code}/start`, hostToken, { version: rooms.get(code).version });
  let gameState = response.body;
  for (const [playerToken, word] of [[hostToken, 'dots'], [guestToken, 'cots'], [hostToken, 'cats']]) {
    response = await post(`/api/rooms/${code}/move`, playerToken, { word, version: gameState.version });
    assert.equal(response.status, 200);
    gameState = response.body;
  }
  assert.equal(gameState.phase, 'roundResults');
  assert.equal(gameState.current, 'cats');
  assert.equal(gameState.roundWinnerId, gameState.you.id);
  assert.equal(gameState.players.find(p => p.id === gameState.you.id).score, 500);
  response = await post(`/api/rooms/${code}/next`, hostToken, { version: gameState.version });
  assert.equal(response.status, 200);
  assert.equal(response.body.round, 2);
  assert.equal(response.body.start, 'cold');
  assert.notEqual(response.body.activePlayerId, response.body.you.id);
});

test.after(async () => { await new Promise(resolve => server.close(resolve)); });

test('computer opponent takes a legal server-controlled turn', async () => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body = {}) => { const response = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  const created = await post('/api/rooms', null, { name: 'Solo', mode: 'computer', botDifficulty: 'Quick Thinker' });
  const { code } = created.body.state; const token = created.body.token;
  assert.equal(created.body.state.players.length, 2);
  const start = await post(`/api/rooms/${code}/start`, token, { version: rooms.get(code).version });
  assert.equal(start.status, 200);
  const humanMove = await post(`/api/rooms/${code}/move`, token, { word: 'dots', version: start.body.version });
  assert.equal(humanMove.status, 200);
  const before = rooms.get(code).current;
  const until = Date.now() + 2500;
  while (Date.now() < until && rooms.get(code).current === before) await new Promise(resolve => setTimeout(resolve, 50));
  const room = rooms.get(code);
  assert.notEqual(room.current, before);
  assert.equal(room.moves.at(-1).playerName, 'Quick Thinker');
  assert.equal(gameChanged(room.moves.at(-1).word, before), 1);
  assert.ok(room.used.has(room.current));
});

function gameChanged(from, to) { let count = 0; for (let i = 0; i < from.length; i++) if (from[i] !== to[i]) count++; return count; }


test('head-to-head ends when a player wins three rounds', async () => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body = {}) => { const response = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  const created = await post('/api/rooms', null, { name: 'Nia', mode: 'headToHead' });
  const { code } = created.body.state; const hostToken = created.body.token; const hostId = created.body.state.you.id;
  const joined = await post(`/api/rooms/${code}/join`, null, { name: 'Maya' }); const guestToken = joined.body.token; const guestId = joined.body.state.you.id;
  await post(`/api/rooms/${code}/ready`, guestToken, { ready: true, version: joined.body.state.version });
  let current = (await post(`/api/rooms/${code}/start`, hostToken, { version: rooms.get(code).version })).body;
  const paths = [
    ['dogs', 'dots', 'cots', 'cats'],
    ['cold', 'cord', 'word', 'ward', 'warm'],
    ['head', 'heal', 'teal', 'tell', 'tall', 'tail'],
  ];
  for (let roundIndex = 0; roundIndex < paths.length; roundIndex++) {
    const path = paths[roundIndex];
    assert.equal(current.start, path[0]);
    for (const word of path.slice(1)) {
      const activeToken = current.activePlayerId === hostId ? hostToken : guestToken;
      const moved = await post(`/api/rooms/${code}/move`, activeToken, { word, version: current.version });
      assert.equal(moved.status, 200);
      current = moved.body;
    }
    if (roundIndex < paths.length - 1) current = (await post(`/api/rooms/${code}/next`, hostToken, { version: current.version })).body;
  }
  assert.equal(current.phase, 'complete');
  assert.equal(current.players.find(player => player.id === current.championId).name, 'Nia');
  assert.equal(current.round, 3);
});

test('Party Chaos uses seven rounds and announces each modifier', async () => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body = {}) => { const response = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  const created = await post('/api/rooms', null, { name: 'Nia', mode: 'party' });
  const { code } = created.body.state; const hostToken = created.body.token;
  const joined = await post(`/api/rooms/${code}/join`, null, { name: 'Maya' }); const guestToken = joined.body.token;
  await post(`/api/rooms/${code}/ready`, guestToken, { ready: true, version: joined.body.state.version });
  let current = (await post(`/api/rooms/${code}/start`, hostToken, { version: rooms.get(code).version })).body;
  assert.equal(current.rounds, 7);
  assert.equal(current.modifier, 'Lightning Round');
  assert.equal(current.timerSeconds, 15);
  current = (await post(`/api/rooms/${code}/move`, hostToken, { word: 'dots', version: current.version })).body;
  current = (await post(`/api/rooms/${code}/move`, guestToken, { word: 'cots', version: current.version })).body;
  current = (await post(`/api/rooms/${code}/move`, hostToken, { word: 'cats', version: current.version })).body;
  current = (await post(`/api/rooms/${code}/next`, hostToken, { version: current.version })).body;
  assert.equal(current.round, 2);
  assert.equal(current.modifier, 'Memory Round');
  assert.equal(current.timerSeconds, 25);
});

test('Team Battle seats Blue–Red–Blue–Red and assigns round contributions', async () => {
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body = {}) => { const response = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
  const created = await post('/api/rooms', null, { name: 'Blue One', mode: 'teams' });
  const { code } = created.body.state; const hostToken = created.body.token;
  const tokens = [hostToken];
  let currentLobby = created.body.state;
  for (const name of ['Red One', 'Blue Two', 'Red Two']) {
    const joined = await post(`/api/rooms/${code}/join`, null, { name });
    tokens.push(joined.body.token);
    currentLobby = await (await post(`/api/rooms/${code}/ready`, joined.body.token, { ready: true, version: joined.body.state.version })).body;
  }
  assert.deepEqual(currentLobby.players.map(player => player.team), ['blue', 'red', 'blue', 'red']);
  let current = (await post(`/api/rooms/${code}/start`, hostToken, { version: rooms.get(code).version })).body;
  current = (await post(`/api/rooms/${code}/move`, tokens[0], { word: 'dots', version: current.version })).body;
  current = (await post(`/api/rooms/${code}/move`, tokens[1], { word: 'cots', version: current.version })).body;
  assert.equal(current.players.find(player => player.id === current.activePlayerId).name, 'Blue Two');
  assert.equal(current.players.find(player => player.id === current.activePlayerId).team, 'blue');
  current = (await post(`/api/rooms/${code}/move`, tokens[2], { word: 'cats', version: current.version })).body;
  assert.equal(current.phase, 'roundResults');
  assert.equal(current.teamWins.blue, 1);
  assert.equal(current.players.find(player => player.id === current.roundWinnerId).name, 'Blue Two');
});

test('mode keys and malformed JSON bodies cannot corrupt rooms', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const mode of ['constructor', '__proto__', 'toString']) {
    const response = await fetch(base + '/api/rooms', { method: 'POST', body: JSON.stringify({ mode }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).state.mode, 'classic');
  }
  for (const body of ['null', '[]', '42']) {
    const response = await fetch(base + '/api/rooms', { method: 'POST', body });
    assert.equal(response.status, 400);
  }
});

test('slow concurrent joins cannot exceed capacity or join after start', async () => {
  const http = require('node:http');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body) => {
    const response = await fetch(base + url, { method: 'POST', headers: token ? { 'x-player-token': token } : {}, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const slowJoin = code => {
    let request;
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const response = new Promise((resolve, reject) => {
      request = http.request(base + `/api/rooms/${code}/join`, { method: 'POST' }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      request.on('error', reject);
      request.write('{"name":', started);
    });
    return { ready, response, finish: () => request.end('"Slow"}') };
  };
  const created = await post('/api/rooms', null, { mode: 'headToHead' });
  const code = created.body.state.code;
  const slow = slowJoin(code);
  await slow.ready;
  const joined = await post(`/api/rooms/${code}/join`, null, { name: 'Fast' });
  assert.equal(joined.status, 201);
  slow.finish();
  assert.equal(await slow.response, 409);
  assert.equal(rooms.get(code).players.length, 2);

  const other = await post('/api/rooms', null, { mode: 'classic' });
  const otherCode = other.body.state.code;
  const guest = await post(`/api/rooms/${otherCode}/join`, null, { name: 'Guest' });
  await post(`/api/rooms/${otherCode}/ready`, guest.body.token, { ready: true });
  const late = slowJoin(otherCode);
  await late.ready;
  assert.equal((await post(`/api/rooms/${otherCode}/start`, other.body.token, {})).status, 200);
  late.finish();
  assert.equal(await late.response, 409);
});

test('moves require a current version and restart clears the champion', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, token, body) => {
    const response = await fetch(base + url, { method: 'POST', headers: token ? { 'x-player-token': token } : {}, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const created = await post('/api/rooms', null, { mode: 'computer' });
  const code = created.body.state.code, token = created.body.token;
  await post(`/api/rooms/${code}/start`, token, {});
  const before = rooms.get(code).version;
  const missing = await post(`/api/rooms/${code}/move`, token, { word: 'dots' });
  assert.equal(missing.status, 409);
  assert.equal(missing.body.state.version, before);
  assert.equal(rooms.get(code).current, 'dogs');
  assert.equal(rooms.get(code).version, before);
  const room = rooms.get(code);
  room.phase = 'complete'; room.championId = room.players[0].id;
  const restarted = await post(`/api/rooms/${code}/restart`, token, { version: before });
  assert.equal(restarted.status, 200);
  assert.equal(restarted.body.championId, null);
});

test('offline QR assets and safe local-network address discovery are available', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/join-code.js', '/vendor/qrcodegen.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.ok((await response.text()).length > 100);
  }
  const response = await fetch(base + '/api/join-origins', { headers: { Host: 'attacker.invalid' } });
  assert.equal(response.status, 200);
  const { origins } = await response.json();
  for (const origin of origins) {
    const url = new URL(origin);
    assert.equal(url.protocol, 'http:');
    assert.match(url.hostname, /^\d+\.\d+\.\d+\.\d+$/);
    assert.equal(url.port, String(server.address().port));
    assert.notEqual(url.hostname, '127.0.0.1');
  }
});

test('TV HTTP session restores without a player seat and a phone captain starts the game',async()=>{
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,token,body={})=>{const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-player-token':token}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const tv=await post('/api/rooms',null,{displayOnly:true,mode:'computer'}),code=tv.body.state.code;
 assert.equal(tv.body.state.players.length,1);assert.equal(tv.body.state.you.isDisplay,true);
 const phone=await post(`/api/rooms/${code}/join`,null,{name:'Phone Player'});
 assert.equal(phone.body.state.players[0].name,'Phone Player');assert.equal(phone.body.state.you.canControl,true);
 await post(`/api/rooms/${code}/ready`,phone.body.token,{ready:true,version:rooms.get(code).version});
 assert.equal((await post(`/api/rooms/${code}/start`,phone.body.token,{version:rooms.get(code).version})).status,200);
 const restored=await (await fetch(base+`/api/rooms/${code}`,{headers:{'x-player-token':tv.body.token}})).json();
 assert.equal(restored.you.isDisplay,true);assert.equal(restored.players.some(p=>p.id===restored.you.id),false);
 assert.equal((await post(`/api/rooms/${code}/move`,tv.body.token,{word:'dots',version:rooms.get(code).version})).status,403);
 assert.equal((await post(`/api/rooms/${code}/end`,tv.body.token,{version:rooms.get(code).version})).status,200);
});

test('HTTP pause, captain transfer, offline removal and leave preserve the shared match safely',async()=>{
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,token,body={})=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-player-token':token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const tv=await post('/api/rooms',null,{displayOnly:true}),code=tv.body.state.code,phones=[];
 for(const name of ['Alpha','Bravo','Charlie']){const p=await post(`/api/rooms/${code}/join`,null,{name});phones.push(p.body);await post(`/api/rooms/${code}/ready`,p.body.token,{ready:true,version:rooms.get(code).version});}
 const [a,b,c]=phones,abort=new AbortController();
 try{
  const stream=await fetch(base+`/api/events?room=${code}&token=${b.token}`,{signal:abort.signal});assert.equal(stream.status,200);
  assert.equal((await post(`/api/rooms/${code}/start`,a.token,{version:rooms.get(code).version})).status,200);
  await post(`/api/rooms/${code}/move`,a.token,{word:'dots',version:rooms.get(code).version});
  const paused=await post(`/api/rooms/${code}/pause`,tv.body.token);assert.equal(paused.body.phase,'paused');assert.equal(paused.body.turnDeadline,null);
  assert.equal((await post(`/api/rooms/${code}/captain`,tv.body.token,{playerId:b.state.you.id,version:rooms.get(code).version})).status,200);
  const removed=await post(`/api/rooms/${code}/remove`,tv.body.token,{playerId:c.state.you.id,version:rooms.get(code).version});assert.equal(removed.status,200);assert.equal(removed.body.players.length,2);
  assert.equal((await post(`/api/rooms/${code}/leave`,b.token)).status,200);assert.equal(rooms.get(code).phase,'ended');
  assert.equal((await fetch(base+`/api/rooms/${code}`,{headers:{'x-player-token':c.token}})).status,404);
  assert.equal(removed.body.summary.find(p=>p.name==='Alpha').valid,1);
 }finally{abort.abort();}
});

test('HTTP custom/daily/quick/category settings and private hint/vote endpoints share the rules',async()=>{
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,token,body={})=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-player-token':token}:{})},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
 assert.equal((await fetch(base+'/fun-client.js')).status,200);
 const before=rooms.size,invalid=await post('/api/rooms',null,{puzzleSource:'custom',customStart:'cat',customTarget:'dogs'});assert.equal(invalid.status,400);assert.equal(rooms.size,before);
 const created=await post('/api/rooms',null,{displayOnly:true,category:'animals',puzzlePack:'beginner',matchFormat:'quick'}),code=created.body.state.code;
 const phones=[];for(const name of ['Alpha','Bravo']){const p=await post(`/api/rooms/${code}/join`,null,{name});phones.push(p.body);await post(`/api/rooms/${code}/ready`,p.body.token,{ready:true,version:rooms.get(code).version});}
 await post(`/api/rooms/${code}/start`,created.body.token,{version:rooms.get(code).version});assert.equal(rooms.get(code).rounds,3);assert.equal(rooms.get(code).current.length,3);assert.equal(rooms.get(code).puzzle.timerSeconds,25);
 const hint=await post(`/api/rooms/${code}/hint`,phones[0].token,{hintType:'word',version:rooms.get(code).version});assert.equal(hint.status,200);assert.equal(hint.body.you.hintsRemaining,1);assert.ok(hint.body.you.hint.word);
 const other=await (await fetch(base+`/api/rooms/${code}`,{headers:{'x-player-token':phones[1].token}})).json();assert.equal(other.you.hint,null);assert.equal((await post(`/api/rooms/${code}/vote`,phones[1].token,{category:'food',pack:'expert',version:rooms.get(code).version})).status,409);
 const daily=await post('/api/rooms',null,{mode:'daily',displayOnly:true});assert.equal(daily.status,201);assert.equal(daily.body.state.dailyDate,new Date().toISOString().slice(0,10));assert.equal(daily.body.state.maxPlayers,1);
});
