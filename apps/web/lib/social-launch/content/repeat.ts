import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import type {SocialContentPrincipal,SocialContentView,SocialRepeatConflict} from './types';
type Db=ReturnType<typeof createAdminClient>;
const reasons=['duplicate_content','similar_recent_content','repeat_history_unavailable','short_content_review'];
export async function withRepeatReview(db:Db,p:SocialContentPrincipal,view:SocialContentView):Promise<SocialContentView>{
 if(view.project.slug!=='familje-stunden'||!view.posts.length)return view;
 const unavailable=():SocialContentView=>({...view,posts:view.posts.map(post=>({...post,status:'needs_review',requirements:[...new Set([...post.requirements,'repeat_history_unavailable'])]}))});
 try{
  const {data,error}=await (db as any).rpc('social_content_repeat_check',{p_principal:p,p_input:{projectId:view.project.id}});
  if(error||!Array.isArray(data)||data.length>view.posts.length)return unavailable();
  const conflicts=new Map<string,SocialRepeatConflict>();
  for(const row of data){
   const post=view.posts.find(x=>x.id===row?.postId);
   if(!post||post.revision.id!==row.revisionId||conflicts.has(post.id)||!reasons.includes(row.reason))return unavailable();
   if(['duplicate_content','similar_recent_content'].includes(row.reason)&&(typeof row.conflictPostId!=='string'||typeof row.at!=='string'||!Number.isFinite(Date.parse(row.at))))return unavailable();
   conflicts.set(post.id,{postId:row.conflictPostId??null,publicationId:row.publicationId??null,at:row.at??null,reason:row.reason});
  }
  return {...view,posts:view.posts.map(post=>{
   const repeatConflict=conflicts.get(post.id);return repeatConflict?{...post,status:'needs_review' as const,requirements:[...new Set([...post.requirements,repeatConflict.reason])],repeatConflict}:post;
  })};
 }catch{return unavailable();}
}
