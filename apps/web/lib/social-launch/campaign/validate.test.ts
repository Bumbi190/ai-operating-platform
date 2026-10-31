import {describe,it,expect} from 'vitest'
import {parseCampaignInput} from './validate'
const now='2026-10-31T15:00:00.000Z'
const id='10000000-0000-4000-8000-000000000001'
const item={title:'Test',text:'A dealer platform review draft.',imagePrompt:'A Swedish car dealership, no visible names or text.',localMinute:'2026-11-03T08:30'}
const input=()=>({projectId:id,campaignId:'10000000-0000-4000-8000-000000000002',planRevisionId:id,profileRevisionId:id,idempotencyKey:'campaign-intent-1',items:[{...item}]})
describe('campaign admission input',()=>{
 it('pins intended Stockholm time to UTC preserving actual text',()=>expect(parseCampaignInput(input(),now).items[0]).toEqual({...item,scheduledAt:'2026-11-03T07:30:00.000Z'}))
 it('accepts exactly three distinct future drafts',()=>{
  const value=input();value.items=[{...item},{...item,localMinute:'2026-11-05T08:30'},{...item,localMinute:'2026-11-06T08:30'}]
  expect(parseCampaignInput(value,now).items.map(x=>x.scheduledAt)).toEqual(['2026-11-03T07:30:00.000Z','2026-11-05T07:30:00.000Z','2026-11-06T07:30:00.000Z'])
 })
 it('rejects a fourth image and an empty package',()=>{for(const items of [[],[1,2,3,4].map((_,i)=>({...item,localMinute:'2026-11-0'+(i+3)+'T08:30'}))])expect(()=>parseCampaignInput({...input(),items},now)).toThrow('INVALID_BODY')})
 it('rejects duplicate intended slots',()=>expect(()=>parseCampaignInput({...input(),items:[item,{...item}]},now)).toThrow('INVALID_BODY'))
 it.each(['2026-10-31T15:00','2026-02-30T10:00','2027-10-31T02:30','2027-03-28T02:30'])('refuses past/impossible/ambiguous time %s',localMinute=>expect(()=>parseCampaignInput({...input(),items:[{...item,localMinute}]},now)).toThrow('INVALID_BODY'))
 it.each(['ownerId','maxCostSek','provider','claimId','approved','conversationId'])('refuses caller authority %s',key=>expect(()=>parseCampaignInput({...input(),[key]:'forged'},now)).toThrow('INVALID_BODY'))
 it('refuses model image URLs',()=>expect(()=>parseCampaignInput({...input(),items:[{...item,imageUrl:'https://evil.test/img.png'}]},now)).toThrow('INVALID_BODY'))
 it.each(['projectId','campaignId','planRevisionId','profileRevisionId'])('refuses invalid identity %s',key=>expect(()=>parseCampaignInput({...input(),[key]:'wrong'},now)).toThrow('INVALID_BODY'))
 it.each([null,undefined,[],42])('refuses nonobject input',value=>expect(()=>parseCampaignInput(value,now)).toThrow('INVALID_BODY'))
 it('requires stable intent and bounded nonempty fields',()=>{
  for(const changes of [{idempotencyKey:''},{idempotencyKey:'bad key'}])expect(()=>parseCampaignInput({...input(),...changes},now)).toThrow('INVALID_BODY')
  for(const changes of [{title:' '},{text:' '},{imagePrompt:' '},{title:'x'.repeat(151)},{text:'x'.repeat(5001)},{imagePrompt:'x'.repeat(2001)}])expect(()=>parseCampaignInput({...input(),items:[{...item,...changes}]},now)).toThrow('INVALID_BODY')
 })
})
