'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const engine = require('./game-engine');
const policy = require('./server-policy');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const LIMITS = Object.freeze({ rooms: 200, sockets: 1200, streams: 800, streamsPerRoom: 12, streamsPerPlayer: 2, moves: 100, rateBuckets: 5000, bodyTimeoutMs: 5000 });
const TRUSTED_PROXIES = policy.trustedAddresses(process.env.TRUST_PROXY_ADDRESSES);
const PUBLIC_ORIGIN = policy.configuredOrigin();
const rooms = new Map();
const streams = new Map();
const rateBuckets = new Map();
const MAX_BODY = 2048;
const ALLOWED_AVATARS = new Set(['🦊', '🐸', '🐯', '🐼', '🦁', '🐨', '🐙', '🐧', '🐻', '🐰', '🐵', '🦄']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';


function randomToken(bytes = 24) { return crypto.randomBytes(bytes).toString('base64url'); }
function roomCode() {
  let code;
  do { code = Array.from(crypto.randomBytes(5), b => CODE_CHARS[b % CODE_CHARS.length]).join(''); } while (rooms.has(code));
  return code;
}
function cleanName(value) {
  return String(value || '').normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 18);
}
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function error(res, status, message) { send(res, status, { error: message }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, settled = false;
    const timer = setTimeout(() => finish(Object.assign(new Error('Request body timed out'), { status: 408 })), LIMITS.bodyTimeoutMs);
    timer.unref();
    function finish(err, body) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAbort);
      if (err) { req.once('error', () => {}); req.resume(); reject(err); } else resolve(body);
    }
    function onData(chunk) {
      bytes += chunk.length;
      if (bytes > MAX_BODY) return finish(Object.assign(new Error('Request too large'), { status: 413 }));
      chunks.push(chunk);
    }
    function onEnd() {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected an object');
        finish(null, body);
      } catch { finish(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    }
    function onError(err) { finish(err); }
    function onAbort() { finish(Object.assign(new Error('Request aborted'), { status: 400 })); }
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAbort);
  });
}
function connected(room, id) {
  return [...(streams.get(room.code) || [])].some(client => !client.destroyed && client.player.id === id);
}
function logMove(room, move) {
  room.moves.push(move);
  if (room.moves.length > LIMITS.moves) room.moves.splice(0, room.moves.length - LIMITS.moves);
}
function writeEvent(client, event, data) {
  if (client.destroyed || client.writableEnded) return;
  if (client.writableLength > 256 * 1024) { client.destroy(); return; }
  client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function closeRoom(room, reason = 'This room expired after two hours without player activity.') {
  if (rooms.get(room.code) !== room) return;
  rooms.delete(room.code);
  clearTimeout(room.aiTimer);
  for (const client of streams.get(room.code) || []) { writeEvent(client, 'expired', { message: reason }); client.end(); }
  streams.delete(room.code);
}
function maintainRooms(now = Date.now()) {
  for (const room of rooms.values()) {
    if (now - room.lastActivityAt >= ROOM_TTL_MS) { closeRoom(room); continue; }
    if (!room.display && room.hostDisconnectedAt && now - room.hostDisconnectedAt >= 15_000 && !connected(room, room.hostId)) {
      const successor = room.players.find(player => !player.isBot && connected(room, player.id));
      if (successor) {
        room.hostId = successor.id; room.hostDisconnectedAt = null;
        room.lastMessage = `${successor.name} is now hosting the room.`; touch(room);
      }
    }
    if (room.phase === 'playing' && room.turnDeadline <= now) applyTimeout(room);
  }
}
function getToken(req, url) { return req.headers['x-player-token'] || url.searchParams.get('token') || ''; }
function requirePlayer(room, token) {
  if (!room || !token) return null;
  return room.players.find(player => player.token === token) || (room.display?.token === token ? room.display : null);
}
const { MODES, createRules } = require('./room-rules');
const rules = createRules(engine, { onChange: room => { broadcast(room); if(room.phase!=='playing'){clearTimeout(room.aiTimer);room.aiTimer=null;} else scheduleAI(room); }, isConnected: connected });
const { activePlayer, publicState, touch, startRound, endRound, nextRound, applyTimeout, acceptMove, resetTurn } = rules;

function broadcast(room) {
  const clients = streams.get(room.code);
  if (!clients) return;
  for (const client of clients) {
    if (client.destroyed) { clients.delete(client); continue; }
    writeEvent(client, 'state', publicState(room, client.player));
  }
}

function scheduleAI(room) {
  const player = activePlayer(room);
  if (room.phase !== 'playing' || !player?.isBot || room.aiTimer) return;
  const expectedDeadline = room.turnDeadline;
  const expectedRound = room.round;
  const delay = Math.max(0,room.turnDeadline-room.puzzle.timerSeconds*1000+(engine.BOT_DELAY_MS[player.difficulty] || engine.BOT_DELAY_MS['Quick Thinker'])-Date.now());
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    if (!rooms.has(room.code) || room.phase !== 'playing' || room.turnDeadline !== expectedDeadline || room.round !== expectedRound || activePlayer(room)?.id !== player.id) return;
    const nextWord = engine.chooseAIMove(room.current, room.puzzle.target, room.used, player.difficulty);
    if (nextWord) acceptMove(room, player, nextWord);
    else applyTimeout(room);
  }, delay);
  room.aiTimer.unref();
}

