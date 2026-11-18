import 'server-only';
import type {AdminDb, CalendarActor, CalendarEntry, CalendarRange} from './types';
import {projectBufferCalendar, type BufferRecord} from './buffer-projection';
import {resolveCalendarLocal} from './time';

const ORG_ID='6afccee04775b0917da20baf';
const CHANNEL_ID='6afccf7eece6dfde5fff4341';
const PROJECT_ID='8f673c09-1c8f-4d78-876e-4c14bf1c89b3';
const MAX_PAGES=5;
const QUERY=`query BufferCalendarPosts($after: String) {
  posts(first: 100, after: $after, input: {
    organizationId: "${ORG_ID}",
    filter: { channelIds: ["${CHANNEL_ID}"], status: [scheduled, sent, error] }
  }) {
    edges { node { id text status dueAt sentAt channelId externalLink } }
    pageInfo { hasNextPage endCursor }
  }
}`;
type ApiNode={id:string;text:string;status:string;dueAt:string|null;sentAt:string|null;channelId:string;externalLink:string|null};
type PostsResponse={data?:{posts?:{edges?:Array<{node:ApiNode}>;pageInfo?:{hasNextPage:boolean;endCursor:string|null}}};errors?:Array<{message:string}>};

function key():string {
  const value=process.env.BUFFER_API_KEY;
  if(!value||value.trim().length<16)throw Error('Buffer calendar not configured');
  return value;
}
async function fetchBufferPage(apiKey:string,cursor:string|null):Promise<PostsResponse> {
  const response=await fetch('https://api.buffer.com',{
    method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({query:QUERY,variables:{after:cursor}}),
    cache:'no-store',signal:AbortSignal.timeout(9000),
  });
  if(!response.ok)throw Error('Buffer calendar provider unavailable');
  const json=await response.json() as PostsResponse;
  if(json.errors?.length||!json.data?.posts||!Array.isArray(json.data.posts.edges)||!json.data.posts.pageInfo)
    throw Error('Buffer calendar response incomplete');
  return json;
}

/** Read-only, authenticated, project-scoped; no Buffer post mutation or stored credentials. */
export async function readCalendarBuffer(_db:AdminDb,actor:CalendarActor,range:CalendarRange):
  Promise<{entries:CalendarEntry[];truncated:boolean;available:boolean}> {
  if(actor.projectScopeAvailable===false)throw Error('Calendar project scope unavailable');
  if(!actor.allowedProjectIds.includes(PROJECT_ID))return {entries:[],truncated:false,available:true};
  const apiKey=key();
  const records:BufferRecord[]=[];
  let cursor:string|null=null,hasNextPage=false;
  const cursors=new Set<string>();
  for(let page=0;page<MAX_PAGES;page++){
    const result=await fetchBufferPage(apiKey,cursor);
    const listing=result.data!.posts!;
    for(const {node} of listing.edges!){
      if(!node||node.channelId!==CHANNEL_ID||typeof node.id!=='string')continue;
      records.push({id:node.id,channelId:node.channelId,text:node.text??'',
        status:node.status==='error'?'failed':node.status,
        dueAt:node.dueAt,sentAt:node.sentAt,permalink:node.externalLink});
    }
    hasNextPage=listing.pageInfo!.hasNextPage;
    if(!hasNextPage)break;
    const next=listing.pageInfo!.endCursor;
    if(!next||cursors.has(next))throw Error('Buffer calendar cursor invalid');
    cursors.add(next);cursor=next;
  }
  const fromUtc=resolveCalendarLocal(range.fromDate+'T00:00');
  const toUtc=resolveCalendarLocal(range.toDateExclusive+'T00:00');
  const projected=projectBufferCalendar(records,CHANNEL_ID,fromUtc,toUtc);
  const syncedAt=new Date().toISOString();
  return {entries:projected.map(post=>{
    const providerId=post.id.slice(('buffer:'+CHANNEL_ID+':').length);
    const status=post.status==='published'?'buffer_published':post.status==='failed'?'failed':'scheduled';
    return {
      id:'buffer:'+PROJECT_ID+':'+CHANNEL_ID+':'+providerId,
      source:{kind:'buffer' as const,projectId:PROJECT_ID,postId:providerId},
      title:post.title,
      time:{kind:'timed' as const,startUtc:post.atUtc,endUtc:null,timeZone:'Europe/Stockholm' as const},
      projectId:PROJECT_ID,status,editable:false,href:post.permalink,pendingChange:null,
      bufferDetail:{fullText:post.fullText,channel:'linkedin' as const,providerId,
        syncedAt,sentAt:post.sentAt,permalink:post.permalink},
    };
  }),truncated:hasNextPage,available:true};
}
