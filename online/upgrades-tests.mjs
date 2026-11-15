import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {serve} from './static-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await serve(new URL('../dist',import.meta.url).pathname),base=process.env.UPGRADES_TEST_URL || `http://127.0.0.1:${server.address().port}/word-shift/`,live=Boolean(process.env.UPGRADES_TEST_URL);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox',...(!live?['--no-proxy-server']:[])]});
const contexts=[],errors=[];let tv,code;
async function page(viewport){const c=await browser.newContext({viewport});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return p;}
try{
 tv=await page({width:1280,height:720});await tv.goto(base+'?tv=1');assert.equal(await tv.evaluate(()=>WORD_SHIFT_FIREBASE.projectId),live?'sa-trivia-showdown-5518-f09c4':'demo-word-shift');
 await tv.evaluate(()=>chooseMode('Classic Multiplayer'));await tv.getByRole('button',{name:'Create game →',exact:true}).click();await tv.waitForFunction(()=>state?.code);code=await tv.evaluate(()=>state.code);
 const phones=[];for(const name of ['Alpha','Bravo','Charlie']){const p=await page({width:390,height:844});phones.push(p);await p.goto(base+'?join='+code);await p.locator('#joinName').fill(name);await p.getByRole('button',{name:'Join →',exact:true}).click();await p.getByRole('button',{name:'Tap when ready',exact:true}).click();}
 const [a,b,c]=phones;await tv.waitForFunction(()=>!document.getElementById('lobbyAction').disabled);await tv.locator('#lobbyAction').click();await tv.locator('#tv.active').waitFor();await a.locator('#phoneTurn').waitFor({state:'visible'});assert.match(await a.locator('#phonePlayerName').textContent(),/Alpha/);
 await a.getByRole('button',{name:'Select letter 3, G',exact:true}).click();await a.locator('#keyboard').getByRole('button',{name:'T',exact:true}).click();assert.equal(await a.locator('#answer').inputValue(),'dots');assert.match(await a.locator('#draftHint').textContent(),/1 letter changed/);assert.equal(await tv.evaluate(()=>state.current),'dogs');
 await a.locator('#submitShift').click();await tv.waitForFunction(()=>state.current==='dots');
 await b.waitForFunction(()=>state.current==='dots' && state.you.isActive);
 await tv.evaluate(()=>{globalThis.testCues=[];const play=WordShiftMusic.effect;WordShiftMusic.effect=name=>{testCues.push(name);return play(name);};const saved=localDeadline;localDeadline=Date.now()+4000;paintClock();localDeadline=saved;paintClock();});assert.ok(await tv.evaluate(()=>testCues.includes('warning')));
 const invalid=await b.evaluate(async()=>{const r=await WordShiftOnline.request(`/api/rooms/${room}/move`,{method:'POST',body:JSON.stringify({word:'zzzz',version:state.version})});return r.status;});assert.equal(invalid,422);
 await tv.evaluate(()=>openMatchMenu());await tv.getByRole('button',{name:'Players & captain',exact:true}).click();await tv.locator('.manage-player').filter({hasText:'Bravo'}).getByRole('button',{name:'Make captain',exact:true}).click();
 await b.waitForFunction(()=>state.you.canControl);assert.equal(await a.evaluate(()=>state.you.canControl),false);
 await b.evaluate(()=>openMatchMenu());await b.getByRole('button',{name:'Pause game',exact:true}).click();for(const p of [tv,a,b,c])await p.locator('#paused.active').waitFor();
 const remaining=await tv.evaluate(()=>state.secondsLeft);await tv.reload();await tv.locator('#paused.active').waitFor();assert.equal(await tv.evaluate(()=>state.secondsLeft),remaining);
 await a.evaluate(()=>reconnectRoom());await a.waitForFunction(()=>stream?.readyState===1);assert.equal(await a.evaluate(()=>state.you.name),'Alpha');assert.equal(await a.evaluate(()=>state.players.find(p=>p.id===state.you.id).score),125);assert.equal(await a.evaluate(()=>state.phase),'paused');
 await tv.evaluate(()=>show('settings'));await tv.locator('#musicVolume').selectOption('25');await tv.locator('#effectsVolume').selectOption('75');await tv.locator('#textSize').selectOption('1.15');await tv.locator('#screenMargin').selectOption('6');
 assert.deepEqual(await tv.evaluate(()=>WordShiftMusic.volumes),{music:25,effects:75});await tv.reload();await tv.locator('#paused.active').waitFor();assert.equal(await tv.evaluate(()=>localStorage.getItem('wordshift.screenMargin')),'6');
 await tv.evaluate(()=>showPlayers());await c.context().close();await tv.waitForFunction(()=>state.players.some(p=>p.name==='Charlie' && p.connected===false));
 const row=tv.locator('.manage-player').filter({hasText:'Charlie'});await row.getByRole('button',{name:'Remove offline',exact:true}).click();await tv.waitForFunction(()=>state.players.length===2);
 await tv.evaluate(()=>showSummary());assert.match(await tv.locator('#summaryCards').textContent(),/Alpha/);assert.match(await tv.locator('#summaryCards').textContent(),/100%/);assert.equal(await tv.evaluate(()=>state.summary.find(p=>p.name==='Alpha').valid),1);assert.equal(await tv.evaluate(()=>state.summary.find(p=>p.name==='Bravo').invalid),1);
 assert.ok(await tv.evaluate(()=>{const grid=document.getElementById('summaryCards');for(let i=0;i<12;i++)grid.appendChild(grid.firstElementChild.cloneNode(true));grid.focus();wordShiftRemote('ArrowDown');return grid.scrollTop>0;}));
 await b.evaluate(()=>openMatchMenu());await b.getByRole('button',{name:'Resume game',exact:true}).first().click(); // Menu resume returns to paused screen.
 await b.locator('#paused #resumeButton').click();await tv.locator('#tv.active').waitFor();assert.equal(await tv.evaluate(()=>state.current),'dots');
 await b.evaluate(()=>showPlayers());await b.getByRole('button',{name:'Leave game',exact:true}).click();await b.locator('#home.active').waitFor();await tv.locator('#ended.active').waitFor();await a.locator('#ended.active').waitFor();
 assert.equal(await b.evaluate(()=>localStorage.getItem('wordshift.room.session')),null);assert.equal(await tv.evaluate(()=>state.captainId),await a.evaluate(()=>state.you.id));
 await tv.evaluate(code=>WordShiftOnline.closeOwnedRoom(code),code);code=null;
 await tv.evaluate(()=>returnToStart());await tv.evaluate(()=>chooseMode('Player vs Computer'));await tv.locator('#puzzlePack').selectOption('beginner');await tv.getByRole('button',{name:'Create game →',exact:true}).click();await tv.waitForFunction(()=>state?.code);code=await tv.evaluate(()=>state.code);
 await a.goto(base+'?join='+code);await a.locator('#joinName').fill('Difficulty Check');await a.getByRole('button',{name:'Join →',exact:true}).click();await a.getByRole('button',{name:'Tap when ready',exact:true}).click();await tv.waitForFunction(()=>!document.getElementById('lobbyAction').disabled);await tv.locator('#lobbyAction').click();await tv.locator('#tv.active').waitFor();
 assert.equal(await tv.evaluate(()=>state.puzzlePack),'beginner');assert.equal(await tv.evaluate(()=>state.current.length),3);assert.equal(await tv.evaluate(()=>state.difficulty),'Beginner');await tv.evaluate(()=>endMatch());
 assert.deepEqual(errors,[]);console.log('PASS: one-letter preview, pause/reload/resume, same-seat reconnect, captain handover, offline removal, explicit leave, summary stats, difficulty selection and saved volume/TV options.');
}catch(error){
 for(const ctx of contexts)for(const p of ctx.pages())console.log('Upgrade diagnostic',await p.evaluate(()=>({screen:document.querySelector('.screen.active')?.id,phase:state?.phase,version:state?.version,you:state?.you,error:document.getElementById('menuMessage').textContent,playerMessage:document.getElementById('playerMessage').textContent,connection:document.getElementById('connectionText').textContent})).catch(()=>null));throw error;
}finally{
 if(tv&&code)await tv.evaluate(code=>WordShiftOnline.closeOwnedRoom(code),code).catch(()=>{});
 for(const c of contexts)await c.close().catch(()=>{});await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
