'use strict';

const tvDisplay = new URLSearchParams(location.search).get('tv') === '1';
const screens = [...document.querySelectorAll('.screen')];
const storageKey = 'wordshift.room.session';
const avatars = ['🦊', '🐸', '🐯', '🐼', '🦁', '🐨', '🐙', '🐧', '🐻', '🐰', '🐵', '🦄'];
let room = null;
let token = null;
let state = null;
let stream = null;
let previousPhase = null;
let localDeadline = 0;
let selectedLetter = 0;
let requestBusy = false;
let previousScreen = 'home';
let menuReturnScreen = 'home';
let selectedMode = 'classic';
let joinOrigin = globalThis.WordShiftOnline?.enabled ? new URL('.', location.href).href : location.origin;
let joinQrLink = '';
let networkAddressPending = false;
let networkAddressLoaded = false;
let reconnecting = false;
let reconnectProbe = false;
let draftKey='', lastSoundKey='', warningKey='', summaryReturn='matchMenu', managerKey='';

function show(id) {
  if (id === 'phone' && state?.you?.isDisplay) id = 'tv';
  const active = screens.find(screen => screen.classList.contains('active'))?.id;
  if (id === 'settings' && active) previousScreen = active;
  screens.forEach(screen => screen.classList.toggle('active', screen.id === id));
  if (id === 'phone') renderPhone();
  if (id === 'tv') renderGame();
}
function backFromSettings() { show(previousScreen); }

function togglePreference(name, button) {
  button.classList.toggle('on');
  if (name === 'motion') {
    document.querySelector('.app').classList.toggle('reduced-motion', button.classList.contains('on'));
    localStorage.setItem('wordshift.reduceMotion', button.classList.contains('on') ? '1' : '0');
  }
}

function chooseMode(modeName) {
  const modes = { 'Classic Multiplayer': 'classic', 'Head-to-Head': 'headToHead', 'Player vs Computer': 'computer', 'Team Battle': 'teams', 'Party Chaos': 'party', 'Daily Challenge': 'daily' };
  window.selectedMode = modes[modeName] || 'classic';
  selectedMode = window.selectedMode;
  document.getElementById('lobby-mode').textContent=`${modeName} · create a game or join your crew`;
  document.getElementById('botSettings').style.display = selectedMode === 'computer' ? 'block' : 'none';
  setRoomError('');
  show('lobby');
  globalThis.updateSetupOptions?.();
}

function setRoomError(message) {
  const node = document.getElementById('roomError');
  if (node) node.textContent = message || '';
}

function sessionHeaders() {
  return token ? { 'x-player-token': token } : {};
}

async function requestJson(url, options = {}) {
  const sendRequest = globalThis.WordShiftOnline?.enabled ? WordShiftOnline.request : fetch;
  const response = await sendRequest(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...sessionHeaders(), ...(options.headers || {}) },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (result.state) updateState(result.state);
    throw Object.assign(new Error(result.error || `Request failed (${response.status}).`), { status: response.status });
  }
  return result;
}

function saveSession() {
  if (room && token) localStorage.setItem(storageKey, JSON.stringify({ room, token }));
}

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.room && saved?.token) { room = saved.room; token = saved.token; return true; }
  } catch { /* Ignore a damaged local browser session. */ }
  return false;
}

async function createRoom() {
  setRoomError('');
  try {
    const name = document.getElementById('hostName').value.trim() || 'Host';
    const botDifficulty = document.getElementById('botDifficulty')?.value || 'Quick Thinker';
    const result = await requestJson('/api/rooms', { method: 'POST', body: JSON.stringify({ name, avatar: '🦊', mode: selectedMode, botDifficulty,...(globalThis.WordShiftFun?.setupBody() || {}), puzzlePack:document.getElementById('puzzlePack').value, displayOnly: tvDisplay }) });
    room = result.state.code;
    token = result.token;
    saveSession();
    attachRoom(result.state);
    show('lobby');
  } catch (err) { setRoomError(err.message); }
}

async function joinRoom() {
  setRoomError('');
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  const name = document.getElementById('joinName').value.trim();
  if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) { setRoomError('Enter the five-character room code.'); return; }
  try {
    const result = await requestJson(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: JSON.stringify({ name, avatar: avatars[Math.floor(Math.random() * avatars.length)] }) });
    room = result.state.code;
    token = result.token;
    saveSession();
    attachRoom(result.state);
    show(result.state.phase === 'lobby' ? 'lobby' : 'phone');
  } catch (err) { setRoomError(err.message); }
}