function serveStatic(req, res, pathname) {
  const route = pathname === '/' ? '/index.html' : pathname;
  if (!new Set(['/index.html', '/client.js', '/music.js', '/tv.js', '/join-code.js', '/vendor/qrcodegen.js', '/data/words-en.json']).has(route)) return error(res, 404, 'Not found');
  const file = path.resolve(ROOT, `.${route}`);
  if (!file.startsWith(ROOT + path.sep)) return error(res, 403, 'Forbidden');
  fs.readFile(file, (err, contents) => {
    if (err) return error(res, 404, 'Not found');
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'" });
    res.end(contents);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (req.method === 'GET' && p === '/api/join-origins') {
      // A loopback URL cannot be scanned by a phone. Never trust Host/Forwarded here.
      const remote = req.socket.remoteAddress;
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return error(res, 403, 'Open the game using its Wi-Fi address.');
      let interfaces = [];
      try { interfaces = Object.values(os.networkInterfaces()).flat(); } catch { /* Fall back to the printed address. */ }
      const origins = [...new Set(interfaces.filter(item => item && item.family === 'IPv4' && !item.internal).map(item => `http://${item.address}:${server.address().port}`))];
      return send(res, 200, { origins });
    }
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, rooms: rooms.size });
    if ((req.method === 'POST' || p === '/api/events') && !policy.allowedOrigin(req, PUBLIC_ORIGIN)) return error(res, 403, 'Open this game from its own server address.');
    if (req.method === 'POST') {
      const ip = policy.clientAddress(req, TRUSTED_PROXIES);
      if (!rateBuckets.has(ip) && rateBuckets.size >= LIMITS.rateBuckets) return error(res, 503, 'The server is busy. Please try again shortly.');
      const now = Date.now();
      const bucket = rateBuckets.get(ip) || { started: now, count: 0 };
      if (now - bucket.started > 60_000) { bucket.started = now; bucket.count = 0; }
      bucket.count++;
      rateBuckets.set(ip, bucket);
      if (bucket.count > 120) return error(res, 429, 'Too many requests. Please wait a minute and try again.');
    }
    if (req.method === 'POST' && p === '/api/rooms') {
      const body = await readBody(req);
      if (rooms.size >= LIMITS.rooms) { maintainRooms(); if (rooms.size >= LIMITS.rooms) return error(res, 503, 'The server has reached its room limit. Try again later.'); }
      const mode = Object.hasOwn(MODES, body.mode) ? body.mode : 'classic';
      const config = MODES[mode];
      const botDifficulty = Object.hasOwn(engine.BOT_DELAY_MS, body.botDifficulty) ? body.botDifficulty : 'Quick Thinker';
      const name = cleanName(body.name) || 'Host';
      const player = { id: randomToken(8), token: randomToken(), name, avatar: ALLOWED_AVATARS.has(body.avatar) ? body.avatar : '🦊', score: 0, ready: true, roundWins: 0, team: mode === 'teams' ? 'blue' : null };
      const players = [player];
      if (mode === 'computer') players.push({ id: randomToken(8), token: null, name: botDifficulty, avatar: '🧠', score: 0, ready: true, roundWins: 0, isBot: true, difficulty: botDifficulty });
      const code = roomCode();
      const room = { code, mode, players, puzzlePack:Object.hasOwn(engine.PUZZLE_PACKS,body.puzzlePack)?body.puzzlePack:'original',puzzleSeed:crypto.randomInt(1,2147483647), hostId: player.id, phase: 'lobby', round: 0, rounds: config.rounds, version: 1, history: [], moves: [], used: new Set(), activeIndex: 0, turnDeadline: null, createdAt: Date.now(), updatedAt: Date.now(), lastActivityAt: Date.now(), hostDisconnectedAt: null, lastMessage: 'Room created. Share the code to invite players.', puzzle: null, resets: 0, unresolved: false, roundWinnerId: null, championId: null, championIds: [], championTeam: null, teamWins: { blue: 0, red: 0 } };
      if (body.displayOnly === true) {room.display = {...player,name:'TV display',isDisplay:true};room.players = players.filter(p=>p.id!==player.id);}
      rooms.set(code, room);
      return send(res, 201, { state: publicState(room, room.display || player), token: player.token, joinUrl: `/?join=${code}` });
    }
    const joinMatch = p.match(/^\/api\/rooms\/([A-Z2-9]+)\/join$/);
    if (req.method === 'POST' && joinMatch) {
      const room = rooms.get(joinMatch[1]);
      if (!room) return error(res, 404, 'Room not found. Check the code and try again.');
      const body = await readBody(req);
      // Check mutable room state after the final await, immediately before joining.
      if (!rooms.has(room.code)) return error(res, 404, 'Room has expired.');
      if (room.phase !== 'lobby') return error(res, 409, 'This match has already started.');
      if (room.players.filter(player => !player.isBot).length >= MODES[room.mode].max) return error(res, 409, 'This room is full.');
      const name = cleanName(body.name);
      if (!name) return error(res, 400, 'Enter a nickname first.');
      if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return error(res, 409, 'That nickname is already in this room.');
      const player = { id: randomToken(8), token: randomToken(), name, avatar: ALLOWED_AVATARS.has(body.avatar) ? body.avatar : '🐸', score: 0, ready: false, roundWins: 0, team: room.mode === 'teams' ? (room.players.length % 2 ? 'red' : 'blue') : null };
      room.players.splice(room.players.filter(p=>!p.isBot).length,0,player);
      room.lastActivityAt = Date.now();
      room.lastMessage = `${name} joined the room.`;
      touch(room);
      return send(res, 201, { state: publicState(room, player), token: player.token });
    }
    const roomMatch = p.match(/^\/api\/rooms\/([A-Z2-9]+)(?:\/(ready|start|move|next|restart|end|pause|resume|leave|remove|captain))?$/);
    if (req.method === 'GET' && roomMatch && !roomMatch[2]) {
      const room = rooms.get(roomMatch[1]);
      const player = requirePlayer(room, getToken(req, url));
      if (!player) return error(res, 404, 'Room or player session not found.');
      room.lastActivityAt = Date.now();
      return send(res, 200, publicState(room, player));
    }
    if (req.method === 'GET' && p === '/api/events') {
      const room = rooms.get(url.searchParams.get('room'));
      const player = requirePlayer(room, getToken(req, url));
      if (!player) return error(res, 404, 'Room or player session not found.');
      const clients = streams.get(room.code) || new Set();
      const total = [...streams.values()].reduce((sum, clients) => sum + clients.size, 0);
      if (total >= LIMITS.streams || clients.size >= LIMITS.streamsPerRoom || [...clients].filter(client => client.player.id === player.id).length >= LIMITS.streamsPerPlayer) {
        res.setHeader('retry-after', '15');
        return error(res, 429, 'Too many open room connections. Close another tab and try again.');
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      clients.add(Object.assign(res, { player })); streams.set(room.code, clients);
      room.lastActivityAt = Date.now();
      if (player.id === room.hostId) room.hostDisconnectedAt = null;
      else if (!connected(room, room.hostId) && !room.hostDisconnectedAt) room.hostDisconnectedAt = Date.now();
      // Presence changes do not change the authoritative move version.
      broadcast(room);
      res.on('error', () => res.destroy());
      res.on('close', () => {
        clients.delete(res);
        if (!clients.size && streams.get(room.code) === clients) streams.delete(room.code);
        if (rooms.get(room.code) !== room) return;
        if (player.id === room.hostId && !connected(room, player.id)) room.hostDisconnectedAt = Date.now();
        broadcast(room);
      });
      return;
    }
    if (req.method === 'POST' && roomMatch && roomMatch[2]) {
      const room = rooms.get(roomMatch[1]);
      const player = requirePlayer(room, getToken(req, url));
      if (!player) return error(res, 404, 'Room or player session not found.');
      const action = roomMatch[2];
      const body = await readBody(req);
      if (rooms.get(room.code) !== room) return error(res, 404, 'Room has expired.');
      room.lastActivityAt = Date.now();
      const result = rules.action(room, player, action, body);
      return send(res, result.status, result.body);
    }
    if (req.method === 'GET') return serveStatic(req, res, p);
    return error(res, 404, 'Not found');
  } catch (err) {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) return res.destroy();
    if ([408, 413].includes(err.status)) res.setHeader('connection', 'close');
    return error(res, err.status || 500, err.status ? err.message : 'The game server hit an unexpected error.');
  }
});

server.maxConnections = LIMITS.sockets;
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5000;

server.listen(PORT, HOST, () => {
  let lan = [];
  try { lan = Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => `http://${x.address}:${PORT}`); }
  catch { /* Some restricted hosts do not expose network interfaces. */ }
  const actualPort = server.address().port;
  lan = lan.map(url => url.replace(/:\d+$/, `:${actualPort}`));
  console.log(`WORD SHIFT listening at http://localhost:${actualPort}`);
  if (lan.length) console.log(`Same-Wi‑Fi phone address: ${lan[0]}`);
});

setInterval(maintainRooms, 250).unref();

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) if (now - bucket.started > 120_000) rateBuckets.delete(ip);
  for (const clients of streams.values()) for (const client of clients) if (!client.destroyed) { if (client.writableLength > 256 * 1024) client.destroy(); else client.write(': keepalive\n\n'); }
}, 15_000).unref();

module.exports = { server, rooms, streams, startRound, publicState, maintainRooms, closeRoom, logMove, LIMITS, ROOM_TTL_MS };
