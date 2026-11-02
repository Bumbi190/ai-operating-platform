import 'server-only'
import {compileWebsiteArtifact} from '../artifact'
import {vehicle3DAsset} from '../assets/vehicle-3d'
import {MODEL3D_RUNTIME_ASSET} from '../model3d-runtime-asset'
import {premiumDealerStarterDraft} from '../templates/premium-dealer-starter'
import type {PlanContent} from '../planning/types'

/**
 * Fixed, vetted, fictional showroom. Not an arbitrary model-generated customer
 * document and not an existing paused project's build. No provider, SQL or spend.
 * Delivered as an authenticated standalone same-origin document so Vercel SSO
 * credentials stay available when the browser fetches immutable 3D assets.
 */
export function demoMotorsReadOnlyHtml():string{
 const plan:PlanContent={
  title:'Handlarbörsen',purpose:'Fiktiv bilhandlardemo',audience:'Bilhandlare',
  pages:[{key:'home',title:'Hem',purpose:'Visa åtta fiktiva konceptbilar'}],
  design:{style:'Mörk premium',reference:null,starter:'premium-dealer-demo-v1'},
  features:[{name:'Konceptbilar med filtrering',mode:'preview_demo',provider:null}],
  architecture:'Fristående statisk demonstration',steps:['Granska','Utforska'],
  domain:{registrar:'strato',requestedName:null}
 }
 const artifact=compileWebsiteArtifact(premiumDealerStarterDraft(plan,'visual'))
 const vehicle=vehicle3DAsset('vehicle3d:demo-motors-concept-v1')
 if(!vehicle||artifact.assets?.length!==3||!artifact.pages.some(page=>page.key==='index'))
  throw Error('VERIFIED_DEMO_MOTORS_ASSETS_MISSING')
 // The document is served at /build/demo-motors/index.html, so all three
 // RELATIVE asset paths resolve to /build/demo-motors/assets/ behind the
 // owner's session. Keep the GLB runtime's strict relative-path allowlist.
 const html=artifact.pages.find(page=>page.key==='index')!.html
 for(const path of [vehicle.glb.path,vehicle.poster.path,MODEL3D_RUNTIME_ASSET.path])
  if(!html.includes(path))throw Error('VERIFIED_DEMO_MOTORS_PATH_MISSING')
 return html
}