function attachRoom(initial) {
  if (stream) stream.close();
  setConnectionNotice('');
  updateState(initial);
  const url = `/api/events?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`;
  const source = globalThis.WordShiftOnline?.enabled ? WordShiftOnline.events(room, token) : new EventSource(url);
  stream = source;
  source.addEventListener('state', event => {
    if (stream !== source) return;
    try { setConnectionNotice(''); updateState(JSON.parse(event.data)); } catch { /* Ignore an incomplete event. */ }
  });
  source.addEventListener('expired', event => {
    if (stream !== source) return;
    let message = 'This room expired. Create or join a new room.';
    try { message = JSON.parse(event.data).message || message; } catch { /* Use the default. */ }
    forgetExpiredRoom(message);
  });
  source.addEventListener('hostaway',event=>{if(stream===source){try{setConnectionNotice(JSON.parse(event.data).message);}catch{}}});
  source.onerror = () => {
    if (stream !== source) return;
    setConnectionNotice(source.readyState === EventSource.CLOSED ? 'Connection unavailable. Close extra room tabs and reload to reconnect.' : 'Connection lost. Reconnecting…');
    if (reconnectProbe || !room || !token) return;
    reconnectProbe = true;
    requestJson(`/api/rooms/${encodeURIComponent(room)}`).catch(err => {
      if (stream === source && err.status === 404) forgetExpiredRoom('This room is no longer available. Create or join a new room.');
    }).finally(() => { reconnectProbe = false; });
  };
}

function setConnectionNotice(message) {
  reconnecting = Boolean(message);
  const notice = document.getElementById('connectionNotice');
  document.getElementById('connectionText').textContent = message; notice.hidden = !message;
  updateDraftPreview();
}
function forgetExpiredRoom(message) {
  if (stream) stream.close(); stream = null;
  localStorage.removeItem(storageKey);
  room = token = state = null; previousPhase = null; localDeadline = 0;
  document.getElementById('roomSetup').style.display = 'grid';
  document.getElementById('lobbyLayout').style.display = 'none';
  setConnectionNotice(''); setRoomError(message); show('lobby');
}

function updateState(next) {
  if (!next) return;
  if(!next.you){forgetExpiredRoom('You left or were removed from this game. Create or join another game.');return;}
  if (state?.code === next.code && next.version < state.version) return;
  const oldPhase = state?.phase ?? previousPhase;
  const auxiliary=['matchMenu','manage','summary','settings','how','voting','replay','records'].includes(document.querySelector('.screen.active')?.id);
  state = next;
  room = next.code;
  localDeadline = next.turnDeadline && globalThis.WordShiftOnline?.serverNow ? Date.now()+Math.max(0,next.turnDeadline-WordShiftOnline.serverNow()) : Date.now()+(Number(next.secondsLeft || 0)+Number(next.discussionSeconds || 0))*1000;
  saveSession();
  if (next.phase === 'lobby') renderLobby();
  if (next.phase === 'playing') {
    renderGame();
    renderPhone();
    if (oldPhase !== 'playing') {
      if(oldPhase==='paused') show(next.you?.isDisplay || next.you?.isHost?'tv':'phone');
      else if (next.you?.isDisplay) show('tv');
      else if (next.you?.isHost) { updateIntro(); show('intro'); }
      else show('phone');
    }
  }
  if (next.phase === 'roundResults') { renderResults(); if(oldPhase!==next.phase || !auxiliary)show('results'); }
  if (next.phase === 'complete') { renderResults();renderVictory(); if(oldPhase!==next.phase || !auxiliary)show('victory'); }
  if (next.phase === 'paused') {document.getElementById('pauseInfo').textContent=`${next.activePlayerName}’s turn · ${next.secondsLeft} seconds saved. The TV or captain can resume.`;document.getElementById('resumeButton').disabled=!next.you.canControl;if(oldPhase!==next.phase || !auxiliary)show('paused');}
  if (next.phase === 'ended') {document.getElementById('endedReason').textContent=next.lastMessage || 'Thanks for playing!';if(oldPhase!==next.phase || !auxiliary)show('ended');}
  refreshExtraViews();
  playStateSound(next);
  globalThis.WordShiftFun?.update(next);
  previousPhase = next.phase;
}

