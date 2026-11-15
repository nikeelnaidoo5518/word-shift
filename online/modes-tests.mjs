import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {serve} from './static-server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await serve(new URL('../dist',import.meta.url).pathname),base=`http://127.0.0.1:${server.address().port}/word-shift/`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox','--no-proxy-server']});
async function action(page,code,action,body={}) {
  return page.evaluate(async({code,action,body})=>{const r=await WordShiftOnline.request(`/api/rooms/${code}/${action}`,{method:'POST',body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{code,action,body});
}
try {
  for(const [mode,count] of [['Head-to-Head',2],['Team Battle',4],['Party Chaos',2],['Player vs Computer',1]]) {
    const contexts=[],pages=[];let code;
    try {
      for(let i=0;i<count;i++){
        const context=await browser.newContext({viewport:{width:i?390:1280,height:i?844:720}});contexts.push(context);
        const page=await context.newPage();pages.push(page);
        await page.goto(base);
        assert.equal(await page.evaluate(()=>WORD_SHIFT_FIREBASE.projectId),'demo-word-shift');
        if(!i){await page.evaluate(mode=>chooseMode(mode),mode);await page.getByRole('button',{name:'Create room →',exact:true}).click();await page.waitForFunction(()=>state?.code);code=await page.locator('#roomCode').textContent();}
        else {await page.evaluate(()=>show('lobby'));await page.locator('#joinCode').fill(code);await page.locator('#joinName').fill('Phone '+i);await page.getByRole('button',{name:'Join →',exact:true}).click();await page.getByRole('button',{name:'Tap when ready',exact:true}).click();}
      }
      const host=pages[0];await host.waitForFunction(()=>!document.getElementById('lobbyAction').disabled);
      const started=await action(host,code,'start',{version:await host.evaluate(()=>state.version)});assert.equal(started.status,200);
      let current=started.body;
      const byUid=new Map(await Promise.all(pages.map(async page=>[await page.evaluate(()=>state.you.id),page])));
      if(mode==='Player vs Computer') {
        const moved=await action(host,code,'move',{word:'dots',version:current.version});assert.equal(moved.status,200);
        await host.waitForFunction(()=>state.current!=='dogs' && state.current!=='dots');
        current=await host.evaluate(()=>state);assert.equal(current.current,'cots');
        const won=await action(host,code,'move',{word:'cats',version:current.version});assert.equal(won.status,200);assert.equal(won.body.phase,'roundResults');
      }else {
        const paths=mode==='Head-to-Head'?[['dots','cots','cats'],['cord','word','ward','warm'],['heal','teal','tell','tall','tail']]:[['dots','cots','cats']];
        for(let round=0;round<paths.length;round++) {
          for(const word of paths[round]){const moved=await action(byUid.get(current.activePlayerId),code,'move',{word,version:current.version});assert.equal(moved.status,200,`${mode}: ${word}`);current=moved.body;}
          if(round<paths.length-1){const next=await action(host,code,'next',{version:current.version});assert.equal(next.status,200);current=next.body;}
        }
        if(mode==='Head-to-Head'){assert.equal(current.phase,'complete');assert.equal(current.players.find(p=>p.id===current.championId).roundWins,3);}
        if(mode==='Team Battle'){assert.deepEqual(current.players.map(p=>p.team),['blue','red','blue','red']);assert.equal(current.teamWins.blue,1);}
        if(mode==='Party Chaos'){assert.equal(current.rounds,7);assert.equal(current.timerSeconds,15);}
      }
      await host.evaluate(code=>WordShiftOnline.closeOwnedRoom(code),code);
      console.log('PASS: Firebase mode',mode);
    }finally{for(const context of contexts)await context.close();}
  }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
