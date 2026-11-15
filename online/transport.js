import {initializeApp} from 'firebase/app';
import {getAuth, signInAnonymously, connectAuthEmulator} from 'firebase/auth';
import {getDatabase, ref, set, get, update, remove, onValue, onChildAdded, onChildChanged, onDisconnect, runTransaction, connectDatabaseEmulator} from 'firebase/database';

const TTL = 2 * 60 * 60 * 1000;
const avatars = new Set(['🦊','🐸','🐯','🐼','🦁','🐨','🐙','🐧','🐻','🐰','🐵','🦄']);
const cleanName = value => String(value || '').normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().replace(/\s+/g,' ').slice(0,18);
const id = () => crypto.randomUUID();
const json = (status, body) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}});
const failure = (status, error) => ({status,body:{error}});
const tabId = sessionStorage.getItem('wordshift.online.tab') || id();
sessionStorage.setItem('wordshift.online.tab',tabId);
let app, auth, db, engine, rules, bootPromise, offset = 0, connected = false, host = null;
let queue = Promise.resolve(), hostGeneration = 0;
// Keep the five-character WORD SHIFT UI; the database uses a W-prefixed six-character key.
// These records use the existing SA Trivia transport schema, without editing its rules.
const path = code => `rooms/W${code}`;
const privatePath = code => `${path(code)}/inputs/${auth.currentUser.uid}/value`;
const responsePath = (code,uid) => `${path(code)}/feedback/${uid}`;
function profileWire(profile,requestId) { return {name:profile.name,avatar:profile.avatar,colour:requestId,team:{_alive:false},audience:false}; }
const now = () => Date.now() + offset;
function wireRoom(room) { const {used,...rest}=room; return JSON.parse(JSON.stringify({...rest,used:[...used]})); }
function restoreRoom(data) { return {...data,used:new Set(data.used || data.history || []),history:data.history || [],moves:data.moves || [],players:data.players || []}; }
function friendly(error) {
  if (/permission.denied/i.test(error?.code || error?.message || '')) return 'Online rooms are not enabled yet. Check that anonymous sign-in and the Firebase access rules are enabled.';
  return error?.message || 'Could not connect. Check your internet connection.';
}
async function boot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async()=>{
    const config=globalThis.WORD_SHIFT_FIREBASE;
    if (!config) throw Error('Online game configuration is missing.');
    app=initializeApp(config,'word-shift');auth=getAuth(app);db=getDatabase(app);
    if (config.emulators) {
      if (!['localhost','127.0.0.1'].includes(location.hostname)) throw Error('Emulators can only be used by local tests.');
      connectAuthEmulator(auth,`http://127.0.0.1:${config.emulators.auth}`,{disableWarnings:true});
      connectDatabaseEmulator(db,'127.0.0.1',config.emulators.database);
    }
    onValue(ref(db,'.info/serverTimeOffset'),snap=>{offset=snap.val() || 0;});
    onValue(ref(db,'.info/connected'),snap=>{connected=Boolean(snap.val());});
    await auth.authStateReady(); if (!auth.currentUser) await signInAnonymously(auth);
    const response=await fetch(new URL('data/words-en.json',document.baseURI));
    if (!response.ok) throw Error('The word dictionary could not be loaded. Reload to retry.');
    engine=globalThis.createWordShiftEngine(await response.json());
    rules=globalThis.WordShiftRules.createRules(engine,{now,isConnected:(_room,uid)=>Boolean(host?.presence[uid] && Object.values(host.presence[uid]).some(Boolean))});
  })();
  try { await bootPromise; } catch(error) { bootPromise=null; throw error; }
}
function view(state, uid=auth.currentUser.uid) {
  const next=JSON.parse(JSON.stringify(state));
  next.players ||= [];next.history ||= [];next.moves ||= [];next.championIds ||= [];
  const player=next.players.find(player=>player.id===uid);
  next.you=player ? {...player,isHost:uid===next.hostId,isActive:uid===next.activePlayerId} : null;
  next.secondsLeft=next.turnDeadline ? Math.max(0,Math.ceil((next.turnDeadline-now())/1000)) : 0;
  return next;
}
async function metadata(code) {
  const owner=await get(ref(db,path(code)+'/host'));
  if(!owner.exists())throw Object.assign(Error('Room not found. Check the code.'),{status:404});
  let saved;
  try {saved=(await get(ref(db,path(code)+'/state'))).val();}
  catch(error){if(/permission.denied/i.test(error.code || error.message || ''))throw Object.assign(Error('This room expired. Create a new room.'),{status:404});throw error;}
  if(!saved || saved.game!=='word-shift')throw Object.assign(Error('This is not a WORD SHIFT room.'),{status:404});
  if(saved.expiresAt<=now())throw Object.assign(Error('This room expired. Create a new room.'),{status:404});
  return {host:owner.val(),expiresAt:saved.expiresAt};
}
function checkpoint(room, ledger={}) {return {owner:tabId,room:wireRoom(room),ledger};}
function publicRoom(room) {
  return JSON.parse(JSON.stringify({...rules.publicState(room,null),game:'word-shift',turnDeadline:room.turnDeadline || null,expiresAt:room.lastActivityAt+TTL}));
}
async function claim(code) {
  const result=await runTransaction(ref(db,privatePath(code)+'/controller'),current=>{
    if (current && current.id!==tabId && now()-current.heartbeatAt<15_000) return;
    return {id:tabId,heartbeatAt:now()};
  },{applyLocally:false});
  if (!result.committed) throw Error('This room is already open in another TV tab. Use that tab, or close it and wait 15 seconds before reloading.');
}
async function startHost(code) {
  if (host?.code===code) return;
  stopHost();const generation=hostGeneration;await claim(code);
  if(generation!==hostGeneration)throw Error('Room connection was replaced.');
  const saved=(await get(ref(db,privatePath(code)+'/checkpoint'))).val();
  if(generation!==hostGeneration)throw Error('Room connection was replaced.');
  if (!saved?.room) throw Error('The saved room could not be restored.');
  const controller={code,room:restoreRoom(saved.room),ledger:saved.ledger || {},presence:{},cleanups:[],active:true,busy:false};
  host=controller;
  const member=snap=>{
    const profile=snap.val();if(!profile)return;
    controller.presence[snap.key]=typeof profile.team==='object'?profile.team:{};
    const translated={...profile,requestId:profile.colour};
    enqueue(async()=>{
      await joinMember(controller,snap.key,translated);
      if(host===controller)await publish();
    }).catch(()=>{});
  };
  const input=snap=>{
    const envelope=snap.val();
    if(envelope?.type==='word-shift/input' && JSON.stringify(envelope).length<=2048) {
      const action={...envelope.value,id:envelope.id};
      enqueue(()=>processInput(controller,snap.key,action)).catch(()=>{});
    }
  };
  controller.cleanups.push(onChildAdded(ref(db,path(code)+'/members'),member),onChildChanged(ref(db,path(code)+'/members'),member),onChildAdded(ref(db,path(code)+'/inputs'),input),onChildChanged(ref(db,path(code)+'/inputs'),input));
  controller.timer=setInterval(()=>{
    if(host!==controller || !connected || controller.busy)return;
    controller.busy=true;
    enqueue(async()=>{
      if(host!==controller)return;
      const room=controller.room;
      if(now()-room.lastActivityAt>=TTL) {await remove(ref(db,path(code)));stopHost();return;}
      if(room.phase!=='playing')return;
      if(now()>=room.turnDeadline){rules.applyTimeout(room);await publish();return;}
      const player=rules.activePlayer(room);
      const due=room.turnDeadline-room.puzzle.timerSeconds*1000+(engine.BOT_DELAY_MS[player?.difficulty] || 1100);
      if(player?.isBot && now()>=due) {
        const word=engine.chooseAIMove(room.current,room.puzzle.target,room.used,player.difficulty);
        if(word)rules.acceptMove(room,player,word);else rules.applyTimeout(room);
        await publish();
      }
    }).catch(()=>{}).finally(()=>{controller.busy=false;});
  },250);
  controller.heartbeat=setInterval(async()=>{
    if(host!==controller || !connected)return;
    try {
      const result=await runTransaction(ref(db,privatePath(code)+'/controller'),current=>current?.id===tabId?{id:tabId,heartbeatAt:now()}:undefined,{applyLocally:false});
      if(!result.committed)stopHost();
    } catch { /* Firebase will reconnect; no host writes run while offline. */ }
  },5000);
  await publish();
}
function stopHost() {
  hostGeneration++;
  if(!host)return;const old=host;host=null;old.active=false;
  clearInterval(old.timer);clearInterval(old.heartbeat);old.cleanups.forEach(cleanup=>cleanup());
}
function enqueue(work) {const task=queue.then(work);queue=task.catch(()=>{});return task;}
async function publish(uid, response) {
  if(!host || !connected)throw Error('Connection lost. Reconnect before playing.');
  const lease=(await get(ref(db,privatePath(host.code)+'/controller'))).val();
  if(lease?.id!==tabId){stopHost();throw Error('This room is now controlled by another TV tab.');}
  const updates={state:publicRoom(host.room),[`inputs/${auth.currentUser.uid}/value/checkpoint`]:checkpoint(host.room,host.ledger),expiresAt:host.room.lastActivityAt+TTL};
  if(uid && response)updates[`feedback/${uid}`]=response;
  await update(ref(db,path(host.code)),updates);
}
function remembered(controller,uid,requestId) {return (controller.ledger[uid] || []).find(item=>item.id===requestId);}
function remember(controller,uid,response) {controller.ledger[uid]=[...(controller.ledger[uid] || []),{id:response.id,status:response.status,error:response.error || null}].slice(-32);}
async function respond(controller,uid,requestId,result) {
  if(host!==controller)return;
  const response={id:requestId,status:result.status,error:result.body.error || null};
  remember(controller,uid,response);await publish(uid,response);
}
async function joinMember(controller,uid,profile) {
  if(host!==controller)return;
  const room=controller.room, requestId=profile.requestId;
  if(remembered(controller,uid,requestId))return;
  const existing=room.players.find(player=>player.id===uid);
  if(existing) {await respond(controller,uid,requestId,{status:200,body:{}});return;}
  const mode=globalThis.WordShiftRules.MODES[room.mode];
  let error=null;
  const name=cleanName(profile.name);
  if(room.phase!=='lobby')error='This match has already started.';
  else if(room.players.filter(player=>!player.isBot).length>=mode.max)error='This room is full.';
  else if(!name)error='Enter a nickname first.';
  else if(room.players.some(player=>player.name.toLowerCase()===name.toLowerCase()))error='That nickname is already in this room.';
  if(error) {await respond(controller,uid,requestId,failure(409,error));return;}
  room.players.push({id:uid,name,avatar:avatars.has(profile.avatar)?profile.avatar:'🐸',score:0,ready:false,roundWins:0,team:room.mode==='teams'?(room.players.length%2?'red':'blue'):null});
  room.lastActivityAt=now();room.lastMessage=`${name} joined the room.`;rules.touch(room);
  await respond(controller,uid,requestId,{status:201,body:{}});
}
async function processInput(controller,uid,input) {
  if(host!==controller)return failure(503,'The TV host is not connected.');
  const player=controller.room.players.find(player=>player.id===uid);
  if(!player)return failure(403,'Join the room before playing.');
  const previous=remembered(controller,uid,input.id);
  if(previous){await publish(uid,previous);return {status:previous.status,body:{error:previous.error,state:rules.publicState(controller.room,player)}};}
  controller.room.lastActivityAt=now();
  const result=rules.action(controller.room,player,input.action,input);
  await respond(controller,uid,input.id,result);return result;
}
async function waitResponse(code,requestId,write) {
  return new Promise((resolve,reject)=>{
    let done=false,unsubscribe=()=>{};
    const timer=setTimeout(()=>finish(Error('The TV is not responding. Keep the TV app open, then retry.')),12_000);
    function finish(error,value){if(done)return;done=true;clearTimeout(timer);unsubscribe();error?reject(error):resolve(value);}
    unsubscribe=onValue(ref(db,responsePath(code,auth.currentUser.uid)),snap=>{if(snap.val()?.id===requestId)finish(null,snap.val());},error=>finish(error));
    write().catch(error=>finish(error));
  });
}
async function request(url,options={}) {
  try {
    await boot();const parsed=new URL(url,location.href),p=parsed.pathname;
    const body=JSON.parse(options.body || '{}'),uid=auth.currentUser.uid;
    if(p==='/api/join-origins')return json(200,{origins:[new URL('.',location.href).href]});
    if(p==='/api/rooms' && options.method==='POST') {
      stopHost();const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for(let attempt=0;attempt<8;attempt++) {
        const code=Array.from(crypto.getRandomValues(new Uint8Array(5)),n=>alphabet[n%alphabet.length]).join('');
        const room=rules.makeRoom({code,mode:body.mode,hostId:uid,name:cleanName(body.name)||'Host',avatar:avatars.has(body.avatar)?body.avatar:'🦊',difficulty:Object.hasOwn(engine.BOT_DELAY_MS,body.botDifficulty)?body.botDifficulty:'Quick Thinker'});
        try {
          if((await get(ref(db,path(code)+'/host'))).exists())continue;
          await set(ref(db,path(code)),{host:uid,createdAt:now(),expiresAt:now()+TTL,state:publicRoom(room),members:{[uid]:profileWire({name:room.players[0].name,avatar:room.players[0].avatar},'host')},inputs:{[uid]:{id:'host',type:'word-shift/checkpoint',value:{checkpoint:checkpoint(room),controller:{id:tabId,heartbeatAt:now()}}}}});
          await startHost(code);
          return json(201,{state:view(publicRoom(host.room)),token:uid});
        } catch(error) {if(attempt===7)throw error;}
      }
    }
    const match=p.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{5})(?:\/(join|ready|start|move|next|restart|end))?$/);
    if(!match)return json(404,{error:'Not found.'});
    const code=match[1],action=match[2],meta=await metadata(code);
    if(!action) {
      const state=(await get(ref(db,path(code)+'/state'))).val();
      const result=view(state);
      if(!result.you)return json(404,{error:'Player session not found. Join this room again.'});
      return json(200,result);
    }
    if(action==='join') {
      const existing=view((await get(ref(db,path(code)+'/state'))).val());
      if(existing.you)return json(200,{state:existing,token:uid});
      const requestId=id(),name=cleanName(body.name);
      if(!name)return json(400,{error:'Enter a nickname first.'});
      const result=await waitResponse(code,requestId,()=>set(ref(db,path(code)+'/members/'+uid),profileWire({name,avatar:avatars.has(body.avatar)?body.avatar:'🐸'},requestId)));
      if(result.status>=400)return json(result.status,{error:result.error});
      return json(result.status,{state:view((await get(ref(db,path(code)+'/state'))).val()),token:uid});
    }
    const input={id:id(),action,version:body.version ?? -1,...(action==='move'?{word:String(body.word || '').slice(0,8)}:{}),...(action==='ready'?{ready:Boolean(body.ready)}:{})};
    let result;
    if(meta.host===uid) {
      if(!host || host.code!==code)await startHost(code);
      result=await enqueue(()=>processInput(host,uid,input));
      return json(result.status,result.body);
    }
    result=await waitResponse(code,input.id,()=>set(ref(db,path(code)+'/inputs/'+uid),{id:input.id,type:'word-shift/input',value:input}));
    const state=view((await get(ref(db,path(code)+'/state'))).val());
    return json(result.status,result.status>=400?{error:result.error,state}:state);
  } catch(error) {return json(error.status || 503,{error:friendly(error)});}
}
function events(code) {
  const source=new EventTarget();source.readyState=0;let closed=false,currentExpiry=0;const cleanups=[];
  source.close=()=>{if(closed)return;closed=true;source.readyState=2;cleanups.forEach(cleanup=>cleanup());if(host?.code===code)stopHost();};
  const emit=(name,data)=>{if(!closed)source.dispatchEvent(new MessageEvent(name,{data:JSON.stringify(data)}));};
  const fail=error=>{if(closed)return;source.readyState=2;source.onerror?.(error);};
  (async()=>{
    await boot();if(closed)return;
    const uid=auth.currentUser.uid,meta=await metadata(code);currentExpiry=meta.expiresAt;
    if(meta.host===uid)await startHost(code);
    if(closed)return;
    const presence=ref(db,`${path(code)}/members/${uid}/team/${tabId}`);
    cleanups.push(()=>{remove(presence).catch(()=>{});});
    cleanups.push(onValue(ref(db,'.info/connected'),async snap=>{
      if(closed)return;
      if(!snap.val()){source.readyState=0;source.onerror?.(Error('offline'));return;}
      try {
        await onDisconnect(presence).remove();await set(presence,true);if(closed)return;source.readyState=1;
        const latest=await get(ref(db,path(code)+'/state'));
        if(latest.exists()){currentExpiry=latest.val().expiresAt;emit('state',view(latest.val()));}
      }catch(error){if(currentExpiry<=now())emit('expired',{message:'This room expired. Create a new room.'});else fail(error);}
    }));
    cleanups.push(onValue(ref(db,path(code)+'/state'),snap=>{
      if(closed)return;
      if(!snap.exists()){emit('expired',{message:'This room is no longer available. Create a new room.'});source.close();return;}
      currentExpiry=snap.val().expiresAt;
      if(connected){source.readyState=1;emit('state',view(snap.val()));}
    },error=>{if(currentExpiry<=now())emit('expired',{message:'This room expired. Create a new room.'});else fail(error);}));
  })().catch(error=>{if(error.status===404)emit('expired',{message:error.message});else fail(error);});
  return source;
}
async function closeOwnedRoom(code) {
  await boot();const meta=await metadata(code);
  if(meta.host!==auth.currentUser.uid)throw Error('Only this room host can close it.');
  stopHost();await remove(ref(db,path(code)));
}
globalThis.WordShiftOnline={enabled:true,request,events,serverNow:now,closeOwnedRoom};
