import {CAPTURE_KINDS} from './capture-intake'
import {REVIEW_VIEWS,REVIEW_FEATURES} from './review-dossier'
import {vehicle3DAsset} from '../assets/vehicle-3d'

const labels:Record<string,string>={
 front_three_quarter:'Framifrån, trekvart',
 side:'Sida',rear_three_quarter:'Bakifrån, trekvart',
 opposite_side_front:'Motsatt främre sida',
 wheel_detail:'Närbild på rätt fälg',
 trim_identifier:'Utrustnings- och trimdetalj',
 body:'Kaross',paint:'Lack',wheels:'Fälgar',trim:'Utrustning',lights:'Lampor'
}

/**
 * Owner-only, READ-ONLY preview of a future reviewer screen. It contains no
 * real dealer evidence or actionable verification controls, no uploads and
 * no feature flag for publishing.
 */
export function renderVehicleReviewPrototype():string{
 const model=vehicle3DAsset('vehicle3d:demo-motors-concept-v1')
 if(!model||model.truthClass!=='fictional_concept')
  throw Error('REVIEW_PROTOTYPE_REQUIRES_FICTIONAL_ASSET')
 const image='/build/demo-motors/'+model.poster.path
 const sourceCards=CAPTURE_KINDS.map((kind,i)=>
  '<li class="source"><div class="source-icon" aria-hidden="true">'+
  String(i+1)+'</div><div><strong>'+labels[kind]+'</strong>'+
  '<p>Originalfoto saknas · ingen äkta lagerbil registrerad</p></div>'+
  '<span class="missing">Saknas</span></li>').join('')
 const comparisons=REVIEW_VIEWS.map((kind,i)=>
  '<article class="comparison"><h3>'+String(i+1)+'. '+labels[kind]+'</h3>'+
  '<div class="compare-images"><div class="placeholder" aria-label="Originalfoto saknas">'+
  'Originalfoto från annonsbilen saknas</div><div class="placeholder" aria-label="3D-jämförelserender saknas">'+
  '3D-render från samma vinkel saknas</div></div>'+
  '<p>Kontroller: '+REVIEW_FEATURES.map(f=>labels[f]).join(' · ')+'</p>'+
  '<p class="warning">Ingen visuell jämförelse kan godkännas</p></article>').join('')
 return '<!doctype html><html lang="sv"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>Demo Motors · Mänsklig 3D-granskning</title>'+
 '<style>'+
 '*{box-sizing:border-box}body{margin:0;background:#10151c;color:#f4f6f8;font:16px/1.5 system-ui,Arial,sans-serif}'+
 'main{max-width:1120px;padding:24px;margin:auto}a{color:#b9d8f1}h1{font-size:clamp(1.6rem,3vw,2.5rem);line-height:1.15}'+
 '.eyebrow{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#a8bfd3}'+
 '.notice{border-left:4px solid #efb86a;background:#30291f;padding:14px 18px;border-radius:5px;margin:22px 0}'+
 '.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}section,.comparison{background:#1a222d;border:1px solid #364250;border-radius:14px;padding:22px}'+
 'section{margin:18px 0}p{color:#bac6d1;margin:8px 0}h2{margin:0 0 13px}h3{margin:2px 0 12px}'+
 '.preview{width:100%;height:auto;border-radius:8px;display:block;background:#242b35}'+
 '.source-list{list-style:none;padding:0;margin:0}.source{display:flex;gap:12px;align-items:center;border-top:1px solid #34404b;padding:13px 0}'+
 '.source p{font-size:.85rem}.source-icon{display:grid;place-items:center;flex:none;background:#2e4152;color:#d7e7f1;width:34px;height:34px;border-radius:50%}'+
 '.missing{margin-left:auto;background:#423323;color:#ffd099;padding:3px 8px;border-radius:4px;font-size:.78rem}'+
 '.compare-images{display:grid;grid-template-columns:1fr 1fr;gap:10px}.placeholder{min-height:118px;border:1px dashed #718191;border-radius:8px;display:grid;place-items:center;text-align:center;padding:15px;font-size:.85rem;color:#a6b4c3}'+
 '.warning{color:#ffcb85;font-size:.85rem}button[disabled]{padding:12px 20px;background:#57616c;color:#e9ecef;border:0;border-radius:8px;cursor:not-allowed}'+
 '@media(max-width:760px){main{padding:16px}.grid{grid-template-columns:1fr}section,.comparison{padding:16px}}'+
 '</style></head><body><main><p class="eyebrow">Omnira Web Studio / Granskningsprototyp</p>'+
 '<p><a href="/build/demo-motors/index.html">Tillbaka till Demo Motors</a></p>'+
 '<h1>Mänsklig fordonsgranskning</h1>'+
 '<p>Så här ska en granskare jämföra verkliga originalfoton med rätt 3D-modell, vinkel för vinkel.</p>'+
 '<div role="status" class="notice"><strong>FIKTIV PROTOTYP · INTE VERIFIERAD</strong>'+
 '<p>Inga originalfoton, riktiga biluppgifter eller mänskliga godkännanden finns i denna demo. '+
 'Detta är en skrivskyddad visning av kontrollprocessen.</p></div>'+
 '<div class="grid"><section aria-labelledby="model-heading"><h2 id="model-heading">Nuvarande konceptmodell</h2>'+
 '<img class="preview" alt="Fiktiv lågpoly-konceptbil, inte en verklig lagerbil" src="'+image+'">'+
 '<p>Nord GT är en fiktiv Blender-modell, inte en digital tvilling av en bil som annonseras.</p></section>'+
 '<section aria-labelledby="evidence-heading"><h2 id="evidence-heading">Sex obligatoriska originalfoton</h2>'+
 '<ol class="source-list">'+sourceCards+'</ol></section></div>'+
 '<section aria-labelledby="compare-heading"><h2 id="compare-heading">Jämför fyra låsta vinklar</h2>'+
 '<div class="grid">'+comparisons+'</div></section>'+
 '<section aria-labelledby="approval-heading"><h2 id="approval-heading">Beslut och publicering</h2>'+
 '<p>Kontroller som saknas: fotourspung och användningsrätt, rätt bil/annons, oberoende bildunderlag, '+
 'GLB-källa, exakt lack/fälgar/trim och autentiserad mänsklig granskning.</p>'+
 '<button type="button" disabled aria-disabled="true">Godkänn 3D – spärrat</button>'+
 '<p>Inga granskningar kan sparas eller publiceras från denna prototyp.</p></section>'+
 '</main></body></html>'
}
