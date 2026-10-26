import {expect,it} from 'vitest';
import {projectPromptCalendar} from './media-events';
import {calendarProgress} from './progress';
import {weekRange} from './time';
const project='10000000-0000-4000-8000-000000000001',now='2026-10-26T12:00:00.000Z';
const bindings=['facebook','instagram','youtube'].map(platform=>({platform:platform as 'facebook'|'instagram'|'youtube',verification:'provider_attested',blocked_at:null}));
const script=(patch:Record<string,unknown>={})=>({id:'s',project_id:project,hook:'Dagens nyhet',status:'approved',video_status:'ready',generated_at:'2026-10-26T08:00:00Z',reviewed_at:'2026-10-26T10:00:00Z',published_at:null,instagram_media_id:null,facebook_post_id:null,youtube_video_id:null,publish_channel_state:{},...patch});
const run=(patch:Record<string,unknown>={},date='2026-10-26')=>projectPromptCalendar(project,[script(patch)],bindings,weekRange(date),now);
it('places approved content without invented clock time and identifies its date source',()=>{
 expect(run().entries[0]).toMatchObject({id:'media:'+project+':s',dateBasis:'approval',displayLabel:'Utan klockslag',time:{kind:'all_day',startDate:'2026-10-26',endDateExclusive:'2026-10-27'},editable:false});
 expect(run({reviewed_at:null}).entries[0].dateBasis).toBe('creation');
});
it('retains fully published history and unresolved channels at first-publication time',()=>{
 const partial=run({status:'published',published_at:'2026-10-26T11:00:00Z',instagram_media_id:'1',facebook_post_id:'2'}).entries[0];
 expect(partial).toMatchObject({dateBasis:'first_publication',time:{kind:'timed',startUtc:'2026-10-26T11:00:00.000Z'}});expect(calendarProgress(partial).tone).toBe('waiting');
 const complete=run({status:'published',published_at:'2026-10-26T11:00:00Z',instagram_media_id:'1',facebook_post_id:'2',youtube_video_id:'3'}).entries[0];expect(calendarProgress(complete).tone).toBe('success');
 expect(calendarProgress(run({published_at:'2026-10-26T11:00:00Z'}).entries[0]).tone).toBe('review');
});
it('puts historical failures on their source day and filters exact Stockholm boundaries',()=>{
 expect(run({video_status:'failed',reviewed_at:'2026-10-20T10:00:00Z'}).entries).toEqual([]);
 const row=run({reviewed_at:'2026-10-25T23:00:00Z'}).entries[0];expect(row.time).toMatchObject({startDate:'2026-10-26'});
 expect(run({reviewed_at:'2026-11-01T23:00:00Z'}).entries).toEqual([]);
 expect(run({reviewed_at:'2026-10-24T22:30:00Z'},'2026-10-19').entries[0].time).toMatchObject({startDate:'2026-10-25'});
});
it('does not create a date for missing or invalid source timestamps, duplicate identities, or foreign rows',()=>{
 expect(run({reviewed_at:null,generated_at:null}).undated).toHaveLength(1);expect(run({reviewed_at:'bad'}).undated).toHaveLength(1);
 const result=projectPromptCalendar(project,[script(),script(),script({id:'foreign',project_id:'other'}),script({id:'draft',status:'pending_review'})],bindings,weekRange('2026-10-26'),now);expect(result.entries).toHaveLength(1);
 expect(JSON.stringify(result)).not.toMatch(/video_url|script_text|publish_channel_state|media_id/);
});
