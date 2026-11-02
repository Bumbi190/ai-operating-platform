/** Authored, fixed tour controls for the fictional showroom; never model output. */
export const CINEMATIC_RUNTIME=String.raw`(()=>{
 'use strict';
 const scene=document.getElementById('cinema-scene'),video=document.getElementById('cinema-video');
 const motion=document.getElementById('cinema-motion'),play=document.getElementById('cinema-play');
 const status=document.getElementById('cinema-status'),seek=document.getElementById('cinema-seek');
 if(!scene||!video||!motion||!play||!status||!seek)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const chapters=Array.from(scene.querySelectorAll('[data-tour-chapter]'));
 const copies=Array.from(scene.querySelectorAll('[data-tour-copy]'));
 const starts=(scene.dataset.chapterStarts||'0,5,9').split(',').map(Number);
 let mode='still',ready=false,broken=false,queued=false,pendingSeek=null,epoch=0,manipulating=false;
 const lastTime=()=>Math.max(0,video.duration-0.04);
 function render(){
  if(!ready)return;
  const t=video.currentTime;let active=0;
  for(let i=1;i<starts.length;i++)if(t>=starts[i]-.04)active=i;
  chapters.forEach((el,i)=>el.setAttribute('aria-current',i===active?'step':'false'));
  copies.forEach((el,i)=>{el.hidden=i!==active;});
  if(!manipulating)seek.value=String(Math.round(t/Math.max(.1,video.duration)*1000));
  scene.style.setProperty('--tour-progress',String(t/Math.max(.1,video.duration)));
 }
 function controls(){
  const scrolling=mode==='scroll',playing=mode==='play';
  scene.dataset.tourMode=mode;
  scene.classList.toggle('is-still',!scrolling);
  motion.setAttribute('aria-pressed',String(scrolling));
  motion.textContent=scrolling?'Stäng av scrollstyrning':'Styr med scroll';
  play.setAttribute('aria-pressed',String(playing));
  play.textContent=playing?'Pausa rundturen':ready&&video.currentTime>0&&video.currentTime<lastTime()?'Fortsätt rundturen':'Spela rundturen';
 }
 function ensureSource(){
  if(!video.getAttribute('src')){ready=false;video.src=video.dataset.src;video.load();}
 }
 function pauseMode(next,align){
  epoch++;video.pause();mode=next;controls();
  if(align)scene.scrollIntoView({block:'start',behavior:'instant'});
 }
 function stop(){
  const bounds=scene.getBoundingClientRect();
  const inside=mode==='scroll'&&bounds.top<=0&&bounds.bottom>0;
  pauseMode('still',inside);ready=false;pendingSeek=null;
  video.hidden=true;video.removeAttribute('src');video.load();
  seek.hidden=true;chapters.forEach(el=>{el.hidden=true;});
  copies.forEach((el,i)=>{el.hidden=i!==0;});
  status.textContent=broken?'Stillbild visas. Du kan fortsätta till bilarna.':'Stillbild visas. Spela rundturen eller välj scrollstyrning.';
  controls();
 }
 function fail(){
  if(broken)return;
  broken=true;stop();motion.disabled=true;play.disabled=true;
  motion.textContent='Scrollfilm är inte tillgänglig';play.textContent='Rundturen är inte tillgänglig';
 }
 function scrollUpdate(){
  queued=false;if(mode!=='scroll'||!ready||video.seeking)return;
  const r=scene.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,-r.top/Math.max(1,r.height-innerHeight)));
  const t=fraction*lastTime();if(Math.abs(video.currentTime-t)>.035)video.currentTime=t;
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(scrollUpdate);}}
 function enableScroll(align){
  if(broken)return;
  const fraction=ready?video.currentTime/Math.max(.1,video.duration):0;
  pauseMode('scroll',false);ensureSource();
  status.textContent='Scrolla ned genom hallen och bilen. Scrolla upp för att gå tillbaka.';
  if(align)window.scrollTo({top:scene.offsetTop+fraction*Math.max(1,scene.offsetHeight-innerHeight),behavior:'instant'});
  schedule();
 }
 function startPlay(){
  if(broken)return;
  if(mode==='play'){pauseMode('paused',false);status.textContent='Pausad. Fortsätt, välj ett kapitel eller dra i tidslinjen.';return;}
  const fromScroll=mode==='scroll';pauseMode('play',fromScroll);ensureSource();
  if(ready&&video.currentTime>=lastTime())video.currentTime=0;
  const token=epoch;
  status.textContent='Rundturen laddas.';
  video.muted=true;
  const attempt=video.play();
  if(attempt&&typeof attempt.then==='function')attempt.then(()=>{
   if(token!==epoch)return;
   status.textContent='Rundturen spelas. Du kan pausa eller välja ett kapitel.';controls();
  }).catch(()=>{
   if(token!==epoch||broken)return;
   pauseMode('paused',false);status.textContent='Rundturen kunde inte starta. Tryck på Spela igen eller välj scrollstyrning.';
  });
 }
 function jump(time){
  if(broken)return;
  pauseMode('paused',mode==='scroll');ensureSource();
  pendingSeek=Math.max(0,time);
  if(ready){video.currentTime=Math.min(lastTime(),pendingSeek);pendingSeek=null;}
  status.textContent='Utforska i din takt. Spela vidare eller välj ett annat kapitel.';
 }
 video.addEventListener('loadeddata',()=>{
  if(mode==='still')return;
  if(!Number.isFinite(video.duration)||video.duration<=0){fail();return;}
  ready=true;video.hidden=false;seek.hidden=false;
  chapters.forEach(el=>{el.hidden=false;});
  if(pendingSeek!==null){video.currentTime=Math.min(lastTime(),pendingSeek);pendingSeek=null;}
  render();controls();if(mode==='scroll')schedule();
 });
 video.addEventListener('timeupdate',render);
 video.addEventListener('seeked',()=>{render();if(mode==='scroll')schedule();});
 video.addEventListener('ended',()=>{pauseMode('paused',false);status.textContent='Rundturen är klar. Utforska bilarna nedanför.';render();controls();});
 video.addEventListener('error',()=>{if(mode!=='still')fail();});
 play.hidden=false;motion.hidden=false;controls();
 play.addEventListener('click',startPlay);
 motion.addEventListener('click',()=>{if(mode==='scroll')stop();else enableScroll(true);});
 chapters.forEach((el,i)=>el.addEventListener('click',()=>jump(starts[i])));
 seek.addEventListener('input',()=>{if(ready)jump(Number(seek.value)/1000*video.duration);});
 seek.addEventListener('pointerdown',()=>{manipulating=true;});
 seek.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))manipulating=true;});
 const releaseSeek=()=>{manipulating=false;render();};
 addEventListener('pointerup',releaseSeek);addEventListener('pointercancel',releaseSeek);
 seek.addEventListener('keyup',releaseSeek);seek.addEventListener('blur',releaseSeek);
 seek.addEventListener('change',releaseSeek);
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='play'){pauseMode('paused',false);status.textContent='Rundturen pausades.';}});
 reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
 if(!reduced.matches&&!matchMedia('(max-width: 760px)').matches&&!matchMedia('(pointer: coarse)').matches&&!(navigator.connection&&navigator.connection.saveData))enableScroll(false);
})();`
