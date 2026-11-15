'use strict';
const assert=require('node:assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || undefined,headless:true,args:['--no-sandbox']});const failures=[];
 try{for(const [width,height] of [[360,640],[390,844],[412,915]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});const page=await context.newPage();await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4173')+'/');
  for(const [current,target] of [['cat','dog'],['dogs','cats'],['stone','share']]){
   await page.evaluate(({current,target})=>{const p={id:'a',name:'Alexandria Phone',avatar:'🦊',ready:true,score:125,roundWins:0,connected:true};updateState({code:'ABCDE',mode:'classic',modeName:'Classic',minPlayers:2,maxPlayers:4,phase:'playing',activePlayerId:'a',activePlayerName:p.name,hostId:'tv',displayOnly:true,captainId:'a',round:1,rounds:5,roundName:'Warm-Up',difficulty:'Beginner',timerSeconds:40,start:current,current,target,history:[current],moves:[],players:[p,{...p,id:'b',name:'Bravo'}],you:{...p,isActive:true,isHost:false,canControl:true},version:1,secondsLeft:40,moveCounts:{},totalMoves:0});show('phone');selectLetter(0);typeKey(current[0]==='b'?'c':'b');}, {current,target});
   const issues=await page.evaluate(()=>[...document.querySelectorAll('#phone button,#phone input,#phone .phone-target,#phone .draft-hint,#phone .phone-moves,#phone .phone-feedback')].filter(el=>el.getClientRects().length).flatMap(el=>{const r=el.getBoundingClientRect();return r.left<0 || r.right>innerWidth || r.top<0 || r.bottom>innerHeight-5?[{node:el.id||el.textContent,box:[r.x,r.y,r.width,r.height]}]:[]}));
   if(issues.length)failures.push({width,height,current,issues});
   assert.equal(await page.locator('#answer').inputValue(),(current[0]==='b'?'c':'b')+current.slice(1));
   if(process.env.SHOTS){require('node:fs').mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:`${process.env.SHOTS}/phone-${width}-${current.length}.png`});}
  }await context.close();
 }if(failures.length)console.log(JSON.stringify(failures,null,2));assert.equal(failures.length,0,'All phone previews and touch controls fit');console.log('PASS: 3/4/5-letter controls fit phone viewports 360×640, 390×844 and 412×915.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
