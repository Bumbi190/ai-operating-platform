import {describe,it,expect} from 'vitest'
import {prepareCodeWorkIntakePreview} from '@/lib/atlas/code-work/intake/preview'
import {OMNIRA_REPOSITORY_ID} from '@/lib/atlas/code-work/repository-registry'
const LOCAL={modelId:'qwen2.5-coder:7b',digest:'sha256:'+'a'.repeat(64)}
const ctx={repositoryId:OMNIRA_REPOSITORY_ID,pinnedBaseSha:'b'.repeat(40),localQualified:LOCAL}
const request={objective:'Correct the display scale label',kind:'ui_fix',writePaths:['apps/web/lib/ui/display-preferences.ts']}
const preview=(input:unknown=request,context:any=ctx)=>prepareCodeWorkIntakePreview(input,context)

describe('first code-work instruction intake is an inert, hash-bound preview',()=>{
 it('pins exact UI task to the qualified local coder and a cross-family reviewer',()=>{
  const p=preview()
  expect(p).toMatchObject({state:'awaiting_human_approval',noAuthorityGranted:true,executionEnabled:false,
   authorProfile:'small',risk:'low',authorCapSek:0,reviewerCapSek:3,totalCapSek:3,
   requiresOwnerChoice:false,requiresExactHumanApproval:true,requiresIndependentReview:true})
  expect(p.authorModel).toBe(LOCAL.modelId)
  expect(p.reviewerFamily).not.toBe('qwen')
  expect(p.sensitivePaths).toEqual([])
  expect(p.previewFingerprint).toMatch(/^[a-f0-9]{64}$/)
 })
 it('proposes paid Standard only with explicit choice if the local coder is not qualified',()=>{
  const p=preview(request,{...ctx,localQualified:null})
  expect(p).toMatchObject({authorProfile:'standard',requiresOwnerChoice:true,
   state:'awaiting_human_approval',executionEnabled:false,authorCapSek:2,totalCapSek:5})
 })
 it('never accepts a model-provided risk flag, price, profile or approval',()=>{
  for(const extra of [{securitySensitive:false},{capSek:100},{modelId:'free-server'},{approved:true}]){
   expect(()=>preview({...request,...extra})).toThrow('invalid_intake_request')
  }
 })
 it('classifies sensitive files by concrete paths regardless of UI fix wording',()=>{
  for(const path of [
   'apps/web/components/security/AccountBadge.tsx',
   'apps/web/components/admin/Panel.tsx',
   'apps/web/components/ApprovalWidget.tsx',
   'apps/web/components/credentialsPanel.tsx',
   'apps/web/components/kalender/Åtkomst.tsx',
   'apps/web/components/calendar/import-data.sql',
   'apps/web/components/calendar/config.json',
   'apps/web/lib/atlas/code-work/model-routing/model-router.ts',
   'apps/web/app/api/atlas/code-work/route.ts',
   '.github/workflows/sdf1c-trusted-broker-boundary.yml',
   'apps/web/supabase/migrations/20261018185809_atlas_code_review_storage.sql',
  ]){
   const p=preview({...request,writePaths:[path]})
   expect(p).toMatchObject({risk:'high',authorProfile:'complex',requiresOwnerChoice:true,
    executionEnabled:false,requiresIndependentReview:true,requiresExactHumanApproval:true})
   expect(p.sensitivePaths).toEqual([path])
  }
 })
 it('does not downgrade when sensitive and benign paths are mixed',()=>{
  const p=preview({...request,writePaths:[request.writePaths[0],'apps/web/lib/atlas/code-work/policy.ts']})
  expect(p.risk).toBe('high')
  expect(p.authorProfile).toBe('complex')
  expect(p.writePaths).toHaveLength(2)
 })
 it('rejects vague scopes, traversal, forbidden credentials, duplicate case aliases and globs',()=>{
  for(const paths of [
   [],['apps/web/components'],['apps/web/components/*.tsx'],['apps/web/components/../../.env'],
   ['apps/web/components/.env.local'],['apps/web/lib/ui/Thing.ts','apps/web/lib/ui/thing.ts'],
   Array.from({length:9},(_,i)=>'apps/web/components/View'+i+'.tsx'),
  ]) expect(()=>preview({...request,writePaths:paths})).toThrow()
 })
 it('refuses unsupported repository, unpinned bases, forged or unqualified local models',()=>{
  expect(()=>preview(request,{...ctx,repositoryId:'github.com/another/project'})).toThrow('untrusted_intake_context')
  expect(()=>preview(request,{...ctx,pinnedBaseSha:'main'})).toThrow('untrusted_intake_context')
  expect(()=>preview(request,{...ctx,localQualified:{modelId:'unknown',digest:LOCAL.digest}})).toThrow('unqualified_local_model')
  expect(()=>preview(request,{...ctx,localQualified:{modelId:LOCAL.modelId,digest:'bad'}})).toThrow('unqualified_local_model')
 })
 it('binds every material change to a different immutable-looking preview fingerprint',()=>{
  const base=preview()
  const changed=[
   preview({...request,objective:'Correct a different label'}),
   preview({...request,kind:'bugfix'}),
   preview({...request,writePaths:['apps/web/components/ScalePicker.tsx']}),
   preview(request,{...ctx,pinnedBaseSha:'c'.repeat(40)}),
   preview(request,{...ctx,localQualified:{modelId:LOCAL.modelId,digest:'sha256:'+'c'.repeat(64)}}),
  ]
  for(const p of changed)expect(p.previewFingerprint).not.toBe(base.previewFingerprint)
  expect(preview().previewFingerprint).toBe(base.previewFingerprint)
 })
 it('refuses extra fields, malformed objectives or unsafe file encodings',()=>{
  for(const r of [{...request,objective:''},{...request,objective:' bad '},{...request,objective:'x'.repeat(1501)},{...request,kind:'trade'},{...request,writePaths:['C:/Users/data/file.ts']},{...request,writePaths:['apps\\web\\lib\\ui\\x.ts']}])expect(()=>preview(r)).toThrow()
 })
})
