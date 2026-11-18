import 'server-only';
import type {AdminDb, CalendarActor, CalendarEntry, CalendarRange} from './types';
import {projectBufferCalendar, type BufferRecord} from './buffer-projection';
import {resolveCalendarLocal} from './time';

const MAX_BUFFER_ROWS = 500;
type BufferMirrorRow = {
  owner_id:string; project_id:string; channel_id:string; provider_post_id:string;
  content_text:string; provider_status:string; scheduled_at:string|null;
  sent_at:string|null; permalink:string|null; synced_at:string;
};
function safeUrl(value:string|null):string|null {
  try {const u=new URL(value??'');return u.protocol==='https:' ? u.href : null;} catch {return null;}
}

/**
 * Only reads a server-owned status mirror, NOT Buffer OAuth or a publishing API.
 * The calendar user must own the project; RLS is defense-in-depth and this read
 * additionally scopes by both owner ID and allowlisted project IDs.
 */
export async function readCalendarBuffer(db:AdminDb,actor:CalendarActor,range:CalendarRange):
  Promise<{entries:CalendarEntry[];truncated:boolean;available:boolean}> {
  if(actor.projectScopeAvailable===false) throw Error('Buffer calendar project scope unavailable');
  if(!actor.allowedProjectIds.length) return {entries:[],truncated:false,available:true};
  // Typed Supabase definitions predate this migration; the service role reader is server-only.
  const result=await (db as any).from('calendar_buffer_posts')
    .select('owner_id,project_id,channel_id,provider_post_id,content_text,provider_status,scheduled_at,sent_at,permalink,synced_at')
    .eq('owner_id',actor.userId).in('project_id',actor.allowedProjectIds.slice(0,500))
    .order('synced_at',{ascending:false}).limit(MAX_BUFFER_ROWS);
  if(result.error || !Array.isArray(result.data)) throw Error('Buffer mirror unavailable');
  const rows=result.data as BufferMirrorRow[];
  const entries:CalendarEntry[]=[];
  const startUtc=resolveCalendarLocal(range.fromDate+'T00:00');
  const endUtc=resolveCalendarLocal(range.toDateExclusive+'T00:00');
  const allowed=new Set(actor.allowedProjectIds);
  const groups=new Map<string,BufferMirrorRow[]>();
  for(const row of rows) {
    if(row.owner_id!==actor.userId||!allowed.has(row.project_id)||typeof row.channel_id!=='string')continue;
    const key=row.project_id+'|'+row.channel_id;
    groups.set(key,[...(groups.get(key)??[]),row]);
  }
  for(const [,group] of groups) {
    const projectId=group[0].project_id;
    const channelId=group[0].channel_id;
    const projected=projectBufferCalendar(group.map((row):BufferRecord=>({
      id:row.provider_post_id,channelId:row.channel_id,status:row.provider_status,
      text:row.content_text,dueAt:row.scheduled_at,sentAt:row.sent_at,permalink:row.permalink,
    })),channelId,startUtc,endUtc);
    for(const post of projected) {
      const row=group.find(r=>r.provider_post_id===post.id.split(':').at(-1));
      if(!row) continue;
      const status=post.status==='published'?'buffer_published':post.status==='failed'?'failed':'scheduled';
      entries.push({
        id:'buffer:'+projectId+':'+channelId+':'+row.provider_post_id,
        source:{kind:'buffer',projectId,postId:row.provider_post_id},
        title:post.title,time:{kind:'timed',startUtc:post.atUtc,endUtc:null,timeZone:'Europe/Stockholm'},
        projectId,status,editable:false,href:post.permalink,
        pendingChange:null,
        bufferDetail:{fullText:post.fullText,channel:'linkedin',providerId:row.provider_post_id,
          syncedAt:row.synced_at,sentAt:post.sentAt,permalink:safeUrl(post.permalink)},
      });
    }
  }
  entries.sort((a,b)=>a.time.kind==='timed'&&b.time.kind==='timed'?
    a.time.startUtc.localeCompare(b.time.startUtc)||a.id.localeCompare(b.id):a.id.localeCompare(b.id));
  return {entries,truncated:rows.length===MAX_BUFFER_ROWS||actor.allowedProjectIds.length>500,available:true};
}
