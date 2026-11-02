import shots from './cinematic-assets/reel.json'

const root='/build/demo-motors/cinematic'
const files={wide:'reel.'+shots.wide.sha256.slice(0,16)+'.mp4',portrait:'reel.'+shots.portrait.sha256.slice(0,16)+'.mp4'}
const widePoster='reel.'+shots.widePoster.sha256.slice(0,16)+'.webp'
const portraitPoster='reel.'+shots.portraitPoster.sha256.slice(0,16)+'.webp'
export const reelFiles=new Map([[files.wide,shots.wide],[files.portrait,shots.portrait],[widePoster,shots.widePoster],[portraitPoster,shots.portraitPoster]])
export const REEL_RUNTIME=String.raw`(()=>{
 const scene=document.querySelector('#story'),film=document.querySelector('#reel'),play=document.querySelector('#play'),status=document.querySelector('#hint'),progress=document.querySelector('#progress');
 const small=matchMedia('(max-width: 760px)'),touch=matchMedia('(pointer: coarse)'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let scrollMode=false,raf=0,denied=false;
 const end=()=>Math.max(0,film.duration-.045);
 function source(){if(!film.hasAttribute('src')){film.src=small.matches?film.dataset.portrait:film.dataset.wide;film.load()}}
 function update(){
  raf=0;if(!scrollMode||film.readyState<2||film.seeking||document.hidden)return;
  const rect=scene.getBoundingClientRect(),travel=Math.max(1,scrollY+rect.bottom-innerHeight);
  const target=Math.min(1,Math.max(0,scrollY/travel))*end(),gap=target-film.currentTime;
  if(Math.abs(gap)<.035){film.pause();return}
  if(gap>0&&gap<=.9&&!denied){
   const rate=gap>.5?1.55:1;if(film.playbackRate!==rate)film.playbackRate=rate;
   if(film.paused)film.play().catch(e=>{if(e.name==='NotAllowedError'){denied=true;queue()}});
   queue();
  }else{
   film.pause();
   const step=Math.min(Math.abs(gap),Math.max(1/24,Math.abs(gap)*.14));
   film.currentTime=Math.abs(gap)>.9?target:film.currentTime+Math.sign(gap)*step;
  }
 }
 function queue(){if(scrollMode&&!raf)raf=requestAnimationFrame(update)}
 function display(){
  const t=film.currentTime||0;progress.value=t;const chapters=[3,3.833,9.333,13.083,16.083];
  document.querySelector('#chapter').textContent=['01 / Bilhallen','02 / Annonsen','03 / In i bilen','04 / Fri 3D-vy','05 / Bildgalleriet','06 / Din bilhall'][chapters.filter(n=>t>=n).length];
 }
 function label(){
  const name=film.ended?'Spela igen':film.paused?'Spela filmen':'Pausa filmen';
  play.setAttribute('aria-label',name);play.title=name;play.textContent=film.paused?'▶':'Ⅱ';
 }
 function policy(){
  film.poster=small.matches?film.dataset.portraitPoster:film.dataset.widePoster;
  const next=!small.matches&&!touch.matches&&!reduced.matches&&!navigator.connection?.saveData;
  film.pause();
  const desired=small.matches?film.dataset.portrait:film.dataset.wide;
  if(film.hasAttribute('src')&&film.getAttribute('src')!==desired){film.removeAttribute('src');film.load();display()}
  film.playbackRate=1;scrollMode=next;scene.classList.toggle('scroll',next);play.hidden=next;
  status.textContent=next?'Scrolla ned för att gå framåt. Scrolla upp för att backa.':'Tryck på play för att se visningen.';
  if(next){source();queue()}label();
 }
 play.addEventListener('click',()=>{
  if(!film.paused){film.pause();return}source();if(film.ended)film.currentTime=0;
  film.play().catch(()=>{status.textContent='Filmen kunde inte starta. Prova igen eller öppna bilhallen.';label()});
 });
 film.addEventListener('loadeddata',()=>{display();queue()});
 film.addEventListener('seeked',()=>{display();queue()});film.addEventListener('timeupdate',display);
 for(const e of ['playing','pause','ended'])film.addEventListener(e,label);
 film.addEventListener('error',()=>{scrollMode=false;scene.classList.remove('scroll');film.removeAttribute('src');play.hidden=false;status.textContent='Filmen kunde inte laddas. Försök igen eller öppna bilhallen.';label()});
 addEventListener('scroll',queue,{passive:true});addEventListener('resize',queue,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();else queue()});
 for(const q of [small,touch,reduced])q.addEventListener('change',policy);
 policy();display();
})();`

