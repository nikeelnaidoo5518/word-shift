'use strict';
// Original eight-bar waltz, synthesized locally; no recordings or network requests.
(() => {
  let enabled = localStorage.getItem('wordshift.music') !== 'off';
  if (localStorage.getItem('wordshift.music') === null && (new URLSearchParams(location.search).has('join') || innerWidth < 651)) enabled = false;
  let context, master, timer, nextTime=0, beat=0, unlocked=false;
  const melody=[76,79,77,76,74,72,74,77,76,74,72,71,72,76,79,81,79,77,76,74,72,71,74,72];
  const chords=[[48,55,60],[48,55,60],[53,60,65],[55,62,67],[48,55,60],[53,60,65],[55,62,67],[48,55,60]];
  function note(midi,time,duration,level) {
    const voice=context.createOscillator(),gain=context.createGain();
    voice.type='sine';voice.frequency.value=440*2**((midi-69)/12);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(level,time+.025);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    voice.connect(gain);gain.connect(master);voice.start(time);voice.stop(time+duration+.02);
  }
  function schedule() {
    if(!context || context.state!=='running')return;
    if(nextTime<context.currentTime)nextTime=context.currentTime+.04;
    while(nextTime<context.currentTime+.25) {
      const step=beat%24,chord=chords[Math.floor(step/3)];
      note(melody[step],nextTime,.7,.18);
      if(step%3===0)note(chord[0],nextTime,.95,.15);
      else {note(chord[1],nextTime,.65,.065);note(chord[2],nextTime,.65,.065);}
      nextTime+=.6;beat++;
    }
  }
  function syncButtons() {
    document.querySelectorAll('[aria-label="Toggle music"]').forEach(el=>{el.classList.toggle('on',enabled);el.setAttribute('aria-pressed',String(enabled));});
    document.querySelectorAll('[data-music-toggle]').forEach(el=>{el.textContent=enabled?'Music: On · tap to mute':'Music: Off · tap to play';el.setAttribute('aria-pressed',String(enabled));});
  }
  async function play() {
    if(!enabled || !unlocked || document.hidden)return;
    try {
      const Audio=window.AudioContext || window.webkitAudioContext;if(!Audio)return;
      if(!context){context=new Audio();master=context.createGain();master.gain.value=.22;master.connect(context.destination);}
      await context.resume();if(!enabled || document.hidden){await context.suspend();return;}
      if(!timer){nextTime=context.currentTime+.05;schedule();timer=setInterval(schedule,100);}
    } catch { /* A later user gesture can retry blocked browser audio. */ }
  }
  function pause(){clearInterval(timer);timer=null;context?.suspend().catch(()=>{});}
  function toggle(){enabled=!enabled;unlocked=true;localStorage.setItem('wordshift.music',enabled?'on':'off');syncButtons();enabled?play():pause();}
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{unlocked=true;play();},{passive:true});
  document.addEventListener('visibilitychange',()=>document.hidden?pause():play());
  window.WordShiftMusic={toggle,get enabled(){return enabled;},get playing(){return Boolean(timer && context?.state==='running');}};
  syncButtons();
})();
