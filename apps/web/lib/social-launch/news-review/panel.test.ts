import {it,expect} from 'vitest'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {NewsReviewEvidence} from '@/components/social-launch/NewsReviewEvidence'
const review:any={projectId:'project',postId:'post',revisionId:'revision',evidenceSha256:'a'.repeat(64),review_packet_ready:true,blockers:[],publicationBlockers:['video_transport_unavailable','account_required'],canPublish:false,dispatchEnabled:false,source:{url:'https://www.anthropic.com/news/claude',publishedAt:'2026-10-18T08:00:00.000Z'},creativeVersion:'the-prompt-illustrated-smooth-v1',video:{id:'video',sha256:'b'.repeat(64),byteSize:22656},imageCount:3,voiceLabel:'Victoria',aiDisclosure:'AI-GENERATED / EDITORIAL ILLUSTRATIONS',channel:'facebook',destinationLabel:'The Prompt testkonto'}
it('shows_source_date_disclosure_destination_and_separate_states',()=>{
 const html=renderToStaticMarkup(React.createElement(NewsReviewEvidence,{review}))
 for(const text of ['anthropic.com/news/claude','2026-10-18T08:00:00.000Z','Victoria','3 illustrationer','AI-GENERATED / EDITORIAL ILLUSTRATIONS','The Prompt testkonto','Underlaget är klart för granskning','Publicering är inte aktiverad'])expect(html).toContain(text)
 for(const text of ['documentText','reportText','storage_path','signedUrl','service_role'])expect(html).not.toContain(text)
})
it('missing_and_stale_evidence_are_explicit',()=>{
 const html=renderToStaticMarkup(React.createElement(NewsReviewEvidence,{review:{...review,review_packet_ready:false,source:null,video:null,blockers:['news_source_expired','news_evidence_required']}}))
 expect(html).toContain('Nyheten är för gammal');expect(html).toContain('Granskningsunderlag saknas');expect(html).not.toContain('Underlaget är klart för granskning')
})