export function reelResponse(runtimeName:string){
 const html=`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>En bilhall på 18 sekunder · Omnira Web Studio</title><style>
 *{box-sizing:border-box}html,body{margin:0;background:#09151b;color:#f5f2ec;font:16px/1.45 system-ui,sans-serif}a{color:inherit}#story.scroll{height:420svh}.screen{max-width:1420px;margin:auto;padding:14px clamp(16px,4vw,64px);display:flex;flex-direction:column;gap:12px}.scroll .screen{position:sticky;top:0;height:100svh}.mast,.caption,.top{display:flex;align-items:center;justify-content:space-between;gap:16px}.mast{border-bottom:1px solid #39454a;padding:4px 0 10px}.mast b,.eyebrow{font-size:11px;letter-spacing:.18em;color:#dfc395}.mast a,.cta a{font-size:14px;text-decoration:none;border-bottom:1px solid #af9470}.eyebrow{margin:0}.top h1{font-size:clamp(24px,3.6vw,48px);letter-spacing:-.055em;line-height:1.02;margin:3px 0}.top small,.caption{color:#c6cfce;font-size:13px}.frame{position:relative;min-height:0;display:grid;place-items:center;overflow:hidden;border:1px solid #675b49;border-radius:16px;background:#060d12}.scroll .frame{flex:1}.frame video{display:block;width:100%;max-height:72svh;object-fit:contain}.scroll .frame video{height:100%;max-height:100%;min-height:0;position:absolute;inset:0}#play{position:absolute;bottom:12px;right:12px;width:48px;height:48px;border-radius:50%;border:1px solid #ffedcf;color:#14222a;background:#e7cda5;font-size:18px;cursor:pointer}#play[hidden]{display:none}progress{width:100%;height:4px;accent-color:#d5b78a}progress::-webkit-progress-bar{background:#37444a}progress::-webkit-progress-value{background:#d5b78a}.cta{min-height:26vh;display:grid;place-content:center;justify-items:center;gap:10px;text-align:center;padding:28px}.cta h2{font-size:clamp(26px,3vw,46px);letter-spacing:-.05em;margin:0}.cta .download{background:none;border:0;color:#cfb78e;font-size:13px;font-weight:500;padding:4px}.download.mobile{display:none}@media(max-width:760px){.download.mobile{display:block}.download.desktop{display:none}}.cta a{background:#e5cba3;color:#11222b;padding:11px 20px;border:0;border-radius:24px;font-weight:650}a:focus-visible,button:focus-visible{outline:3px solid #fff;outline-offset:3px}
 @media(max-width:760px){.screen{gap:9px}.frame{width:min(100%,40svh);min-width:min(100%,265px);margin:auto;aspect-ratio:9/16}.frame video{width:100%;height:100%;max-height:none}.top small{font-size:11px}.caption{align-items:flex-start}.caption span:last-child{text-align:right}.mast b{font-size:10px}.cta{min-height:16vh}}
 </style><main id="story"><section class="screen"><header class="mast"><b>OMNIRA WEB STUDIO</b><a href="${root}">Prova bilhallen ↗</a></header><div class="top"><div><p class="eyebrow">DEMO MOTORS · KONCEPTVISNING</p><h1>En bilhall på 18 sekunder.</h1></div><small>FILM 01</small></div><div class="frame"><video id="reel" muted playsinline preload="none" poster="${root}/assets/${widePoster}" data-wide-poster="${root}/assets/${widePoster}" data-portrait-poster="${root}/assets/${portraitPoster}" data-wide="${root}/assets/${files.wide}" data-portrait="${root}/assets/${files.portrait}" aria-label="Från bilhallen till Nord R:s kupé, 3D-vy och bildgalleri"></video><button id="play" type="button" aria-label="Spela filmen" hidden>▶</button></div><progress id="progress" max="18" value="0" aria-label="Förlopp i filmen"></progress><div class="caption"><strong id="chapter">01 / Bilhallen</strong><span id="hint"></span></div><noscript><a href="${root}/assets/${files.wide}">Spela filmen</a></noscript></section></main><footer class="cta"><h2>Ta plats bakom ratten.</h2><a href="${root}#lager">Prova Nord R själv ↗</a><a class="download desktop" href="${root}/assets/${files.wide}" download="Demo-Motors-18s.mp4">Hämta filmen · MP4</a><a class="download mobile" href="${root}/assets/${files.portrait}" download="Demo-Motors-mobil-18s.mp4">Hämta mobilfilmen · MP4</a></footer><script defer src="${root}/assets/${runtimeName}"></script></html>`
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-frame-options':'DENY','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'"}})
}
