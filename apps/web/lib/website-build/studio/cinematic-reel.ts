import shots from './cinematic-assets/reel.json'

const files={wide:'reel.'+shots.wide.sha256.slice(0,16)+'.mp4',portrait:'reel.'+shots.portrait.sha256.slice(0,16)+'.mp4'}
const widePoster='reel.'+shots.widePoster.sha256.slice(0,16)+'.webp'
const portraitPoster='reel.'+shots.portraitPoster.sha256.slice(0,16)+'.webp'
const scrollFilm='reel.'+shots.scroll.sha256.slice(0,16)+'.mp4'
const backdrop='reel.'+shots.backdrop.sha256.slice(0,16)+'.webp'
export const reelFiles=new Map([[scrollFilm,shots.scroll],[backdrop,shots.backdrop],[files.wide,shots.wide],[files.portrait,shots.portrait],[widePoster,shots.widePoster],[portraitPoster,shots.portraitPoster]])
export const REEL_RUNTIME=String.raw`(()=>{
 const scene=document.querySelector('#story'), film=document.querySelector('#reel');
 const play=document.querySelector('#play'), mode=document.querySelector('#mode');
 const hint=document.querySelector('#hint'), progress=document.querySelector('#progress'), chapter=document.querySelector('#chapter');
 const small=matchMedia('(max-width: 760px)'), touch=matchMedia('(pointer: coarse)'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const chapters=['01 / Bilhallen','02 / Annonsen','03 / In i bilen','04 / Fri 3D-vy','05 / Bildgalleriet','06 / Din bilhall'];
 const cuts=[3,3.833,9.333,13.083,16.083];
 let scrollMode=false, manual=false, raf=0, travel=1;
 function resize(){travel=Math.max(1,scene.offsetHeight-innerHeight);queue()}
 function source(){
  const url=small.matches?film.dataset.portrait:film.dataset.scroll;
  if(film.getAttribute('src')!==url){film.src=url;film.load()}
 }
 function display(){
  const time=film.currentTime||0, title=chapters[cuts.filter(n=>time>=n).length];
  progress.value=time;
  if(chapter.textContent!==title)chapter.textContent=title;
 }
 function update(){
  raf=0;
  if(!scrollMode||film.readyState<2||film.seeking||document.hidden)return;
  // One seek at a time. Re-read the latest scroll position when the decoder is ready.
  const lastFrame=Math.max(0,Math.round(film.duration*24)-1);
  const frame=Math.round(Math.min(1,Math.max(0,scrollY/travel))*lastFrame);
  if(frame!==Math.round(film.currentTime*24))film.currentTime=frame/24;
 }
 function queue(){if(scrollMode&&!raf)raf=requestAnimationFrame(update)}
 function label(){
  const name=film.ended?'Spela igen':film.paused?'Spela filmen':'Pausa filmen';
  play.setAttribute('aria-label',name);play.title=name;play.textContent=film.paused?'▶':'Ⅱ';
 }
 function start(){
  source();if(film.ended)film.currentTime=0;
  film.play().catch(()=>{hint.textContent='Tryck på play för att starta filmen.';label()});
 }
 function policy(){
  const desktop=!small.matches&&!touch.matches&&!reduced.matches&&!navigator.connection?.saveData;
  scrollMode=desktop&&!manual;
  film.pause();film.poster=small.matches?film.dataset.portraitPoster:film.dataset.widePoster;
  const desired=small.matches?film.dataset.portrait:film.dataset.scroll;
  if(film.hasAttribute('src')&&film.getAttribute('src')!==desired){film.removeAttribute('src');film.load();display()}
  scene.classList.toggle('scroll',scrollMode);play.hidden=scrollMode;mode.hidden=!desktop;
  mode.textContent=scrollMode?'Spela utan scroll ▶':'Styr med scroll ↕';
  hint.textContent=scrollMode?'Scrolla ned för att gå framåt. Scrolla upp för att backa.':'Tryck på play för att se visningen.';
  film.preload=scrollMode?'auto':'none';
  if(scrollMode)source();
  resize();label();
 }
 mode.addEventListener('click',()=>{
  const time=film.currentTime;manual=scrollMode;policy();
  if(manual){scene.scrollIntoView();start()}
  else{scrollTo(0,travel*time/(film.duration||18));queue()}
 });
 play.addEventListener('click',()=>{if(film.paused)start();else film.pause()});
 film.addEventListener('loadeddata',()=>{display();queue()});
 film.addEventListener('seeked',()=>{display();update()});
 film.addEventListener('timeupdate',display);
 for(const e of ['playing','pause','ended'])film.addEventListener(e,label);
 film.addEventListener('error',()=>{manual=true;policy();film.removeAttribute('src');film.load();hint.textContent='Filmen kunde inte laddas. Försök igen eller öppna bilhallen.'});
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',resize,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();else queue()});
 for(const q of [small,touch,reduced])q.addEventListener('change',policy);
 policy();display();
})();`