function renderLobby() {
  document.getElementById('roomSetup').style.display = 'none';
  document.getElementById('lobbyLayout').style.display = 'grid';
  document.getElementById('lobby-mode').textContent = `${state.modeName} · ${state.players.length} / ${state.maxPlayers} players`;
  document.getElementById('roomCode').textContent = state.code;
  document.getElementById('shareCode').textContent = state.code;
  renderJoinCode();
  const options = document.querySelectorAll('.lobby-options .option b');
  options[1].textContent = `${state.rounds} · ${state.modeName}`;
  options[3].textContent = 'English · unreviewed';
  const slots = document.getElementById('slots');
  slots.innerHTML = state.players.map(player => `<div class="slot joined ${player.team || ''}"><span class="avatar">${player.avatar}</span><strong>${escapeHtml(player.name)}${player.id === state.you.id ? ' · You' : ''}</strong><small>${player.isBot ? '● COMPUTER' : player.connected === false ? '○ OFFLINE' : player.ready ? '● READY' : '○ NOT READY'}${player.team ? ` · ${player.team.toUpperCase()} TEAM` : ''}</small></div>`).join('') + Array.from({ length: Math.max(0, state.maxPlayers - state.players.length) }, () => '<div class="slot"><span class="empty-slot">＋<br>Waiting for player</span></div>').join('');
  document.querySelector('.lobby-main .lobby-title h2').innerHTML = `Players <span style="color:var(--muted);font:500 15px var(--sans)">${state.players.length} / ${state.maxPlayers}</span>`;
  const button = document.getElementById('lobbyAction');
  if ((state.you.canControl ?? state.you.isHost) && (state.you.isDisplay || state.you.ready)) {
    button.innerHTML = 'Start game <span>→</span>';
    button.disabled = state.players.filter(p => !p.isBot).length < state.minPlayers || !state.players.every(p => p.ready);
    document.getElementById('lobbyMessage').textContent = state.players.filter(p => !p.isBot).length < state.minPlayers ? `Invite at least ${state.minPlayers} human player${state.minPlayers === 1 ? '' : 's'}.` : state.players.every(p => p.ready) ? 'Everyone is ready.' : 'Waiting for every player to tap Ready.';
  } else {
    button.innerHTML = state.you.ready ? 'Ready ✓' : 'Tap when ready';
    button.disabled = false;
    document.getElementById('lobbyMessage').textContent = state.you.canControl ? 'Tap Ready, then start here or on the TV once everyone is ready.' : 'Tap Ready when you’re set. The TV or first phone player starts the game.';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderJoinCode() {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(joinOrigin).hostname);
  if (loopback && !globalThis.WordShiftOnline?.enabled) {
    document.getElementById('joinQr').replaceChildren();
    document.getElementById('qrHelp').textContent = 'Finding your Wi-Fi address…';
    if (networkAddressPending || networkAddressLoaded) return;
    networkAddressPending = true;
    requestJson('/api/join-origins').then(result => {
      const origins = result.origins || [];
      networkAddressLoaded = true;
      if (!origins.length) throw new Error('Open the game using the Same-Wi-Fi phone address printed by npm start.');
      const select = document.getElementById('joinAddress');
      select.replaceChildren(...origins.map(origin => {
        const option = document.createElement('option'); option.value = origin; option.textContent = origin; return option;
      }));
      document.getElementById('joinAddressLabel').hidden = origins.length < 2;
      select.onchange = () => { joinOrigin = select.value; joinQrLink = ''; renderJoinCode(); };
      joinOrigin = origins[0];
      renderJoinCode();
    }).catch(err => { document.getElementById('qrHelp').textContent = err.message; })
      .finally(() => { networkAddressPending = false; });
    return;
  }
  const link = WordShiftJoin.joinUrl(joinOrigin, state.code);
  if (link !== joinQrLink) {
    try {
      document.getElementById('joinQr').innerHTML = WordShiftJoin.svgFor(link, qrcodegen);
      document.getElementById('joinLink').textContent = link;
      joinQrLink = link;
    } catch {
      document.getElementById('qrHelp').textContent = 'QR unavailable. Use the address and room code instead.';
      document.getElementById('joinLink').textContent = link;
      return;
    }
  }
  document.getElementById('qrHelp').textContent = globalThis.WordShiftOnline?.enabled ? 'Scan with your phone camera · internet required' : 'Same Wi-Fi · scan with your phone camera';
}

async function copyJoinLink() {
  if (!globalThis.WordShiftOnline?.enabled && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(joinOrigin).hostname)) {
    document.getElementById('lobbyMessage').textContent = 'Open the game using its Same-Wi-Fi phone address before sharing.';
    return;
  }
  const link = WordShiftJoin.joinUrl(joinOrigin, state.code);
  try {
    await navigator.clipboard.writeText(link);
    document.getElementById('lobbyMessage').textContent = globalThis.WordShiftOnline?.enabled ? 'Join link copied. Send it to your players.' : 'Join link copied. Send it to players on the same Wi‑Fi.';
  } catch {
    document.getElementById('lobbyMessage').textContent = `Open ${link} on your phone.`;
  }
}

