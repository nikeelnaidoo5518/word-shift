'use strict';
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.env.PORT='0';
const {server,rooms,streams,maintainRooms,closeRoom,ROOM_TTL_MS} = require('../server');
(async()=>{
  await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
  try {
    const hostContext=await browser.newContext({viewport:{width:1280,height:720}});
    const phoneContext=await browser.newContext({viewport:{width:390,height:844}});
    const host=await hostContext.newPage(),phone=await phoneContext.newPage();
    const errors=[];for(const page of [host,phone])page.on('pageerror',e=>errors.push(e.message));
    await host.goto(base+'/?tv=1');await host.evaluate(()=>chooseMode('Classic Multiplayer'));
    await host.getByRole('button',{name:'Create room →',exact:true}).click();
    await host.waitForFunction(()=>document.getElementById('roomCode').textContent!=='-----');
    const code=await host.locator('#roomCode').textContent();
    await phone.goto(`${base}/?join=${code}`);await phone.locator('#joinName').fill('Reconnect Guest');
    await phone.getByRole('button',{name:'Join →',exact:true}).click();
    await phone.getByRole('button',{name:'Tap when ready',exact:true}).click();
    await host.getByRole('button',{name:'Start game',exact:false}).click();
    await host.locator('#intro.active').waitFor();await host.getByRole('button',{name:'Let’s play',exact:false}).click();
    await phone.locator('#phone.active').waitFor();
    const identity=await phone.evaluate(()=>({id:state.you.id,token,version:state.version}));
    await phoneContext.setOffline(true);
    for(const client of streams.get(code)||[])if(client.player.id===identity.id)client.destroy();
    await phone.getByText('Connection lost. Reconnecting…',{exact:true}).waitFor();
    await host.waitForFunction(id=>state.players.find(player=>player.id===id).connected===false,identity.id);
    assert.match(await host.locator('#players').textContent(),/OFFLINE/);
    await phoneContext.setOffline(false);
    await phone.waitForFunction(()=>document.getElementById('connectionNotice').hidden===true);
    await host.waitForFunction(id=>state.players.find(player=>player.id===id).connected===true,identity.id);
    assert.equal(await phone.evaluate(()=>state.you.id),identity.id);
    assert.equal(rooms.get(code).players.length,2);
    // A transient HTTP restore failure must not erase the saved player token.
    await phone.route('**/api/rooms/*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporarily unavailable"}'}));
    await phone.reload();
    await phone.getByText('Could not reconnect. Check your Wi-Fi and reload to try again.',{exact:true}).waitFor();
    assert.equal(await phone.evaluate(()=>JSON.parse(localStorage.getItem('wordshift.room.session')).token),identity.token);
    await phone.unroute('**/api/rooms/*');await phone.reload();
    await phone.locator('#phone.active').waitFor();assert.equal(await phone.evaluate(()=>state.you.id),identity.id);
    const room=rooms.get(code);room.lastActivityAt=Date.now()-ROOM_TTL_MS-1;maintainRooms();
    for(const page of [host,phone]) {
      await page.locator('#roomSetup').waitFor({state:'visible'});
      await page.waitForFunction(()=>localStorage.getItem('wordshift.room.session')===null);
      assert.equal(await page.evaluate(()=>stream),null);
      assert.match(await page.locator('#roomError').textContent(),/expired|no longer/i);
    }
    // A late restore response from an older session must not clear a new room.
    await phone.evaluate(()=>createRoom());
    let pendingRestore;
    let restoreArrived;
    const arrived=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Restore request was not observed')),10_000);
      restoreArrived=()=>{clearTimeout(timer);resolve();};
    });
    await phone.route('**/api/rooms/*',route=>{
      if(route.request().method()==='GET'){pendingRestore=route;restoreArrived();}
      else route.continue();
    });
    await phone.goto(base);await arrived;
    await phone.evaluate(()=>createRoom());
    const newRoom=await phone.evaluate(()=>room);
    await pendingRestore.fulfill({status:404,contentType:'application/json',body:'{"error":"Old room expired"}'});
    await phone.unroute('**/api/rooms/*');
    await phone.waitForTimeout(100);
    assert.equal(await phone.evaluate(()=>state.code),newRoom);
    assert.equal(await phone.evaluate(()=>JSON.parse(localStorage.getItem('wordshift.room.session')).room),newRoom);
    const second=await phoneContext.newPage();second.on('pageerror',e=>errors.push(e.message));
    await second.goto(base);
    await second.waitForFunction(()=>state && stream && stream.readyState===EventSource.OPEN);
    const third=await phoneContext.newPage();third.on('pageerror',e=>errors.push(e.message));
    await third.goto(base);
    await third.getByText('Connection unavailable. Close extra room tabs and reload to reconnect.',{exact:true}).waitFor();
    await second.close();
    await third.reload();await third.waitForFunction(()=>state && stream && stream.readyState===EventSource.OPEN && document.getElementById('connectionNotice').hidden);
    await third.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: real SSE disconnection, visible offline/reconnect states, same-seat recovery, saved token on transient failure, expiry cleanup, and late-restore isolation, and tab-limit recovery.');
  } finally {
    await browser.close();for(const room of rooms.values())closeRoom(room);
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
