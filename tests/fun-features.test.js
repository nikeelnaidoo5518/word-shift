'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const engine=require('../game-engine');const {createRules}=require('../room-rules');
function game(options={}){let time=Date.parse('2026-11-24T12:00:00Z');const rules=createRules(engine,{now:()=>time,isConnected:()=>true});const room=rules.makeRoom({code:'ABCDE',hostId:'tv',displayOnly:true,mode:options.mode || 'classic',...options});const n=options.mode==='teams'?4:options.mode==='daily'?1:2;for(let i=0;i<n;i++)room.players.splice(i,0,{id:'p'+i,name:'Phone '+i,score:0,ready:true,roundWins:0,team:options.mode==='teams'?(i%2?'red':'blue'):null});return{rules,room,setTime:t=>{time=t;},advance:ms=>{time+=ms;}};}
function move(g,word){return g.rules.action(g.room,g.rules.activePlayer(g.room),'move',{word,version:g.room.version});}

test('category endpoints are themed, dictionary-valid, equal-length and connected in every difficulty',()=>{
 for(const category of Object.keys(engine.CATEGORIES).filter(k=>k!=='all'))for(const pack of ['beginner','intermediate','expert','mixed']){
  const pairs=engine.categoryPool(category,pack);assert.ok(pairs.length>=7,category+pack);for(const pair of pairs){assert.ok(engine.dictionary.has(pair.start));assert.equal(pair.start.length,pair.target.length);assert.ok(engine.shortestPath(pair.start,pair.target));}
  const puzzle=engine.puzzleForRound(0,pack,123,category);assert.ok(pairs.some(p=>p.start===puzzle.start && p.target===puzzle.target));
 }
});
test('hint budgets are per player/match, private, legal and do not pass the turn or extend the clock',()=>{
 const g=game();g.rules.action(g.room,g.room.display,'start');const player=g.room.players[0],deadline=g.room.turnDeadline;
 let result=g.rules.action(g.room,player,'hint',{hintType:'letter',version:g.room.version});assert.equal(result.status,200);assert.equal(result.body.you.hintsRemaining,2);assert.equal(result.body.you.hint.word,null);assert.equal(result.body.you.hint.index,2);assert.equal(g.room.activeIndex,0);assert.equal(g.room.turnDeadline,deadline);
 result=g.rules.action(g.room,player,'hint',{hintType:'word',version:g.room.version});assert.equal(result.status,200);assert.equal(result.body.you.hintsRemaining,0);const word=result.body.you.hint.word;assert.equal(engine.changedPositions(g.room.current,word),1);assert.ok(!g.room.used.has(word));assert.ok(engine.shortestPath(word,g.room.puzzle.target,g.room.used));
 assert.equal(g.rules.publicState(g.room,g.room.players[1]).you.hint,null);assert.equal(g.rules.publicState(g.room,g.room.display).you.hint,null);assert.ok(!JSON.stringify(g.rules.publicState(g.room,null)).includes('"word":"'+word+'"'));
 assert.equal(g.rules.action(g.room,player,'hint',{hintType:'letter',version:g.room.version}).status,409);assert.equal(g.rules.action(g.room,g.room.players[1],'hint',{hintType:'letter',version:g.room.version}).status,403);
 assert.equal(move(g,word).status,200);assert.equal(g.rules.publicState(g.room,player).you.hint,null);
});
test('custom pairs are validated before creating a one-round match',()=>{
 for(const [a,b] of [['cat','cats'],['cats','cats'],['zzzz','cats'],['chair','table']])assert.throws(()=>engine.validateCustom(a,b));
 const g=game({puzzleSource:'custom',customStart:'COLD',customTarget:'warm'});assert.equal(g.room.rounds,1);g.rules.action(g.room,g.room.display,'start');assert.equal(g.room.current,'cold');assert.equal(g.room.puzzle.target,'warm');assert.equal(g.room.puzzle.roundName,'Custom ladder');
});
test('quick matches end after three rounds with the existing one-letter rules',()=>{
 const g=game({matchFormat:'quick'});assert.equal(g.room.rounds,3);g.rules.action(g.room,g.room.display,'start');
 for(let round=1;round<=3;round++){const path=engine.shortestPath(g.room.current,g.room.puzzle.target);for(const word of path.slice(1))assert.equal(move(g,word).status,200);if(round<3)g.rules.action(g.room,g.room.display,'next');}
 assert.equal(g.room.phase,'complete');assert.ok(g.room.championIds.length>0);
});
test('daily puzzles use the same UTC date for every room and have a single human turn',()=>{
 const a=game({mode:'daily'}),b=game({mode:'daily'});b.room.puzzleSeed=999;a.rules.action(a.room,a.room.display,'start');b.rules.action(b.room,b.room.display,'start');assert.equal(a.room.dailyDate,'2026-11-24');assert.equal(a.room.rounds,1);assert.deepEqual(a.room.puzzle,b.room.puzzle);
 const path=engine.shortestPath(a.room.current,a.room.puzzle.target);for(const word of path.slice(1))assert.equal(move(a,word).status,200);assert.equal(a.room.phase,'complete');assert.equal(a.room.championId,'p0');assert.equal(a.rules.publicState(a.room,a.room.players[0]).replay.shortestMoves,path.length-1);
});
test('voting accepts one replaceable vote per phone, rejects displays and applies majority without arbitrary ties',()=>{
 const g=game();assert.equal(g.rules.action(g.room,g.room.display,'vote',{category:'animals',pack:'beginner',version:g.room.version}).status,403);
 const sharedVersion=g.room.version;for(const p of g.room.players)assert.equal(g.rules.action(g.room,p,'vote',{category:'animals',pack:'beginner',version:sharedVersion}).status,200,'different phones may vote concurrently');
 g.rules.action(g.room,g.room.display,'start');assert.equal(g.room.category,'animals');assert.equal(g.room.puzzlePack,'beginner');assert.equal(g.room.current.length,3);assert.deepEqual(g.room.votes,{});
 assert.equal(g.rules.action(g.room,g.room.players[0],'vote',{category:'food',pack:'expert',version:g.room.version}).status,409);
 const route=engine.shortestPath(g.room.current,g.room.puzzle.target);for(const word of route.slice(1))move(g,word);
 g.rules.action(g.room,g.room.players[0],'vote',{category:'food',pack:'expert',version:g.room.version});g.rules.action(g.room,g.room.players[0],'vote',{category:'nature',pack:'intermediate',version:g.room.version});g.rules.action(g.room,g.room.players[1],'vote',{category:'nature',pack:'intermediate',version:g.room.version});g.rules.action(g.room,g.room.display,'next');assert.equal(g.room.category,'nature');assert.equal(g.room.current.length,4);
});
test('team discussion protects ten seconds before every word turn, including across pauses',()=>{
 const g=game({mode:'teams',teamDiscussion:true});g.rules.action(g.room,g.room.display,'start');assert.equal(g.rules.publicState(g.room,g.room.display).discussionSeconds,10);assert.equal(g.rules.publicState(g.room,g.room.display).secondsLeft,g.room.puzzle.timerSeconds);assert.equal(move(g,'dots').status,409);
 g.advance(3000);g.rules.action(g.room,g.room.display,'pause');g.advance(50000);g.rules.action(g.room,g.room.display,'resume');assert.equal(g.rules.publicState(g.room,g.room.display).discussionSeconds,7);g.advance(7000);assert.equal(move(g,'dots').status,200);assert.equal(g.rules.publicState(g.room,g.room.display).discussionSeconds,10);assert.equal(g.room.activeIndex,1);
});
test('Party Chaos implements hidden targets and double points without changing valid shifts',()=>{
 const g=game({mode:'party'});g.rules.action(g.room,g.room.display,'start');for(const word of ['dots','cots','cats'])move(g,word);g.rules.action(g.room,g.room.display,'next');assert.equal(g.room.chaosEvent,'memory');g.advance(5001);assert.equal(g.rules.publicState(g.room,g.room.players[0]).target,'????');
 const path=engine.shortestPath(g.room.current,g.room.puzzle.target);for(const word of path.slice(1))move(g,word);assert.equal(g.rules.publicState(g.room,g.room.display).target,'warm');g.rules.action(g.room,g.room.display,'next');assert.equal(g.room.chaosEvent,'double');const player=g.rules.activePlayer(g.room),before=player.score,next=engine.shortestPath(g.room.current,g.room.puzzle.target)[1],matches=engine.targetMatches(next,g.room.puzzle.target)>engine.targetMatches(g.room.current,g.room.puzzle.target);move(g,next);assert.equal(player.score-before,(100+(matches?25:0))*2);
});
test('round replay is withheld until completion and records exact shortest routes and earned badges',()=>{
 const g=game({matchFormat:'quick'});g.rules.action(g.room,g.room.display,'start');assert.equal(g.rules.publicState(g.room,g.room.display).replay,null);for(const word of ['dots','cots','cats'])move(g,word);const state=g.rules.publicState(g.room,g.room.display);assert.equal(state.replay.shortestMoves,3);assert.equal(state.replay.moves,3);assert.deepEqual(state.replay.route,['dogs','dots','cots','cats']);assert.ok(state.summary.find(p=>p.id==='p0').badges.includes('Perfect Round'));
 g.room.phase='complete';assert.ok(g.rules.publicState(g.room,g.room.display).summary[0].badges.includes('No Hints Needed'));g.room.stats.p0.hintsSpent=1;assert.ok(!g.rules.publicState(g.room,g.room.display).summary[0].badges.includes('No Hints Needed'));
});