async function startOrReady() {
  if (!state || requestBusy || reconnecting) return;
  requestBusy = true;
  try {
    if ((state.you.canControl ?? state.you.isHost) && (state.you.isDisplay || state.you.ready)) {
      await requestJson(`/api/rooms/${room}/start`, { method: 'POST', body: JSON.stringify({ version: state.version }) });
    } else {
      await requestJson(`/api/rooms/${room}/ready`, { method: 'POST', body: JSON.stringify({ ready: !state.you.ready, version: state.version }) });
    }
  } catch (err) { setRoomError(err.message); }
  finally { requestBusy = false; }
}

function updateIntro() {
  if (!state) return;
  document.getElementById('introRound').textContent = `ROUND ${String(state.round).padStart(2, '0')} · ${state.roundName.toUpperCase()}`;
  document.getElementById('introDescription').textContent = `Build a shared ladder from ${state.start.toUpperCase()} to ${state.target.toUpperCase()}. One letter changes on each turn.`;
  document.getElementById('introBadges').innerHTML = `<span>✦ ${state.difficulty.toUpperCase()}</span><span>◷ ${state.timerSeconds} SEC / TURN</span><span>★ +250 TARGET BONUS</span>${state.modifier && state.mode === 'party' ? `<span>✺ ${state.modifier.toUpperCase()}</span>` : ''}`;
}

function beginRound() { if (state?.phase === 'playing') show('tv'); }

function letterTiles(word, target) {
  return [...word].map((letter, i) => `<span class="tile ${letter === target[i] ? 'matched' : ''}">${letter.toUpperCase()}</span>`).join('');
}

function renderGame() {
  if (!state || state.phase !== 'playing') return;
  document.querySelector('#tv .game-top .pill').textContent = `${state.modeName.toUpperCase()} · ROUND ${state.round} / ${state.rounds}`;
  document.querySelector('#tv .round-meta').innerHTML = `<span>${state.roundName.toUpperCase()}</span><b>✦ ${state.difficulty.toUpperCase()}</b><span>·</span><span>${escapeHtml(state.activePlayerName).toUpperCase()}’S TURN</span>`;
  document.querySelector('#tv .endpoint .word').textContent = state.start.toUpperCase();
  document.querySelector('#tv .endpoint.target .word').textContent = state.target.toUpperCase();
  document.getElementById('tv-turn').textContent = `${state.activePlayerName.toUpperCase()}’S TURN`;
  document.getElementById('bigword').textContent = state.current.toUpperCase();
  document.getElementById('tiles').innerHTML = letterTiles(state.current, state.target);
  document.getElementById('ladder').innerHTML = state.history.map((word, i) => `<span class="ladder-chip ${i === state.history.length - 1 ? 'current-chip' : ''}">${word.toUpperCase()}</span>`).join('');
  document.getElementById('players').innerHTML = state.players.map((player, i) => `<div class="player-card ${player.id === state.activePlayerId ? 'active-player' : ''} ${player.team ? `team-${player.team}` : ''}"><span class="miniavatar">${player.avatar}</span><span><b>${escapeHtml(player.name)}</b><small>${player.score} PTS${player.team ? ` · ${player.team.toUpperCase()}` : ''}${player.connected === false ? ' · OFFLINE' : ''}</small></span></div>`).join('');
  const counts = state.moveCounts || {};
  document.getElementById('tvMoves').textContent = state.you?.isDisplay ? `${state.totalMoves || 0} moves this round` : `${state.totalMoves || 0} moves this round · You: ${counts[state.you?.id] || 0}`;
  document.getElementById('phoneViewButton').hidden = Boolean(state.you?.isDisplay);
  paintClock();
}

function paintClock() {
  if (!state || state.phase !== 'playing') return;
  const seconds = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
  if(seconds>0 && seconds<=5){const key=`${state.code}:${state.round}:${state.version}`;if(warningKey!==key){warningKey=key;globalThis.WordShiftMusic?.effect('warning');}}
  document.getElementById('clock').textContent = seconds;
  document.getElementById('bigTimer').style.setProperty('--progress', `${(seconds / state.timerSeconds) * 100}%`);
  const phoneClock = document.getElementById('phoneClock');
  if (phoneClock) phoneClock.textContent = `${seconds}s`;
  const progress = document.getElementById('phoneProgress');
  if (progress) progress.style.width = `${(seconds / state.timerSeconds) * 100}%`;
  globalThis.WordShiftFun?.clock();
}

