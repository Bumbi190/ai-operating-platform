import 'server-only'
import {createPremiumDealerDraft} from './premium-dealer'
import {BUNDLED_DEMO_RASTERS,rasterHandle} from '../assets/bundled-rasters'
import {mapRasterSources} from '../assets/raster-markup'
import {parseWebsiteVisualStyle} from '../planning/visual-style'
import type {PlanContent} from '../planning/types'
export const PREMIUM_DEALER_STARTER='premium-dealer-demo-v1' as const
const cars=[
 {id:'concept-01',name:'Nord GT',fuel:'el' as const,year:2025,km:1200,price:499000},
 {id:'concept-02',name:'Aero S',fuel:'hybrid' as const,year:2024,km:18000,price:379000},
 {id:'concept-03',name:'Touring 03',fuel:'bensin' as const,year:2023,km:32000,price:289000},
 {id:'concept-04',name:'Nord R',fuel:'el' as const,year:2025,km:4800,price:549000},
 {id:'concept-05',name:'Aero Touring',fuel:'hybrid' as const,year:2022,km:41000,price:319000},
 {id:'concept-06',name:'Sport 06',fuel:'bensin' as const,year:2024,km:9600,price:429000},
 {id:'concept-07',name:'Nord City',fuel:'el' as const,year:2023,km:22000,price:359000},
 {id:'concept-08',name:'Aero Grand',fuel:'hybrid' as const,year:2025,km:2500,price:459000},
]
/** Versioned, fictional built-in design; neither a model call nor an approval. */
export function premiumDealerStarterDraft(content:PlanContent,direction:'editorial'|'visual'|'structured'){
 if(content.design.starter!==PREMIUM_DEALER_STARTER||content.pages.length!==1||!['home','index'].includes(content.pages[0].key)||content.features.some(f=>f.mode!=='preview_demo'))throw Error('INVALID_STARTER_PLAN')
 const hero=BUNDLED_DEMO_RASTERS.find(r=>r.name==='showroom-hero')!
 const photos=['concept-silver','concept-green','concept-blue','concept-black'].map(name=>BUNDLED_DEMO_RASTERS.find(r=>r.name===name)!)
 const draft=createPremiumDealerDraft({brand:content.title,subtitle:'DEMO MOTORS',hero,cars:cars.map((car,i)=>({...car,image:photos[i%photos.length]})),accent:content.design.visual?.palette.accent})
 for(const page of draft.pages)page.bodyHtml=mapRasterSources(page.bodyHtml,src=>rasterHandle(src))
 if(direction==='editorial')draft.css+='\nh1,h2{font-family:Georgia,serif}.catalog{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:760px){.catalog{grid-template-columns:1fr}}'
 if(direction==='structured')draft.css+='\n@media(min-width:761px){.hero-inner{padding-top:48px;padding-bottom:48px}.hero{min-height:460px}.catalog{grid-template-columns:repeat(3,minmax(0,1fr))}}'
 if(content.design.visual){const v=parseWebsiteVisualStyle(content.design.visual);draft.css+='\n:root{--bg:'+v.palette.background+';--fg:'+v.palette.foreground+'}h1,h2,h3{font-family:'+(v.font==='serif'?'Georgia,serif':'system-ui,sans-serif')+'}'}
 return draft
}
