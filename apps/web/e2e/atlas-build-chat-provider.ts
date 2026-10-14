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
   return {stop_reason:'tool_use',content:[{type:'tool_use',id:'fixture-'+crypto.randomUUID(),name:'draft_website_build_plan',input:{projectId:TEST_PROJECT,...(current?{planId:current.planId}:{}),expectedRevisionId:current?.revisionId??null,idempotencyKey:crypto.randomUUID(),content:{title:'Caféets hemsida',purpose:text,audience:'Gäster',pages:[{key:'index',title:'Hem',purpose:'Visa caféet'},{key:'contact',title:'Kontakt',purpose:'Hitta oss'}],design:{style:'Omniras färger',reference:null},features:[],architecture:'Statisk hemsida med två sidor',steps:['Bygg','Kontrollera'],domain:{registrar:'strato',requestedName:'cafe-exempel.se'}}}}]}
  }}
 }}
}
