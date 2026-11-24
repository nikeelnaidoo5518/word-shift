'use strict';

const MODES = {
  daily: { name: 'Daily Challenge', min: 1, max: 1, rounds: 1 },
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
  if (player && !room.players.some(p=>p.id===player.id) && player.id!==room.display?.id) player=null;
  const countdown = room.phase==='paused' ? Math.min(room.puzzle?.timerSeconds || 999,Math.ceil((room.pausedRemainingMs || 0)/1000)) : room.turnDeadline ? Math.max(0, Math.min(room.puzzle?.timerSeconds || 999,Math.ceil((room.turnDeadline - now()) / 1000))) : 0;
  return {
    code: room.code,
    mode: room.mode,
    modeName: MODES[room.mode].name,
    minPlayers: MODES[room.mode].min,
    maxPlayers: MODES[room.mode].max + (room.mode === 'computer' ? 1 : 0),
    phase: room.phase,
    hostId: room.hostId,
    displayOnly: Boolean(room.display),
    captainId: captainId(room),
    puzzlePack: room.puzzlePack || 'original',
    category: room.category || 'all',
    categoryName: room.customPuzzle?'Custom puzzle':engine.CATEGORIES[room.category || 'all'],
    matchFormat: room.matchFormat || 'standard',
    variedPuzzles:Boolean(room.variedPuzzles),
    matchId: `${room.code}:${room.matchSerial || 0}`,
    dailyDate: room.dailyDate || null,
    teamDiscussion: Boolean(room.teamDiscussion),
    discussionSeconds: room.phase==='paused'?Math.ceil((room.pausedDiscussionMs || 0)/1000):Math.max(0,Math.ceil(((room.turnBeginsAt || 0)-now())/1000)),
    turnBeginsAt: room.turnBeginsAt || null,
    targetRevealUntil: room.targetRevealUntil || null,
    targetHidden: hiddenTarget(room),
    chaosEvent: room.chaosEvent || null,
    votes: room.votes || {},
    voteResult: room.voteResult || null,
    rivalry: rivalry(room),
    replay: ['roundResults','complete','ended'].includes(room.phase)?room.roundReplay || null:null,
    summary: [...room.players,...(room.archivedPlayers || [])].map(p=>({id:p.id,name:p.name,avatar:p.avatar,score:p.score,removed:Boolean(p.removed),...(room.stats?.[p.id] || {valid:0,invalid:0,timeouts:0,longestStreak:0,roundWins:0}),hintsSpent:room.stats?.[p.id]?.hintsSpent || 0,badges:badgesFor(room,p.id)})),
    round: room.round,
    rounds: room.rounds,
    roundName: room.puzzle?.roundName || null,
    modifier: room.puzzle?.modifier || null,
    difficulty: room.puzzle?.difficulty || null,
    timerSeconds: room.puzzle?.timerSeconds || null,
    start: room.puzzle?.start || null,
    target: hiddenTarget(room)?'?'.repeat(room.current.length):room.puzzle?.target || null,
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
    you: player ? { id: player.id, name: player.name, avatar: player.avatar, isHost: player.id === room.hostId, isDisplay: Boolean(player.isDisplay), canControl: canControl(room, player), isActive: player.id === active?.id, ready: player.ready, hintsRemaining:Math.max(0,3-(room.stats?.[player.id]?.hintsSpent || 0)), hint:privateHint(room,player.id) } : null,
    players: room.players.map(({ id, name, avatar, score, ready, roundWins, isBot }) => ({ id, name, avatar, score, ready, roundWins, isBot: Boolean(isBot), connected: Boolean(isBot) || isConnected(room, id),hintsSpent:room.stats?.[id]?.hintsSpent || 0, team: room.mode === 'teams' ? room.players.find(p=>p.id===id).team : null })),
  };
}
function hiddenTarget(room){return room.chaosEvent==='memory' && ['playing','paused'].includes(room.phase) && (room.phase==='paused'?room.pausedRevealMs===0:now()>=(room.targetRevealUntil || Infinity));}
function privateHint(room,id){const hint=room.hintsByPlayer?.[id];return hint && hint.matchId===`${room.code}:${room.matchSerial || 0}` && hint.round===room.round && hint.from===room.current && activePlayer(room)?.id===id?hint:null;}
function badgesFor(room,id){const result=[...(room.badges?.[id] || [])],s=room.stats?.[id];if(s?.longestStreak>=5)result.push('Five-Word Streak');if(room.phase==='complete' && s?.valid>0 && !s.hintsSpent)result.push('No Hints Needed');return [...new Set(result)];}
function rivalry(room){
 if(room.mode==='daily' || ['complete','ended','lobby'].includes(room.phase))return '';
 if(room.mode==='teams'){const teams=['blue','red'].filter(t=>room.teamWins[t]===MODES.teams.wins-1);if(teams.length)return teams.map(t=>t.toUpperCase()).join(' & ')+' TEAM · one round from victory';}
 if(['headToHead','computer'].includes(room.mode)){const names=room.players.filter(p=>p.roundWins===MODES[room.mode].wins-1).map(p=>p.name);if(names.length)return names.join(' & ')+' · one round from victory';}
 if(room.round>=room.rounds-(room.phase==='roundResults'?1:0))return 'Final round · every point counts';return '';
}
function applyVotes(room){
 if(room.customPuzzle || room.mode==='daily')return;
 const votes=Object.entries(room.votes || {}).filter(([id])=>room.players.some(p=>p.id===id && !p.isBot)).map(([,v])=>v);
 const winner=(field,current)=>{const counts={};for(const vote of votes)counts[vote[field]]=(counts[vote[field]] || 0)+1;const high=Math.max(0,...Object.values(counts)),leaders=Object.keys(counts).filter(k=>counts[k]===high).sort();return leaders.includes(current)?current:leaders[0] || current;};
 if(votes.length){const before=`${room.category}:${room.puzzlePack}`;room.category=winner('category',room.category || 'all');room.puzzlePack=winner('pack',room.puzzlePack || 'original');if(room.round>0 && `${room.category}:${room.puzzlePack}`!==before)room.variedPuzzles=true;room.voteResult={category:room.category,pack:room.puzzlePack,count:votes.length};}room.votes={};
}
function configureRoom(room,options={}){
 room.category=Object.hasOwn(engine.CATEGORIES,options.category)?options.category:'all';
 room.teamDiscussion=room.mode==='teams' && options.teamDiscussion===true;
 room.matchFormat=options.matchFormat==='quick'?'quick':'standard';
 if(room.mode==='daily'){room.matchFormat='daily';room.dailyDate=new Date(now()).toISOString().slice(0,10);room.category='all';}
 else if(options.puzzleSource==='custom'){room.customPuzzle=engine.validateCustom(options.customStart,options.customTarget);room.matchFormat='custom';room.category='all';}
 room.rounds=['daily','custom'].includes(room.matchFormat)?1:room.matchFormat==='quick'?Math.min(3,MODES[room.mode].rounds):MODES[room.mode].rounds;
 return room;
}
function scheduleTurn(room){room.turnBeginsAt=now()+(room.teamDiscussion?10000:0);room.turnDeadline=room.turnBeginsAt+room.puzzle.timerSeconds*1000;}
function captainId(room) { return room.display ? room.captainId || room.players.find(p=>!p.isBot)?.id || null : room.hostId; }
function stat(room,player) {room.stats ||= {};return room.stats[player.id] ||= {valid:0,invalid:0,timeouts:0,streak:0,longestStreak:0,roundWins:0};}
function canControl(room, player) { return Boolean(player && (player.id === room.hostId || (room.display && player.id === captainId(room)))); }
function touch(room) { room.updatedAt = now(); room.version++; onChange(room); }
function resetTurn(room) { room.activeIndex = (room.activeIndex + 1) % room.players.length; scheduleTurn(room); }
function startRound(room) {
  room.puzzle = room.mode==='daily'?engine.dailyPuzzle(room.dailyDate):room.customPuzzle?{...room.customPuzzle,roundName:'Custom ladder',timerSeconds:45,difficulty:'Custom'}:engine.puzzleForRound(room.round - 1, room.puzzlePack || 'original', room.puzzleSeed || 0,room.category || 'all');
  room.chaosEvent=null;room.targetRevealUntil=null;
  if (room.mode === 'party') {
    room.chaosEvent=['lightning','memory','double','lightning','double','memory','double'][(room.round-1)%7];
    room.puzzle.roundName={lightning:'Lightning Round',memory:'Memory Round',double:'Double Points'}[room.chaosEvent];room.puzzle.modifier=room.puzzle.roundName;
    if(room.chaosEvent==='memory')room.targetRevealUntil=now()+5000;
    room.puzzle.timerSeconds = [15, 25, 25, 15, 15, 20, 15][room.round - 1];
  }
  if(room.matchFormat==='quick')room.puzzle.timerSeconds=Math.min(room.puzzle.timerSeconds,25);
  room.roundStartedAt=now();room.roundPausedMs=0;room.pauseStartedAt=null;room.roundStartStats={};for(const p of room.players)room.roundStartStats[p.id]={...stat(room,p)};room.hintsByPlayer={};room.roundReplay=null;
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
  scheduleTurn(room);
  room.lastMessage = `${room.puzzle.roundName} begins. ${room.players[room.activeIndex].name}, you’re first.`;
  touch(room);
}
function endRound(room, winnerId = null, unresolved = false) {
  const elapsedMs=Number.isFinite(room.roundStartedAt)?Math.max(1,now()-room.roundStartedAt-(room.roundPausedMs || 0)):null;
  const route=engine.shortestPath(room.puzzle.start,room.puzzle.target) || room.puzzle.route;
  const moves=Object.values(room.moveCounts || {}).reduce((a,b)=>a+b,0);
  room.roundReplay={start:room.puzzle.start,target:room.puzzle.target,route,shortestMoves:route.length-1,played:[...room.history],moves,resets:room.resets,elapsedMs,winnerId,winnerName:room.players.find(p=>p.id===winnerId)?.name || null};
  room.badges ||= {};
  for(const p of room.players){const s=stat(room,p),before=room.roundStartStats?.[p.id] || {valid:0,invalid:0,timeouts:0};if(s.valid>before.valid && s.invalid===before.invalid && s.timeouts===before.timeouts)room.badges[p.id]=[...new Set([...(room.badges[p.id] || []),'Perfect Round'])];}
  if(winnerId){const winner=room.players.find(p=>p.id===winnerId),s=stat(room,winner);if(elapsedMs!==null)s.fastestTargetMs=Math.min(s.fastestTargetMs || Infinity,elapsedMs);s.fewestTargetMoves=Math.min(s.fewestTargetMoves || Infinity,moves);}
  room.phase = 'roundResults';
  room.turnDeadline = null;
  room.roundWinnerId = winnerId;
  room.unresolved = unresolved;
  if (winnerId) {
    const winner = room.players.find(player => player.id === winnerId);
    if(winner)stat(room,winner).roundWins++;
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
  applyVotes(room);
  startRound(room);
  return true;
}
function applyTimeout(room) {
  if (room.phase !== 'playing') return;
  const player = activePlayer(room);
  const stats=stat(room,player);stats.timeouts++;stats.streak=0;
  logMove(room, { playerId: player.id, playerName: player.name, word: null, valid: false, reason: 'TIME’S UP!', at: now() });
  room.lastMessage = `TIME’S UP! ${player.name} loses the turn.`;
  resetTurn(room);
  touch(room);
}
function acceptMove(room, player, word) {
  const stats=stat(room,player);stats.valid++;stats.streak++;stats.longestStreak=Math.max(stats.longestStreak,stats.streak);
  room.moveCounts ||= {};
  room.moveCounts[player.id] = (room.moveCounts[player.id] || 0) + 1;
  const previous = room.current;
  const oldMatches = engine.targetMatches(previous, room.puzzle.target);
  room.current = word;
  room.used.add(word);
  room.history.push(word);
  const newMatches = engine.targetMatches(word, room.puzzle.target);
  const finale = room.round === room.rounds;
  const points = (100 + (newMatches > oldMatches ? 25 : 0) + (word === room.puzzle.target ? 250 : 0)) * (finale || room.chaosEvent==='double' ? 2 : 1);
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
    scheduleTurn(room);
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
  if (!['end','pause','resume','leave','vote'].includes(action) && (action === 'move' || body.version !== undefined) && body.version !== room.version) return fail(409, 'The game changed. Your screen has been updated; try again.');
  if(action==='vote'){
    if(player.isDisplay || player.isBot)return fail(403,'Phone players vote for the next puzzle.');
    if(!['lobby','roundResults'].includes(room.phase) || room.customPuzzle || room.mode==='daily')return fail(409,'Voting opens in the lobby and between regular rounds.');
    if(!Object.hasOwn(engine.CATEGORIES,body.category) || !Object.hasOwn(engine.PUZZLE_PACKS,body.pack))return fail(400,'Choose a listed category and difficulty.');
    room.votes ||= {};room.votes[player.id]={category:body.category,pack:body.pack};room.lastMessage=`${player.name} voted for the next puzzle.`;touch(room);return success();
  }
  if(action==='hint'){
    if(room.phase!=='playing' || player.isDisplay || player.isBot || activePlayer(room)?.id!==player.id)return fail(403,'Hints are private to the player whose turn it is.');
    if(now()<(room.turnBeginsAt || 0))return fail(409,'Wait until the team huddle ends before asking for a hint.');
    if(now()>=room.turnDeadline){applyTimeout(room);return fail(409,'Your turn has ended.');}
    const cost=body.hintType==='word'?2:body.hintType==='letter'?1:0;if(!cost)return fail(400,'Choose a letter hint or a word reveal.');
    const s=stat(room,player);if((s.hintsSpent || 0)+cost>3)return fail(409,'Not enough hint points remain. Each player has three per match.');
    const route=engine.shortestPath(room.current,room.puzzle.target,room.used);if(!route || route.length<2)return fail(409,'No unused route remains from this word.');
    const word=route[1],index=[...word].findIndex((c,i)=>c!==room.current[i]);s.hintsSpent=(s.hintsSpent || 0)+cost;
    room.hintsByPlayer ||= {};room.hintsByPlayer[player.id]={matchId:`${room.code}:${room.matchSerial || 0}`,round:room.round,from:room.current,index,word:cost===2?word:null,type:body.hintType};
    room.lastMessage=`${player.name} used a hint.`;touch(room);return success();
  }
  if (action === 'ready') {
    if (player.isDisplay) return fail(403, 'The TV is a display, not a player.');
    if (room.phase !== 'lobby') return fail(409, 'The lobby is already closed.');
    player.ready = Boolean(body.ready); room.lastMessage = `${player.name} is ${player.ready ? 'ready' : 'not ready'}.`; touch(room); return success();
  }
  if (['start', 'next', 'restart', 'end', 'pause', 'resume', 'remove', 'captain'].includes(action) && !canControl(room, player)) return fail(403, 'Only the TV or phone captain can control the match.');
  if(action==='pause') {
    if(room.phase!=='playing')return fail(409,'Only a running round can be paused.');
    if(now()>=room.turnDeadline)applyTimeout(room);
    room.pauseStartedAt=now();room.pausedRevealMs=Math.max(0,(room.targetRevealUntil || 0)-now());room.pausedDiscussionMs=Math.max(0,(room.turnBeginsAt || 0)-now());
    room.pausedRemainingMs=Math.max(1,room.turnDeadline-now());room.turnDeadline=null;room.phase='paused';room.lastMessage='Game paused. Everyone can take a break.';touch(room);return success();
  }
  if(action==='resume') {
    if(room.phase!=='paused')return fail(409,'This game is not paused.');
    if(room.chaosEvent==='memory' && room.pausedRevealMs>0)room.targetRevealUntil=now()+room.pausedRevealMs;room.roundPausedMs=(room.roundPausedMs || 0)+Math.max(0,now()-(room.pauseStartedAt ?? now()));room.turnBeginsAt=now()+(room.pausedDiscussionMs || 0);room.turnDeadline=now()+room.pausedRemainingMs;room.phase='playing';room.lastMessage='Game resumed.';touch(room);return success();
  }
  if(action==='captain') {
    const target=room.players.find(p=>p.id===body.playerId && !p.isBot);
    if(!room.display || !target || !isConnected(room,target.id))return fail(409,'Choose a connected phone player.');
    room.captainId=target.id;room.lastMessage=`${target.name} is now phone captain.`;touch(room);return success();
  }
  if(action==='leave' || action==='remove') {
    const target=action==='leave'?player:room.players.find(p=>p.id===body.playerId);
    if(!target || target.isDisplay || target.isBot || target.id===room.hostId)return fail(409,'The TV or playing host must end the game instead.');
    if(action==='remove' && (!['lobby','paused'].includes(room.phase) || isConnected(room,target.id)))return fail(409,'Pause first, and choose a disconnected player.');
    const index=room.players.findIndex(p=>p.id===target.id),wasActive=index===room.activeIndex;
    if(room.votes)delete room.votes[target.id];
    room.departed ||= {};room.departed[target.id]=action==='leave'?'left':'removed';
    room.archivedPlayers ||= [];room.archivedPlayers=room.archivedPlayers.filter(p=>p.id!==target.id);room.archivedPlayers.push({...target,removed:true});room.archivedPlayers=room.archivedPlayers.slice(-16);
    room.players.splice(index,1);
    if(room.captainId===target.id)room.captainId=null;
    if(room.phase==='lobby') {if(room.mode==='teams')room.players.forEach((p,i)=>{p.team=i%2?'red':'blue';});}
    else if(!['complete','ended'].includes(room.phase) && room.players.filter(p=>!p.isBot).length<MODES[room.mode].min) {room.phase='ended';room.turnDeadline=null;}
    else if(room.players.length) {room.activeIndex=(room.activeIndex-(index<room.activeIndex?1:0))%room.players.length;if(wasActive && room.phase==='playing')room.turnDeadline=now()+room.puzzle.timerSeconds*1000;if(wasActive && room.phase==='paused')room.pausedRemainingMs=room.puzzle.timerSeconds*1000;}
    room.lastMessage=room.phase==='ended'?'Match ended: too few players remain.':`${target.name} left the game.`;touch(room);return success();
  }
  if (action === 'end') {
    room.phase = 'ended'; room.turnDeadline = null; room.lastMessage = 'The host ended this match.'; touch(room); return success();
  }
  if (action === 'start') {
    if (room.phase !== 'lobby') return fail(409, 'The match has already started.');
    const count = room.players.filter(p => !p.isBot).length, mode = MODES[room.mode];
    if (count < mode.min || count > mode.max) return fail(409, `This mode needs ${mode.min}${mode.min === mode.max ? '' : `–${mode.max}`} human players.`);
    if (!room.players.every(p => p.ready)) return fail(409, 'Everyone must be ready before the match starts.');
    room.stats={};room.variedPuzzles=false;room.badges={};room.hintsByPlayer={};room.matchSerial=(room.matchSerial || 0)+1;if(room.mode==='daily')room.dailyDate=new Date(now()).toISOString().slice(0,10);room.archivedPlayers=[];applyVotes(room);room.round = 1; room.players.forEach(p => { p.score = 0; p.roundWins = 0; }); room.teamWins = { blue: 0, red: 0 }; startRound(room); return success();
  }
  if (action === 'move') {
    if (room.phase !== 'playing') return fail(409, 'This round is not accepting moves.');
    if (player.id !== activePlayer(room)?.id) return fail(403, 'It is not your turn.');
    if(now()<(room.turnBeginsAt || 0))return fail(409,'Team huddle: discuss your move before the timer starts.');
    if (now() >= room.turnDeadline) { applyTimeout(room); return fail(409, 'TIME’S UP! Your turn passed.'); }
    const word = String(body.word || '').trim().toLowerCase();
    let reason = null;
    if (word.length !== room.current.length) reason = 'Keep the word the same length.';
    else if (engine.changedPositions(room.current, word) !== 1) reason = 'Only change ONE letter!';
    else if (!engine.dictionary.has(word)) reason = 'Word not recognized!';
    else if (room.used.has(word)) reason = 'That word has already been used!';
    if (reason) {
      const stats=stat(room,player);stats.invalid++;stats.streak=0;
      logMove(room, { playerId: player.id, playerName: player.name, word, valid: false, reason, at: now() });
      room.lastMessage = reason; resetTurn(room); touch(room); return fail(422, reason);
    }
    acceptMove(room, player, word); return success();
  }
  if (action === 'next') { if (!nextRound(room)) return fail(409, 'There is no next round.'); return success(); }
  if (action === 'restart') {
    if (room.phase !== 'complete') return fail(409, 'Finish the current match first.');
    room.stats={};room.variedPuzzles=false;room.badges={};room.hintsByPlayer={};room.matchSerial=(room.matchSerial || 0)+1;if(room.mode==='daily')room.dailyDate=new Date(now()).toISOString().slice(0,10);room.archivedPlayers=[];room.players.forEach(p => { p.score = 0; p.roundWins = 0; }); room.teamWins = { blue: 0, red: 0 };
    room.championIds = []; room.championId = null; room.championTeam = null; room.round = 1; startRound(room); return success();
  }
  return fail(404, 'Unknown game action.');
}
function makeRoom({code, mode = 'classic', hostId, name = 'Host', avatar = '🦊', difficulty = 'Quick Thinker', displayOnly = false, puzzlePack = 'original', puzzleSeed = 0,...options}) {
  if (!Object.hasOwn(MODES, mode)) mode = 'classic';
  const players = displayOnly ? [] : [{ id: hostId, name, avatar, score: 0, ready: true, roundWins: 0, team: mode === 'teams' ? 'blue' : null }];
  if (mode === 'computer') players.push({id:'computer',name:difficulty,avatar:'🧠',score:0,ready:true,roundWins:0,isBot:true,difficulty});
  const room = {code,mode,players,hostId,puzzlePack:Object.hasOwn(engine.PUZZLE_PACKS || {},puzzlePack)?puzzlePack:'original',puzzleSeed:Math.abs(Number(puzzleSeed)||0),...(displayOnly ? {display:{id:hostId,name:'TV display',avatar:'📺',isDisplay:true}} : {}),phase:'lobby',round:0,rounds:MODES[mode].rounds,version:1,history:[],moves:[],used:new Set(),activeIndex:0,turnDeadline:null,createdAt:now(),updatedAt:now(),lastActivityAt:now(),lastMessage:'Room created. Scan the QR code to invite players.',puzzle:null,resets:0,unresolved:false,roundWinnerId:null,championId:null,championIds:[],championTeam:null,teamWins:{blue:0,red:0}};
  return configureRoom(room,options);
}
return {activePlayer, publicState, touch, startRound, endRound, nextRound, applyTimeout, acceptMove, resetTurn, logMove, action, makeRoom, configureRoom, privateHint};
}
const api = {createRules, MODES};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.WordShiftRules = api;
