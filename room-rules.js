'use strict';

const MODES = {
  classic: { name: 'Classic Multiplayer', min: 2, max: 4, rounds: 5 },
  headToHead: { name: 'Head-to-Head', min: 2, max: 2, rounds: 5, wins: 3 },
  computer: { name: 'Player vs Computer', min: 1, max: 1, rounds: 5, wins: 3 },
  teams: { name: 'Team Battle', min: 4, max: 4, rounds: 7, wins: 4 },
  party: { name: 'Party Chaos', min: 2, max: 4, rounds: 7 },
};
function createRules(engine, { now = Date.now, onChange = () => {}, isConnected = () => false } = {}) {
function logMove(room, move) {
  room.moves.push(move);
  if (room.moves.length > 100) room.moves.splice(0, room.moves.length - 100);
}
function activePlayer(room) { return room.players[room.activeIndex] || null; }
function publicState(room, player) {
  const active = activePlayer(room);
  const countdown = room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - now()) / 1000)) : 0;
  return {
    code: room.code,
    mode: room.mode,
    modeName: MODES[room.mode].name,
    minPlayers: MODES[room.mode].min,
    maxPlayers: MODES[room.mode].max + (room.mode === 'computer' ? 1 : 0),
    phase: room.phase,
    hostId: room.hostId,
    displayOnly: Boolean(room.display),
    captainId: room.display ? room.players.find(p => !p.isBot)?.id || null : room.hostId,
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
    moveCounts: room.moveCounts || {},
    totalMoves: Object.values(room.moveCounts || {}).reduce((a, b) => a + b, 0),
    activePlayerId: active?.id || null,
    activePlayerName: active?.name || null,
    secondsLeft: countdown,
    turnDeadline: room.turnDeadline || null,
    lastMessage: room.lastMessage,
    roundWinnerId: room.roundWinnerId,
    championId: room.championId,
    championIds: room.championIds || [],
    championTeam: room.championTeam || null,
    teamWins: room.teamWins,
    unresolved: room.unresolved,
    resets: room.resets,
    version: room.version,
    you: player ? { id: player.id, name: player.name, avatar: player.avatar, isHost: player.id === room.hostId, isDisplay: Boolean(player.isDisplay), canControl: canControl(room, player), isActive: player.id === active?.id, ready: player.ready } : null,
    players: room.players.map(({ id, name, avatar, score, ready, roundWins, isBot }) => ({ id, name, avatar, score, ready, roundWins, isBot: Boolean(isBot), connected: Boolean(isBot) || isConnected(room, id), team: room.mode === 'teams' ? (room.players.findIndex(p => p.id === id) % 2 ? 'red' : 'blue') : null })),
  };
}
function canControl(room, player) { return Boolean(player && (player.id === room.hostId || (room.display && player.id === room.players.find(p => !p.isBot)?.id))); }
function touch(room) { room.updatedAt = now(); room.version++; onChange(room); }
function resetTurn(room) { room.activeIndex = (room.activeIndex + 1) % room.players.length; room.turnDeadline = now() + room.puzzle.timerSeconds * 1000; }
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
  room.moveCounts = {};
  room.resets = 0;
  room.unresolved = false;
  room.roundWinnerId = null;
  room.phase = 'playing';
  room.activeIndex = (room.round - 1 + room.players.length) % room.players.length;
  room.turnDeadline = now() + room.puzzle.timerSeconds * 1000;
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
  logMove(room, { playerId: player.id, playerName: player.name, word: null, valid: false, reason: 'TIME’S UP!', at: now() });
  room.lastMessage = `TIME’S UP! ${player.name} loses the turn.`;
  resetTurn(room);
  touch(room);
}
function acceptMove(room, player, word) {
  room.moveCounts ||= {};
  room.moveCounts[player.id] = (room.moveCounts[player.id] || 0) + 1;
  const previous = room.current;
  const oldMatches = engine.targetMatches(previous, room.puzzle.target);
  room.current = word;
  room.used.add(word);
  room.history.push(word);
  const newMatches = engine.targetMatches(word, room.puzzle.target);
  const finale = room.round === room.rounds;
  const points = (100 + (newMatches > oldMatches ? 25 : 0) + (word === room.puzzle.target ? 250 : 0)) * (finale ? 2 : 1);
  player.score += points;
  logMove(room, { playerId: player.id, playerName: player.name, word, valid: true, points, at: now() });
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
    logMove(room, { playerId: player.id, playerName: player.name, word: null, valid: false, reason: 'DEAD END · LADDER RESET', at: now() });
    room.activeIndex = (room.activeIndex + 1) % room.players.length;
    room.turnDeadline = now() + room.puzzle.timerSeconds * 1000;
    room.lastMessage = `Dead end. The ladder has reset; scores stay with you. ${room.players[room.activeIndex].name} starts.`;
    touch(room);
    return;
  }
  room.lastMessage = `${player.name} shifted to ${word}. +${points} points.`;
  resetTurn(room);
  touch(room);
}

