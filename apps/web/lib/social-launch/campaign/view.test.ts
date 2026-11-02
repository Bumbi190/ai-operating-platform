import {expect,it} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {SocialCampaignPanel} from '@/components/social-launch/SocialCampaignPanel'
import type {CampaignView} from './types'
const initial:CampaignView={id:'campaign',projectId:'project',conversationId:'source',status:'uncertain',maxCostSek:3,publicationAuthority:false,workspaceUrl:'/projects/dealer/social/campaigns/campaign',contentUrl:'/projects/dealer/social#content',items:['queued','review_ready','uncertain'].map((state,i)=>({id:'item'+i,runId:'run'+i,postId:'post'+i,state:state as 'queued'|'review_ready'|'uncertain',unitCeilingSek:1,draft:{title:'Utkast '+(i+1),text:'Sparad förslagstext '+(i+1),imagePrompt:'A dealer',localMinute:'2026-11-03T08:30',scheduledAt:'2026-11-03T07:30:00.000Z'},assetId:i===1?'asset':null,revisionId:i===1?'revision':null,reason:null}))}
it('shows exact saved post link only for a real revision, and distinguishes uncertainty from completed review',()=>{
 const html=renderToStaticMarkup(createElement(SocialCampaignPanel,{initial,projectName:'Exempelprojekt'}))
 expect(html).toContain('Text och bild klara för granskning')
 expect(html).toContain('Väntar på bild');expect(html).toContain('Utfallet behöver kontrolleras')
 expect(html).toContain('/projects/dealer/social?post=post1#content')
 expect(html).not.toContain('?post=post0');expect(html).not.toContain('?post=post2')
 expect(html).toContain('Ingen ny beställning görs automatiskt')
})