function renderPhone() {
  if (!state || state.phase !== 'playing' || state.you?.isDisplay) return;
  const mine = state.you?.isActive;
  const key=`${state.code}:${state.round}:${state.current}:${state.activePlayerId}`;
  if(draftKey!==key){draftKey=key;selectedLetter=0;document.getElementById('answer').value=state.current;}
  document.getElementById('answer').maxLength = state.current.length;
  document.getElementById('phoneMoves').textContent = `Your moves: ${state.moveCounts?.[state.you?.id] || 0} · Round total: ${state.totalMoves || 0}`;
  document.getElementById('phoneTurn').style.display = mine ? 'flex' : 'none';
  document.getElementById('phoneWait').style.display = mine ? 'none' : 'flex';
  if (mine) {
    document.getElementById('phonePlayerName').textContent = `${state.you.name} · ${state.you.avatar}`;
    document.getElementById('phoneWord').textContent = state.current.toUpperCase();
    document.querySelector('#phoneTurn .phone-target b').textContent = state.target.toUpperCase();
    document.getElementById('letterPick').innerHTML = [...state.current].map((letter, i) => `<button class="${i === selectedLetter ? 'selected' : ''}" aria-label="Select letter ${i + 1}, ${letter.toUpperCase()}" onclick="selectLetter(${i})">${letter.toUpperCase()}</button>`).join('');
    document.getElementById('feedback').textContent = state.lastMessage || 'Change exactly one letter, then pass the turn.';
    document.getElementById('feedback').style.color = 'var(--turq)';
  } else {
    document.getElementById('waitTitle').textContent = `Waiting for ${state.activePlayerName}…`;
    document.getElementById('waitWord').textContent = state.current.toUpperCase();
    document.querySelector('#phoneWait p').textContent = state.lastMessage || 'Watch the shared ladder on the main screen.';
  }
  updateDraftPreview();
  paintClock();
}

function selectLetter(index) { selectedLetter = index; renderPhone();globalThis.WordShiftFun?.phone(); }
function typeKey(letter) {
  if (!state?.you?.isActive) return;
  const input = document.getElementById('answer');
  input.value = `${state.current.slice(0, selectedLetter)}${letter.toLowerCase()}${state.current.slice(selectedLetter + 1)}`;
  updateDraftPreview();
}

async function submitWord() {
  if (state?.you?.isDisplay || !state?.you?.isActive || requestBusy || reconnecting) return;
  if(globalThis.WordShiftFun?.discussionRemaining()>0){setFeedback('Team huddle: discuss first, then submit.');return;}
  const input = document.getElementById('answer');
  const word = input.value.trim().toLowerCase();
  if (!word) { setFeedback('Enter a word to make your shift.'); return; }
  requestBusy = true;
  try {
    await requestJson(`/api/rooms/${room}/move`, { method: 'POST', body: JSON.stringify({ word, version: state.version }) });
    input.value = '';
    selectedLetter = 0;
  } catch (err) { setFeedback(err.message); }
  finally { requestBusy = false;globalThis.WordShiftFun?.phone(); }
}

function setFeedback(message) {
  const feedback = document.getElementById('feedback');
  feedback.textContent = message;
  feedback.style.color = 'var(--coral)';
}

async function nextRound() {
  if (!(state?.you?.canControl ?? state?.you?.isHost) || requestBusy || reconnecting) return;
  requestBusy = true;
  try { await requestJson(`/api/rooms/${room}/next`, { method: 'POST', body: JSON.stringify({ version: state.version }) }); }
  catch (err) { setFeedback(err.message); }
  finally { requestBusy = false; }
}

async function playAgain() {
  if (reconnecting || requestBusy) return;
  if (!(state?.you?.canControl ?? state?.you?.isHost)) { show('home'); return; }
  requestBusy = true;
  try { await requestJson(`/api/rooms/${room}/restart`, { method: 'POST', body: JSON.stringify({ version: state.version }) }); }
  catch (err) { setRoomError(err.message); show('lobby'); }
  finally { requestBusy = false; }
}

