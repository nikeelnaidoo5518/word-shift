'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const engine=require('../game-engine');const {createRules}=require('../room-rules');
function fixture(mode='classic',count=3){let now=100000;const online=new Set(['a','b','c','d']);const rules=createRules(engine,{now:()=>now,isConnected:(_r,id)=>online.has(id)});const room=rules.makeRoom({code:'ABCDE',hostId:'tv',displayOnly:true,mode});for(let i=0;i<count;i++)room.players.splice(i,0,{id:'abcd'[i],name:'Phone '+i,score:0,ready:true,roundWins:0,team:mode==='teams'?(i%2?'red':'blue'):null});return {room,rules,online,setNow:v=>{now=v;}};}
test('pause preserves remaining time and turn across a long break; only controllers resume',()=>{
 const {room,rules,setNow}=fixture();rules.action(room,room.display,'start');const deadline=room.turnDeadline,active=rules.activePlayer(room).id;
 setNow(deadline-7500);assert.equal(rules.action(room,room.players[1],'pause').status,403);
 assert.equal(rules.action(room,room.display,'pause').status,200);assert.equal(room.turnDeadline,null);assert.equal(rules.publicState(room,room.display).secondsLeft,8);
 setNow(deadline+900000);rules.applyTimeout(room);assert.equal(room.moves.length,0);assert.equal(rules.action(room,room.players[0],'move',{word:'dots',version:room.version}).status,409);
 assert.equal(rules.action(room,room.players[1],'resume').status,403);assert.equal(rules.action(room,room.players[0],'resume').status,200);
 assert.equal(room.turnDeadline,deadline+907500);assert.equal(rules.activePlayer(room).id,active);
});
test('captain transfer is explicit, authorized and limited to connected human phones',()=>{
 const {room,rules,online}=fixture();assert.equal(rules.action(room,room.players[1],'captain',{playerId:'b'}).status,403);
 online.delete('b');assert.equal(rules.action(room,room.display,'captain',{playerId:'b'}).status,409);online.add('b');
 assert.equal(rules.action(room,room.players[0],'captain',{playerId:'b'}).status,200);assert.equal(rules.publicState(room,room.players[1]).you.canControl,true);assert.equal(rules.publicState(room,room.players[0]).you.canControl,false);
 rules.action(room,room.players[1],'leave');assert.equal(rules.publicState(room,room.display).captainId,'a');
});
test('disconnected removal requires a pause, preserves order/stats and never swaps team colours',()=>{
 const {room,rules,online}=fixture();rules.action(room,room.display,'start');assert.equal(rules.action(room,room.display,'remove',{playerId:'b',version:room.version}).status,409);
 rules.action(room,room.display,'pause');assert.equal(rules.action(room,room.display,'remove',{playerId:'b',version:room.version}).status,409);online.delete('b');
 assert.equal(rules.action(room,room.display,'remove',{playerId:'b',version:room.version}).status,200);assert.equal(room.phase,'paused');assert.deepEqual(room.players.map(p=>p.id),['a','c']);assert.equal(room.departed.b,'removed');
 assert.equal(rules.publicState(room,{id:'b'}).you,null);
 const team=fixture('teams',4);team.rules.action(team.room,team.room.display,'start');team.rules.action(team.room,team.room.players[0],'leave');assert.equal(team.room.phase,'ended');assert.equal(team.room.players[0].team,'red');
});
test('leaving the active seat continues at the next player or ends if below mode minimum',()=>{
 const {room,rules}=fixture();rules.action(room,room.display,'start');rules.action(room,room.players[0],'leave');assert.equal(rules.activePlayer(room).id,'b');assert.equal(room.phase,'playing');
 rules.action(room,room.players[0],'leave');assert.equal(room.phase,'ended');assert.equal(room.turnDeadline,null);
});
test('match stats track valid, invalid, timeouts, own-turn streaks and round wins across rounds',()=>{
 const {room,rules,setNow}=fixture('headToHead',2);rules.action(room,room.display,'start');
 rules.action(room,room.players[0],'move',{word:'dots',version:room.version});rules.action(room,room.players[1],'move',{word:'zzzz',version:room.version});
 rules.action(room,room.players[0],'move',{word:'cots',version:room.version});setNow(room.turnDeadline+1);rules.applyTimeout(room);
 rules.action(room,room.players[0],'move',{word:'cats',version:room.version});
 const rows=rules.publicState(room,room.display).summary;assert.equal(rows[0].valid,3);assert.equal(rows[0].longestStreak,3);assert.equal(rows[0].roundWins,1);assert.equal(rows[1].invalid,1);assert.equal(rows[1].timeouts,1);
 rules.action(room,room.display,'next');assert.equal(rules.publicState(room,room.display).summary[0].valid,3);
});
test('difficulty decks are deterministic, varied and contain only solvable unused-word routes',()=>{
 for(const pack of ['beginner','intermediate','expert','mixed']){
  const seen=new Set();for(let round=0;round<12;round++){const p=engine.puzzleForRound(round,pack,123);assert.deepEqual(p,engine.puzzleForRound(round,pack,123));const key=p.start+':'+p.target;assert.ok(!seen.has(key),pack);seen.add(key);assert.ok(p.route.length>1);assert.equal(new Set(p.route).size,p.route.length);for(let i=1;i<p.route.length;i++)assert.equal(engine.changedPositions(p.route[i-1],p.route[i]),1);}
  assert.notEqual(engine.puzzleForRound(0,pack,123).start+engine.puzzleForRound(0,pack,123).target,engine.puzzleForRound(0,pack,456).start+engine.puzzleForRound(0,pack,456).target);
 }
});
