'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const sizes = [[960,540],[1280,720],[1920,1080],[3840,2160]];
(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox']});
  const failures=[];
  if(process.env.SHOTS)require('node:fs').mkdirSync(process.env.SHOTS,{recursive:true});
  try {
    for(const [width,height] of sizes) {
     for(const calibration of ['standard','large','wide']) {
      const context=await browser.newContext({viewport:{width,height}});
      await context.addInitScript(calibration=>{localStorage.setItem('wordshift.textSize',calibration==='standard'?'1':'1.15');localStorage.setItem('wordshift.screenMargin',calibration==='wide'?'6':'4');},calibration);
      const page=await context.newPage();
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/?tv=1');
      await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
      const scenes=['home','modes','setup','lobby','intro','tv','phone','results','victory','victory-tie','how','settings','matchMenu','ended','paused','manage','summary'];
      for(const scene of scenes) {
        await page.evaluate(scene=>{
          const players=Array.from({length:4},(_,i)=>({id:String(i),name:['Alexandria the Fox','Christopher Player','Long Nickname Here','Extra Long Player'][i],avatar:'🦊',score:12500,roundWins:2,ready:true,connected:i!==2,team:i%2?'red':'blue'}));
          const fixture={code:'ABCDE',mode:'teams',modeName:'Team Battle',minPlayers:4,maxPlayers:4,phase:'lobby',hostId:'0',round:7,rounds:7,roundName:'Mega Finale',modifier:'Mystery Bonus',difficulty:'Super Hard',timerSeconds:15,start:'love',target:'hate',current:'have',history:Array(15).fill('love').concat(['hove','have']),moves:[],activePlayerId:'0',activePlayerName:players[0].name,secondsLeft:15,lastMessage:'Everyone is ready to start the next round.',roundWinnerId:'0',championId:'0',championIds:['0','1','2','3'],championTeam:'both',teamWins:{blue:3,red:3},unresolved:false,resets:0,version:100,you:{id:'0',name:players[0].name,avatar:'🦊',isHost:true,canControl:true,isActive:true,ready:true},players};
          fixture.captainId='0';fixture.summary=players.map(p=>({...p,valid:12,invalid:3,timeouts:2,longestStreak:5,roundWins:2}));
          if(scene==='setup'){document.getElementById('roomSetup').style.display='grid';document.getElementById('lobbyLayout').style.display='none';chooseMode('Player vs Computer');return;}
          if(scene==='victory-tie'){fixture.mode='classic';fixture.modeName='Classic Multiplayer';fixture.championTeam=null;}
          if(['lobby','intro','tv','phone','results','victory','victory-tie','paused','manage','summary'].includes(scene)) {
            fixture.phase=scene==='lobby'?'lobby':scene==='paused'?'paused':scene==='results'?'roundResults':scene.startsWith('victory')?'complete':'playing';
            updateState(fixture);
          }
          if(scene==='manage'){showPlayers();return;}if(scene==='summary'){showSummary();return;}
          show(scene==='victory-tie'?'victory':scene);
        },scene);
        if(scene==='lobby')await page.locator('#joinQr svg').waitFor();
        const issues=await page.evaluate(()=>{
          const active=document.querySelector('.screen.active');
          const selectors='button,input,select,.page-head,.slot,.lobby-options,.join-qr,#joinLink,#qrHelp,#roomCode,#bigword,#tiles,#bigTimer,.endpoint,#players,.result-panel,.center-stage h1,.center-stage>p,.hero-copy,.slot strong,.player-card b,.player-card small,.score-row,.manage-player,.stat-card,#championName,#tvMoves,#phoneMoves,.creator-credit';
          return [...active.querySelectorAll(selectors)].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').flatMap(el=>{
            const r=el.getBoundingClientRect();
            if(r.left < innerWidth*.035-1 || r.right > innerWidth*.965+1 || r.top < innerHeight*.035-1 || r.bottom > innerHeight*.965+1) return [{element:el.id||el.className||el.tagName,box:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}];
            return [];
          });
        });
        if(issues.length)failures.push({size:`${width}x${height}`,calibration,scene,issues});
        if(process.env.SHOTS && width<=1280 && ['lobby','tv','victory-tie','paused','manage','summary'].includes(scene))await page.screenshot({path:`${process.env.SHOTS}/${scene}-${width}.png`});
      }
      assert.deepEqual(errors,[],`No browser errors at ${width}x${height}`);
      await context.close();
     }
    }
    if(failures.length)console.log(JSON.stringify(failures,null,2));
    assert.equal(failures.length,0,'All TV screens must fit inside the overscan-safe area');
    console.log('PASS: 17 TV screens with standard/larger/wide-margin settings fit at 960×540, 1280×720, 1920×1080, and 3840×2160.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