function renderResults() {
  document.getElementById('roundSummary').innerHTML = state.unresolved ? 'This ladder ran out of unused paths. Match points carry forward.' : `<b style="color:var(--ivory)">${escapeHtml(state.players.find(p => p.id === state.roundWinnerId)?.name || 'A player')}</b> reached ${state.target.toUpperCase()} in round ${state.round}.`;
  document.getElementById('resultLadder').innerHTML = state.history.map(word => `<span>${word.toUpperCase()}</span>`).join('');
  document.getElementById('roundScores').innerHTML = [...state.players].sort((a, b) => b.score - a.score).map((player, i) => `<div class="score-row"><span>${player.avatar} ${escapeHtml(player.name)}${player.id === state.roundWinnerId ? ' · round winner' : ''}</span><b ${i === 0 ? 'style="color:var(--gold)"' : ''}>${player.score}</b></div>`).join('');
  const next = document.getElementById('nextButton');
  next.textContent = state.round >= state.rounds ? 'Match complete' : 'Next round →';
  next.disabled = state.round >= state.rounds || !(state.you.canControl ?? state.you.isHost);
}

function renderVictory() {
  const summary=state.summary?.length?state.summary:state.players;
  const champion = summary.find(player => player.id === state.championId);
  const champions = (state.championIds || [state.championId]).map(id => summary.find(player => player.id === id)?.name).filter(Boolean);
  document.getElementById('championName').textContent = state.championTeam === 'both' ? 'Both Teams' : state.championTeam ? `${state.championTeam.toUpperCase()} TEAM` : champions.length ? champions.join(' & ') : champion?.name || 'Champion';
  document.getElementById('finalScores').innerHTML = [...summary].sort((a, b) => b.score - a.score).map((player, i) => `<div class="score-row"><span>${['🥇', '🥈', '🥉', '✦'][i]} ${escapeHtml(player.name)}</span><b ${i === 0 ? 'style="color:var(--gold)"' : ''}>${player.score} pts</b></div>`).join('');
}

document.getElementById('keyboard').innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => `<button onclick="typeKey('${letter}')">${letter}</button>`).join('');
// Preserve mobile input focus so the submit button cannot move before click.
document.querySelector('.phone-input button').addEventListener('pointerdown', event => {
  if (document.activeElement === document.getElementById('answer')) event.preventDefault();
});
document.getElementById('answer').addEventListener('input', event => {
  if(!state?.current)return;
  const value=event.target.value.toLowerCase().replace(/[^a-z]/g,'');
  const changed=value.length===state.current.length?[...value].filter((c,i)=>c!==state.current[i]).length:99;
  if(changed<=1)event.target.value=value;
  else if(value.length===1)typeKey(value);
  else {event.target.value=state.current;setFeedback('Select one letter, then choose its replacement.');}
  updateDraftPreview();
});
document.getElementById('answer').addEventListener('keydown', event => { if (event.key === 'Enter') submitWord(); });
document.getElementById('joinCode').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 5); });
setInterval(paintClock, 250);
if (localStorage.getItem('wordshift.reduceMotion') === '1') { document.querySelector('.app').classList.add('reduced-motion'); document.querySelector('[aria-label="Reduce motion"]')?.classList.add('on'); }

const joinFromUrl = new URLSearchParams(location.search).get('join');
const hasSavedSession = loadSession();
if (joinFromUrl && (!hasSavedSession || room !== joinFromUrl.toUpperCase())) {
  document.getElementById('joinCode').value = joinFromUrl.toUpperCase().slice(0, 5);
  show('lobby');
} else if (hasSavedSession) {
  const restoringRoom = room, restoringToken = token;
  requestJson(`/api/rooms/${encodeURIComponent(room)}?token=${encodeURIComponent(token)}`).then(next => {
    if (room !== restoringRoom || token !== restoringToken) return;
    if (tvDisplay && !next.you?.isDisplay) {state=next;return returnToStart();}
    attachRoom(next);
    show(next.phase === 'playing' ? (next.you.isHost ? 'tv' : 'phone') : next.phase === 'paused' ? 'paused' : next.phase === 'roundResults' ? 'results' : next.phase === 'complete' ? 'victory' : next.phase === 'ended' ? 'ended' : 'lobby');
  }).catch(err => {
    if (room !== restoringRoom || token !== restoringToken) return;
    if (err.status === 404) forgetExpiredRoom('Your previous room is no longer available. Create or join a new room.');
    else setConnectionNotice('Could not reconnect. Check your Wi-Fi and reload to try again.');
  });
}

window.show = show;
window.backFromSettings = backFromSettings;
window.togglePreference = togglePreference;
window.chooseMode = chooseMode;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.copyJoinLink = copyJoinLink;
window.startOrReady = startOrReady;
window.beginRound = beginRound;
window.selectLetter = selectLetter;
window.typeKey = typeKey;
window.submitWord = submitWord;
window.nextRound = nextRound;
window.playAgain = playAgain;

