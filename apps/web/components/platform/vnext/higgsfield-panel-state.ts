export interface HiggsfieldPanelState {
 status:'disconnected'|'connected'|'reconnect_required'|'unavailable'
 working:boolean;creditBalance:number|null;quoteCredits:number|null;observedAt:string|null
}
export function createHiggsfieldPanelController(projectId:string,canManage:boolean,fetcher:typeof fetch=fetch,navigate:(url:string)=>void=url=>window.location.assign(url)) {
 let state:HiggsfieldPanelState={status:'unavailable',working:false,creditBalance:null,quoteCredits:null,observedAt:null}
 const listeners=new Set<()=>void>()
 function update(value:Partial<HiggsfieldPanelState>){state={...state,...value};listeners.forEach(fn=>fn())}
 async function execute(action:'status'|'connect'|'inspect'|'disconnect') {
  if(!canManage||state.working)return
  update({working:true})
  try {
   const endpoint=action==='connect'?'oauth/start':action
   const url='/api/media/higgsfield/'+endpoint+(action==='status'?'?project_id='+encodeURIComponent(projectId):'')
   const response=await fetcher(url,action==='status'?{cache:'no-store',signal:AbortSignal.timeout(30000)}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project_id:projectId}),cache:'no-store',signal:AbortSignal.timeout(30000)})
   if(!response.ok)throw Error()
   const body=await response.json()
   if(action==='connect'){
    const to=new URL(body.authorization_url)
    if(to.origin!=='https://clerk.higgsfield.ai'||to.pathname!=='/oauth/authorize'||to.username||to.password||to.hash)throw Error()
    navigate(to.href);return
   }
   if(!['connected','disconnected','reconnect_required','unavailable'].includes(body.status))throw Error()
   const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null
   update({status:body.status,creditBalance:number(body.creditBalance),quoteCredits:number(body.quoteCredits),observedAt:typeof body.observedAt==='string'&&Number.isFinite(Date.parse(body.observedAt))?body.observedAt:null})
  }catch{update({status:'unavailable',creditBalance:null,quoteCredits:null,observedAt:null})}
  finally{update({working:false})}
 }
 return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},load:()=>execute('status'),act:(action:'connect'|'inspect'|'disconnect')=>execute(action)}
}
