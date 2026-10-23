import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement} from 'react'
import {ScheduledMetaReviewFixture} from '@/components/social-launch/ScheduledMetaReviewFixture'
import {prepareScheduledMetaReviewHandoffFixture} from './review-handoff-fixture'

const projectId='10000000-0000-4000-8000-000000000010'
const jobId='20000000-0000-4000-8000-000000000011'
const postId='30000000-0000-4000-8000-000000000012'
const publicationId='40000000-0000-4000-8000-000000000013'
function row(publicationState='published',extra:Record<string,unknown>={}){
 return {jobId,publicationId,postId,reservedAt:'2026-10-23T07:40:00.000Z',
  databaseJobState:'published',publicationState,
  providerOutcome:'unknown',reviewStatus:'needs_authenticated_meta_evidence',
  automaticRetryAllowed:false,...extra}
}
function queue(items:unknown[]=[row()],extra:Record<string,unknown>={}){
 return {projectId,automaticRetryAllowed:false,reviewAction:'operator_review_provider_evidence',
  pageLimit:25,items,...extra}
}
beforeEach(()=>vi.stubEnv('NODE_ENV','test'))
afterEach(()=>vi.unstubAllEnvs())

it('never equates internal published with verified Meta receipt or enables legacy inspector',()=>{
 const data=prepareScheduledMetaReviewHandoffFixture(queue(),projectId)
 expect(data).toMatchObject({projectId,automaticRetryAllowed:false,
  mayFinalizeReceipt:false,mayPublish:false})
 expect(data.entries).toHaveLength(1)
 expect(data.entries[0]).toMatchObject({
  databaseJobState:'published',publicationState:'published',
  providerEvidence:'unverified',reviewMode:'separate_operator_meta_check',
  existingManualPanelEligible:false,manualPanelScope:null,
  automaticRetryAllowed:false,canConfirmMetaReceipt:false,
 })
 expect(data.entries[0].operatorInstruction).toMatch(/inte verifierat/)
 const html=renderToStaticMarkup(createElement(ScheduledMetaReviewFixture,{review:data}))
 expect(html).toContain('Meta-bevis: saknas')
 expect(html).toContain('Intern jobbstatus: published')
 expect(html).toContain('separat kontroll')
 expect(html).not.toContain('<button')
 expect(html).not.toContain('<form')
 expect(html).not.toContain('<a ')
 expect(html).not.toContain('Meta-resultat: verifierat')
})

it('offers only passive handoff to the existing operator-only inspector when publication really is uncertain',()=>{
 const q=queue([row('uncertain',{databaseJobState:'uncertain'})])
 const data=prepareScheduledMetaReviewHandoffFixture(q,projectId)
 const entry=data.entries[0]
 expect(entry.reviewMode).toBe('existing_manual_facebook_panel')
 expect(entry.existingManualPanelEligible).toBe(true)
 expect(entry.manualPanelScope).toEqual({projectId,postId,publicationId})
 expect(entry.needsOperatorReview).toBe(true)
 expect(entry.canConfirmMetaReceipt).toBe(false)
 const html=renderToStaticMarkup(createElement(ScheduledMetaReviewFixture,{review:data}))
 expect(html).toContain('befintlig operatörsstyrd Facebook-panel')
 expect(html).not.toContain('<button')
})

it('requires separate operator review when underlying record is missing or not uncertain',()=>{
 for(const state of ['requested','creating','processing','publishing','failed','missing']){
  const entry=prepareScheduledMetaReviewHandoffFixture(queue([row(state)]),projectId).entries[0]
  expect(entry.existingManualPanelEligible).toBe(false)
  expect(entry.manualPanelScope).toBeNull()
  expect(entry.automaticRetryAllowed).toBe(false)
 }
 const entry=prepareScheduledMetaReviewHandoffFixture(queue([row('uncertain',{postId:null})]),projectId).entries[0]
 expect(entry.existingManualPanelEligible).toBe(false)
})

it('rejects foreign project, forged proofs, extra action arguments and duplicate records',()=>{
 const bad=[
  queue([row()],{projectId:'10000000-0000-4000-8000-000000000099'}),
  queue([row()],{automaticRetryAllowed:true}),
  queue([row()],{reviewAction:'complete'}),
  queue([row()],{pageLimit:500}),
  queue([row('published',{providerOutcome:'published'})]),
  queue([row('published',{reviewStatus:'verified'})]),
  queue([row('published',{automaticRetryAllowed:true})]),
  queue([row('published',{providerId:'12345_999'})]),
  queue([row('published',{postId:'bad'})]),
  queue([row('published',{reservedAt:'invalid'})]),
  queue([row(),row()]),
  queue(Array.from({length:26},(_,i)=>row('published',{jobId:i.toString().padStart(8,'0')+'-0000-4000-8000-000000000011'}))),
 ]
 for(const sample of bad)
  expect(()=>prepareScheduledMetaReviewHandoffFixture(sample,projectId)).toThrow()
 expect(()=>prepareScheduledMetaReviewHandoffFixture(queue(), '10000000-0000-4000-8000-000000000099')).toThrow()
})

it('shows an empty project queue safely and warns when the nonpaginated 25-item fixture limit is reached',()=>{
 const empty=prepareScheduledMetaReviewHandoffFixture(queue([]),projectId)
 expect(empty.entries).toEqual([])
 expect(empty.limitReached).toBe(false)
 expect(renderToStaticMarkup(createElement(ScheduledMetaReviewFixture,{review:empty})))
  .toContain('Inga osäkra publiceringsförsök')
 const items=Array.from({length:25},(_,i)=>row('published',{
  jobId:'20000000-0000-4000-8000-'+(i+100).toString().padStart(12,'0'),
  publicationId:'40000000-0000-4000-8000-'+(i+100).toString().padStart(12,'0'),
 }))
 const data=prepareScheduledMetaReviewHandoffFixture(queue(items),projectId)
 expect(data.limitReached).toBe(true)
 expect(renderToStaticMarkup(createElement(ScheduledMetaReviewFixture,{review:data})))
  .toContain('Fler kan finnas')
})

it('refuses construction outside isolated test mode',()=>{
 vi.stubEnv('NODE_ENV','production')
 expect(()=>prepareScheduledMetaReviewHandoffFixture(queue(),projectId)).toThrow()
})

const replayInput=process.env.OMNIRA_SCHEDULE_REPLAY_REVIEW_B64
const replayProject=process.env.OMNIRA_SCHEDULE_REPLAY_REVIEW_PROJECT
it.skipIf(!replayInput||!replayProject)('renders the actual isolated PostgREST review RPC without trusting internal published as a Meta receipt',()=>{
 const value=JSON.parse(Buffer.from(replayInput!,'base64').toString('utf8'))
 const prepared=prepareScheduledMetaReviewHandoffFixture(value,replayProject!)
 expect(prepared.entries).toHaveLength(1)
 expect(prepared.entries[0].publicationState).toBe('published')
 expect(prepared.entries[0].providerEvidence).toBe('unverified')
 expect(prepared.entries[0].reviewMode).toBe('separate_operator_meta_check')
 expect(prepared.entries[0].existingManualPanelEligible).toBe(false)
 expect(prepared.entries[0].manualPanelScope).toBeNull()
 expect(prepared.mayFinalizeReceipt).toBe(false)
 const html=renderToStaticMarkup(createElement(ScheduledMetaReviewFixture,{review:prepared}))
 expect(html).toContain('Meta-bevis: saknas')
 expect(html).not.toContain('<button')
 expect(html).not.toContain('<form')
})