function openMatchMenu() {
  menuReturnScreen = screens.find(screen=>screen.classList.contains('active'))?.id || 'home';
  document.getElementById('endMatchButton').disabled = !(state?.you?.canControl ?? state?.you?.isHost) || state.phase === 'ended';
  document.getElementById('menuMessage').textContent = '';
  refreshExtraViews();
  show('matchMenu');
}
function resumeMatch() {
  if(state?.phase==='paused')return show('paused');
  if(state?.phase==='ended')return show('ended');
  if(state?.phase==='complete')return show('victory');
  if(state?.phase==='roundResults')return show('results');
  show(menuReturnScreen==='matchMenu'?'home':menuReturnScreen);
}
function backFromHelp(){show(state?'matchMenu':'home');}
async function endMatch() {
  if(!(state?.you?.canControl ?? state?.you?.isHost) || requestBusy)return false;
  requestBusy=true;
  try {
    const next=await requestJson(`/api/rooms/${room}/end`,{method:'POST',body:JSON.stringify({version:state.version})});
    updateState(next);return true;
  } catch(error) {show('matchMenu');document.getElementById('menuMessage').textContent=error.message;return false;}
  finally {requestBusy=false;}
}
async function returnToStart() {
  // A host leaving stops the shared match; a guest only leaves their local view.
  if(requestBusy)return;
  if(state?.you?.isHost && state.phase!=='ended' && !await endMatch())return;
  if(state && !state.you?.isHost){
    try{await requestJson(`/api/rooms/${room}/leave`,{method:'POST',body:JSON.stringify({})});}
    catch(error){show('matchMenu');document.getElementById('menuMessage').textContent=error.message;return;}
  }
  if(stream)stream.close();stream=null;
  localStorage.removeItem(storageKey);
  room=token=state=null;previousPhase=null;localDeadline=0;
  document.getElementById('roomSetup').style.display='grid';
  document.getElementById('lobbyLayout').style.display='none';
  setConnectionNotice('');setRoomError('');
  history.replaceState(null,'',location.pathname+(new URLSearchParams(location.search).get('tv')==='1'?'?tv=1':''));
  show('home');
}
Object.assign(window,{openMatchMenu,resumeMatch,backFromHelp,endMatch,returnToStart});

if(tvDisplay) {
  document.querySelector('#roomSetup .setup-card h3').textContent='Create game';
  document.querySelector('#roomSetup .setup-card p').textContent='This TV displays the game. All players join on their phones by scanning the QR code.';
  document.querySelector('#roomSetup .setup-row button').textContent='Create game →';
  document.getElementById('roomSetup').appendChild(document.getElementById('roomError'));
}

