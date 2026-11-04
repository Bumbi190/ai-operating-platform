import {parse,parseFragment,serialize,type DefaultTreeAdapterMap} from 'parse5'
import {cinematicAssetNames} from './cinematic-assets'
import {listingCardContent,listingDialog} from './cinematic-listing'
import {websiteCsp} from '../preview-runtime'
import {listingStyles} from './cinematic-listing-styles'
type Node=DefaultTreeAdapterMap['node']
type Element=DefaultTreeAdapterMap['element']
function find(node:Node,predicate:(element:Element)=>boolean):Element|null{
 if('tagName' in node&&predicate(node))return node
 if('childNodes' in node)for(const child of node.childNodes){const match=find(child,predicate);if(match)return match}
 return null
}
const attr=(node:Element,key:string)=>node.attrs.find(a=>a.name===key)
const styles=`
.cinema{height:440svh;position:relative;background:#091116;color:#fbf9f4;--tour-progress:0}
.reel-link{text-align:center}.reel-link a{color:#dfc398;text-underline-offset:4px}
.cinema [hidden]{display:none!important}
.cinema.is-still{height:96svh;min-height:710px}
.cinema-stage{position:sticky;top:0;height:100svh;min-height:710px;overflow:hidden;isolation:isolate}
.cinema.is-still .cinema-stage{height:100%}
.cinema-poster,.cinema-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:64% center;z-index:-3}
.cinema-video{z-index:-2}
.cinema-shade{position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(3,12,19,.9),rgba(3,12,19,.67) 31%,rgba(3,12,19,.08) 78%),linear-gradient(0deg,rgba(3,12,19,.72),transparent 30%)}
.cinema-content{width:min(1440px,100%);margin:auto;padding:clamp(70px,13vh,145px) clamp(22px,5.5vw,90px) 90px}
.cinema-copy{max-width:550px;animation:cinema-copy-in .35s ease-out}
.cinema-kicker{font:500 11px/1.5 system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#d7bd91;margin:0 0 22px}
.cinema-copy h1,.cinema-copy h2{font:500 clamp(48px,6.2vw,94px)/1.04 system-ui,sans-serif;letter-spacing:-.055em;color:#fbf9f4;max-width:680px;margin:0 0 23px}
.cinema-copy em{font-style:normal;color:#dbbe92}
.cinema-intro{font:400 clamp(16px,1.3vw,19px)/1.65 system-ui,sans-serif;color:#d5dfdf;max-width:390px;margin:0}
.cinema-console{max-width:490px;margin-top:30px}
.cinema-chapters{display:flex;gap:24px;margin:0 0 19px}
.cinema-chapter{border:0;border-bottom:1px solid transparent;padding:0 0 8px;background:none;color:#aebcbe;font:500 12px system-ui;cursor:pointer}
.cinema-chapter span{font-size:10px;color:#d4b987;margin-right:7px}
.cinema-chapter[aria-current=step]{border-bottom-color:#d4b987;color:#fff}
.cinema-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.cinema-actions .button,.cinema-play,.cinema-control{border-radius:999px;padding:13px 19px;font:500 12px/1.3 system-ui,sans-serif;cursor:pointer;text-decoration:none}
.cinema-play{background:#dbbe92;color:#142128;border:1px solid #dbbe92}
.cinema-actions .button{background:rgba(7,20,29,.65);color:#f6f1e6;border:1px solid #a7b1b2}
.cinema-control{background:none;color:#d4dfe0;border:1px solid #657b84}
.cinema-play:disabled,.cinema-control:disabled{opacity:.65;cursor:default}
.cinema :is(button,a,input):focus-visible{outline:3px solid #fff;outline-offset:5px}
.cinema-status{margin:14px 0 0;max-width:440px;font:400 11px/1.6 system-ui,sans-serif;color:#c1d0d4;min-height:3.2em}
.cinema-seek{display:block;width:100%;height:18px;margin-top:8px;accent-color:#d4b987;cursor:pointer}
.cinema-caption{position:absolute;bottom:22px;left:clamp(22px,5.5vw,90px);right:24px;color:#bbcace;font:10px/1.6 system-ui,sans-serif;letter-spacing:.03em}
.cinema-caption strong{display:block;color:#e5e9e7;font-size:11px;font-weight:500;margin-bottom:2px}
.cinema-accessible{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes cinema-copy-in{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
@media(min-width:761px) and (min-height:701px){
 .cinema-content{padding-top:clamp(42px,7vh,84px)}
 .cinema-copy h1,.cinema-copy h2{font-size:clamp(44px,4.6vw,76px);margin-bottom:12px}
 .cinema-kicker{margin-bottom:14px}.cinema-intro{font-size:15px;max-width:320px}
 .cinema-console{position:absolute;left:clamp(22px,5.5vw,90px);bottom:max(112px,17vh);width:min(470px,45vw)}
 .cinema-status{min-height:1.6em}
}
@media(max-width:760px){
 .cinema{height:380svh}.cinema.is-still{height:92svh;min-height:720px}.cinema-stage{min-height:720px}
 .cinema-content{padding-top:52px;padding-bottom:85px}
 .cinema-copy h1,.cinema-copy h2{font-size:clamp(44px,11vw,65px);max-width:350px}
 .cinema-kicker{font-size:10px;letter-spacing:.16em;margin-bottom:18px}
 .cinema-intro{font-size:14px;max-width:300px}
 .cinema-console{margin-top:22px}.cinema-chapters{gap:24px;margin-bottom:14px}
 .cinema-actions{gap:9px}.cinema-actions .button,.cinema-play,.cinema-control{padding:12px 16px}
 .cinema-shade{background:linear-gradient(180deg,rgba(3,12,19,.86),rgba(3,12,19,.5) 56%,rgba(3,12,19,.75))}
 .cinema-poster,.cinema-video{object-position:92% center}.cinema-caption{font-size:9px}
}
@media(max-height:600px) and (min-width:650px){
 .cinema-stage,.cinema.is-still .cinema-stage{height:100svh;min-height:0}
 .cinema.is-still{height:100svh;min-height:0}
 .cinema-content{padding-top:28px;padding-bottom:65px}
 .cinema-copy{max-width:43%}.cinema-copy h1,.cinema-copy h2{font-size:38px;margin-bottom:12px}
 .cinema-kicker{font-size:9px;margin-bottom:12px}.cinema-intro{font-size:12px;line-height:1.5}
 .cinema-console{position:absolute;left:52%;right:5%;top:34px;margin-top:0;max-width:none}
 .cinema-chapters{gap:16px;margin-bottom:14px}.cinema-chapter{font-size:11px}
 .cinema-actions .button,.cinema-play,.cinema-control{padding:10px 13px;font-size:11px}
 .cinema-status{font-size:10px;margin-top:12px}.cinema-caption{bottom:12px;font-size:9px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cinema-copy{animation:none}}
`
/** Transform only the trusted authored Demo Motors template. General compiler/sandbox unchanged. */
export function createCinematicDemoHtml(baseHtml:string,root='/build/demo-motors/cinematic/assets/'):string{
 const doc=parse(baseHtml)
 const hero=find(doc,e=>e.tagName==='section'&&(attr(e,'class')?.value.split(/\s+/).includes('hero')??false))
 const runtime=find(doc,e=>attr(e,'id')?.value==='__atlas_runtime')
 const body=find(doc,e=>e.tagName==='body'),head=find(doc,e=>e.tagName==='head')
 const meta=find(doc,e=>e.tagName==='meta'&&attr(e,'http-equiv')?.value==='Content-Security-Policy'),csp=meta&&attr(meta,'content')
 const scriptHash=csp?.value.match(/(?:^|;\s*)script-src ('sha256-[A-Za-z0-9+/]{43}=');/)?.[1]
 if(!hero?.parentNode||!runtime||!body||!head||!csp||!scriptHash||csp.value!==websiteCsp(scriptHash))throw Error('CINEMATIC_BASE')
 const names=cinematicAssetNames()
 const markup=`<section id="cinema-scene" class="cinema is-still" data-chapter-starts="0,5,9" aria-labelledby="cinema-title">
 <div class="cinema-stage">
 <img class="cinema-poster" src="${root+names.poster}" width="2048" height="1152" alt="Fiktiv svensk bilhall i kvällsljus med en blå konceptbil" fetchpriority="high">
 <video id="cinema-video" class="cinema-video" data-src="${root+names.video}" muted playsinline preload="none" aria-hidden="true" hidden></video>
 <div class="cinema-shade"></div><div class="cinema-content">
 <div class="cinema-copy" id="cinema-copy-0" data-tour-copy="0">
 <p class="cinema-kicker">Demo Motors · 01 · Visning i kvällsljus</p>
 <h1 id="cinema-title">Kväll hos<br><em>Demo Motors.</em></h1>
 <p class="cinema-intro">Utanför hallen väntar Nord R, kvällens visningsbil.</p></div>
 <div class="cinema-copy" id="cinema-copy-1" data-tour-copy="1" hidden>
 <p class="cinema-kicker">02 · Bilen i fokus</p>
 <h2>Nord R i<br><em>midnattsblått.</em></h2>
 <p class="cinema-intro">Följ ljuset längs karossen, från fronten till bakskärmen.</p></div>
 <div class="cinema-copy" id="cinema-copy-2" data-tour-copy="2" hidden>
 <p class="cinema-kicker">03 · Kom närmare</p>
 <h2>Bakom<br><em>ratten.</em></h2>
 <p class="cinema-intro">Grafitgrå klädsel, dämpade skärmar och hallens ljus genom vindrutan.</p></div>
 <div class="cinema-console">
 <nav class="cinema-chapters" aria-label="Rundturens kapitel">
 <button id="cinema-chapter-0" class="cinema-chapter" type="button" data-tour-chapter="0" aria-current="step" hidden><span>01</span>Hallen</button>
 <button id="cinema-chapter-1" class="cinema-chapter" type="button" data-tour-chapter="1" aria-current="false" hidden><span>02</span>Bilen</button>
 <button id="cinema-chapter-2" class="cinema-chapter" type="button" data-tour-chapter="2" aria-current="false" hidden><span>03</span>Interiören</button>
 </nav>
 <div class="cinema-actions">
 <button type="button" id="cinema-play" class="cinema-play" aria-pressed="false" aria-controls="cinema-video" hidden>Spela rundturen</button>
 <a class="button" href="#lager">Utforska bilarna ↗</a>
 <button type="button" id="cinema-motion" class="cinema-control" aria-pressed="false" aria-controls="cinema-video" hidden>Styr med scroll</button></div>
 <p class="cinema-status" id="cinema-status" role="status">Stillbild visas. Spela rundturen eller välj scrollstyrning.</p>
 <label class="cinema-accessible" for="cinema-seek">Rundturens position</label>
 <input type="range" class="cinema-seek" id="cinema-seek" min="0" max="1000" step="1" value="0" hidden>
 </div></div>
 <div class="cinema-caption"><strong>FIKTIV KONCEPTPREVIEW · DEMO MOTORS</strong>AI-genererad bilhall, bil och konceptinteriör. Inga verkliga lagerbilar visas.</div>
 </div></section>`
 const fragment=parseFragment(markup),parent=hero.parentNode,index=parent.childNodes.indexOf(hero)
 for(const child of fragment.childNodes)child.parentNode=parent
 parent.childNodes.splice(index,1,...fragment.childNodes)
 const featured=find(doc,e=>attr(e,'id')?.value==='concept-04')
 const heading=find(doc,e=>attr(e,'id')?.value==='inventory-heading')
 if(!featured?.parentNode||!heading||!('childNodes' in featured.parentNode))throw Error('CINEMATIC_INVENTORY')
 const details=featured.childNodes.find(n=>'tagName' in n&&n.tagName==='details')
 featured.childNodes=[...parseFragment(listingCardContent(root)).childNodes,...(details?[details]:[])]
 for(const child of featured.childNodes)child.parentNode=featured
 const roadster=find(doc,e=>attr(e,'id')?.value==='concept-07')
 if(!roadster)throw Error('CINEMATIC_ROADSTER_SLOT')
 const roadsterCard=parseFragment(`<div class="card-top"><span>DEMO MOTORS / KONCEPTVISNING</span><span class="badge el">El</span></div>
 <div class="car-image"><img loading="lazy" src="${root}${names.roadsterCover}" alt="Röd Roadster-inspirerad konceptbil framför kvällshallen"></div>
 <div class="car-body"><div class="car-heading"><h3>Roadster-koncept</h3></div><p class="spec-line">Tesla-inspirerad elbil · Visningsbil</p></div>
 <p><a class="button" href="?view=roadster">Utforska Roadster — film och 3D</a></p><details><summary>Om Roadster-visningen</summary><div class="detail-body">

 <h4>Om visningen</h4><p>En AI-illustrerad tolkning av Tesla Roadster i Demo Motors kvällshall. Konceptvisning utan försäljningspris.</p>
 <button class="button" id="concept-07-interest" aria-expanded="false" aria-controls="concept-07-form">Kontakta säljaren</button>
 <section id="concept-07-form" hidden><h4>Fråga om Roadster-konceptet</h4><p>Demoförfrågan. Inget skickas.</p><form><label for="concept-07-vehicle">Vald bil</label><input id="concept-07-vehicle" name="vehicle" value="Roadster-koncept" readonly><label for="concept-07-message">Ditt testmeddelande</label><textarea id="concept-07-message" rows="3"></textarea><button type="submit" class="button outline">Förhandsvisa testförfrågan</button></form></section></div></details>`)
 roadster.childNodes=roadsterCard.childNodes
 for(const child of roadster.childNodes)child.parentNode=roadster
 const catalog=featured.parentNode
 catalog.childNodes.splice(catalog.childNodes.indexOf(featured),1)
 catalog.childNodes.unshift(featured)
 heading.childNodes=[{nodeName:'#text',value:'Bilar i hallen',parentNode:heading}]
 const inventory=find(doc,e=>attr(e,'id')?.value==='lager')
 const intro=inventory&&find(inventory,e=>attr(e,'class')?.value==='description')
 if(intro)intro.childNodes=[{nodeName:'#text',value:'Öppna Nord R från rundturen eller filtrera bilarna efter drivlina. Alla priser och fordonsuppgifter är exempel.',parentNode:intro}]
 const about=find(doc,e=>attr(e,'id')?.value==='om')
 if(about){
  const paragraphs=about.childNodes.flatMap(n=>'childNodes' in n?n.childNodes:[]).filter(n=>'tagName' in n&&n.tagName==='p')
  const last=paragraphs[paragraphs.length-1]
  if(last&&'childNodes' in last)last.childNodes=[{nodeName:'#text',value:'I Nord R:s annons kan du scrolla från utsidan in till förarplatsen. Där finns också tre referensbilder och en roterbar 3D-tolkning av frontbilden. I annonsen kan du prova ett fast pris, föreslå ett bud eller skriva en fråga till Demo Motors.',parentNode:last}]

  const link=parseFragment('<p class="reel-link"><a href="?view=visning">Se bilhallen på 18 sekunder ↗</a></p>').childNodes[0]
  link.parentNode=about;about.childNodes.push(link)
 }
 const modal=parseFragment(listingDialog(root)).childNodes[0];modal.parentNode=body;body.childNodes.push(modal)
 const style=parseFragment('<style>'+styles+listingStyles+'</style>').childNodes[0];style.parentNode=head;head.childNodes.push(style)
 const script=parseFragment('<script src="'+root+names.runtime+'" defer></script>').childNodes[0];script.parentNode=body;body.childNodes.push(script)
 // The cinematic parent loads same-origin media and the dedicated viewer in its own frame.
 csp.value=websiteCsp(scriptHash+" 'self'").replace("img-src data:","img-src data: 'self'")
  .replace("frame-src 'none'","frame-src 'self'")+"; media-src 'self'"
 return serialize(doc)
}
