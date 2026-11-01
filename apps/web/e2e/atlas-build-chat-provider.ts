import {TEST_PROJECT} from '../lib/website-build/test-db'
export default class FixtureAnthropic {
 messages={stream:(args:any)=>{
  const events:Record<string,(value:any)=>void>={}
  const last=args.messages.at(-1),blocks=last?.content
  return {on(name:string,callback:(value:any)=>void){events[name]=callback;return this},async finalMessage(){
   if(Array.isArray(blocks)&&blocks.some((b:any)=>b.type==='tool_result')){const text='Feedbacken är mottagen.';events.text?.(text);return {stop_reason:'end_turn',content:[{type:'text',text}]}}
   const text=typeof blocks==='string'?blocks:'Bygg en hemsida'
   const system=typeof args.system==='string'?args.system:JSON.stringify(args.system)
   const build=system.match(/CURRENT BUILD \(verified for this conversation\): (\{[^\n]*?\});/)?.[1]
   if(build){const context=JSON.parse(build);return {stop_reason:'tool_use',content:[{type:'tool_use',id:'fixture-'+crypto.randomUUID(),name:'submit_website_build_feedback',input:{...context,text,inputSource:'text',idempotencyKey:crypto.randomUUID()}}]}}
   const ref=system.match(/CURRENT REVIEWED PLAN REFERENCES: (\{[^\n]*?\});/)?.[1]
   const current=ref?JSON.parse(ref):null
   const studio=system.match(/ACTIVE WEBSITE STUDIO PROJECT: (\{[^\n]*?\});/)?.[1]
   const projectId=studio?JSON.parse(studio).projectId:TEST_PROJECT
   // Explicit authored provider fixture only; actual plan tool and approvals remain unchanged.
   if(text.includes('premium-dealer-demo-v1'))return {stop_reason:'tool_use',content:[{type:'tool_use',id:'fixture-'+crypto.randomUUID(),name:'draft_website_build_plan',input:{projectId,...(current?{planId:current.planId}:{}),expectedRevisionId:current?.revisionId??null,idempotencyKey:crypto.randomUUID(),content:{title:'Handlarbörsen',purpose:'Fiktiv ensidesdemo för en bilhandlare',audience:'Bilhandlare',pages:[{key:'index',title:'Hem',purpose:'Showroom och åtta exempelbilar'}],design:{style:'Mörkt showroom med varm amberaccent',reference:null,starter:'premium-dealer-demo-v1'},features:[{name:'Filter och testförfrågan',mode:'preview_demo',provider:null}],architecture:'Statisk fiktiv demo, inga riktiga kunder eller utskick',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}}}}]}

   return {stop_reason:'tool_use',content:[{type:'tool_use',id:'fixture-'+crypto.randomUUID(),name:'draft_website_build_plan',input:{projectId,...(current?{planId:current.planId}:{}),expectedRevisionId:current?.revisionId??null,idempotencyKey:crypto.randomUUID(),content:{title:'Caféets hemsida',purpose:text,audience:'Gäster',pages:[{key:'index',title:'Hem',purpose:'Visa caféet'},{key:'contact',title:'Kontakt',purpose:'Hitta oss'}],design:{style:'Omniras färger',reference:null},features:[],architecture:'Statisk hemsida med två sidor',steps:['Bygg','Kontrollera'],domain:{registrar:'strato',requestedName:'cafe-exempel.se'}}}}]}
  }}
 }}
}
