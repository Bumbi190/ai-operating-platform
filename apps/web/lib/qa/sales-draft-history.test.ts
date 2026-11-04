import {it,expect} from 'vitest'
import {getDraftReviewHistory} from '@/lib/sales/draft-history'
const projectId='project-a',contactId='contact-a',recipient='sales@example.se'
const draft={projectId,contactId,toEmail:recipient,contactVersion:1} as never
function fixture(){
 const h={id:'current-history',projectId,recipient,version:2,data:{contactVersions:[{id:contactId,version:1}],history:'unknown'}}
 return {projectId,contacts:[{id:contactId,projectId,email:recipient,historySource:'Older note'}],timing:{projectId,contacts:[{contactId,recipient,contactVersion:1,historyRevisionId:h.id,blockers:['SOURCE_STALE','SOURCE_GAP'],initialPreparationAllowed:false}],historyRevisions:[{...h,id:'unbound-newer',version:99},h]}} as never
}
it('uses the report-bound saved revision, preserving stale and gap states',()=>{
 const found=getDraftReviewHistory(fixture(),draft)
 expect(found.history?.id).toBe('current-history');expect(found.timing?.blockers).toEqual(['SOURCE_STALE','SOURCE_GAP']);expect(found.legacyNote).toBe('Older note')
})
it('matches a normalized mailbox without changing the saved source',()=>{
 const m:any=fixture();m.timing.historyRevisions[1].recipient=' SALES@EXAMPLE.SE '
 expect(getDraftReviewHistory(m,draft).history?.recipient).toBe(' SALES@EXAMPLE.SE ')
})
it.each(['projectId','recipient','contactVersions'])('refuses a history bound to a different %s',field=>{
 const m:any=fixture(),h=m.timing.historyRevisions[1]
 if(field==='contactVersions')h.data.contactVersions=[{id:'other-contact',version:1}];else h[field]='other'
 expect(getDraftReviewHistory(m,draft).history).toBeNull()
})
it('does not borrow an old note or history from another project',()=>{
 const m:any=fixture();m.projectId='other-project'
 expect(getDraftReviewHistory(m,draft)).toEqual({history:null,timing:null,legacyNote:null})
})
it('does not treat an unmatched older note as a structured history',()=>{
 const m:any=fixture();m.timing.contacts[0].historyRevisionId='missing'
 expect(getDraftReviewHistory(m,draft).history).toBeNull();expect(getDraftReviewHistory(m,draft).legacyNote).toBe('Older note')
})
