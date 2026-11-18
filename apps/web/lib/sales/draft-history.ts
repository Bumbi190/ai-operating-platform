import type {SalesDraftRevision,SalesWorkspace} from './types'
import type {ContactTiming,HistoryRevision} from './timing/types'
const mailbox=(value:string)=>value.trim().toLowerCase()
export function getDraftReviewHistory(model:SalesWorkspace,draft:SalesDraftRevision):{history:HistoryRevision|null;timing:ContactTiming|null;legacyNote:string|null}{
 if(draft.projectId!==model.projectId)return {history:null,timing:null,legacyNote:null}
 const recipient=mailbox(draft.toEmail)
 const contact=model.contacts.find(c=>c.id===draft.contactId&&c.projectId===model.projectId&&mailbox(c.email)===recipient)
 const report=model.timing?.projectId===model.projectId?model.timing:null
 const timing=report?.contacts.find(t=>t.contactId===draft.contactId&&mailbox(t.recipient??'')===recipient)??null
 const history=report?.historyRevisions.find(h=>h.id===timing?.historyRevisionId&&h.projectId===model.projectId&&mailbox(h.recipient)===recipient&&h.data.contactVersions.some(v=>v.id===draft.contactId))??null
 return {history,timing,legacyNote:contact?.historySource||null}
}
