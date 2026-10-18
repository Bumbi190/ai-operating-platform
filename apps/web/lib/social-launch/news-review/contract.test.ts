import {it,expect} from 'vitest'
import {parsePrepareNewsReview,parseRenderReceipt,newsEvidenceSha256,renderReceiptSha256} from './contract'
import {reviewFixture,id} from './fixtures.test-utils'
import {checkFreshRelevantNews} from '@/lib/media/news-freshness'
it('strict_input_and_receipt_identity',()=>{
 const input={projectId:id(1),scriptId:id(3),videoAssetId:id(5),idempotencyKey:'retry-1'}
 expect(parsePrepareNewsReview(input)).toEqual(input)
 for(const extra of [{rightsVerified:true},{approved:true},{url:'https://example.com/x?token=secret'}])expect(()=>parsePrepareNewsReview({...input,...extra})).toThrow()
 const r=reviewFixture().receipt
 expect(parseRenderReceipt(r)).toEqual(r)
 for(const change of [{kind:'uploaded'},{creativeVersion:'old'},{compositionId:'SimpleNewsReel'},{sourceSha:''},{language:'sv'},
 {voiceReceipt:{...r.voiceReceipt,voiceId:'other'}},{audio:{...r.audio,sha256:'b'.repeat(64)}},
 {images:[r.images[0],r.images[0],r.images[2]]},{transcript:'Different text'},
 {words:[...r.words].reverse()},{profile:{...r.profile,frames:329,durationMs:10966}},
 {profile:{...r.profile,width:0}},{narrationDurationMs:NaN},
 {source:{...r.source,publishedAt:'tomorrow'}},{source:{...r.source,url:r.source.url+'?token=secret'}},
 {usage:[]},{usage:r.usage.map(u=>({...u,documentText:'Changed'}))},{costEventIds:[]},
 {qa:{...r.qa,reportSha256:'a'.repeat(64)}}])expect(()=>parseRenderReceipt({...r,...change})).toThrow()
})
it('word_key_order_is_canonical_but_image_order_is_not',()=>{
 const a=reviewFixture();a.receiptSha256=renderReceiptSha256(a.receipt)
 const b=structuredClone(a);b.receipt.words=b.receipt.words.map(w=>({endMs:w.endMs,word:w.word,startMs:w.startMs}))
 expect(newsEvidenceSha256(b)).toBe(newsEvidenceSha256(a))
 const c=structuredClone(a);c.receipt.images.reverse();c.receiptSha256=renderReceiptSha256(c.receipt)
 expect(newsEvidenceSha256(c)).not.toBe(newsEvidenceSha256(a))
 expect(()=>newsEvidenceSha256({...a,rightsVerified:true})).toThrow()
 expect(()=>newsEvidenceSha256({...a,receiptSha256:'f'.repeat(64)})).toThrow()
})
it('freshness_boundaries',()=>{
 const now=Date.parse('2026-10-18T08:00:00Z'),lead={title:'Anthropic launches AI agents',summary:'New model',url:'https://www.anthropic.com/news/ai',source:'rss_anthropic',sourceLabel:'Anthropic'}
 for(const [age,eligible] of [[172800000,true],[172800001,false],[-900000,true],[-900001,false]] as const)expect(checkFreshRelevantNews({...lead,publishedAt:new Date(now-age)},now).eligible).toBe(eligible)
})
