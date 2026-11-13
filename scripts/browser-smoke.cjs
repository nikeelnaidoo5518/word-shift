const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox']});
 try {
 const hostContext = await browser.newContext({viewport:{width:1440,height:900}});
 const guestContext = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const host = await hostContext.newPage(), guest = await guestContext.newPage();
 const errors=[];
 for (const page of [host,guest]) page.on('pageerror', e=> errors.push(e.message));
 await host.goto(base);
 await host.evaluate(()=>chooseMode('Classic Multiplayer'));
 await host.getByRole('button',{name:'Create room →',exact:true}).click();
 await host.waitForFunction(()=>document.getElementById('roomCode').textContent.length===5 && document.getElementById('roomCode').textContent!=='-----');
 const code=await host.locator('#roomCode').textContent();
 await guest.goto(`${base}/?join=${code}`);
 await guest.locator('#joinName').fill('Browser Guest');
 await guest.getByRole('button',{name:'Join →',exact:true}).click();
 await guest.getByRole('button',{name:'Tap when ready',exact:true}).click();
 await host.getByRole('button',{name:'Start game',exact:false}).click();
 await host.locator('#intro.active').waitFor();
 await host.getByRole('button',{name:'Let’s play',exact:false}).click();
 await host.locator('#tv button').filter({hasText:'Phone view'}).click();
 for(const [page,word] of [[host,'dots'],[guest,'cots'],[host,'cats']]) {
  await page.locator('#phoneTurn').waitFor({state:'visible'});
  await page.locator('#answer').fill(word);
  await page.getByRole('button',{name:'SHIFT ↗',exact:true}).click();
  await page.waitForFunction(expected => state.current === expected, word);
 }
 for(const page of [host,guest]) await page.locator('#results.active').waitFor();
 await host.getByRole('button',{name:'Next round →',exact:true}).click();
 await guest.waitForFunction(()=>document.getElementById('phoneWord').textContent==='COLD');
 await guest.reload();
 await guest.locator('#phone.active').waitFor();
 if(errors.length) throw new Error(errors.join('\n'));
 console.log('PASS: desktop host + mobile guest, link join, ready/start, alternating moves, results, next round, reconnect; no browser exceptions.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
