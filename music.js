'use strict';
// Original waltz and short synthesized cues. No recordings or network requests.
(() => {
  const phone=new URLSearchParams(location.search).has('join') || innerWidth<651;
  let enabled=localStorage.getItem('wordshift.music')!=='off';
  if(localStorage.getItem('wordshift.music')===null && phone)enabled=false;
  const stored=key=>{const n=Number(localStorage.getItem(key));return localStorage.getItem(key)!==null && [0,25,50,75,100].includes(n)?n:null;};
  let musicVolume=stored('wordshift.musicVolume')??50,effectsVolume=stored('wordshift.effectsVolume')??(phone?0:50);
  let context,musicGain,effectsGain,timer,nextTime=0,beat=0,unlocked=false;
  const melody=[76,79,77,76,74,72,74,77,76,74,72,71,72,76,79,81,79,77,76,74,72,71,74,72];
  const chords=[[48,55,60],[48,55,60],[53,60,65],[55,62,67],[48,55,60],[53,60,65],[55,62,67],[48,55,60]];
  function note(midi,time,duration,level,bus=musicGain){
    const voice=context.createOscillator(),gain=context.createGain();voice.type='sine';voice.frequency.value=440*2**((midi-69)/12);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(level,time+.025);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    voice.connect(gain);gain.connect(bus);voice.start(time);voice.stop(time+duration+.02);
  }
  async function audio(){
    if(!unlocked || document.hidden)return false;
    const Audio=window.AudioContext || window.webkitAudioContext;if(!Audio)return false;
    if(!context){context=new Audio();musicGain=context.createGain();effectsGain=context.createGain();musicGain.connect(context.destination);effectsGain.connect(context.destination);gains();}
    try{await context.resume();return true;}catch{return false;}
  }
  function gains(){if(musicGain)musicGain.gain.value=.22*musicVolume/50;if(effectsGain)effectsGain.gain.value=.22*effectsVolume/50;}
  function schedule(){
    if(!context || context.state!=='running')return;if(nextTime<context.currentTime)nextTime=context.currentTime+.04;
    while(nextTime<context.currentTime+.25){const step=beat%24,chord=chords[Math.floor(step/3)];note(melody[step],nextTime,.7,.18);if(step%3===0)note(chord[0],nextTime,.95,.15);else{note(chord[1],nextTime,.65,.065);note(chord[2],nextTime,.65,.065);}nextTime+=.6;beat++;}
  }
  function sync(){
    document.querySelectorAll('[aria-label="Toggle music"]').forEach(el=>{el.classList.toggle('on',enabled);el.setAttribute('aria-pressed',String(enabled));});
    document.querySelectorAll('[data-music-toggle]').forEach(el=>{el.textContent=enabled?'Music: On · tap to mute':'Music: Off · tap to play';el.setAttribute('aria-pressed',String(enabled));});
    if(document.getElementById('musicVolume'))document.getElementById('musicVolume').value=String(musicVolume);
    if(document.getElementById('effectsVolume'))document.getElementById('effectsVolume').value=String(effectsVolume);
  }
  async function play(){
    if(!enabled || !unlocked || document.hidden)return;
    if(await audio()){if(!enabled || document.hidden)return;if(!timer){nextTime=context.currentTime+.05;schedule();timer=setInterval(schedule,100);}}
  }
  function stop(){clearInterval(timer);timer=null;if(context && musicGain){musicGain.gain.cancelScheduledValues(context.currentTime);musicGain.gain.setValueAtTime(0,context.currentTime);}}
  function toggle(){enabled=!enabled;unlocked=true;localStorage.setItem('wordshift.music',enabled?'on':'off');sync();if(enabled){gains();play();}else stop();}
  function setVolume(type,value){const n=Number(value);if(![0,25,50,75,100].includes(n))return;unlocked=true;if(type==='music'){musicVolume=n;localStorage.setItem('wordshift.musicVolume',String(n));}else if(type==='effects'){effectsVolume=n;localStorage.setItem('wordshift.effectsVolume',String(n));}gains();if(!enabled && musicGain)musicGain.gain.value=0;sync();play();}
  async function effect(name){
    if(!effectsVolume || !unlocked || document.hidden)return;
    if(!await audio())return;
    const tunes={valid:[72,76],target:[72,76,79,84],warning:[81,76]};const notes=tunes[name];if(!notes)return;
    for(let i=0;i<notes.length;i++)note(notes[i],context.currentTime+.02+i*.11,.23,.32,effectsGain);
  }
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{unlocked=true;audio().then(()=>play());},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();context?.suspend().catch(()=>{});}else{gains();play();}});
  function unlock(){unlocked=true;audio().then(()=>play());}
  window.WordShiftMusic={toggle,setVolume,effect,unlock,get enabled(){return enabled;},get playing(){return Boolean(timer && context?.state==='running');},get volumes(){return {music:musicVolume,effects:effectsVolume};}};
  sync();
})();
