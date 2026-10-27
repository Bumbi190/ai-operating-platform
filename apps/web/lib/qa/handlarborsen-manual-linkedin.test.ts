import {describe,expect,it} from 'vitest'
import type {SocialContentPost} from '@/lib/social-launch/content/types'
import {buildManualLinkedInCopy,manualAssetFilename} from '@/lib/handlarborsen/distribution/manual-linkedin'

const id=(last:string)=>'00000000-0000-4000-8000-'+last.padStart(12,'0')
function post(overrides:Partial<SocialContentPost>={}):SocialContentPost{
 const revision={
  id:id('12'),sequence:2,sha256:'a'.repeat(64),planRevisionId:id('30'),
  draft:{channel:'linkedin' as const,format:'text' as const,title:'Handlarbörsen pilot',
   text:'Vi söker bilhandlare som vill testa vår plattform.',linkUrl:'https://handlarborsen.se/',
   mediaIds:[],mediaBrief:'',scheduledAt:null},
  media:[],binding:null,createdAt:'2026-10-27T10:00:00Z',
 }
 return {
  id:id('11'),revision,decision:{
   id:id('13'),decision:'approve' as const,revisionId:revision.id,
   sha256:revision.sha256,decidedAt:'2026-10-27T11:00:00Z',
  },status:'approved',requirements:[],...overrides,
 }
}

describe('Handlarbörsen manual LinkedIn package',()=>{
 it('exports reviewed media with stable, safe file extensions',()=>{
  expect(manualAssetFilename({kind:'image',mimeType:'image/jpeg'})).toBe('handlarborsen-image.jpg')
  expect(manualAssetFilename({kind:'video',mimeType:'video/mp4'})).toBe('handlarborsen-video.mp4')
  expect(manualAssetFilename({kind:'image',mimeType:'image/svg+xml'})).toBeNull()
  expect(manualAssetFilename({kind:'image',mimeType:'video/mp4'})).toBeNull()
 })
 it('copies the approved, exact LinkedIn text and reviewed link only',()=>{
  expect(buildManualLinkedInCopy(post())).toEqual({
   ok:true,text:'Vi söker bilhandlare som vill testa vår plattform.\n\nhttps://handlarborsen.se/',
   title:'Handlarbörsen pilot',mediaCount:0,postId:id('11'),revisionId:id('12'),
  })
 })
 it('does not duplicate a URL already in reviewed copy',()=>{
  const p=post();p.revision.draft.text='Testa på https://handlarborsen.se/'
  const r=buildManualLinkedInCopy(p)
  expect(r.ok&&r.text).toBe('Testa på https://handlarborsen.se/')
 })
 it('never exposes another channel for manual LinkedIn copying',()=>{
  const p=post();p.revision.draft.channel='instagram'
  expect(buildManualLinkedInCopy(p)).toEqual({ok:false,reason:'not_linkedin'})
 })
 it('refuses unapproved or stale review',()=>{
  expect(buildManualLinkedInCopy(post({decision:null,status:'proposal'}))).toEqual({ok:false,reason:'review_required'})
  const p=post();p.decision!.decision='reject'
  expect(buildManualLinkedInCopy(p)).toEqual({ok:false,reason:'review_required'})
  const q=post();q.decision!.revisionId=id('99')
  expect(buildManualLinkedInCopy(q)).toEqual({ok:false,reason:'revision_mismatch'})
  const r=post();r.decision!.sha256='b'.repeat(64)
  expect(buildManualLinkedInCopy(r)).toEqual({ok:false,reason:'revision_mismatch'})
 })
 it('rejects a tampered URL, rather than inserting arbitrary destinations',()=>{
  const p=post();p.revision.draft.linkUrl='http://example.com'
  expect(buildManualLinkedInCopy(p)).toEqual({ok:false,reason:'invalid_content'})
  p.revision.draft.linkUrl='https://user:password@example.com'
  expect(buildManualLinkedInCopy(p)).toEqual({ok:false,reason:'invalid_content'})
 })
 it('requires actual text and never counts copying as publishing',()=>{
  const p=post();p.revision.draft.text='   '
  expect(buildManualLinkedInCopy(p)).toEqual({ok:false,reason:'invalid_content'})
  expect(JSON.stringify(buildManualLinkedInCopy(post()))).not.toContain('published')
 })
 it('records that attachments need separate manual handling',()=>{
  const p=post();p.revision.media=[{id:id('20'),kind:'image',sha256:'a'.repeat(64),
   mimeType:'image/jpeg',width:1080,height:1080}]
  const r=buildManualLinkedInCopy(p)
  expect(r.ok&&r.mediaCount).toBe(1)
  expect(r.ok&&r.text).not.toMatch(/data:image|\.jpg/)
 })
})
