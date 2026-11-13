'use strict';

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
let selectedMode = 'classic';
let joinOrigin = location.origin;
let joinQrLink = '';
let networkAddressPending = false;
let networkAddressLoaded = false;
let reconnecting = false;
let reconnectProbe = false;

function show(id) {
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
  const modes = { 'Classic Multiplayer': 'classic', 'Head-to-Head': 'headToHead', 'Player vs Computer': 'computer', 'Team Battle': 'teams', 'Party Chaos': 'party' };
  window.selectedMode = modes[modeName] || 'classic';
  selectedMode = window.selectedMode;
  document.getElementById('botSettings').style.display = selectedMode === 'computer' ? 'block' : 'none';
  setRoomError('');
  show('lobby');
}

function setRoomError(message) {
  const node = document.getElementById('roomError');
  if (node) node.textContent = message || '';
}

function sessionHeaders() {
  return token ? { 'x-player-token': token } : {};
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
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
    const result = await requestJson('/api/rooms', { method: 'POST', body: JSON.stringify({ name, avatar: '🦊', mode: selectedMode, botDifficulty }) });
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
  const source = new EventSource(url);
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
  notice.textContent = message; notice.hidden = !message;
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
  if (state?.code === next.code && next.version < state.version) return;
  const oldPhase = state?.phase ?? previousPhase;
  state = next;
  room = next.code;
  localDeadline = Date.now() + (Number(next.secondsLeft || 0) * 1000);
  saveSession();
  if (next.phase === 'lobby') renderLobby();
  if (next.phase === 'playing') {
    renderGame();
    renderPhone();
    if (oldPhase !== 'playing') {
      if (next.you?.isHost) { updateIntro(); show('intro'); }
      else show('phone');
    }
  }
  if (next.phase === 'roundResults') { renderResults(); show('results'); }
  if (next.phase === 'complete') { renderVictory(); show('victory'); }
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
  if (state.you.isHost) {
    button.innerHTML = 'Start game <span>→</span>';
    button.disabled = state.players.filter(p => !p.isBot).length < state.minPlayers || !state.players.every(p => p.ready);
    document.getElementById('lobbyMessage').textContent = state.players.filter(p => !p.isBot).length < state.minPlayers ? `Invite at least ${state.minPlayers} human player${state.minPlayers === 1 ? '' : 's'}.` : state.players.every(p => p.ready) ? 'Everyone is ready.' : 'Waiting for every player to tap Ready.';
  } else {
    button.innerHTML = state.you.ready ? 'Ready ✓' : 'Tap when ready';
    button.disabled = false;
    document.getElementById('lobbyMessage').textContent = 'Tap Ready when you’re set. The host starts the match.';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderJoinCode() {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(joinOrigin).hostname);
  if (loopback) {
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
  document.getElementById('qrHelp').textContent = 'Same Wi-Fi · scan with your phone camera';
}

async function copyJoinLink() {
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(joinOrigin).hostname)) {
    document.getElementById('lobbyMessage').textContent = 'Open the game using its Same-Wi-Fi phone address before sharing.';
    return;
  }
  const link = WordShiftJoin.joinUrl(joinOrigin, state.code);
  try {
    await navigator.clipboard.writeText(link);
    document.getElementById('lobbyMessage').textContent = 'Join link copied. Send it to players on the same Wi‑Fi.';
  } catch {
    document.getElementById('lobbyMessage').textContent = `Open ${link} on your phone.`;
  }
}

async function startOrReady() {
  if (!state || requestBusy || reconnecting) return;
  requestBusy = true;
  try {
    if (state.you.isHost) {
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
  paintClock();
}

function paintClock() {
  if (!state || state.phase !== 'playing') return;
  const seconds = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000));
  document.getElementById('clock').textContent = seconds;
  document.getElementById('bigTimer').style.setProperty('--progress', `${(seconds / state.timerSeconds) * 100}%`);
  const phoneClock = document.getElementById('phoneClock');
  if (phoneClock) phoneClock.textContent = `${seconds}s`;
  const progress = document.getElementById('phoneProgress');
  if (progress) progress.style.width = `${(seconds / state.timerSeconds) * 100}%`;
}

function renderPhone() {
  if (!state || state.phase !== 'playing') return;
  const mine = state.you?.isActive;
  document.getElementById('phoneTurn').style.display = mine ? 'flex' : 'none';
  document.getElementById('phoneWait').style.display = mine ? 'none' : 'flex';
  if (mine) {
    document.querySelector('#phoneTurn .row span:last-child').textContent = `${state.you.name} · ${state.you.avatar}`;
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
  paintClock();
}

function selectLetter(index) { selectedLetter = index; renderPhone(); }
function typeKey(letter) {
  if (!state?.you?.isActive) return;
  const input = document.getElementById('answer');
  input.value = `${state.current.slice(0, selectedLetter)}${letter.toLowerCase()}${state.current.slice(selectedLetter + 1)}`;
}

async function submitWord() {
  if (!state?.you?.isActive || requestBusy || reconnecting) return;
  const input = document.getElementById('answer');
  const word = input.value.trim().toLowerCase();
  if (!word) { setFeedback('Enter a word to make your shift.'); return; }
  requestBusy = true;
  try {
    await requestJson(`/api/rooms/${room}/move`, { method: 'POST', body: JSON.stringify({ word, version: state.version }) });
    input.value = '';
    selectedLetter = 0;
  } catch (err) { setFeedback(err.message); }
  finally { requestBusy = false; }
}

function setFeedback(message) {
  const feedback = document.getElementById('feedback');
  feedback.textContent = message;
  feedback.style.color = 'var(--coral)';
}

async function nextRound() {
  if (!state?.you?.isHost || requestBusy || reconnecting) return;
  requestBusy = true;
  try { await requestJson(`/api/rooms/${room}/next`, { method: 'POST', body: JSON.stringify({ version: state.version }) }); }
  catch (err) { setFeedback(err.message); }
  finally { requestBusy = false; }
}

async function playAgain() {
  if (reconnecting || requestBusy) return;
  if (!state?.you?.isHost) { show('home'); return; }
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
  next.disabled = state.round >= state.rounds || !state.you.isHost;
}

function renderVictory() {
  const champion = state.players.find(player => player.id === state.championId);
  const champions = (state.championIds || [state.championId]).map(id => state.players.find(player => player.id === id)?.name).filter(Boolean);
  document.getElementById('championName').textContent = state.championTeam === 'both' ? 'Both Teams' : state.championTeam ? `${state.championTeam.toUpperCase()} TEAM` : champions.length ? champions.join(' & ') : champion?.name || 'Champion';
  document.getElementById('finalScores').innerHTML = [...state.players].sort((a, b) => b.score - a.score).map((player, i) => `<div class="score-row"><span>${['🥇', '🥈', '🥉', '✦'][i]} ${escapeHtml(player.name)}</span><b ${i === 0 ? 'style="color:var(--gold)"' : ''}>${player.score} pts</b></div>`).join('');
}

document.getElementById('keyboard').innerHTML = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map(letter => `<button onclick="typeKey('${letter}')">${letter}</button>`).join('');
// Preserve mobile input focus so the submit button cannot move before click.
document.querySelector('.phone-input button').addEventListener('pointerdown', event => {
  if (document.activeElement === document.getElementById('answer')) event.preventDefault();
});
document.getElementById('answer').addEventListener('input', event => { event.target.value = event.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8); });
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
    attachRoom(next);
    show(next.phase === 'playing' ? (next.you.isHost ? 'tv' : 'phone') : next.phase === 'roundResults' ? 'results' : next.phase === 'complete' ? 'victory' : 'lobby');
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
