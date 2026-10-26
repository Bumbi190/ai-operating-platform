import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CalendarMediaQueue} from '../../components/calendar/CalendarMediaQueue';
import {projectPromptQueue} from './media-queue-projection';
import type {CalendarMediaQueue as Queue} from './media-queue-types';
Object.assign(globalThis,{React});
const queue:Queue={projectId:'prompt',available:true,truncated:false,readAt:'2026-10-26T10:00:00Z',items:projectPromptQueue([{id:'s',project_id:'prompt',hook:'<script>unsafe title</script>',status:'published',video_status:'ready',generated_at:'2026-10-26T08:00:00Z',facebook_post_id:'123',instagram_media_id:'456',youtube_video_id:null,publish_channel_state:{}}],['facebook','instagram','youtube'].map(platform=>({platform:platform as 'facebook'|'instagram'|'youtube',verification:'provider_attested',blocked_at:null})),'2026-10-26T10:00:00Z')};
const render=(q:Queue|undefined=queue,filter='all',loading=false)=>renderToStaticMarkup(<CalendarMediaQueue queue={q} projectFilter={filter} loading={loading}/>);
it('shows current undated queue with independent channel receipts and source link',()=>{
 const html=render();for(const text of ['The Prompt · aktuell publiceringskö','Ingen fast publiceringstid','Facebook','Instagram','YouTube','Publicerat · sparat kvitto','Godkänd · väntar på publicering','/projects/ai-media-automation/scripts'])expect(html).toContain(text);
 expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).not.toMatch(/<button|datetime=|time datetime|Publicera nu/);
});
it('hides other project/private and non-applicable source',()=>{
 for(const filter of ['private','family'])expect(render(queue,filter)).toBe('');
 expect(render({...queue,projectId:null,items:[]})).toBe('');
});
it('distinguishes healthy empty, failure and truncation',()=>{
 expect(render({...queue,items:[]})).toContain('Inga godkända filmer väntar');
 expect(render({...queue,items:[],available:false})).toContain('Kön kunde inte läsas fullständigt');
 expect(render({...queue,truncated:true})).toContain('Alla poster ryms inte');
 expect(render({...queue,available:false,projectId:null,items:[]})).toContain('Kön kunde inte läsas');
});
it('masks prior queue while refreshing instead of presenting stale receipts as current',()=>{
 const html=render(queue,'all',true);expect(html).toContain('Läser aktuell publiceringskö');expect(html).not.toContain('unsafe title');
});
