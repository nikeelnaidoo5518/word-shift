'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const engine = require('./game-engine');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const rooms = new Map();
const streams = new Map();
const rateBuckets = new Map();
const MAX_BODY = 2048;
const ALLOWED_AVATARS = new Set(['🦊', '🐸', '🐯', '🐼', '🦁', '🐨', '🐙', '🐧', '🐻', '🐰', '🐵', '🦄']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MODES = {
  classic: { name: 'Classic Multiplayer', min: 2, max: 4, rounds: 5 },
  headToHead: { name: 'Head-to-Head', min: 2, max: 2, rounds: 5, wins: 3 },
  computer: { name: 'Player vs Computer', min: 1, max: 1, rounds: 5, wins: 3 },
  teams: { name: 'Team Battle', min: 4, max: 4, rounds: 7, wins: 4 },
  party: { name: 'Party Chaos', min: 2, max: 4, rounds: 7 },
};

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
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try {
        const body = raw ? JSON.parse(raw) : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected an object');
        resolve(body);
      }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function getToken(req, url) { return req.headers['x-player-token'] || url.searchParams.get('token') || ''; }
function requirePlayer(room, token) {
  if (!room || !token) return null;
  return room.players.find(player => player.token === token) || null;
}
function activePlayer(room) { return room.players[room.activeIndex] || null; }
function publicState(room, player) {
  const active = activePlayer(room);
  const countdown = room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000)) : 0;
  return {
    code: room.code,
    mode: room.mode,
    modeName: MODES[room.mode].name,
    minPlayers: MODES[room.mode].min,
    maxPlayers: MODES[room.mode].max + (room.mode === 'computer' ? 1 : 0),
    phase: room.phase,
    hostId: room.hostId,
    round: room.round,
    rounds: room.rounds,
    roundName: room.puzzle?.roundName || null,
    modifier: room.puzzle?.modifier || null,
    difficulty: room.puzzle?.difficulty || null,
    timerSeconds: room.puzzle?.timerSeconds || null,
    start: room.puzzle?.start || null,
    target: room.puzzle?.target || null,
    current: room.current || null,
    history: room.history,
    moves: room.moves,
    activePlayerId: active?.id || null,
    activePlayerName: active?.name || null,
    secondsLeft: countdown,
    lastMessage: room.lastMessage,
    roundWinnerId: room.roundWinnerId,
    championId: room.championId,
    championIds: room.championIds || [],
    championTeam: room.championTeam || null,
    teamWins: room.teamWins,
    unresolved: room.unresolved,
    resets: room.resets,
    version: room.version,
    you: player ? { id: player.id, name: player.name, avatar: player.avatar, isHost: player.id === room.hostId, isActive: player.id === active?.id, ready: player.ready } : null,
    players: room.players.map(({ id, name, avatar, score, ready, roundWins, isBot }) => ({ id, name, avatar, score, ready, roundWins, isBot: Boolean(isBot), team: room.mode === 'teams' ? (room.players.findIndex(p => p.id === id) % 2 ? 'red' : 'blue') : null })),
  };
}
function broadcast(room) {
  const clients = streams.get(room.code);
  if (!clients) return;
  for (const client of clients) {
    if (client.destroyed) { clients.delete(client); continue; }
    client.write(`event: state\ndata: ${JSON.stringify(publicState(room, client.player))}\n\n`);
  }
}
function touch(room) { room.updatedAt = Date.now(); room.version++; broadcast(room); if (room.phase === 'playing') scheduleAI(room); }
function resetTurn(room) { room.activeIndex = (room.activeIndex + 1) % room.players.length; room.turnDeadline = Date.now() + room.puzzle.timerSeconds * 1000; }
function startRound(room) {
  room.puzzle = engine.puzzleForRound(room.round - 1);
  if (room.mode === 'party') {
    room.puzzle.roundName = room.puzzle.modifier;
    room.puzzle.timerSeconds = [15, 25, 25, 15, 15, 20, 15][room.round - 1];
  }
  room.current = room.puzzle.start;
  room.history = [room.current];
  room.used = new Set(room.history);
  room.moves = [];
  room.resets = 0;
  room.unresolved = false;
  room.roundWinnerId = null;
  room.phase = 'playing';
  room.activeIndex = (room.round - 1 + room.players.length) % room.players.length;
  room.turnDeadline = Date.now() + room.puzzle.timerSeconds * 1000;
  room.lastMessage = `${room.puzzle.roundName} begins. ${room.players[room.activeIndex].name}, you’re first.`;
  touch(room);
}
function endRound(room, winnerId = null, unresolved = false) {
  room.phase = 'roundResults';
  room.turnDeadline = null;
  room.roundWinnerId = winnerId;
  room.unresolved = unresolved;
  if (winnerId) {
    const winner = room.players.find(player => player.id === winnerId);
    if (['headToHead', 'computer'].includes(room.mode) && winner) winner.roundWins++;
    if (room.mode === 'teams' && winner) room.teamWins[winner.team]++;
  }
  const modeWin = ['headToHead', 'computer'].includes(room.mode) && room.players.some(player => player.roundWins >= MODES[room.mode].wins);
  const teamWin = room.mode === 'teams' && (Math.max(room.teamWins.blue, room.teamWins.red) >= MODES.teams.wins || room.round >= room.rounds);
  if (room.round >= room.rounds || modeWin || teamWin) {
    room.phase = 'complete';
    if (teamWin) {
      const blueScore = room.players.filter(player => player.team === 'blue').reduce((sum, player) => sum + player.score, 0);
      const redScore = room.players.filter(player => player.team === 'red').reduce((sum, player) => sum + player.score, 0);
      room.championTeam = room.teamWins.blue === room.teamWins.red ? (blueScore === redScore ? 'both' : blueScore > redScore ? 'blue' : 'red') : room.teamWins.blue > room.teamWins.red ? 'blue' : 'red';
      room.championIds = room.players.filter(player => room.championTeam === 'both' || player.team === room.championTeam).map(player => player.id);
      room.championId = room.championIds[0] || null;
    } else if (['headToHead', 'computer'].includes(room.mode)) {
      const highWins = Math.max(...room.players.map(player => player.roundWins));
      const leaders = room.players.filter(player => player.roundWins === highWins);
      const highScore = Math.max(...leaders.map(player => player.score));
      room.championIds = leaders.filter(player => player.score === highScore).map(player => player.id);
      room.championId = room.championIds[0] || null;
    } else {
      const sorted = [...room.players].sort((a, b) => b.score - a.score);
      const highScore = sorted[0]?.score ?? 0;
      room.championIds = sorted.filter(player => player.score === highScore).map(player => player.id);
      room.championId = room.championIds[0] || null;
    }
  }
  room.lastMessage = unresolved ? 'This ladder could not be completed. The match moves on.' : winnerId ? `${room.players.find(p => p.id === winnerId)?.name} reached the target!` : 'Round complete.';
  touch(room);
}
function nextRound(room) {
  if (room.phase !== 'roundResults') return false;
  if (room.round >= room.rounds) return false;
  room.round++;
  startRound(room);
  return true;
}
function applyTimeout(room) {
  if (room.phase !== 'playing') return;
  const player = activePlayer(room);
  room.moves.push({ playerId: player.id, playerName: player.name, word: null, valid: false, reason: 'TIME’S UP!', at: Date.now() });
  room.lastMessage = `TIME’S UP! ${player.name} loses the turn.`;
  resetTurn(room);
  touch(room);
}
function acceptMove(room, player, word) {
  const previous = room.current;
  const oldMatches = engine.targetMatches(previous, room.puzzle.target);
  room.current = word;
  room.used.add(word);
  room.history.push(word);
  const newMatches = engine.targetMatches(word, room.puzzle.target);
  const finale = room.round === room.rounds;
  const points = (100 + (newMatches > oldMatches ? 25 : 0) + (word === room.puzzle.target ? 250 : 0)) * (finale ? 2 : 1);
  player.score += points;
  room.moves.push({ playerId: player.id, playerName: player.name, word, valid: true, points, at: Date.now() });
  if (word === room.puzzle.target) {
    room.lastMessage = `${player.name} reached ${room.puzzle.target}! +${points} points.`;
    endRound(room, player.id);
    return;
  }
  const possible = engine.shortestPath(room.current, room.puzzle.target, room.used);
  if (!possible) {
    room.resets++;
    if (room.resets > 2) {
      endRound(room, null, true);
      return;
    }
    room.current = room.puzzle.start;
    room.history = [room.current];
    room.used = new Set(room.history);
    room.moves.push({ playerId: player.id, playerName: player.name, word: null, valid: false, reason: 'DEAD END · LADDER RESET', at: Date.now() });
    room.activeIndex = (room.activeIndex + 1) % room.players.length;
    room.turnDeadline = Date.now() + room.puzzle.timerSeconds * 1000;
    room.lastMessage = `Dead end. The ladder has reset; scores stay with you. ${room.players[room.activeIndex].name} starts.`;
    touch(room);
    return;
  }
  room.lastMessage = `${player.name} shifted to ${word}. +${points} points.`;
  resetTurn(room);
  touch(room);
}

