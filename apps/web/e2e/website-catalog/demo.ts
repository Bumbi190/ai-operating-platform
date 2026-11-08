// Acceptance fixture using the reusable premium template; not autonomous model output.
import {readFileSync} from 'node:fs'
import {createPremiumDealerDraft,type DealerRaster} from '../../lib/website-build/templates/premium-dealer'
import type {WebsiteDraft} from '../../lib/website-build/types'
function raster(name:string,width:number,height:number,alt:string):DealerRaster{return {src:'data:image/webp;base64,'+readFileSync(new URL('./assets/premium/'+name+'.webp',import.meta.url)).toString('base64'),width,height,alt}}
const hero=raster('showroom-hero',963,367,'AI-genererad silverfärgad konceptbil i ett varmt belyst showroom, inte en faktisk lagerbil')
const photos=[raster('concept-silver',331,140,'AI-genererad silverfärgad konceptsedan'),raster('concept-green',329,140,'AI-genererad grön koncept-SUV'),raster('concept-blue',322,140,'AI-genererad blå konceptbil'),raster('concept-black',331,140,'AI-genererad svart koncept-SUV')]
export const cars=[
 {id:'concept-01',name:'Nord GT',fuel:'el',year:2025,km:1200,price:499000},
 {id:'concept-02',name:'Aero S',fuel:'hybrid',year:2024,km:18000,price:379000},
 {id:'concept-03',name:'Touring 03',fuel:'bensin',year:2023,km:32000,price:289000},
 {id:'concept-04',name:'Nord R',fuel:'el',year:2025,km:4800,price:549000},
 {id:'concept-05',name:'Aero Touring',fuel:'hybrid',year:2022,km:41000,price:319000},
 {id:'concept-06',name:'Sport 06',fuel:'bensin',year:2024,km:9600,price:429000},
 {id:'concept-07',name:'Nord City',fuel:'el',year:2023,km:22000,price:359000},
 {id:'concept-08',name:'Aero Grand',fuel:'hybrid',year:2025,km:2500,price:459000},
] as const
export function dealerCatalogDraft(accent='#efb563'):WebsiteDraft{
 return createPremiumDealerDraft({brand:'Handlarbörsen',subtitle:'DEMO MOTORS',hero,accent,cars:cars.map((c,i)=>({...c,image:photos[i%photos.length]}))})
}
