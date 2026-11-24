'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../game-engine');
const {createRules,MODES}=require('../room-rules');

test('shared TV host rules preserve one-letter validation, turn passing and unused words',()=>{
  let now=100000;const rules=createRules(engine,{now:()=>now});
  const room=rules.makeRoom({code:'ABCDE',hostId:'host'});
  room.players.push({id:'guest',name:'Guest',score:0,ready:true,roundWins:0});
  assert.equal(rules.action(room,room.players[0],'start',{}).status,200);
  let result=rules.action(room,room.players[0],'move',{word:'dots',version:room.version});assert.equal(result.status,200);
  assert.equal(room.activeIndex,1);assert.equal(room.current,'dots');
  result=rules.action(room,room.players[1],'move',{word:'dogs',version:room.version});assert.equal(result.status,422);assert.match(result.body.error,/already been used/);
  assert.equal(room.activeIndex,0);assert.equal(room.current,'dots');
  result=rules.action(room,room.players[0],'move',{word:'zzzz',version:room.version});assert.equal(result.status,422);assert.equal(room.activeIndex,1);
  const version=room.version;result=rules.action(room,room.players[1],'move',{word:'cots',version:version-1});assert.equal(result.status,409);assert.equal(room.activeIndex,1);
  now=room.turnDeadline+1;assert.equal(rules.action(room,room.players[1],'move',{word:'cots',version}).status,409);assert.equal(room.activeIndex,0);
});

test('all five modes have identical TV-host rules for readiness, round rotation and room size',()=>{
  for(const [mode,definition] of Object.entries(MODES).filter(([mode])=>mode!=='daily')) {
    const rules=createRules(engine);const room=rules.makeRoom({code:'ABCDE',hostId:'host',mode});
    for(let i=1;i<definition.min;i++)room.players.push({id:'guest'+i,name:'Guest '+i,score:0,ready:true,roundWins:0,team:mode==='teams'?(i%2?'red':'blue'):null});
    assert.equal(rules.action(room,room.players[0],'start',{}).status,200,mode);
    for(const word of ['dots','cots','cats']) {
      const player=rules.activePlayer(room);
      assert.equal(rules.action(room,player,'move',{word,version:room.version}).status,200,mode);
    }
    assert.equal(room.phase,'roundResults',mode);
    assert.equal(rules.action(room,room.players[0],'next',{version:room.version}).status,200,mode);
    assert.equal(room.round,2);assert.equal(room.activeIndex,1);assert.equal(room.rounds,definition.rounds);
  }
});

test('round move counters count only legal shifts, survive log limits and reset next round',()=>{
  const rules=createRules(engine),room=rules.makeRoom({code:'ABCDE',hostId:'host'});
  room.players.push({id:'guest',name:'Guest',score:0,ready:true,roundWins:0});
  rules.action(room,room.players[0],'start');
  assert.equal(rules.action(room,room.players[0],'move',{word:'cats',version:room.version}).status,422,'two-letter change rejected');
  assert.equal(rules.publicState(room,null).totalMoves,0);
  for(const word of ['dots','cots','cats'])assert.equal(rules.action(room,rules.activePlayer(room),'move',{word,version:room.version}).status,200);
  assert.equal(rules.publicState(room,null).totalMoves,3);
  assert.equal(room.moveCounts.guest,2);assert.equal(room.moveCounts.host,1);
  rules.action(room,room.players[0],'next');assert.equal(rules.publicState(room,null).totalMoves,0);
});

test('only host can end a match; all later moves stop and the deadline is cleared',()=>{
  const rules=createRules(engine),room=rules.makeRoom({code:'ABCDE',hostId:'host'});
  room.players.push({id:'guest',name:'Guest',score:0,ready:true,roundWins:0});
  rules.action(room,room.players[0],'start');
  assert.equal(rules.action(room,room.players[1],'end',{version:room.version}).status,403);
  assert.equal(rules.action(room,room.players[0],'end',{version:room.version-1}).status,200,'ending remains safe when a bot move races the menu click');
  assert.equal(rules.action(room,room.players[0],'end',{version:room.version}).status,200,'ending is idempotent');
  assert.equal(room.phase,'ended');assert.equal(room.turnDeadline,null);
  assert.equal(rules.action(room,room.players[0],'move',{word:'dots',version:room.version}).status,409);
});

test('TV display takes no seat or turn in all modes; first human phone can control the match',()=>{
 for(const [mode,config] of Object.entries(MODES).filter(([mode])=>mode!=='daily')){
  const rules=createRules(engine),room=rules.makeRoom({code:'ABCDE',hostId:'tv',mode,displayOnly:true});
  assert.equal(room.players.filter(p=>!p.isBot).length,0);
  assert.equal(rules.action(room,room.display,'start').status,409,'cannot start before phones join');
  for(let i=0;i<config.min;i++)room.players.splice(i,0,{id:'phone'+i,name:'Phone '+i,score:0,ready:true,roundWins:0,team:mode==='teams'?(i%2?'red':'blue'):null});
  const state=rules.publicState(room,room.display);assert.equal(state.you.isDisplay,true);assert.equal(state.you.canControl,true);
  assert.equal(state.captainId,'phone0');assert.equal(state.players.some(p=>p.id==='tv'),false);
  assert.equal(rules.publicState(room,room.players[0]).you.canControl,true);
  if(config.min>1)assert.equal(rules.action(room,room.players[1],'start').status,403);
  room.players[0].ready=false;assert.equal(rules.action(room,room.display,'start').status,409);room.players[0].ready=true;
  assert.equal(rules.action(room,room.players[0],'start').status,200);
  assert.equal(rules.activePlayer(room).id,'phone0');
  assert.equal(rules.action(room,room.display,'move',{word:'dots',version:room.version}).status,403);
  assert.equal(rules.action(room,room.players[0],'move',{word:'dots',version:room.version}).status,200);
  assert.notEqual(rules.activePlayer(room).id,'tv');
  for(const word of ['cots','cats'])assert.equal(rules.action(room,rules.activePlayer(room),'move',{word,version:room.version}).status,200);
  assert.equal(room.phase,'roundResults');
  assert.equal(rules.action(room,room.players[0],'next').status,200,'phone captain can advance rounds');
  assert.equal(room.round,2);
  assert.equal(rules.action(room,room.display,'end').status,200);
 }
});