function action(room, player, action, body = {}) {
  const fail = (status, error) => ({ status, body: { error, state: publicState(room, player) } });
  const success = () => ({ status: 200, body: publicState(room, player) });
  if (action !== 'end' && (action === 'move' || body.version !== undefined) && body.version !== room.version) return fail(409, 'The game changed. Your screen has been updated; try again.');
  if (action === 'ready') {
    if (player.isDisplay) return fail(403, 'The TV is a display, not a player.');
    if (room.phase !== 'lobby') return fail(409, 'The lobby is already closed.');
    player.ready = Boolean(body.ready); room.lastMessage = `${player.name} is ${player.ready ? 'ready' : 'not ready'}.`; touch(room); return success();
  }
  if (['start', 'next', 'restart', 'end'].includes(action) && !canControl(room, player)) return fail(403, 'Only the TV or phone captain can control the match.');
  if (action === 'end') {
    room.phase = 'ended'; room.turnDeadline = null; room.lastMessage = 'The host ended this match.'; touch(room); return success();
  }
  if (action === 'start') {
    if (room.phase !== 'lobby') return fail(409, 'The match has already started.');
    const count = room.players.filter(p => !p.isBot).length, mode = MODES[room.mode];
    if (count < mode.min || count > mode.max) return fail(409, `This mode needs ${mode.min}${mode.min === mode.max ? '' : `–${mode.max}`} human players.`);
    if (!room.players.every(p => p.ready)) return fail(409, 'Everyone must be ready before the match starts.');
    room.round = 1; room.players.forEach(p => { p.score = 0; p.roundWins = 0; }); room.teamWins = { blue: 0, red: 0 }; startRound(room); return success();
  }
  if (action === 'move') {
    if (room.phase !== 'playing') return fail(409, 'This round is not accepting moves.');
    if (player.id !== activePlayer(room)?.id) return fail(403, 'It is not your turn.');
    if (now() >= room.turnDeadline) { applyTimeout(room); return fail(409, 'TIME’S UP! Your turn passed.'); }
    const word = String(body.word || '').trim().toLowerCase();
    let reason = null;
    if (word.length !== room.current.length) reason = 'Keep the word the same length.';
    else if (engine.changedPositions(room.current, word) !== 1) reason = 'Only change ONE letter!';
    else if (!engine.dictionary.has(word)) reason = 'Word not recognized!';
    else if (room.used.has(word)) reason = 'That word has already been used!';
    if (reason) {
      logMove(room, { playerId: player.id, playerName: player.name, word, valid: false, reason, at: now() });
      room.lastMessage = reason; resetTurn(room); touch(room); return fail(422, reason);
    }
    acceptMove(room, player, word); return success();
  }
  if (action === 'next') { if (!nextRound(room)) return fail(409, 'There is no next round.'); return success(); }
  if (action === 'restart') {
    if (room.phase !== 'complete') return fail(409, 'Finish the current match first.');
    room.players.forEach(p => { p.score = 0; p.roundWins = 0; }); room.teamWins = { blue: 0, red: 0 };
    room.championIds = []; room.championId = null; room.championTeam = null; room.round = 1; startRound(room); return success();
  }
  return fail(404, 'Unknown game action.');
}
function makeRoom({code, mode = 'classic', hostId, name = 'Host', avatar = '🦊', difficulty = 'Quick Thinker', displayOnly = false}) {
  if (!Object.hasOwn(MODES, mode)) mode = 'classic';
  const players = displayOnly ? [] : [{ id: hostId, name, avatar, score: 0, ready: true, roundWins: 0, team: mode === 'teams' ? 'blue' : null }];
  if (mode === 'computer') players.push({id:'computer',name:difficulty,avatar:'🧠',score:0,ready:true,roundWins:0,isBot:true,difficulty});
  return {code,mode,players,hostId,...(displayOnly ? {display:{id:hostId,name:'TV display',avatar:'📺',isDisplay:true}} : {}),phase:'lobby',round:0,rounds:MODES[mode].rounds,version:1,history:[],moves:[],used:new Set(),activeIndex:0,turnDeadline:null,createdAt:now(),updatedAt:now(),lastActivityAt:now(),lastMessage:'Room created. Scan the QR code to invite players.',puzzle:null,resets:0,unresolved:false,roundWinnerId:null,championId:null,championIds:[],championTeam:null,teamWins:{blue:0,red:0}};
}
return {activePlayer, publicState, touch, startRound, endRound, nextRound, applyTimeout, acceptMove, resetTurn, logMove, action, makeRoom};
}
const api = {createRules, MODES};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.WordShiftRules = api;