test('five-word badges come from valid personal streaks and daily decks change on consecutive dates',()=>{
 const g=game({puzzleSource:'custom',customStart:'smile',customTarget:'frown'});g.rules.action(g.room,g.room.display,'start');const path=engine.shortestPath(g.room.current,g.room.puzzle.target);for(const word of path.slice(1)){g.advance(200);move(g,word);}assert.equal(g.room.phase,'complete');assert.ok(g.rules.publicState(g.room,g.room.display).summary.some(p=>p.badges.includes('Five-Word Streak')));assert.equal(g.room.roundReplay.elapsedMs,(path.length-1)*200);
 const a=engine.dailyPuzzle('2026-11-24'),b=engine.dailyPuzzle('2026-11-25');assert.notEqual(a.start+':'+a.target,b.start+':'+b.target);
});

test('match-point banners identify near winners and hints cannot carry into a fresh match',()=>{
 const g=game({mode:'headToHead'});g.rules.action(g.room,g.room.display,'start');g.room.players[0].roundWins=2;assert.match(g.rules.publicState(g.room,g.room.display).rivalry,/Phone 0.*one round/);
 g.rules.action(g.room,g.room.players[0],'hint',{hintType:'word',version:g.room.version});g.room.phase='complete';g.rules.action(g.room,g.room.display,'restart',{version:g.room.version});assert.equal(g.rules.publicState(g.room,g.room.players[0]).you.hint,null);assert.equal(g.rules.publicState(g.room,g.room.players[0]).you.hintsRemaining,3);
 const team=game({mode:'teams'});team.rules.action(team.room,team.room.display,'start');team.room.teamWins.red=3;assert.match(team.rules.publicState(team.room,team.room.display).rivalry,/RED TEAM/);
});

test('legacy checkpoints do not invent an unbeatable target time when no round start was recorded',()=>{
 const g=game();g.rules.action(g.room,g.room.display,'start');delete g.room.roundStartedAt;for(const word of ['dots','cots','cats'])move(g,word);assert.equal(g.room.roundReplay.elapsedMs,null);assert.equal(g.room.stats.p0.fastestTargetMs,undefined);assert.equal(g.room.stats.p0.fewestTargetMoves,3);
});
