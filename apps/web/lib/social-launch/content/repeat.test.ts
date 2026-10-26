import {it,expect,vi} from 'vitest';
import {withRepeatReview} from './repeat';
const view=()=>({project:{id:'p',slug:'familje-stunden'},posts:[{id:'a',revision:{id:'r'},status:'approved',requirements:['activation_required']}]}) as any;
const principal={userId:'owner',allowedProjectIds:['p']};
it('adds a review blocker and exact conflict reference without granting authority',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:[{postId:'a',revisionId:'r',conflictPostId:'old',publicationId:'pub',at:'2026-10-01T20:00:00Z',reason:'duplicate_content'}],error:null});
 const result=await withRepeatReview({rpc} as any,principal,view());
 expect(rpc).toHaveBeenCalledWith('social_content_repeat_check',{p_principal:principal,p_input:{projectId:'p'}});
 expect(result.posts[0]).toMatchObject({status:'needs_review',requirements:['activation_required','duplicate_content'],repeatConflict:{postId:'old',reason:'duplicate_content'}});
});
it('does not apply the family policy to other projects',async()=>{
 const rpc=vi.fn(),v=view();v.project.slug='another';expect(await withRepeatReview({rpc} as any,principal,v)).toBe(v);expect(rpc).not.toHaveBeenCalled();
});
it('fails closed on unavailable, malformed or revision-drifted checks',async()=>{
 for(const response of [{data:null,error:{}},{data:{},error:null},{data:[{postId:'a',revisionId:'old',reason:'duplicate_content'}],error:null}]){
  const r=await withRepeatReview({rpc:async()=>response} as any,principal,view());
  expect(r.posts[0].requirements).toContain('repeat_history_unavailable');expect(r.posts[0].status).toBe('needs_review');
 }
});
it('leaves clean history and existing review reasons intact',async()=>{
 const v=view(),r=await withRepeatReview({rpc:async()=>({data:[],error:null})} as any,principal,v);expect(r).toEqual(v);
});
