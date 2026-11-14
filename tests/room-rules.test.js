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
  for(const [mode,definition] of Object.entries(MODES)) {
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
