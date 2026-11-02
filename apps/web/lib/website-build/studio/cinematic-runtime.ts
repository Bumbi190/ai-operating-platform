/** Fixed authored runtime for the fictional showroom only; never model output. */
export const CINEMATIC_RUNTIME=String.raw`(()=>{
 'use strict';
 const scene=document.getElementById('cinema-scene');
 const video=document.getElementById('cinema-video');
 const button=document.getElementById('cinema-motion');
 const status=document.getElementById('cinema-status');
 if(!scene||!video||!button||!status)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const mobile=matchMedia('(max-width: 760px)');
 let enabled=false,ready=false,queued=false,target=0,broken=false;
 function update(){
  queued=false;
  if(!enabled||!ready||video.seeking)return;
  const r=scene.getBoundingClientRect();
  const progress=Math.max(0,Math.min(1,-r.top/Math.max(1,r.height-innerHeight)));
  target=progress*Math.max(0,video.duration-0.04);
  if(Number.isFinite(target)&&Math.abs(video.currentTime-target)>0.035)
   video.currentTime=target;
 }
 function schedule(){
  if(!queued){queued=true;requestAnimationFrame(update);}
 }
 function setEnabled(value){
  if(value&&broken)return;
  enabled=value;ready=false;
  button.setAttribute('aria-pressed',String(value));
  button.textContent=value?'Stäng av rörelse':'Aktivera filmisk visning';
  scene.classList.toggle('is-still',!value);
  video.hidden=true;
  if(!value){
   video.pause();video.removeAttribute('src');video.load();
   status.textContent=broken?'Stillbild visas. Du kan fortsätta till bilarna.':'Stillbild visas. Utforska bilarna i din egen takt.';
   return;
  }
  status.textContent='Laddar bilhallen…';
  video.src=video.dataset.src;
  video.load();
 }
 video.addEventListener('loadedmetadata',()=>{
  if(!enabled)return;
  if(!Number.isFinite(video.duration)||video.duration<=0){fail();return;}
  ready=true;video.hidden=false;
  status.textContent='Scrolla för att närma dig bilen. Scrolla upp för att gå tillbaka.';
  schedule();
 });
 video.addEventListener('seeked',schedule);
 function fail(){
  broken=true;setEnabled(false);button.disabled=true;
  button.textContent='Filmisk visning är inte tillgänglig';
 }
 video.addEventListener('error',()=>{if(enabled)fail();});
 video.addEventListener('abort',()=>{if(enabled&&video.error)fail();});
 button.hidden=false;
 button.addEventListener('click',()=>setEnabled(!enabled));
 addEventListener('scroll',schedule,{passive:true});
 addEventListener('resize',schedule,{passive:true});
 reduced.addEventListener('change',()=>{if(reduced.matches)setEnabled(false);});
 if(!reduced.matches&&!mobile.matches&&!matchMedia('(pointer: coarse)').matches&&!(navigator.connection&&navigator.connection.saveData))
  setEnabled(true);
})();`
