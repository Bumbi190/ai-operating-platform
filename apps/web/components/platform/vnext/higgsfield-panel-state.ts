export interface HiggsfieldInspectionIssue {code:string;stage:string|null}
// Never store provider-generated errors or unknown response fields in UI state.
const SAFE_CODES=new Set(['disabled','not_configured','invalid_endpoint','provider_unavailable','invalid_response','unsupported_server_schema','state_invalid','access_denied','connection_changed','reconnect_required','storage_unavailable','busy'])
const SAFE_STAGES=new Set(['connect','list_tools','tool_schema','balance','model','quote','consistency'])
function safeIssue(value:unknown):HiggsfieldInspectionIssue {
 const detail=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
 return {
  code:typeof detail.error==='string'&&SAFE_CODES.has(detail.error)?detail.error:'unknown',
  stage:typeof detail.stage==='string'&&SAFE_STAGES.has(detail.stage)?detail.stage:null,
 }
}
export interface HiggsfieldPanelState {
 status:'disconnected'|'connected'|'reconnect_required'|'unavailable'
 working:boolean;inspectionUnavailable:boolean;inspectionIssue:HiggsfieldInspectionIssue|null
 creditBalance:number|null;quoteCredits:number|null;observedAt:string|null
}
export function createHiggsfieldPanelController(projectId:string,canManage:boolean,fetcher:typeof fetch=fetch,navigate:(url:string)=>void=url=>window.location.assign(url)) {
 let state:HiggsfieldPanelState={status:'unavailable',working:false,inspectionUnavailable:false,inspectionIssue:null,creditBalance:null,quoteCredits:null,observedAt:null}
 const listeners=new Set<()=>void>()
 function update(value:Partial<HiggsfieldPanelState>){state={...state,...value};listeners.forEach(fn=>fn())}
 async function execute(action:'status'|'connect'|'inspect'|'disconnect') {
  if(!canManage||state.working)return
  update({working:true,inspectionIssue:null})
  let retryableInspect=action==='inspect'
  let issue:HiggsfieldInspectionIssue|null=null
  try {
   const endpoint=action==='connect'?'oauth/start':action
   const url='/api/media/higgsfield/'+endpoint+(action==='status'?'?project_id='+encodeURIComponent(projectId):'')
   const response=await fetcher(url,action==='status'?{cache:'no-store',signal:AbortSignal.timeout(30000)}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project_id:projectId}),cache:'no-store',signal:AbortSignal.timeout(30000)})
   if(!response.ok){
    if(response.status===401||response.status===403)retryableInspect=false
    if(action==='inspect'&&response.status===503){
     const failure:unknown=await response.json().catch(()=>null)
     issue=safeIssue(failure)
     if(issue.code==='reconnect_required'){
      update({status:'reconnect_required',inspectionUnavailable:false,inspectionIssue:null,creditBalance:null,quoteCredits:null,observedAt:null})
      return
     }
    }
    throw Error()
   }
   const body=await response.json()
   if(action==='connect'){
    const to=new URL(body.authorization_url)
    if(to.origin!=='https://clerk.higgsfield.ai'||to.pathname!=='/oauth/authorize'||to.username||to.password||to.hash)throw Error()
    navigate(to.href);return
   }
   if(!['connected','disconnected','reconnect_required','unavailable'].includes(body.status))throw Error()
   const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null
   update({status:body.status,inspectionUnavailable:false,inspectionIssue:null,creditBalance:number(body.creditBalance),quoteCredits:number(body.quoteCredits),observedAt:typeof body.observedAt==='string'&&Number.isFinite(Date.parse(body.observedAt))?body.observedAt:null})
  }catch{
   const canRetry=retryableInspect&&state.status==='connected'
   update({status:canRetry?'connected':'unavailable',inspectionUnavailable:canRetry,inspectionIssue:canRetry?(issue??{code:'unknown',stage:null}):null,creditBalance:null,quoteCredits:null,observedAt:null})
  }
  finally{update({working:false})}
 }
 return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},load:()=>execute('status'),act:(action:'connect'|'inspect'|'disconnect')=>execute(action)}
}