export function reelResponse(runtimeName:string,root='/build/demo-motors/cinematic'){
 const planningEmail='mailto:info@handlarborsen.se?subject=Vi%20vill%20planera%20en%20hemsida%20f%C3%B6r%20v%C3%A5r%20bilhall&amp;body=Hej!%20Vi%20har%20sett%20f%C3%B6rhandsvisningen%20och%20vill%20prata%20om%20v%C3%A5r%20hemsida.%0A%0ABilhallens%20namn%3A%20%0AV%C3%A5r%20hemsida%20idag%3A%20%0ADet%20viktigaste%20f%C3%B6r%20oss%3A%20'
 const html=`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Förhandsvisning för bilhandlare · Omnira Web Studio</title><style>
 *{box-sizing:border-box}html,body{margin:0;background:#09151b;color:#f5f2ec;font:16px/1.45 system-ui,sans-serif}a{color:inherit}#story.scroll{height:420svh}.screen{max-width:1420px;margin:auto;padding:14px clamp(16px,4vw,64px);display:flex;flex-direction:column;gap:12px}.scroll .screen{position:sticky;top:0;height:100svh}.mast,.caption,.top{display:flex;align-items:center;justify-content:space-between;gap:16px}.mast{border-bottom:1px solid #39454a;padding:4px 0 10px}.mast b,.eyebrow{font-size:11px;letter-spacing:.18em;color:#dfc395}.mast a,.cta a{font-size:14px;text-decoration:none;border-bottom:1px solid #af9470}.eyebrow{margin:0}.top h1{font-size:clamp(24px,3.6vw,48px);letter-spacing:-.055em;line-height:1.02;margin:3px 0}.top small,.caption{color:#c6cfce;font-size:13px}.frame{position:relative;min-height:0;display:grid;place-items:center;overflow:hidden;border:1px solid #675b49;border-radius:16px;background:#060d12}.scroll .frame{flex:1}.frame video{display:block;width:100%;max-height:72svh;object-fit:contain}.scroll .frame video{height:100%;max-height:100%;min-height:0;position:absolute;inset:0}#play{position:absolute;bottom:12px;right:12px;width:48px;height:48px;border-radius:50%;border:1px solid #ffedcf;color:#14222a;background:#e7cda5;font-size:18px;cursor:pointer}#play[hidden]{display:none}progress{width:100%;height:4px;accent-color:#d5b78a}progress::-webkit-progress-bar{background:#37444a}progress::-webkit-progress-value{background:#d5b78a}.cta{min-height:26vh;display:grid;place-content:center;justify-items:center;gap:10px;text-align:center;padding:28px}.cta h2{font-size:clamp(26px,3vw,46px);letter-spacing:-.05em;margin:0}.cta .download{background:none;border:0;color:#cfb78e;font-size:13px;font-weight:500;padding:4px}.download.mobile{display:none}@media(max-width:760px){.download.mobile{display:block}.download.desktop{display:none}}.cta a{background:#e5cba3;color:#11222b;padding:11px 20px;border:0;border-radius:24px;font-weight:650}a:focus-visible,button:focus-visible{outline:3px solid #fff;outline-offset:3px}
 @media(max-width:760px){.screen{gap:9px}.frame{width:min(100%,40svh);min-width:min(100%,265px);margin:auto;aspect-ratio:9/16}.frame video{width:100%;height:100%;max-height:none}.top small{font-size:11px}.caption{align-items:flex-start}.caption span:last-child{text-align:right}.mast b{font-size:10px}.cta{min-height:16vh}}
 /* The same Nord R photo ties the film, margins and end card to the dealership. */
 body{position:relative;isolation:isolate;background:transparent}
 body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(90deg,rgba(6,18,24,.96) 2%,rgba(7,22,29,.73) 47%,rgba(10,24,32,.50)),linear-gradient(0deg,rgba(4,15,22,.7),transparent 65%),url("${root}/assets/${backdrop}") center 52%/cover no-repeat,#0a1920}
 .screen{max-width:1280px;padding:clamp(10px,2vh,20px) clamp(18px,5vw,80px);gap:clamp(8px,1.4vh,15px)}
 .mast{border-color:#d3b77a50}.mast b,.eyebrow{color:#f1cd94}.mast a{color:#fff4df}
 .top{padding:clamp(4px,1vh,14px) 0}.top h1{font-size:clamp(34px,min(5.3vw,7.3vh),78px);font-weight:730;line-height:1.07;color:#fff9ef}
 .top em,.cta h2{font-family:Georgia,serif;font-weight:400}.top em{color:#f3ce93;letter-spacing:-.055em}
 .edition{display:flex;align-items:center;gap:10px;letter-spacing:.16em;white-space:nowrap}.edition i{width:28px;height:1px;background:#c3a475}
 .frame{box-shadow:0 9px 30px #02090d65;border-color:#dfc19079;background:#071217}
 .caption{gap:12px;flex-wrap:wrap}.caption strong{color:#ffe1b2;letter-spacing:.04em}.caption span{margin-right:auto}
 #mode{background:#112128;color:#fae7ca;border:1px solid #c3a47585;border-radius:30px;padding:8px 15px;font:inherit;cursor:pointer}
 .cta{gap:13px;background:linear-gradient(0deg,#081820ea,#08182040);padding-block:clamp(40px,9vh,95px)}.cta h2{font-size:clamp(34px,5vw,70px);font-style:italic;color:#fff1d9}
 @media(max-width:760px){.screen{padding:12px 16px;gap:10px}.top{display:block}.top h1{font-size:clamp(30px,8vw,50px)}.top .edition{display:none}.caption{align-items:baseline}.caption span{margin:0}.frame{border-radius:12px}.cta{padding:32px 12px}}
 .intro,.pitch{margin:6px 0 0;color:#e3e8e6;max-width:68ch;font-size:clamp(13px,1.2vw,16px)}.pitch{margin:0 0 6px}.mast .plan-link{background:#e7c99d;color:#102028;border:0;padding:7px 15px;border-radius:22px;font-weight:650}
 .factline{display:flex;align-items:center;flex-wrap:wrap;gap:3px 14px;color:#eeeae0;font-size:13px}.factline b{color:#f0d2a2}.factline small{font-weight:400}.address,.cta .demo-link{color:#e7d7ba;font-size:13px}.cta .demo-link{background:none;border-bottom:1px solid #b39a75;border-radius:0;padding:3px}.top .edition{flex-shrink:0}
 @media(max-width:760px){.intro{max-width:48ch}.factline{font-size:12px;gap:2px 9px}.mast .plan-link{font-size:12px}.cta{gap:9px}}@media(min-width:761px) and (max-height:680px){.screen{gap:5px;padding-block:5px}.top{padding:2px 0}.top h1{font-size:30px}.mast{padding-bottom:4px}}
 </style><main id="story"><section class="screen"><header class="mast"><b>OMNIRA WEB STUDIO</b><a class="plan-link" href="${planningEmail}">Planera vår hemsida ↗</a></header><div class="top"><div><p class="eyebrow">FÖRHANDSVISNING FÖR BILHANDLARE</p><h1>Låt kunden kliva in <em>i er bilhall.</em></h1><p class="intro">Se vår exempelbil på 18 sekunder. Öppna sedan annonsen och prova vägen från första ögonkastet till förarplatsen.</p></div><small class="edition">NORD R <i></i> FILM 01</small></div><div class="frame"><video id="reel" muted playsinline preload="none" poster="${root}/assets/${widePoster}" data-wide-poster="${root}/assets/${widePoster}" data-portrait-poster="${root}/assets/${portraitPoster}" data-scroll="${root}/assets/${scrollFilm}" data-portrait="${root}/assets/${files.portrait}" aria-label="Från bilhallen till Nord R:s kupé, 3D-vy och bildgalleri"></video><button id="play" type="button" aria-label="Spela filmen" hidden>▶</button></div><progress id="progress" max="18" value="0" aria-label="Förlopp i filmen"></progress><div class="factline" aria-label="Exempelannons för Nord R"><b>Nord R <small>· Konceptbil</small></b><span>549 000 kr</span><span>Årsmodell 2025</span><span>480 mil</span><span>El · SUV</span></div><div class="caption"><strong id="chapter">01 / Bilhallen</strong><span id="hint"></span><button id="mode" type="button" hidden>Spela utan scroll ▶</button></div><noscript><a href="${root}/assets/${files.wide}">Spela filmen</a></noscript></section></main><footer class="cta"><p class="eyebrow">OMNIRA WEB STUDIO · FÖR BILHANDLARE</p><h2>Vilken bil vill ni visa först?</h2><p class="pitch">Berätta om er bilhall och hur ni visar lagret i dag. Tillsammans planerar vi vilka bilar som ska ta plats, hur annonserna ska se ut och hur köparen når er säljare.</p><a href="${planningEmail}">Planera vår hemsida ↗</a><span class="address">Öppnar ert mejlprogram · info@handlarborsen.se</span><a class="demo-link" href="${root}#lager">Prova Nord R själv ↗</a><a class="download desktop" href="${root}/assets/${files.wide}" download="Demo-Motors-18s.mp4">Hämta filmen · MP4</a><a class="download mobile" href="${root}/assets/${files.portrait}" download="Demo-Motors-mobil-18s.mp4">Hämta mobilfilmen · MP4</a></footer><script defer src="${root}/assets/${runtimeName}"></script></html>`
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-frame-options':'DENY','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'"}})
}