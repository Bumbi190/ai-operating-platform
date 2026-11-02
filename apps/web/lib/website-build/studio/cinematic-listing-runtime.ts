export const LISTING_RUNTIME=String.raw`(()=>{
 const dialog=document.querySelector('#lot-dialog'),open=document.querySelector('#lot-open');
 if(!dialog||!open||typeof dialog.showModal!=='function')return;
 const stage=dialog.querySelector('#lot-stage'),photo=stage.querySelector('img');
 const orbit=dialog.querySelector('#lot-orbit'),thumbs=[...dialog.querySelectorAll('[data-lot-photo]')];
 const form=dialog.querySelector('#lot-form'),amount=form.elements.amount,message=form.elements.message;
 const result=dialog.querySelector('#lot-result'),close=dialog.querySelector('#lot-close');
 const loadStatus=dialog.querySelector('#lot-load');
 let action='',frame=null,observer=null,deadline=0;
 function stopWatching(){clearTimeout(deadline);if(observer)observer.disconnect();observer=null;}
 function removeFrame(){stopWatching();if(frame)frame.remove();frame=null;}
 function failed(){
  removeFrame();photo.hidden=false;loadStatus.hidden=false;
  loadStatus.textContent='3D-vyn kunde inte laddas. Välj 3D-vy för att försöka igen.';
 }
 function loadModel(){
  if(frame)return;
  photo.src=thumbs[0].querySelector('img').getAttribute('src');photo.alt='Nord R framifrån';photo.hidden=false;
  loadStatus.textContent='Laddar 3D-modellen…';loadStatus.hidden=false;
  const next=document.createElement('iframe');frame=next;next.style.visibility='hidden';
  next.title='Fri 3D-vy av Nord R';
  next.addEventListener('load',()=>{
   if(frame!==next)return;
   const root=next.contentDocument?.getElementById('vehicle-stage');
   if(!root||!root.dataset.model3dState){failed();return;}
   function check(){
    if(frame!==next)return;
    if(root.dataset.model3dState==='fallback'){failed();return;}
    if(root.dataset.model3dState==='ready'){
     stopWatching();photo.hidden=true;loadStatus.hidden=true;next.style.visibility='visible';
    }
   }
   observer=new MutationObserver(check);observer.observe(root,{attributes:true,attributeFilter:['data-model3d-state']});check();
  },{once:true});
  deadline=setTimeout(()=>{if(frame===next)failed();},15000);
  next.src='/build/demo-motors/cinematic?view=nord-r';stage.append(next);
 }
 const tour=dialog.querySelector('#lot-tour'),film=stage.querySelector('#lot-film');
 const filmControls=dialog.querySelector('#lot-film-controls'),timeline=dialog.querySelector('#lot-timeline');
 let inTour=false,filmTick=0,position=0,drag=null,allowPlay=true,direct=false;
 const allowWarm=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches&&!navigator.connection?.saveData;
 function warmFilm(){
  if(film.hasAttribute('src'))return;
  film.preload='auto';film.src=film.dataset.src;film.load();
 }
 function showFilm(){
  if(!inTour||film.readyState<2)return;
  film.hidden=false;photo.hidden=true;loadStatus.hidden=true;queueFilm();
 }
 function setPosition(value,jump=false){
  direct=jump;
  position=Math.max(0,Math.min(1000,value));timeline.value=String(position);requestFilm();queueFilm();
 }
 function present(){
  filmTick=0;
  if(!inTour||film.readyState<2||film.seeking||!Number.isFinite(film.duration))return;
  const end=Math.max(0,film.duration-.04),target=position/1000*end;
  const gap=target-film.currentTime;
  if(Math.abs(gap)<.026||document.hidden){film.pause();return;}
  // Dragging addresses an exact frame. Wheel input travels through the frames in between.
  if(direct||Math.abs(gap)>1.1){
   film.pause();film.currentTime=direct?target:target-Math.sign(gap)*.45;return;
  }
  if(gap>0&&allowPlay){
   const rate=gap>.8?1.5:1;
   if(film.playbackRate!==rate)film.playbackRate=rate;
   if(film.paused)film.play().catch(err=>{
    if(err.name==='NotAllowedError'){allowPlay=false;queueFilm();}
   });
   queueFilm();return;
  }
  film.pause();film.currentTime+=Math.sign(gap)*Math.min(Math.abs(gap),Math.max(1/30,Math.abs(gap)*.10));
 }
 function queueFilm(){if(!filmTick)filmTick=requestAnimationFrame(present);}
 function requestFilm(){
  warmFilm();
  if(film.readyState>=2){showFilm();return;}
  if(!film.hidden)return;
  loadStatus.textContent='Laddar rundturen…';loadStatus.hidden=false;
 }
 function stopFilm(){
  inTour=false;drag=null;cancelAnimationFrame(filmTick);filmTick=0;
  film.hidden=true;filmControls.hidden=true;
  film.pause();
 }
 film.addEventListener('loadeddata',showFilm);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();else if(inTour)queueFilm();});
 film.addEventListener('seeked',showFilm);
 film.addEventListener('error',()=>{
  if(!film.hasAttribute('src'))return;
  film.removeAttribute('src');if(!inTour)return;film.hidden=true;photo.hidden=false;loadStatus.hidden=false;
  loadStatus.textContent='Filmen kunde inte laddas. Välj Rundtur för att försöka igen.';
 });
 timeline.addEventListener('input',()=>setPosition(Number(timeline.value),true));
 stage.addEventListener('pointerdown',e=>{
  if(!inTour||!e.isPrimary||e.button!==0)return;
  drag={id:e.pointerId,x:e.clientX,start:position};stage.setPointerCapture(e.pointerId);
 });
 stage.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  setPosition(drag.start+(e.clientX-drag.x)*1000/stage.clientWidth,true);
 });
 stage.addEventListener('lostpointercapture',()=>{drag=null;});
 stage.addEventListener('wheel',event=>{
  if(!inTour||event.ctrlKey||!event.deltaY||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1;
  const old=position,next=Math.max(0,Math.min(1000,old+event.deltaY*unit*.55));
  if(next===old)return;
  event.preventDefault();setPosition(next);
 },{passive:false});
 function showView(button,explicit=true){
  [tour,orbit,...thumbs].forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  if(button===tour){
   removeFrame();inTour=true;filmControls.hidden=false;
   if(film.readyState>=2){showFilm();return;}
   photo.src=tour.querySelector('img').getAttribute('src');photo.alt='Nord R inför rundturen';photo.hidden=false;
   if(explicit||film.hasAttribute('src')||allowWarm())requestFilm();
   else{loadStatus.textContent='Dra i reglaget eller välj Rundtur för att ladda filmen.';loadStatus.hidden=false;}
   return;
  }
  stopFilm();
  if(button===orbit){loadModel();return;}
  removeFrame();loadStatus.hidden=true;photo.hidden=false;
  photo.src=button.querySelector('img').getAttribute('src');photo.alt='Nord R · '+button.textContent.trim();
 }
 function clearDeal(){action='';form.reset();form.hidden=true;result.textContent='';}
 const card=open.closest('article');
 function anticipate(){if(allowWarm())warmFilm();}
 if('IntersectionObserver' in window){
  const nearCard=new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting)&&allowWarm()){
    nearCard.disconnect();warmFilm();
   }
  },{threshold:.25});
  nearCard.observe(card);
 }
 card.addEventListener('pointerenter',anticipate);
 open.addEventListener('focus',anticipate);
 open.hidden=false;
 const fallback=open.closest('article').querySelector('details');
 if(fallback)fallback.hidden=true;
 open.addEventListener('click',()=>{
  const from=open.closest('article').getBoundingClientRect();
  clearDeal();dialog.showModal();dialog.scrollTop=0;position=0;direct=true;timeline.value='0';showView(tour,false);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&dialog.animate){
   const to=dialog.getBoundingClientRect();
   const dx=from.left+from.width/2-to.left-to.width/2,dy=from.top+from.height/2-to.top-to.height/2;
   dialog.animate([{transform:'translate('+dx+'px,'+dy+'px) scale('+Math.min(.9,from.width/to.width)+','+Math.min(.9,from.height/to.height)+')',opacity:.4},{transform:'none',opacity:1}],{duration:340,easing:'cubic-bezier(.16,1,.3,1)'});
  }
 });
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{stopFilm();if(film.readyState>=2)film.currentTime=0;removeFrame();clearDeal();open.focus({preventScroll:true});});
 [tour,orbit,...thumbs].forEach(button=>button.addEventListener('click',()=>showView(button)));
 const confirm=dialog.querySelector('#lot-confirm');
 dialog.querySelectorAll('[data-deal]').forEach(button=>button.addEventListener('click',()=>{
  clearDeal();action=button.dataset.deal;form.hidden=false;
  amount.disabled=action!=='bid';amount.required=!amount.disabled;amount.parentElement.hidden=amount.disabled;
  message.disabled=action!=='contact';message.required=!message.disabled;message.parentElement.hidden=message.disabled;
  dialog.querySelector('#lot-prompt').textContent=action==='buy'?'Prova ett köp av Nord R till fast pris, 549 000 kr.':action==='bid'?'Vilket pris vill du erbjuda för Nord R?':'Vad vill du fråga säljaren om bilen?';
  confirm.textContent=action==='buy'?'Bekräfta demoköp':action==='bid'?'Förhandsvisa bud':'Förhandsvisa meddelande';
  (action==='buy'?confirm:action==='bid'?amount:message).focus();
 }));
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!action||!form.reportValidity())return;
  if(action==='contact'&&!message.value.trim()){message.focus();return;}
  result.textContent=action==='buy'?'Demoköp visat · Nord R · 549 000 kr. Ingen beställning har lagts.':action==='bid'?'Förhandsvisat bud på Nord R: '+Number(amount.value).toLocaleString('sv-SE')+' kr. Inget bud har skickats.':'Till Demo Motors om Nord R: '+message.value.trim()+' · Förhandsvisning, inget skickat.';
  form.hidden=true;action='';close.focus({preventScroll:true});
 });
})();`
