import {expect,it} from 'vitest';
import {projectPromptQueue} from './media-queue-projection';
import type {PromptQueueScript,PromptQueueBinding} from './media-queue-types';
const now='2026-10-26T10:00:00.000Z';
const bindings:PromptQueueBinding[]=['facebook','instagram','youtube'].map(platform=>({platform:platform as PromptQueueBinding['platform'],verification:'provider_attested',blocked_at:null}));
const script=(patch:Partial<PromptQueueScript>={}):PromptQueueScript=>({id:'s',project_id:'p',hook:'Dagens AI-nyhet',status:'approved',video_status:'ready',generated_at:'2026-10-26T08:00:00.000Z',instagram_media_id:null,facebook_post_id:null,youtube_video_id:null,publish_channel_state:{},...patch});
const project=(patch:Partial<PromptQueueScript>={},b:PromptQueueBinding[]|null=bindings)=>projectPromptQueue([script(patch)],b,now);
it('distinguishes approved ready, unfinished, and publishing films',()=>{
 expect(project()[0]).toMatchObject({tone:'waiting',label:'Godkänd · väntar på publicering'});
 for(const video_status of ['none','generating','rendering'])expect(project({video_status})[0].label).toBe('Godkänd · video förbereds');
 expect(project({status:'publishing'})[0].label).toBe('Publicering pågår');
});
it('retains global published while YouTube waits, and removes fully receipted film',()=>{
 const partial=project({status:'published',instagram_media_id:'123',facebook_post_id:'456'})[0];
 expect(partial.channels.map(c=>c.tone)).toEqual(['success','success','waiting']);
 expect(project({status:'published',instagram_media_id:'123',facebook_post_id:'456',youtube_video_id:'youtube-id'})).toEqual([]);
});
it('never trusts common publication time or observation ok as a channel receipt',()=>{
 const result=project({publish_channel_state:{instagram:{ok:true,id:'untrusted-observation-id'},facebook:{ok:true}}})[0];
 expect(result.channels.every(c=>c.tone!=='success')).toBe(true);
});
it('keeps blocked binding visible alongside its existing receipt',()=>{
 const result=project({instagram_media_id:'123',facebook_post_id:'456',youtube_video_id:'youtube-id'},bindings.map(b=>b.platform==='instagram'?{...b,blocked_at:now}:b))[0];
 expect(result.tone).toBe('error');expect(result.channels[1]).toMatchObject({tone:'success',bindingWarning:'Kontokopplingen är spärrad'});
});
it('does not promise sending for missing, unverified or unknown bindings',()=>{
 expect(project({},[])[0].channels.every(c=>c.tone==='review')).toBe(true);
 expect(project({},null)[0].channels.every(c=>c.label==='Kontokoppling behöver kontrolleras')).toBe(true);
 expect(project({},bindings.map(b=>({...b,verification:'runtime_evidence'})))[0].tone).toBe('review');
});
it('uses separate freshness boundaries and refuses invalid or future timestamps',()=>{
 const edge=project({generated_at:'2026-10-24T10:00:00.000Z'})[0];expect(edge.channels[2].tone).toBe('waiting');
 const old=project({generated_at:'2026-10-24T09:59:59.999Z'})[0];expect(old.channels.map(c=>c.tone)).toEqual(['waiting','waiting','review']);
 expect(project({generated_at:'2026-10-22T10:00:00.000Z'})[0].channels[0].tone).toBe('waiting');
 expect(project({generated_at:'2026-10-22T09:59:59.999Z'})[0].channels.every(c=>c.tone==='review')).toBe(true);
 for(const generated_at of ['bad','2026-10-27T10:00:00.000Z'])expect(project({generated_at})[0].tone).toBe('review');
});
it('maps video and per-channel problems without exposing raw observations',()=>{
 expect(project({video_status:'failed'})[0].tone).toBe('error');expect(project({video_status:'archived'})[0].tone).toBe('review');
 const obs={instagram:{ok:false,permanent:true,error:'SECRET-fixture'},facebook:{ok:false,permanent:false,detail:'SECRET-fixture'}};
 const result=project({publish_channel_state:obs})[0];expect(result.channels[1].tone).toBe('error');expect(result.channels[0].tone).toBe('review');
 expect(JSON.stringify(result)).not.toContain('SECRET');
 expect(project({instagram_media_id:'123',publish_channel_state:obs})[0].channels[1].tone).toBe('success');
 expect(project({publish_channel_state:{instagram:{ok:true,needsVerification:true}}})[0].channels[1].tone).toBe('review');
});
it('omits unapproved statuses and bounds title using a safe fallback',()=>{
 for(const status of ['draft','rejected','pending_review','unknown'])expect(project({status})).toEqual([]);
 expect(project({hook:' '.repeat(4)})[0].title).toBe('Godkänd nyhetsfilm');expect(project({hook:'x'.repeat(10000)})[0].title.length).toBeLessThanOrEqual(150);
});
it('does not label missing Meta receipts in globally published rows as queued for Meta cron',()=>{
 const row=project({status:'published',youtube_video_id:'youtube-id'})[0];expect(row.channels[0].tone).toBe('review');expect(row.channels[1].tone).toBe('review');
 expect(project({publish_channel_state:{instagram:{ok:true,skipped:'not_configured'}}})[0].channels[1].tone).toBe('review');
});