function updateDraftPreview() {
  if(!state?.current)return;
  const input=document.getElementById('answer'),word=input.value.toLowerCase();
  const changes=word.length===state.current.length?[...word].filter((c,i)=>c!==state.current[i]).length:0;
  const ready=word.length===state.current.length && changes===1;
  document.getElementById('submitShift').disabled=!ready || !state.you?.isActive || reconnecting || requestBusy || (globalThis.WordShiftFun?.discussionRemaining() || 0)>0;
  input.classList.toggle('preview-ready',ready);
  document.getElementById('draftHint').textContent=ready?`${state.current.toUpperCase()} → ${word.toUpperCase()} · 1 letter changed`:'Select one letter, then choose its replacement.';
}
function refreshExtraViews() {
  const control=Boolean(state?.you?.canControl ?? state?.you?.isHost);
  document.getElementById('endMatchButton').disabled=!control || state?.phase==='ended';
  const pause=document.getElementById('pauseButton');pause.disabled=!control || !['playing','paused'].includes(state?.phase);pause.textContent=state?.phase==='paused'?'Resume game':'Pause game';
  if(document.getElementById('manage').classList.contains('active'))renderManagement();
  if(document.getElementById('summary').classList.contains('active'))renderSummary();
}
async function roomCommand(action,body={}) {
  if(!state || requestBusy)return false;
  requestBusy=true;
  try {const next=await requestJson(`/api/rooms/${room}/${action}`,{method:'POST',body:JSON.stringify({version:state.version,...body})});updateState(next);return true;}
  catch(error){for(const id of ['menuMessage','playerMessage'])document.getElementById(id).textContent=error.message;return false;}
  finally {requestBusy=false;updateDraftPreview();}
}
async function pauseOrResume(){return roomCommand(state?.phase==='paused'?'resume':'pause');}
function showPlayers(){managerKey='';renderManagement();show('manage');}
function renderManagement() {
  const players=state?.players || [],control=state?.you?.canControl;
  document.getElementById('leaveGameButton').hidden=!state?.you || Boolean(state.you.isHost);
  const key=JSON.stringify([players,state?.phase,state?.captainId,control]);if(key===managerKey)return;managerKey=key;
  document.getElementById('playerManager').innerHTML=players.length?players.map(p=>`<div class="manage-player"><div><b>${p.avatar} ${escapeHtml(p.name)}</b><small>${p.isBot?'Computer':p.connected?'Connected':'Disconnected · seat saved'}${p.id===state.captainId?' · Captain':''}</small></div><div class="row">${control && !p.isBot?`<button class="btn secondary small" data-id="${escapeHtml(p.id)}" data-command="captain" ${!state.displayOnly || !p.connected || p.id===state.captainId?'disabled':''}>Make captain</button><button class="btn secondary small" data-id="${escapeHtml(p.id)}" data-command="remove" ${p.connected || !['lobby','paused'].includes(state.phase) || p.id===state.hostId?'disabled':''}>Remove offline</button>`:''}</div></div>`).join(''):'<p>No players yet. Scan the QR code on the TV to join.</p>';
  document.querySelectorAll('#playerManager [data-command]').forEach(button=>button.onclick=()=>roomCommand(button.dataset.command,{playerId:button.dataset.id}));
}
function showSummary(){summaryReturn=document.querySelector('.screen.active')?.id || 'matchMenu';renderSummary();show('summary');}
function backFromSummary(){show(summaryReturn==='summary'?'matchMenu':summaryReturn);}
function renderSummary() {
  document.getElementById('summaryCards').innerHTML=(state?.summary || []).map(p=>{const attempts=p.valid+p.invalid,accuracy=attempts?Math.round(p.valid/attempts*100):0;return `<article class="stat-card"><h3>${p.avatar} ${escapeHtml(p.name)}${p.removed?' · Left':''} · ${p.score} pts</h3><div class="stat-values"><span><b>${p.valid}</b><small>Valid moves</small></span><span><b>${accuracy}%</b><small>Accuracy</small></span><span><b>${p.longestStreak}</b><small>Best streak</small></span><span><b>${p.roundWins}</b><small>Round wins</small></span><span><b>${p.timeouts}</b><small>Timeouts</small></span></div><div class="badge-row">${(p.badges || []).map(b=>`<span>${escapeHtml(b)}</span>`).join('')}</div></article>`;}).join('') || '<p>Play a round to see your match statistics here.</p>';
}
async function reconnectRoom() {
  if(!room || !token){if(!loadSession())return;}
  setConnectionNotice('Reconnecting to your saved seat…');
  try {const next=await requestJson(`/api/rooms/${room}`);attachRoom(next);}
  catch(error){if(error.status===404)forgetExpiredRoom('This seat is no longer available. Join another game.');else setConnectionNotice('Still offline. Check your internet and keep the TV app open, then retry.');}
}
function saveDisplaySettings() {
  const size=document.getElementById('textSize').value,margin=document.getElementById('screenMargin').value;
  localStorage.setItem('wordshift.textSize',size);localStorage.setItem('wordshift.screenMargin',margin);applyDisplaySettings();
}
function applyDisplaySettings() {
  const size=localStorage.getItem('wordshift.textSize')==='1.15'?'1.15':'1';
  const margin=['4','5','6'].includes(localStorage.getItem('wordshift.screenMargin'))?localStorage.getItem('wordshift.screenMargin'):'4';
  document.documentElement.style.setProperty('--text-scale',size);document.documentElement.classList.toggle('text-larger',size!=='1');
  document.documentElement.style.setProperty('--tv-inset-y',margin+'vh');document.documentElement.style.setProperty('--tv-inset-x',margin+'vw');
  document.getElementById('textSize').value=size;document.getElementById('screenMargin').value=margin;
}
function playStateSound(next) {
  const move=next.moves?.at(-1);
  if(move){const key=`${next.code}:${next.round}:${move.at}:${move.playerId}:${move.word}`;if(key!==lastSoundKey){lastSoundKey=key;if(move.valid)globalThis.WordShiftMusic?.effect(move.word===next.target?'target':'valid');}}
}
Object.assign(window,{pauseOrResume,showPlayers,showSummary,backFromSummary,reconnectRoom,saveDisplaySettings});
applyDisplaySettings();
