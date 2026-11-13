import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {readWebsiteBuildBody,buildErrorResponse} from '../api'
import {acceptanceTargetDenial} from '../acceptance-target'
import {WebsiteBuildError,readBuildArtifact} from '../store'
import {studioPrincipal,studioKey} from '../studio/store'
import {readWebsiteMockupArtifact} from '../planning/store'
import {listProspects,readProspect,saveProspect,approveProspect} from './store'
import {searchScbCompanies,companySearchProvider} from './search'
import {issueSearchReceipt,readSearchReceipt} from './search-receipt'
import {localCaptureAvailable} from './capture'
import {harveyBridgeConfigured} from './harvey-bridge'
import {prospectReadiness} from './validation'
import {suggestProspectImprovements} from './improvements'
import {registerWebsite,captureWebsite,setImprovements,prepareProspectDesign,startProspectBuild,syncProspectBuild,prospectPlan} from './actions'
import {readProspectImage} from './assets'
import {exportProspect,verifyProspectDemo} from './demo'
import type {ProspectCompany,ProspectView} from './types'

const headers={'cache-control':'private, no-store'}
export function prospectsEnabled(env: NodeJS.ProcessEnv=process.env){return env.WEBBUILDER_PROSPECTS_ENABLED==='true'&&env.VERCEL_ENV!=='production'}
function fields(body: Record<string,unknown>,allowed: string[]){if(Object.keys(body).some(k=>!allowed.includes(k)))throw new WebsiteBuildError('INVALID_BODY')}
function secret(){return process.env.SUPABASE_SERVICE_ROLE_KEY??''}
async function view(db: ReturnType<typeof createAdminClient>,p: {userId:string;allowedProjectIds:string[]},prospect: ProspectView){
  let plan=null,designStale=false
  try{plan=await prospectPlan(db,p,prospect)}catch(error){if(error instanceof WebsiteBuildError&&error.code==='PROSPECT_DESIGN_STALE')designStale=true;else throw error}
  const readiness=prospectReadiness(prospect.content)
  if(designStale){readiness.ready=false;readiness.missing.push('Planen har ändrats. Granska designkopplingen på nytt.')}
  return {prospect:designStale?{...prospect,approval:null}:prospect,plan,designStale,readiness,suggestions:prospect.content.capture?suggestProspectImprovements(prospect.content.capture):[]}
}
const messages: Record<string,string>={PROSPECT_STALE:'Prospektet har ändrats. Läs in det igen innan du fortsätter.',PROSPECT_DESIGN_STALE:'Planen har ändrats. Underlaget måste kopplas till en ny granskad mockup.',PROSPECT_BUILD_PENDING:'Bygget är fortfarande i kö eller pågår. Uppdatera om en stund.',LOCAL_CAPTURE_UNAVAILABLE:'Skärmbilder kräver den isolerade lokala körmiljön.',CAPTURE_FAILED:'Hemsidan kunde inte fångas. Kontrollera adressen och försök igen.',DISCOVERY_SOURCE_NOT_CONFIGURED:'SCB-sökning är inte aktiverad i denna miljö.',DISCOVERY_PROVIDER_UNAVAILABLE:'SCB svarade inte inom den begränsade sökningen.',THREE_IMPROVEMENTS_REQUIRED:'Spara exakt tre förbättringar med stöd i observationerna.',PROSPECT_REVIEW_INCOMPLETE:'Prospektet saknar fortfarande underlag för godkännande.',DEMO_VERIFICATION_FAILED:'Demons innehåll eller mobilkontroll stämmer inte med exporten.',SOURCE_RECEIPT_EXPIRED:'SCB-resultatet har gått ut. Sök efter företaget igen.'}
export async function prospectApi(request: Request,params: {prospectId?:string;assetId?:string;surface?:'asset'|'preview'|'export'}={}):Promise<Response>{
  if(!prospectsEnabled())return Response.json({error:'Not found'},{status:404,headers})
  const write=request.method==='POST'
  if(write){const blocked=acceptanceTargetDenial('prospect');if(blocked)return blocked}
  const access=await resolveProjectAccess();if(!access.ok){access.response.headers.set('cache-control',headers['cache-control']);return access.response}
  try{
    if(write){const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}}
    const body=write?await readWebsiteBuildBody(request):{},query=new URL(request.url).searchParams
    const projectId=(body.projectId??query.get('projectId')) as string
    studioPrincipal(access,projectId)
    const db=createAdminClient(),action=body.action as string
    if(!params.prospectId){
      if(!write)return Response.json({prospects:await listProspects(db,access,projectId),searchAvailable:companySearchProvider()==='scb',captureAvailable:localCaptureAvailable(),harveyBridgeAvailable:harveyBridgeConfigured()&&localCaptureAvailable()},{headers})
      if(action==='search'){
        fields(body,['action','projectId','municipalityCode','offset'])
        const result=await searchScbCompanies({municipalityCode:body.municipalityCode as string,category:'car_dealer',limit:5},body.offset as number??0)
        return Response.json({...result,candidates:result.candidates.map(candidate=>{
          const company:ProspectCompany={source:'scb',sourceId:candidate.sourceId,sourceUrl:candidate.sourceUrl,retrievedAt:result.retrievedAt,name:candidate.name,branchName:candidate.branchName,orgnr:candidate.orgnr,cfar:candidate.cfar,city:candidate.city,municipalityCode:result.meta.municipalityCode,sniCodes:candidate.sniCodes,restricted:candidate.restricted,inactive:candidate.inactive}
          return {company,receipt:issueSearchReceipt(company,access,projectId,secret())}
        })},{headers})
      }
      if(action==='create'){
        fields(body,['action','projectId','sourceReceipt','idempotencyKey']);studioKey(body.idempotencyKey)
        const company=readSearchReceipt(body.sourceReceipt,access,projectId,secret())
        const existing=(await listProspects(db,access,projectId)).find(item=>item.content.company.cfar===company.cfar&&item.content.company.orgnr===company.orgnr)
        if(existing)return Response.json(await view(db,access,existing),{headers})
        const prospect=await saveProspect(db,access,{projectId,expectedRevisionId:null,idempotencyKey:body.idempotencyKey,content:{version:1,company,website:null,capture:null,improvements:[],design:null,build:null,demo:null}})
        return Response.json(await view(db,access,prospect),{status:201,headers})
      }
      throw new WebsiteBuildError('INVALID_BODY')
    }
    const current=await readProspect(db,access,{projectId,prospectId:params.prospectId})
    if(!write){
      if(params.surface==='asset'){const bytes=await readProspectImage(db,access,current,params.assetId!);return new Response(bytes,{headers:{...headers,'content-type':'image/webp','x-content-type-options':'nosniff'}})}
      if(params.surface==='export'){const exported=await exportProspect(db,access,current);return new Response(new Uint8Array(exported.bytes),{headers:{...headers,'content-type':'application/zip','content-disposition':'attachment; filename="prospect-'+current.prospectId+'.zip"','x-content-sha256':exported.sha256}})}
      if(params.surface==='preview'){
        const plan=await prospectPlan(db,access,current)
        let artifact
        if(query.get('kind')==='build'&&current.content.build)artifact=await readBuildArtifact(db,access,{projectId,sessionId:current.content.build.sessionId},current.content.build.revisionId)
        else{
          const mockup=plan?.designReview?.options.find(m=>m.id===query.get('mockupId'))
          if(!plan||!mockup)throw new WebsiteBuildError('NOT_FOUND',404)
          artifact=await readWebsiteMockupArtifact(db,access,{...plan.currentRevision,mockupId:mockup.id,mockupSha256:mockup.sha256})
        }
        return new Response(artifact.pages[0].html,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"sandbox allow-scripts; frame-ancestors 'self'",'x-content-type-options':'nosniff'}})
      }
      return Response.json(await view(db,access,current),{headers})
    }
    const common=['action','projectId','expectedRevisionId','idempotencyKey']
    const additional:Record<string,string[]>={website:['url'],capture:[],improvements:['improvements'],design:[],build:['mockupId','mockupSha256'],'sync-build':[],demo:['url'],approve:['sha256']}
    if(!Object.hasOwn(additional,action))throw new WebsiteBuildError('INVALID_BODY')
    fields(body,[...common,...additional[action]]);studioKey(body.idempotencyKey)
    if(body.idempotencyKey.length>80)throw new WebsiteBuildError('INVALID_IDEMPOTENCY_KEY')
    if(current.revisionId!==body.expectedRevisionId)throw new WebsiteBuildError('PROSPECT_STALE',409)
    const key=body.idempotencyKey
    if(action==='build')return Response.json({session:await startProspectBuild(db,access,current,body.mockupId,body.mockupSha256,key),...await view(db,access,current)},{status:202,headers})
    const updated=action==='website'?await registerWebsite(db,access,current,body.url,key):action==='capture'?await captureWebsite(db,access,current,key):action==='improvements'?await setImprovements(db,access,current,body.improvements,key):action==='design'?await prepareProspectDesign(db,access,current,key):action==='sync-build'?await syncProspectBuild(db,access,current,key):action==='demo'?await verifyProspectDemo(db,access,current,body.url,key):await approveProspect(db,access,{...current,revisionId:current.revisionId,sha256:body.sha256 as string,idempotencyKey:key})
    return Response.json(await view(db,access,updated),{headers})
  }catch(error){
    if(error instanceof WebsiteBuildError&&messages[error.code])return Response.json({code:error.code,error:messages[error.code]},{status:error.status,headers})
    return buildErrorResponse(error)
  }
}
