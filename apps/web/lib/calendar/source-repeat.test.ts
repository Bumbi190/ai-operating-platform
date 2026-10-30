import {it,expect} from 'vitest';
import {projectCalendarSocial} from './source-social';
it('shows repeat-held queued posts as needing review without rewriting a published result',()=>{
 const post:any={id:'p',status:'needs_review',revision:{id:'r',draft:{title:'Kampanj',scheduledAt:'2026-11-01T19:30:00Z'}},requirements:[],repeatConflict:{reason:'similar_recent_content'}};
 const batch:any={manifest:{items:[{postId:'p',revisionId:'r',sha256:'h'}]},jobs:[{id:'j',postId:'p',channel:'facebook',state:'queued',scheduledAt:'2026-11-01T19:30:00Z'}]};
 const range={fromDate:'2026-10-26',toDateExclusive:'2026-11-02',timeZone:'Europe/Stockholm'} as any;
 expect(projectCalendarSocial('project',[post],[batch],false,'/social',range)[0].status).toBe('needs_review');
 batch.jobs[0].state='published';expect(projectCalendarSocial('project',[post],[batch],false,'/social',range)[0].status).toBe('published');
 delete post.repeatConflict;post.requirements=['repeat_history_unavailable'];batch.jobs[0].state='queued';
 expect(projectCalendarSocial('project',[post],[batch],false,'/social',range)[0].status).toBe('needs_review');
 expect(projectCalendarSocial('project',[post],[],false,'/social',range)[0].status).toBe('needs_review');
});
