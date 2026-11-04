// Source-owned controls for the approved film. No remote URLs or provider calls.
export const ROADSTER_RUNTIME=String.raw`const config=JSON.parse(document.querySelector('#roadster-config').textContent);
const stage=document.querySelector('#screen'), track=document.querySelector('#track'), caption=document.querySelector('#caption'), bar=document.querySelector('#filmbar');
const mode=document.querySelector('#mode'), chapter=document.querySelector('#chapter'), timeline=document.querySelector('#timeline'), timelineLabel=document.querySelector('#timeline-label');
const photos={cover:[config.cover,'Den röda karossen i kvällsljus.'],cabin:[config.cabin,'Förarplatsen sedd från passagerarsidan.'],rear:[config.rear,'Aktern med fyra illustrerade konceptthrusters.']};
let video=null, scrollMode=false, scheduled=false;
const stillPreference=matchMedia('(prefers-reduced-motion: reduce)');
function queueSeek(){if(scrollMode&&!scheduled){scheduled=true;requestAnimationFrame(seekScroll)}}
function scrollRange() {
 const start = window.scrollY + track.getBoundingClientRect().top;
 const stageEnd = start + track.offsetHeight - document.querySelector('#panel').offsetHeight;
 const pageEnd = document.documentElement.scrollHeight - innerHeight;
 return { start, distance: Math.max(1, Math.min(stageEnd, pageEnd) - start) };
}
function seekScroll() {
 scheduled = false;
 if (!scrollMode || !video || !Number.isFinite(video.duration) || video.seeking) return;
 const range = scrollRange();
 const progress = Math.min(1, Math.max(0, (window.scrollY - range.start) / range.distance));
 const time = progress * Math.max(0, video.duration - 0.01);
 if (Math.abs(video.currentTime - time) > 0.015) video.currentTime = time;
}
function setScroll(on,align=false){
 scrollMode=on;track.classList.toggle('scrolling',on);mode.setAttribute('aria-pressed',String(on));
 mode.textContent=on?'Spela normalt':'Styr med scroll';
 if(!video)return;video.controls=!on;
 if(on){video.pause();if(align){const range=scrollRange();window.scrollTo(0,range.start+(video.currentTime/(video.duration||1))*range.distance)}queueSeek()}
}
function setView(key,align=true){
 const wasScrolling=scrollMode, start=window.scrollY+track.getBoundingClientRect().top;
 if(video){video.onloadeddata=video.onseeked=video.ontimeupdate=video.onerror=null;video.pause();video.removeAttribute('src');video.load()}setScroll(false);video=null;timeline.value='0';bar.hidden=key!=='film';timeline.hidden=timelineLabel.hidden=key!=='film';stage.replaceChildren();
 if(wasScrolling&&window.scrollY>start)window.scrollTo(0,start);
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===key)));
 if(key==='mesh'){const frame=document.createElement('iframe');frame.title='Vridbar 3D-modell av Roadster';frame.src=config.viewer;stage.append(frame);caption.textContent='Dra för att vrida bilen. Nyp eller scrolla för att zooma.';return}
 if(key!=='film'){const img=new Image();[img.src,img.alt]=photos[key];stage.append(img);caption.textContent=photos[key][1];return}
 const v=document.createElement('video');video=v;v.playsInline=true;v.muted=true;v.preload='auto';v.poster=photos.cover[0];v.src=config.film;stage.append(v);
 v.onloadeddata=v.onseeked=queueSeek;v.onerror=()=>{setScroll(false);mode.disabled=true;timeline.disabled=true;caption.textContent='Filmen kunde inte laddas. Bilderna och 3D-vyn finns kvar.'};mode.disabled=timeline.disabled=false;
 v.ontimeupdate=()=>{timeline.value=String(Math.round(1000*v.currentTime/(v.duration||1)));const label=v.currentTime<2.5?'01 / Exteriör' :v.currentTime<5.04?'02 / Kupé':v.currentTime<10.08?'03 / Runt till aktern':'04 / Thrusterstart';if(chapter.textContent!==label)chapter.textContent=label};chapter.textContent='01 / Exteriör';
 const desktop=!matchMedia('(max-width:760px), (pointer:coarse)').matches && !stillPreference.matches;
 setScroll(desktop,desktop&&align);caption.textContent='Följ kameran in i kupén, ut runt aktern och hela vägen till thrusterstarten.';
 // Mobile and reduced motion retain explicit playback controls.
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-pressed')!=='true')setView(b.dataset.view)});
mode.onclick=()=>{if(!video)return;if(scrollMode){const top=window.scrollY+track.getBoundingClientRect().top;setScroll(false);window.scrollTo(0,top);video.play().catch(()=>{})}else setScroll(true,true)};
addEventListener('scroll',queueSeek,{passive:true});addEventListener('resize',queueSeek);
stillPreference.addEventListener('change',()=>{if(video&&stillPreference.matches){setScroll(false);video.pause()}});
document.querySelector('.cta').onclick=()=>{document.querySelector('details').open=true};
document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('#sent').textContent='Testet är klart. Inget meddelande har skickats.'};

timeline.oninput=()=>{if(!video||!Number.isFinite(video.duration))return;const progress=Number(timeline.value)/1000;video.currentTime=progress*Math.max(0,video.duration-.01);if(scrollMode){const range=scrollRange();window.scrollTo(0,range.start+progress*range.distance)}};
addEventListener('pagehide',()=>{if(video)video.pause()});
`