function scheduleAI(room) {
  const player = activePlayer(room);
  if (room.phase !== 'playing' || !player?.isBot || room.aiTimer) return;
  const expectedVersion = room.version;
  const delay = engine.BOT_DELAY_MS[player.difficulty] || engine.BOT_DELAY_MS['Quick Thinker'];
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    if (!rooms.has(room.code) || room.phase !== 'playing' || room.version !== expectedVersion || activePlayer(room)?.id !== player.id) return;
    const nextWord = engine.chooseAIMove(room.current, room.puzzle.target, room.used, player.difficulty);
    if (nextWord) acceptMove(room, player, nextWord);
    else applyTimeout(room);
  }, delay);
  room.aiTimer.unref();
}

function serveStatic(req, res, pathname) {
  const route = pathname === '/' ? '/index.html' : pathname;
  if (!new Set(['/index.html', '/client.js', '/tv.js', '/join-code.js', '/vendor/qrcodegen.js', '/data/words-en.json']).has(route)) return error(res, 404, 'Not found');
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
    if (req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'local';
      const now = Date.now();
      const bucket = rateBuckets.get(ip) || { started: now, count: 0 };
      if (now - bucket.started > 60_000) { bucket.started = now; bucket.count = 0; }
      bucket.count++;
      rateBuckets.set(ip, bucket);
      if (bucket.count > 120) return error(res, 429, 'Too many requests. Please wait a minute and try again.');
    }
    if (req.method === 'POST' && p === '/api/rooms') {
      const body = await readBody(req);
      const mode = Object.hasOwn(MODES, body.mode) ? body.mode : 'classic';
      const config = MODES[mode];
      const botDifficulty = Object.hasOwn(engine.BOT_DELAY_MS, body.botDifficulty) ? body.botDifficulty : 'Quick Thinker';
      const name = cleanName(body.name) || 'Host';
      const player = { id: randomToken(8), token: randomToken(), name, avatar: ALLOWED_AVATARS.has(body.avatar) ? body.avatar : '🦊', score: 0, ready: true, roundWins: 0, team: mode === 'teams' ? 'blue' : null };
      const players = [player];
      if (mode === 'computer') players.push({ id: randomToken(8), token: null, name: botDifficulty, avatar: '🧠', score: 0, ready: true, roundWins: 0, isBot: true, difficulty: botDifficulty });
      const code = roomCode();
      const room = { code, mode, players, hostId: player.id, phase: 'lobby', round: 0, rounds: config.rounds, version: 1, history: [], moves: [], used: new Set(), activeIndex: 0, turnDeadline: null, createdAt: Date.now(), updatedAt: Date.now(), lastMessage: 'Room created. Share the code to invite players.', puzzle: null, resets: 0, unresolved: false, roundWinnerId: null, championId: null, championIds: [], championTeam: null, teamWins: { blue: 0, red: 0 } };
      rooms.set(code, room);
      return send(res, 201, { state: publicState(room, player), token: player.token, joinUrl: `/?join=${code}` });
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
      room.players.push(player);
      room.lastMessage = `${name} joined the room.`;
      touch(room);
      return send(res, 201, { state: publicState(room, player), token: player.token });
    }
    const roomMatch = p.match(/^\/api\/rooms\/([A-Z2-9]+)(?:\/(ready|start|move|next|restart))?$/);
    if (req.method === 'GET' && roomMatch && !roomMatch[2]) {
      const room = rooms.get(roomMatch[1]);
      const player = requirePlayer(room, getToken(req, url));
      if (!player) return error(res, 404, 'Room or player session not found.');
      return send(res, 200, publicState(room, player));
    }
    if (req.method === 'GET' && p === '/api/events') {
      const room = rooms.get(url.searchParams.get('room'));
      const player = requirePlayer(room, getToken(req, url));
      if (!player) return error(res, 404, 'Room or player session not found.');
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: state\ndata: ${JSON.stringify(publicState(room, player))}\n\n`);
      if (!streams.has(room.code)) streams.set(room.code, new Set());
      streams.get(room.code).add(Object.assign(res, { player }));
      req.on('close', () => {
        streams.get(room.code)?.delete(res);
        if (player.id === room.hostId) setTimeout(() => {
          const connected = [...(streams.get(room.code) || [])];
          if (rooms.has(room.code) && !connected.some(client => client.player.id === room.hostId) && connected.length) {
            const successor = connected[0].player;
            room.hostId = successor.id;
            room.lastMessage = `${successor.name} is now hosting the room.`;
            touch(room);
          }
        }, 15_000).unref();
      });
      return;
    }
    if (req.method === 'POST' && roomMatch && roomMatch[2]) {
      const room = rooms.get(roomMatch[1]);
      const player = requirePlayer(room, getToken(req, url));
      if (!player) return error(res, 404, 'Room or player session not found.');
      const action = roomMatch[2];
      const body = await readBody(req);
      if ((action === 'move' || body.version !== undefined) && body.version !== room.version) {
        return send(res, 409, { error: 'The game changed. Your screen has been updated; try again.', state: publicState(room, player) });
      }
      if (action === 'ready') {
        if (room.phase !== 'lobby') return error(res, 409, 'The lobby is already closed.');
        player.ready = Boolean(body.ready);
        room.lastMessage = `${player.name} is ${player.ready ? 'ready' : 'not ready'}.`;
        touch(room);
        return send(res, 200, publicState(room, player));
      }
      if (action === 'start') {
        if (player.id !== room.hostId) return error(res, 403, 'Only the host can start the match.');
        if (room.phase !== 'lobby') return error(res, 409, 'The match has already started.');
        const humanCount = room.players.filter(p => !p.isBot).length;
        if (humanCount < MODES[room.mode].min || humanCount > MODES[room.mode].max) return error(res, 409, `This mode needs ${MODES[room.mode].min}${MODES[room.mode].max === MODES[room.mode].min ? '' : `–${MODES[room.mode].max}`} human players.`);
        if (!room.players.every(p => p.ready)) return error(res, 409, 'Everyone must be ready before the match starts.');
        room.round = 1;
        room.players.forEach(p => { p.score = 0; p.roundWins = 0; });
        room.teamWins = { blue: 0, red: 0 };
        startRound(room);
        return send(res, 200, publicState(room, player));
      }
      if (action === 'move') {
        if (room.phase !== 'playing') return error(res, 409, 'This round is not accepting moves.');
        if (player.id !== activePlayer(room)?.id) return error(res, 403, 'It is not your turn.');
        if (Date.now() >= room.turnDeadline) { applyTimeout(room); return error(res, 409, 'TIME’S UP! Your turn passed.'); }
        const word = String(body.word || '').trim().toLowerCase();
        let reason = null;
        if (word.length !== room.current.length) reason = 'Keep the word the same length.';
        else if (engine.changedPositions(room.current, word) !== 1) reason = 'Only change ONE letter!';
        else if (!engine.dictionary.has(word)) reason = 'Word not recognized!';
        else if (room.used.has(word)) reason = 'That word has already been used!';
        if (reason) {
          room.moves.push({ playerId: player.id, playerName: player.name, word, valid: false, reason, at: Date.now() });
          room.lastMessage = reason;
          resetTurn(room);
          touch(room);
          return send(res, 422, { error: reason, state: publicState(room, player) });
        }
        acceptMove(room, player, word);
        return send(res, 200, publicState(room, player));
      }
      if (action === 'next') {
        if (player.id !== room.hostId) return error(res, 403, 'Only the host can continue.');
        if (!nextRound(room)) return error(res, 409, 'There is no next round.');
        return send(res, 200, publicState(room, player));
      }
      if (action === 'restart') {
        if (player.id !== room.hostId) return error(res, 403, 'Only the host can start a new match.');
        if (room.phase !== 'complete') return error(res, 409, 'Finish the current match first.');
        room.players.forEach(p => { p.score = 0; p.roundWins = 0; });
        room.teamWins = { blue: 0, red: 0 };
        room.championIds = [];
        room.championId = null;
        room.championTeam = null;
        room.round = 1;
        startRound(room);
        return send(res, 200, publicState(room, player));
      }
    }
    if (req.method === 'GET') return serveStatic(req, res, p);
    return error(res, 404, 'Not found');
  } catch (err) {
    return error(res, err.status || 500, err.status ? err.message : 'The game server hit an unexpected error.');
  }
});

server.listen(PORT, HOST, () => {
  let lan = [];
  try { lan = Object.values(os.networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => `http://${x.address}:${PORT}`); }
  catch { /* Some restricted hosts do not expose network interfaces. */ }
  console.log(`WORD SHIFT listening at http://localhost:${PORT}`);
  if (lan.length) console.log(`Same-Wi‑Fi phone address: ${lan[0]}`);
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_TTL_MS) { rooms.delete(code); streams.get(code)?.forEach(res => res.end()); streams.delete(code); continue; }
    if (room.phase === 'playing' && room.turnDeadline <= now) applyTimeout(room);
  }
}, 250).unref();

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) if (now - bucket.started > 120_000) rateBuckets.delete(ip);
  for (const clients of streams.values()) for (const client of clients) if (!client.destroyed) client.write(': keepalive\n\n');
}, 15_000).unref();

module.exports = { server, rooms, startRound, publicState };
