import {createHash} from 'node:crypto'
export const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
export const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex')
export function reviewFixture(){
 const words=[{word:'AI',startMs:0,endMs:1000},{word:'agents',startMs:2000,endMs:3000},{word:'help',startMs:4000,endMs:5000},{word:'people.',startMs:6000,endMs:7990}]
 const audioBytes=new Uint8Array(200).fill(7),transcript='AI agents help people.'
 const audio={id:id(6),sha256:sha(audioBytes),byteSize:200}
 const usage={documentUrl:'https://ideogram.ai/terms',documentText:'Test-only archived provider terms for editorial use.',scope:'public_social_editorial',reviewedBy:id(2),reviewedAt:'2026-10-18T07:00:00.000Z'}
 const receipt={kind:'the-prompt-review-render-v1',projectId:id(1),scriptId:id(3),scriptSha256:sha(transcript),hookSha256:sha('AI agents'),captionSha256:sha('AI agents help people.'),language:'en',
 source:{newsItemId:id(4),url:'https://www.anthropic.com/news/ai-agents',key:'rss_anthropic',publishedAt:'2026-10-18T06:00:00.000Z'},
 video:{sha256:sha('test video bytes'),byteSize:500},images:[7,8,9].map(n=>({id:id(n),sha256:sha('image'+n),byteSize:500})),audio,words,transcript,narrationDurationMs:8000,
 voiceReceipt:{kind:'the-prompt-voice-v1',voiceId:'qSeXEcewz7tA0Q0qk9fH',modelId:'eleven_turbo_v2_5',transcriptSha256:sha(transcript),audioSha256:audio.sha256,timingsSha256:sha(JSON.stringify(words)),audioByteSize:200,durationMs:8000,wordCount:4},
 creativeVersion:'the-prompt-illustrated-smooth-v1',compositionId:'ThePromptIllustratedNews',sourceSha:'a'.repeat(40),
 profile:{width:720,height:1280,fps:30,frames:330,durationMs:11000,videoCodec:'h264',audioCodec:'aac'},
 qa:{reportText:'Test-only complete A/V decode and visual review report.',reportSha256:sha('Test-only complete A/V decode and visual review report.'),reviewedBy:id(2),reviewedAt:'2026-10-18T07:00:00.000Z'},
 usage:[0,1,2].map(()=>({...usage,documentSha256:sha(usage.documentText)})),assetProvenanceIds:[22,23,24,25].map(id),costEventIds:[id(30)]}
 return {video:{id:id(5),...receipt.video},receipt,receiptSha256:'',provenanceId:id(21),planRevisionId:id(20),destinations:[{channel:'instagram',bindingId:null as string|null,accountId:null as string|null}]}
}
