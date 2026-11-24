'use strict';
// Party features sit on top of the existing client and authoritative room rules.
(() => {
  const categories={all:'Any category',animals:'Animals',food:'Food',nature:'Nature',sport:'Sport',everyday:'Everyday words'};
  const packs={original:'Classic sequence',beginner:'Beginner',intermediate:'Intermediate',expert:'Expert',mixed:'Mixed'};
  let voteReturn='lobby',replayReturn='results',recordsReturn='home',voteFormKey='',recordError='',previousTalk=0;
  const recordKey='wordshift.personalRecords.v1';
  const clean=value=>escapeHtml(value ?? '');
  const serverTime=()=>globalThis.WordShiftOnline?.serverNow?.() || Date.now();
  function discussionRemaining(){if(!state || state.phase!=='playing')return 0;return Math.max(0,Math.ceil(((state.turnBeginsAt || 0)-serverTime())/1000));}
  function displayedTarget(){if(!state)return '';return state.targetHidden || (state.chaosEvent==='memory' && state.phase==='playing' && state.targetRevealUntil && serverTime()>=state.targetRevealUntil)?'?'.repeat(state.current.length):state.target;}
  function updateSetupOptions(){
    const daily=selectedMode==='daily',custom=!daily && document.getElementById('puzzleSource').value==='custom';
    if(daily){document.getElementById('puzzleSource').value='pack';document.getElementById('puzzlePack').value='mixed';document.getElementById('category').value='all';}
    document.getElementById('matchFormat').options[0].textContent=daily?'Daily · 1 round':custom?'Custom · 1 round':'Standard';if(daily || custom)document.getElementById('matchFormat').value='standard';
    document.getElementById('puzzleSource').disabled=daily;
    for(const id of ['category','puzzlePack','matchFormat'])document.getElementById(id).disabled=daily || custom;
    document.getElementById('customFields').hidden=!custom;document.getElementById('dailyNotice').hidden=!daily;
    document.getElementById('teamTalkOption').hidden=selectedMode!=='teams';document.getElementById('teamDiscussion').disabled=selectedMode!=='teams';
  }
  function setupBody(){return {category:document.getElementById('category').value,matchFormat:document.getElementById('matchFormat').value,teamDiscussion:document.getElementById('teamDiscussion').checked && selectedMode==='teams',puzzleSource:document.getElementById('puzzleSource').value,customStart:document.getElementById('customStart').value,customTarget:document.getElementById('customTarget').value};}
  function renderHints(){
    const own=state?.you,active=Boolean(own?.isActive && !own.isDisplay && state.phase==='playing'),remaining=own?.hintsRemaining ?? Math.max(0,3-(own?.hintsSpent || 0));
    document.getElementById('hintControls').hidden=!active;
    document.getElementById('hintBudget').textContent=`${remaining} hint ${remaining===1?'point':'points'}`;
    document.getElementById('letterHintButton').disabled=!active || remaining<1 || requestBusy || reconnecting || discussionRemaining()>0;
    document.getElementById('wordHintButton').disabled=!active || remaining<2 || requestBusy || reconnecting || discussionRemaining()>0;
    document.querySelectorAll('#letterPick button').forEach((button,index)=>button.classList.toggle('hinted',active && own?.hint?.index===index));
    if(active && own.hint){document.getElementById('feedback').textContent=own.hint.word?`Hint: try ${own.hint.word.toUpperCase()}. Submit it to use your turn.`:`Hint: change letter ${own.hint.index+1}. Choose its replacement.`;document.getElementById('feedback').style.color='var(--gold)';}
  }
  async function useHint(hintType){
    if(!state || requestBusy || reconnecting || !state.you?.isActive || state.you.isDisplay)return;
    requestBusy=true;renderHints();updateDraftPreview();
    try{const next=await requestJson(`/api/rooms/${room}/hint`,{method:'POST',body:JSON.stringify({hintType,version:state.version})});updateState(next);}
    catch(error){setFeedback(error.message);}
    finally{requestBusy=false;renderHints();updateDraftPreview();}
  }
  function clock(){
    if(!state || state.phase!=='playing')return;
    const talk=discussionRemaining(),hidden=displayedTarget(),targetNode=document.querySelector('#tv .endpoint.target .word');
    if(targetNode.textContent!==hidden.toUpperCase()){targetNode.textContent=hidden.toUpperCase();document.getElementById('tiles').innerHTML=letterTiles(state.current,hidden);}
    document.querySelector('#phoneTurn .phone-target b').textContent=hidden.toUpperCase();
    let note=talk?`TEAM HUDDLE · ${talk}s · discuss before the turn clock starts`:state.chaosEvent==='memory'?(hidden.includes('?')?'MEMORY ROUND · remember the hidden target':'MEMORY ROUND · memorise the target now'):state.chaosEvent==='double'?'DOUBLE POINTS · one letter per turn':state.dailyDate?`DAILY CHALLENGE · ${state.dailyDate} UTC`:state.rivalry || '';
    const node=document.getElementById('phoneEvent');node.textContent=note;node.hidden=!note;
    if(talk){document.getElementById('clock').textContent=talk;document.getElementById('bigTimer').querySelector('small').textContent='HUDDLE';document.getElementById('phoneClock').textContent=`Talk ${talk}s`;document.getElementById('phoneProgress').style.width='100%';document.getElementById('bigTimer').style.setProperty('--progress','100%');}else document.getElementById('bigTimer').querySelector('small').textContent='SECONDS';
    if(talk)document.getElementById('submitShift').disabled=true;else if(previousTalk>0)updateDraftPreview();previousTalk=talk;
    renderHints();
  }
  function renderVotes(){
    const enabled=Boolean(state && ['lobby','roundResults'].includes(state.phase) && !['daily','custom'].includes(state.matchFormat));
    const key=state?`${state.code}:${state.round}:${state.phase}`:'none';
    if(voteFormKey!==key){voteFormKey=key;document.getElementById('voteCategory').value=state?.votes?.[state.you?.id]?.category || state?.category || 'all';document.getElementById('votePack').value=state?.votes?.[state.you?.id]?.pack || state?.puzzlePack || 'original';}
    const button=document.getElementById('voteButton');button.disabled=!enabled || state.you?.isDisplay || requestBusy;button.textContent=state?.you?.isDisplay?'Players vote on phones':'Send vote';
    for(const id of ['voteCategory','votePack'])document.getElementById(id).disabled=!enabled || state?.you?.isDisplay;
    document.getElementById('voteHelp').textContent=enabled?'Vote for the next puzzle. The TV or captain starts/advances when the crew is ready.':'Voting opens in the lobby or between regular rounds. Daily and custom puzzles stay fixed.';
    document.getElementById('voteTally').innerHTML=(state?.players || []).filter(p=>!p.isBot).map(p=>{const vote=state.votes?.[p.id];return `<div class="vote-row"><b>${clean(p.name)}</b><small>${vote?`${clean(categories[vote.category])} · ${clean(packs[vote.pack])}`:'Not voted yet'}</small></div>`;}).join('') || '<p>No phone players yet.</p>';
  }
  function showVoting(){voteReturn=document.querySelector('.screen.active')?.id || 'lobby';document.getElementById('voteMessage').textContent='';renderVotes();show('voting');}
  function backFromVoting(){show(voteReturn==='voting'?'lobby':voteReturn);}
  async function submitVote(){
    if(!state || requestBusy || state.you?.isDisplay)return;requestBusy=true;renderVotes();
    try{const next=await requestJson(`/api/rooms/${room}/vote`,{method:'POST',body:JSON.stringify({version:state.version,category:document.getElementById('voteCategory').value,pack:document.getElementById('votePack').value})});updateState(next);document.getElementById('voteMessage').textContent='Vote saved. You can change it before the next round.';}
    catch(error){document.getElementById('voteMessage').textContent=error.message;}
    finally{requestBusy=false;renderVotes();}
  }
  function showReplay(){replayReturn=document.querySelector('.screen.active')?.id || 'results';renderReplay();show('replay');}
  function backFromReplay(){show(replayReturn==='replay'?'results':replayReturn);}
  function renderReplay(){
    const replay=state?.replay;
    const chips=words=>(words || []).map(w=>`<span>${clean(w.toUpperCase())}</span>`).join('');
    document.getElementById('playedReplay').innerHTML=chips(replay?.played);document.getElementById('shortestReplay').innerHTML=chips(replay?.route);
    document.getElementById('replayMetrics').textContent=replay?`${replay.moves} valid moves · shortest ${replay.shortestMoves} · ${Number.isFinite(replay.elapsedMs)?(replay.elapsedMs/1000).toFixed(1)+' seconds':'time not tracked'}${replay.resets?` · ${replay.resets} ladder reset(s)`:''}`:'Finish a round to reveal its shortest route.';
  }
  function readRecords(){try{const data=JSON.parse(localStorage.getItem(recordKey) || '{"entries":{},"seen":[]}');return data?.entries && Array.isArray(data.seen)?data:{entries:{},seen:[]};}catch{return {entries:{},seen:[]};}}
  function recordContext(next){return `${next.mode}:${next.matchFormat || 'standard'}:${next.variedPuzzles?'voted-mix':next.puzzlePack || 'original'}:${next.variedPuzzles?'voted-categories':next.category || 'all'}:${next.teamDiscussion?'talk':'normal'}:${next.dailyDate || (next.matchFormat==='custom'?next.start+'-'+next.target:'')}`;}
  function saveRecords(next){
    if(next.phase!=='complete' || next.you?.isDisplay)return;
    const own=next.summary?.find(p=>p.id===next.you?.id);if(!own || own.valid<1)return;
    const data=readRecords(),match=`${next.matchId || next.code}:${next.you.id}`;if(data.seen.includes(match))return;
    const key=recordContext(next),old=data.entries[key] || {games:0,bestScore:0,badges:[],mode:next.modeName,pack:next.variedPuzzles?'Voted difficulties':packs[next.puzzlePack] || 'Classic',category:next.variedPuzzles?'Voted categories':next.categoryName || 'Any category',format:next.matchFormat || 'standard',date:next.dailyDate || null,ladder:next.matchFormat==='custom'?`${next.start.toUpperCase()} → ${next.target.toUpperCase()}`:null};
    old.games++;old.bestScore=Math.max(old.bestScore,own.score);old.fastestTargetMs=own.fastestTargetMs?Math.min(old.fastestTargetMs || Infinity,own.fastestTargetMs):old.fastestTargetMs || null;old.fewestMoves=own.fewestTargetMoves?Math.min(old.fewestMoves || Infinity,own.fewestTargetMoves):old.fewestMoves || null;old.badges=[...new Set([...old.badges,...(own.badges || [])])];old.updatedAt=Date.now();
    if(next.dailyDate){const run={moves:own.valid,hints:own.hintsSpent || 0,ms:own.fastestTargetMs || next.replay?.elapsedMs || 0},prior=old.dailyBest;const better=!prior || (run.hints===0 && prior.hints>0) || ((run.hints===0)===(prior.hints===0) && (run.moves<prior.moves || run.moves===prior.moves && run.ms<prior.ms));if(better)old.dailyBest=run;}
    data.entries[key]=old;data.seen=[...data.seen,match].slice(-160);
    const entries=Object.entries(data.entries).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,80);data.entries=Object.fromEntries(entries);
    try{localStorage.setItem(recordKey,JSON.stringify(data));recordError='';}catch{recordError='This browser could not save records. Enable local storage to keep personal bests.';}
  }
  function renderRecords(){
    const entries=Object.values(readRecords().entries).sort((a,b)=>b.updatedAt-a.updatedAt);
    document.getElementById('recordList').innerHTML=entries.map(e=>`<article class="stat-card"><h3>${clean(e.mode)}${e.date?` · ${clean(e.date)} UTC`:''}</h3><div class="setup-note">${clean(e.ladder || e.category)} · ${clean(e.pack)} · ${clean(e.format)}</div><div class="record-detail">Best match: <b>${e.bestScore} pts</b><br>Fastest target: <b>${e.fastestTargetMs?(e.fastestTargetMs/1000).toFixed(1)+'s':'—'}</b><br>Fewest ladder moves in a won round: <b>${e.fewestMoves || '—'}</b>${e.dailyBest?`<br>Daily best: <b>${e.dailyBest.moves} moves · ${(e.dailyBest.ms/1000).toFixed(1)}s · ${e.dailyBest.hints?'assisted':'no hints'}</b>`:''}</div><div class="badge-row">${(e.badges || []).map(b=>`<span>${clean(b)}</span>`).join('')}</div></article>`).join('') || `<p>${clean(recordError || 'Complete a match on your phone to start collecting personal bests and badges here.')}</p>`;
  }
  function showRecords(){recordsReturn=document.querySelector('.screen.active')?.id || 'home';renderRecords();show('records');}
  function backFromRecords(){show(recordsReturn==='records'?'home':recordsReturn);}
  function update(next){
    renderHints();
    if(next.phase==='lobby'){
      document.querySelectorAll('.lobby-options .option b')[2].textContent=(next.mode==='party'?'15–25s':['daily','custom'].includes(next.matchFormat)?'45s':next.matchFormat==='quick'?'25s':next.puzzlePack==='original'?'15–40s':next.puzzlePack==='intermediate'?'35s':'45s')+(next.teamDiscussion?' + 10s talk':'');document.querySelectorAll('.lobby-options .option b')[0].textContent=packs[next.puzzlePack] || 'Classic';document.querySelectorAll('.lobby-options .option b')[3].textContent=next.categoryName || 'Any category';document.getElementById('lobbyFooterCode').textContent=next.dailyDate?`Daily · ${next.dailyDate} UTC`:`ROOM ${next.code}`;
    }
    for(const id of ['tvRivalry','roundRivalry']){const node=document.getElementById(id),note=[next.category && next.category!=='all'?next.categoryName:null,next.rivalry].filter(Boolean).join(' · ');node.textContent=note;node.hidden=!note;}
    if(next.phase==='roundResults' && next.replay?.winnerName)document.getElementById('roundSummary').innerHTML=`<b>${clean(next.replay.winnerName)}</b> reached <span class="winning-word">${clean(next.target.toUpperCase())}</span> · ${next.replay.moves} moves`;
    if(next.phase==='complete'){document.getElementById('victoryTarget').innerHTML=`Final word: <span class="winning-word">${clean((next.target || '').toUpperCase())}</span>${next.dailyDate?' · Daily challenge complete':''}`;saveRecords(next);}
    if(next.phase==='paused' && next.discussionSeconds)document.getElementById('pauseInfo').textContent+=` ${next.discussionSeconds} seconds of team huddle also saved.`;
    const screen=document.querySelector('.screen.active')?.id;
    if(screen==='voting')renderVotes();if(screen==='replay')renderReplay();if(screen==='records')renderRecords();
    clock();
  }
  globalThis.WordShiftFun={setupBody,update,phone:renderHints,clock,discussionRemaining,displayedTarget,saveRecords,readRecords};
  Object.assign(window,{updateSetupOptions,useHint,showVoting,backFromVoting,submitVote,showReplay,backFromReplay,showRecords,backFromRecords});
  if(new URLSearchParams(location.search).has('join'))document.documentElement.classList.add('join-only');
  updateSetupOptions();if(state)update(state);
})();
