import {MODEL3D_RUNTIME_ASSET} from '../model3d-runtime-asset'
import media from './cinematic-assets/nord-r.json'

export const listingImages={front:media.front,rear:media.rear,cabin:media.cabin}
const assetRoot='/build/demo-motors/cinematic/assets/'
const imageUrl=(key:keyof typeof listingImages)=>assetRoot+listingImages[key].sha256+'.webp'
const views=[['front','Framifrån'],['rear','Bakifrån'],['cabin','Kupén']] as const

export const nordFilmName=()=>'nord-r.'+media.film.sha256.slice(0,16)+'.mp4'

export function listingCardContent(){
 return `<div class="lot-visual"><img loading="lazy" width="1440" height="810" src="${imageUrl('front')}" alt="Midnattsblå Nord R framför bilhallen"><span>UR RUNDTUREN</span></div>
 <div class="lot-summary"><p class="lot-eyebrow">Demo Motors &nbsp; / &nbsp; Utvald bil</p><h3>Nord R</h3><p class="lot-subtitle">Midnattsblå · Elektrisk SUV</p>
 <p class="lot-meta">2025 &nbsp; / &nbsp; 480 mil &nbsp; / &nbsp; El</p>
 <div class="lot-sale"><span>Fast pris · Bud välkomnas</span><strong>549 000 kr</strong></div>
 <button type="button" id="lot-open" aria-haspopup="dialog" hidden>Öppna annonsen <span aria-hidden="true">↗</span></button></div>`
}

export function listingDialog(){
 const thumbs=views.map(([key,label])=>`<button type="button" data-lot-photo="${key}" aria-pressed="false"><img loading="lazy" src="${imageUrl(key)}" alt=""><span>${label}</span></button>`).join('')
 return `<dialog id="lot-dialog" aria-labelledby="lot-title"><div class="lot-sheet">
 <header class="lot-header"><div><p class="lot-eyebrow">Demo Motors &nbsp; / &nbsp; Konceptbil 04</p><h2 id="lot-title">Nord R <small>Midnattsblå</small></h2><p class="lot-keyfacts">549 000 kr <span>·</span> 2025 <span>·</span> 480 mil <span>·</span> El</p></div><button type="button" id="lot-close" aria-label="Stäng annonsen" autofocus>Stäng &nbsp; ×</button></header>
 <div class="lot-gallery"><div class="lot-stage" id="lot-stage"><img id="lot-photo" src="${imageUrl('front')}" alt="Nord R framifrån"><video id="lot-film" muted playsinline preload="none" data-src="${assetRoot+nordFilmName()}" hidden></video><span id="lot-load" role="status" hidden></span></div>
 <nav class="lot-views" aria-label="Välj fordonsvy"><button id="lot-tour" type="button" aria-pressed="true"><img loading="lazy" src="${imageUrl('rear')}" alt=""><span>Rundtur</span></button><button id="lot-orbit" type="button" aria-pressed="false"><img loading="lazy" src="${assetRoot+media.orbit.sha256}.webp" alt=""><b aria-hidden="true">⟲</b><span>3D-vy</span></button>${thumbs}</nav></div>
 <div id="lot-film-controls" hidden><label for="lot-timeline">Från utsidan till förarplatsen</label><input id="lot-timeline" type="range" min="0" max="1000" value="0" step="1" aria-label="Position i bilens rundtur"><small>Scrolla, svep i sidled eller dra i reglaget.</small></div>
 <div class="lot-info"><section aria-label="Fordonsinformation"><p class="lot-eyebrow">Fordonsinformation</p><dl>${[['Årsmodell','2025'],['Mätarställning','480 mil'],['Drivmedel','El'],['Kaross','SUV'],['Kulör','Midnattsblå'],['Säljare','Demo Motors']].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
 <section class="lot-offer" aria-label="Affärsalternativ"><p class="lot-eyebrow">Fast pris · Bud välkomnas</p><strong>549 000 kr</strong><div class="lot-actions"><button type="button" data-deal="buy">Köp direkt</button><button type="button" data-deal="bid">Lägg bud</button><button type="button" data-deal="contact">Kontakta säljaren</button></div>
 <form id="lot-form" hidden><p id="lot-prompt"></p><label id="lot-amount-label" hidden>Ditt bud i kronor<input name="amount" type="number" min="1" max="99999999" step="1" inputmode="numeric" disabled></label><label id="lot-message-label" hidden>Meddelande till Demo Motors<textarea name="message" rows="2" maxlength="500" disabled></textarea></label><button type="submit" id="lot-confirm">Bekräfta</button></form><p id="lot-result" role="status"></p></section></div>
 <footer>3D-modellen är en tolkning av frontbilden. Fiktiv visningsannons. Pris och fordonsfakta är exempel. Inga köp, bud eller meddelanden skickas.</footer></div></dialog>`
}

// This isolated, owner-only frame reuses the pinned Studio viewer. Only the
// two exact hashes below are mapped to private listing files by the media route.
export function listingViewerResponse(){
 const assets={glb:'assets/3d/'+media.model.sha256+'.glb',poster:'assets/3d/'+media.front.sha256+'.webp',truthClass:'fictional_concept'}
 const config={vehicle3dAssets:{nord:assets},behaviors:[{kind:'model3d',assetId:'nord',triggerId:'vehicle-stage',targetIds:['vehicle-fallback']}]}
 const html=`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nord R · 3D</title><style>
 *{box-sizing:border-box}html,body,main,#vehicle-stage,#vehicle-fallback{height:100%;margin:0}body{background:#182128 url("${assetRoot+media.studio.sha256}.webp") center center/cover no-repeat;color:#fff;font:12px system-ui}main{position:relative}canvas,.model3d-poster,#vehicle-fallback img{width:100%;height:100%;display:block;object-fit:cover}.model3d-poster{position:absolute;inset:0;pointer-events:none}.model3d-status,#vehicle-fallback span{position:absolute;bottom:10px;left:12px;max-width:calc(100% - 24px);padding:5px 10px;border-radius:20px;background:#101b21dc;color:#f5ece2;font:11px system-ui;pointer-events:none}canvas{touch-action:none}main{overflow:hidden;background:linear-gradient(0deg,#1210121a,transparent 45%)}
 #vehicle-stage{position:absolute;inset:-50% 0 auto;height:200%}#vehicle-stage .model3d-status{position:fixed;bottom:10px;left:12px}
 @media(max-aspect-ratio:8/5){#vehicle-stage{top:-35%;height:170%}}

 </style><main><div id="vehicle-stage" aria-label="Rotera den referensbaserade 3D-modellen av Nord R"></div><div id="vehicle-fallback" hidden><img src="${assets.poster}" alt="Nord R från annonsens originalbild"><span>3D-vyn kunde inte visas. Utforska bilen i bilderna.</span></div></main><script id="__atlas_config" type="application/json">${JSON.stringify(config)}</script><script type=module src="${MODEL3D_RUNTIME_ASSET.path}"></script></html>`
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-frame-options':'SAMEORIGIN','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' blob:; base-uri 'none'; frame-ancestors 'self'; form-action 'none'"}})
}