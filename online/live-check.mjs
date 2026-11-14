// Creates only a temporary WORD SHIFT room, then deletes that same owned room.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {serve} from './static-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await serve(new URL('../dist',import.meta.url).pathname),base=`http://127.0.0.1:${server.address().port}/word-shift/`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox']});
let host,code;
try {
  const context=await browser.newContext();host=await context.newPage();
  await host.goto(base+'?tv=1');
  assert.equal(await host.evaluate(()=>WORD_SHIFT_FIREBASE.projectId),'sa-trivia-showdown-5518-f09c4');
  await host.evaluate(()=>chooseMode('Classic Multiplayer'));await host.locator('#hostName').fill('WORD SHIFT Check');
  await host.getByRole('button',{name:'Create room →',exact:true}).click();
  await host.waitForFunction(()=>state?.code,undefined,{timeout:30000}).catch(async e=>{console.log('Room setup:',await host.locator('#roomError').textContent());throw e;});
  code=await host.locator('#roomCode').textContent();
  const phoneContext=await browser.newContext(),phone=await phoneContext.newPage();
  await phone.goto(base+'?join='+code);await phone.locator('#joinName').fill('WORD SHIFT Phone');
  await phone.getByRole('button',{name:'Join →',exact:true}).click();await phone.getByRole('button',{name:'Tap when ready',exact:true}).click();
  await host.getByRole('button',{name:'Start game',exact:false}).click();await host.locator('#intro.active').waitFor();
  const moved=await host.evaluate(async()=>{const r=await WordShiftOnline.request(`/api/rooms/${room}/move`,{method:'POST',body:JSON.stringify({word:'dots',version:state.version})});return {status:r.status,body:await r.json()};});
  assert.equal(moved.status,200);await phone.waitForFunction(()=>state.current==='dots');
  console.log('PASS: existing live Firebase project supports a new WORD SHIFT room, separate phone joining, and a TV-validated move; no rules or existing rooms were changed.');
}finally {
  if(host && code)await host.evaluate(code=>WordShiftOnline.closeOwnedRoom(code),code).catch(()=>{});
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
