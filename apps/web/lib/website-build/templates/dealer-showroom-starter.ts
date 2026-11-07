import 'server-only'
import {BUNDLED_DEMO_RASTERS} from '../assets/bundled-rasters'
import {escapeHtml} from '../preview-runtime'
import {DEALER_SHOWROOM_STARTER,parseShowroomOptions,type DemoVehicle} from '../planning/dealer-showroom'
import type {PlanContent} from '../planning/types'
import {parseWebsiteVisualStyle} from '../planning/visual-style'
import type {WebsiteDraft} from '../types'
import {dealerShowroomCss,renderDealerShowroom} from './dealer-showroom-presentation'

const samples:DemoVehicle[] = [
  {name:'Skog E',year:2025,mileage:360,price:429000,fuel:'El',photo:'concept-green'},
  {name:'Kust Touring',year:2024,mileage:1850,price:369000,fuel:'Hybrid',photo:'concept-silver'},
  {name:'Vik S',year:2023,mileage:2900,price:299000,fuel:'Bensin',photo:'concept-blue'},
]

export function dealerShowroomDraft(plan:PlanContent,direction:'editorial'|'visual'|'structured'):WebsiteDraft {
  if(plan.design.starter!==DEALER_SHOWROOM_STARTER || plan.pages.length!==1 || !['home','index'].includes(plan.pages[0].key) || plan.features.some(f=>f.mode!=='preview_demo')) throw Error('INVALID_STARTER_PLAN')
  const options=parseShowroomOptions(plan.design.showroom??{vehicles:samples})
  const style=plan.design.visual ? parseWebsiteVisualStyle(plan.design.visual) : null
  const vehicles=options.vehicles.map((car,i)=>{
    const photo=BUNDLED_DEMO_RASTERS.find(image=>image.name===car.photo)
    if(!photo) throw Error('MISSING_SHOWROOM_PHOTO')
    return {...car,id:String(i+1),sold:car.sold??false,photos:[photo.id]}
  })
  const brand=escapeHtml(plan.title)
  const bodyHtml=`<a class="skip" href="#inventory">Hoppa till bilhallen</a>
    <header class="site-header"><div class="shell nav"><a class="brand" href="#">${brand}<small>DIGITAL BILHALL</small></a>
    <a class="button outline" href="#inventory">Se bilarna</a></div></header>
    <main>${renderDealerShowroom(plan.title,vehicles)}</main>
    <footer class="shell dh-stock"><p class="dh-eyebrow">${brand} · Fiktiv bilhall</p>
    <p>Illustrationer och fordonsuppgifter är exempel i den här förhandsvisningen.</p></footer>`
  let css=dealerShowroomCss(style?.palette.accent??'#91d2bc')
  if(direction==='editorial') css+='\n.dh-hero h1,.dh-stock h2{font-family:Georgia,serif}@media(min-width:801px){.dh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
  if(direction==='structured') css+='\n@media(min-width:801px){.dh-hero-inner{min-height:360px}.dh-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}'
  if(style) css+='\n:root{--bg:'+style.palette.background+';--fg:'+style.palette.foreground+';--panel:var(--bg);--muted:var(--fg)}.dh-hero h1,.dh-stock h2,.dh-copy h3{font-family:'+(style.font==='serif'?'Georgia,serif':'system-ui,sans-serif')+'}'
  return {format:'static-website.v1',title:plan.title+' – Bilhall',css,pages:[{key:'index',title:plan.title+' – Bilhall',bodyHtml,behaviors:[]}]}
}
