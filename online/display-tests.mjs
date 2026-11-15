import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {serve} from './static-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await serve(new URL('../dist',import.meta.url).pathname),base=process.env.DISPLAY_TEST_URL || `http://127.0.0.1:${server.address().port}/word-shift/`;
const live=Boolean(process.env.DISPLAY_TEST_URL);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox',...(!live?['--no-proxy-server']:[])]});
try{
 // Upgrading an old TV-player session retires it rather than restoring a player on the TV.
 {
  const ctx=await browser.newContext();const page=await ctx.newPage();let oldCode;
  try{
   await page.goto(base);assert.equal(await page.evaluate(()=>WORD_SHIFT_FIREBASE.projectId),live?'sa-trivia-showdown-5518-f09c4':'demo-word-shift');
   await page.evaluate(()=>chooseMode('Player vs Computer'));await page.getByRole('button',{name:'Create room →',exact:true}).click();
   await page.waitForFunction(()=>state?.code);oldCode=await page.evaluate(()=>state.code);
   await page.goto(base+'?tv=1');await page.locator('#home.active').waitFor();
   await page.waitForFunction(()=>localStorage.getItem('wordshift.room.session')===null);
   console.log('PASS: old TV-player session safely returns to start for display-only upgrade.');
  }finally{if(oldCode)await page.evaluate(code=>WordShiftOnline.closeOwnedRoom(code),oldCode).catch(()=>{});await ctx.close();}
 }
 for(const [mode,count] of [['Classic Multiplayer',2],['Head-to-Head',2],['Player vs Computer',1],['Team Battle',4],['Party Chaos',2]]){
  if(process.env.DISPLAY_TEST_MODE && mode!==process.env.DISPLAY_TEST_MODE)continue;
  const contexts=[];let tv,code;const errors=[],phones=[];
  try{
   const context=await browser.newContext({viewport:{width:1280,height:720}});contexts.push(context);tv=await context.newPage();tv.on('pageerror',e=>errors.push(e.message));
   await tv.goto(base+'?tv=1');assert.equal(await tv.evaluate(()=>WORD_SHIFT_FIREBASE.projectId),live?'sa-trivia-showdown-5518-f09c4':'demo-word-shift');
   await tv.evaluate(mode=>chooseMode(mode),mode);
   assert.equal(await tv.locator('#hostName').isVisible(),false);
   await tv.getByRole('button',{name:'Create game →',exact:true}).click();await tv.waitForFunction(()=>state?.code);
   code=await tv.evaluate(()=>state.code);
   assert.equal(await tv.evaluate(()=>state.players.filter(p=>!p.isBot).length),0);
   assert.equal(await tv.locator('#lobbyAction').isDisabled(),true);
   await tv.locator('#joinQr svg').waitFor();

   for(let i=0;i<count;i++){
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(ctx);
    const phone=await ctx.newPage();phones.push(phone);phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(base+'?join='+code);await phone.locator('#joinName').fill('Display Check '+i);
    await phone.getByRole('button',{name:'Join →',exact:true}).click();
    await phone.getByRole('button',{name:'Tap when ready',exact:true}).click();
   }
   await tv.waitForFunction(()=>!document.getElementById('lobbyAction').disabled);
   const roster=await tv.evaluate(()=>state.players);
   assert.equal(roster.filter(p=>!p.isBot).length,count);assert.equal(roster.some(p=>p.name==='TV display'),false);
   // Both TV-start and captain-phone-start are exercised across the five modes.
   if(mode==='Classic Multiplayer')await tv.locator('#lobbyAction').click();
   else {await phones[0].waitForFunction(()=>!document.getElementById('lobbyAction').disabled);await phones[0].getByRole('button',{name:'Start game',exact:false}).click();}
   await tv.locator('#tv.active').waitFor();assert.equal(await tv.locator('#phoneViewButton').isVisible(),false);
   await phones[0].locator('#phoneTurn').waitFor({state:'visible'});
   const denied=await tv.evaluate(async()=>{const r=await WordShiftOnline.request(`/api/rooms/${room}/move`,{method:'POST',body:JSON.stringify({word:'dots',version:state.version})});return r.status;});assert.equal(denied,403);
   await phones[0].locator('#answer').fill('dots');await phones[0].getByRole('button',{name:'SHIFT ↗',exact:true}).click();
   await tv.waitForFunction(()=>state.history.includes('dots'));assert.ok(await tv.evaluate(()=>state.totalMoves)>=1);
   assert.equal(await tv.evaluate(()=>state.activePlayerId===state.hostId),false);
   await tv.reload();await tv.locator('#tv.active').waitFor();assert.equal(await tv.evaluate(()=>state.you.isDisplay),true);
   if(mode==='Classic Multiplayer'){
    // A non-captain cannot control the shared match.
    const blocked=await phones[1].evaluate(async()=>{const r=await WordShiftOnline.request(`/api/rooms/${room}/end`,{method:'POST',body:JSON.stringify({version:state.version})});return r.status;});assert.equal(blocked,403);
   }
   const controller=mode==='Classic Multiplayer'?phones[0]:tv;
   await controller.evaluate(()=>openMatchMenu());await controller.locator('#endMatchButton').click();
   for(const page of [tv,...phones])await page.locator('#ended.active').waitFor();
   assert.deepEqual(errors,[]);
   console.log('PASS: display-only TV, correct phone seats/readiness, TV or phone start, legal phone move, TV reload and end: '+mode);
  }catch(error){
   for(const page of [tv,...phones])if(page)console.log('Display check diagnostic',mode,await page.evaluate(()=>({phase:state?.phase,current:state?.current,version:state?.version,you:state?.you,menu:document.getElementById('menuMessage').textContent,connection:document.getElementById('connectionNotice').textContent,screen:document.querySelector('.screen.active')?.id})).catch(()=>null));
   throw error;
  }finally{
   if(tv&&code)await tv.evaluate(code=>WordShiftOnline.closeOwnedRoom(code),code).catch(()=>{});
   for(const context of contexts)await context.close();
  }
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
