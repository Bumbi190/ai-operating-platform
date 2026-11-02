import {parse,parseFragment,serialize,type DefaultTreeAdapterMap} from 'parse5'
import {cinematicAssetNames} from './cinematic-assets'
type Node=DefaultTreeAdapterMap['node']
type Element=DefaultTreeAdapterMap['element']
function find(node:Node,predicate:(element:Element)=>boolean):Element|null{
 if('tagName' in node&&predicate(node))return node
 if('childNodes' in node)for(const child of node.childNodes){const match=find(child,predicate);if(match)return match}
 return null
}
const attr=(node:Element,key:string)=>node.attrs.find(a=>a.name===key)
const styles=`
.cinema{height:240svh;position:relative;background:#0b1217;color:#fff}
.cinema.is-still{height:96svh;min-height:620px}
.cinema.is-still .cinema-stage{height:100%}
.cinema-stage{position:sticky;top:0;height:100svh;min-height:620px;overflow:hidden;isolation:isolate}
.cinema-poster,.cinema-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:64% center;z-index:-3}
.cinema-video{z-index:-2}
.cinema-shade{position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(3,12,19,.88),rgba(3,12,19,.52) 43%,rgba(3,12,19,.04) 80%),linear-gradient(0deg,rgba(3,12,19,.7),transparent 36%)}
.cinema-copy{width:min(1280px,100%);margin:auto;padding:clamp(75px,17vh,180px) clamp(22px,5vw,80px) 30px}
.cinema-kicker{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#b4d6ec;margin:0 0 22px}
.cinema-copy h1{font:500 clamp(48px,6.5vw,100px)/1.02 system-ui,sans-serif;letter-spacing:-.055em;color:#fff;max-width:760px;margin:0 0 25px}
.cinema-copy h1 em{font-style:normal;color:#9bd6f5}
.cinema-intro{font:400 clamp(16px,1.4vw,20px)/1.6 system-ui,sans-serif;color:#d3e1e9;max-width:430px;margin:0 0 28px}
.cinema-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
.cinema-actions .button{background:#a9ddf7;color:#10212c;border-color:#a9ddf7;text-decoration:none}
.cinema-control{background:rgba(6,18,27,.7);border:1px solid #89a1b2;border-radius:999px;color:#e9f5fb;padding:13px 20px;font:500 13px system-ui;cursor:pointer}
.cinema-control:disabled{opacity:.7;cursor:default}
.cinema-control:focus-visible,.cinema-actions a:focus-visible{outline:3px solid #fff;outline-offset:5px}
.cinema-status{margin:20px 0 0;max-width:420px;font-size:12px;color:#c0d2de;min-height:2.7em}
.cinema-caption{position:absolute;bottom:26px;left:clamp(22px,5vw,80px);right:24px;color:#d5e2e9;font:11px/1.5 system-ui,sans-serif;letter-spacing:.03em}
.cinema-caption strong{display:block;color:#f0f7fc;font-size:12px;margin-bottom:4px}
@media(max-width:760px){.cinema{height:200svh}.cinema.is-still{height:92svh;min-height:690px}.cinema-stage{min-height:690px}.cinema-copy{padding-top:68px}.cinema-copy h1{font-size:clamp(46px,11vw,70px)}.cinema-intro{font-size:15px;max-width:300px}.cinema-shade{background:linear-gradient(180deg,rgba(3,12,19,.83),rgba(3,12,19,.35) 55%,rgba(3,12,19,.68))}.cinema-poster,.cinema-video{object-position:70% center}.cinema-caption{font-size:10px}.cinema-actions{gap:10px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`
/** Transform only the trusted compiled Demo Motors template, never customer HTML.
 * The existing artifact compiler and general sandbox policy are unchanged.
 */
export function createCinematicDemoHtml(baseHtml:string):string{
 const doc=parse(baseHtml)
 const hero=find(doc,e=>e.tagName==='section'&&(attr(e,'class')?.value.split(/\s+/).includes('hero')??false))
 const runtime=find(doc,e=>attr(e,'id')?.value==='__atlas_runtime')
 const body=find(doc,e=>e.tagName==='body'),head=find(doc,e=>e.tagName==='head')
 const meta=find(doc,e=>e.tagName==='meta'&&attr(e,'http-equiv')?.value==='Content-Security-Policy')
 const csp=meta&&attr(meta,'content')
 if(!hero?.parentNode||!runtime||!body||!head||!csp||!/script-src[^;]*'self'/.test(csp.value))
  throw Error('CINEMATIC_BASE')
 const names=cinematicAssetNames(),root='/build/demo-motors/cinematic/assets/'
 const markup=`<section id="cinema-scene" class="cinema is-still" aria-labelledby="cinema-title">
 <div class="cinema-stage">
 <img class="cinema-poster" src="${root+names.poster}" width="1920" height="1080" alt="Fiktiv svensk bilhall i kvällsljus med en blå konceptbil" fetchpriority="high">
 <video id="cinema-video" class="cinema-video" data-src="${root+names.video}" muted playsinline preload="none" aria-hidden="true" hidden></video>
 <div class="cinema-shade"></div><div class="cinema-copy">
 <p class="cinema-kicker">För bilhandlare · Omnira Web Studio</p>
 <h1 id="cinema-title">En bilhall.<br><em>En upplevelse.</em></h1>
 <p class="cinema-intro">En första titt på hur din bilfirma kan möta nästa kund. Utforska känslan, bilarna och möjligheterna.</p>
 <div class="cinema-actions"><a class="button" href="#lager">Utforska bilarna ↓</a>
 <button type="button" id="cinema-motion" class="cinema-control" aria-pressed="false" aria-controls="cinema-video" hidden>Aktivera filmisk visning</button></div>
 <p class="cinema-status" id="cinema-status" role="status">Stillbild visas. Utforska bilarna i din egen takt.</p></div>
 <div class="cinema-caption"><strong>DEMO MOTORS · EN FIKTIV KONCEPTPREVIEW</strong>AI-genererad bilhall och film. Inga verkliga lagerbilar visas.</div>
 </div></section>`
 const fragment=parseFragment(markup),parent=hero.parentNode,index=parent.childNodes.indexOf(hero)
 for(const child of fragment.childNodes)child.parentNode=parent
 parent.childNodes.splice(index,1,...fragment.childNodes)
 const style=parseFragment('<style>'+styles+'</style>').childNodes[0]
 style.parentNode=head;head.childNodes.push(style)
 const script=parseFragment('<script src="'+root+names.runtime+'" defer></script>').childNodes[0]
 script.parentNode=body;body.childNodes.push(script)
 // Capability restricted to this fixed owner-only document. No external hosts.
 if(!/(^|;)\s*media-src\s/.test(csp.value))csp.value+="; media-src 'self'"
 return serialize(doc)
}
