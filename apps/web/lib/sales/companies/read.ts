import type {SalesContact} from '../types'
import type {TimingReport} from '../timing/types'
import type {ContactsRead} from './types'
const UUID=/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export type ContactPage=(afterId:string|null,limit:number)=>Promise<{data:unknown;error:unknown}>
export async function readCompanyContacts(projectId:string,fetchPage:ContactPage):Promise<ContactsRead>{
 const contacts:SalesContact[]=[];let after:string|null=null
 try{
  for(;;){
   const result=await fetchPage(after,contacts.length===10000?1:500)
   if(result.error||!Array.isArray(result.data))throw new Error('unavailable')
   if(contacts.length===10000&&result.data.length)return {status:'incomplete',contacts:[]}
   if(result.data.length>500)throw new Error('oversized_page')
   for(const raw of result.data){
    if(!object(raw)||typeof raw.id!=='string'||!UUID.test(raw.id)||raw.project_id!==projectId||!object(raw.data)||raw.data.id!==raw.id||raw.data.projectId!==projectId||raw.version!==raw.data.version||!Number.isInteger(raw.version)||(raw.version as number)<1||after!==null&&raw.id<=after)throw new Error('invalid_row')
    const c=raw.data
    if(typeof c.companyName!=='string'||!c.companyName.trim()||typeof c.branchName!=='string'||typeof c.email!=='string'||!c.email.includes('@')||typeof c.confirmed!=='boolean'||typeof c.suppressed!=='boolean'||typeof c.excluded!=='boolean'||!['contacted','unknown','not_contacted'].includes(String(c.history))||!(c.websiteUrl===null||typeof c.websiteUrl==='string'))throw new Error('invalid_contact')
    contacts.push(c as unknown as SalesContact);after=raw.id
   }
   if(result.data.length<500)return {status:'ready',contacts}
  }
 }catch{return {status:'unavailable',contacts:[]}}
}
export async function readCompanyTiming(projectId:string,contacts:SalesContact[],fetchBatch:(ids:string[])=>Promise<TimingReport>):Promise<TimingReport|null>{
 if(!contacts.length)return null
 try{
  let report:TimingReport|null=null
  for(let start=0;start<contacts.length;start+=200){
   const next=await fetchBatch(contacts.slice(start,start+200).map(c=>c.id))
   if(next.projectId!==projectId||!Array.isArray(next.contacts)||!Array.isArray(next.historyRevisions))return null
   if(!report)report={...next,contacts:[...next.contacts],historyRevisions:[...next.historyRevisions]}
   else{
    if(report.rules?.id!==next.rules?.id)return null
    report.contacts.push(...next.contacts);report.historyRevisions.push(...next.historyRevisions)
   }
  }
  return report
 }catch{return null}
}
