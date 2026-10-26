import {it,expect,vi,beforeEach} from 'vitest';
const store=vi.hoisted(()=>({inspect:vi.fn(),complete:vi.fn()}));
vi.mock('./store',async original=>({...await original<typeof import('./store')>(),reconciliationInspect:store.inspect,reconciliationComplete:store.complete}));
import {inspectReconciliation,completeReconciliation,candidateHash} from './service';
const id='10000000-0000-4000-8000-000000000001';
const scope={projectId:id,postId:id,publicationId:id},principal={userId:id,allowedProjectIds:[id]};
const candidate={id:'67890',providerId:'67890',accountId:'12345',createdAt:'2026-10-23T18:31:47Z',text:'Exakt granskad text',permalink:'https://www.instagram.com/p/Example/',photoId:'67890',imageUrl:'https://scontent.cdninstagram.com/a.jpg'};
let snapshot:any,proof:any,deps:any;
beforeEach(()=>{
 vi.clearAllMocks();snapshot={publication:{id,projectId:id,channel:'instagram',state:'uncertain',bindingId:'binding',accountId:'12345',requestedAt:candidate.createdAt,version:3},revision:{draft:{text:candidate.text}}};
 proof={...candidate,id,expiresAt:'2026-10-26T12:00:00Z',candidateHash:candidateHash(candidate)};
 store.inspect.mockImplementation(async()=>({snapshot,proofs:[proof]}));store.complete.mockResolvedValue({state:'published'});
 deps={resolveCredential:vi.fn(async()=>({channel:'instagram',bindingId:'binding',accountId:'12345'})),provider:{list:vi.fn(async()=>[candidate]),read:vi.fn(async()=>candidate)},now:()=>Date.parse('2026-10-26T10:00:00Z')};
});
it('uses the receipt channel and saves only the unique Instagram candidate',async()=>{
 const r=await inspectReconciliation({} as any,principal,scope,deps);
 expect(deps.resolveCredential).toHaveBeenCalledWith(id,'instagram');expect(r.candidates).toHaveLength(1);expect(store.inspect.mock.calls[1][2].candidates).toHaveLength(1);
});
it('zero or multiple matching candidates never become selectable proofs',async()=>{
 for(const items of [[],[candidate,{...candidate,id:'67891',providerId:'67891'}]]){
  store.inspect.mockClear();deps.provider.list.mockResolvedValue(items);
  expect((await inspectReconciliation({} as any,principal,scope,deps)).candidates).toEqual([]);expect(store.inspect).toHaveBeenCalledTimes(1);
 }
});
it('completion re-lists and re-reads before recording a receipt',async()=>{
 expect(await completeReconciliation({} as any,principal,{...scope,candidateId:id,expectedVersion:3,imageConfirmed:true},deps)).toMatchObject({state:'published'});
 expect(deps.provider.list).toHaveBeenCalledTimes(1);expect(deps.provider.read).toHaveBeenCalledWith(expect.anything(),'67890');expect(store.complete).toHaveBeenCalledTimes(1);
});
it('new ambiguity, disappearing media or edited content prevents completion',async()=>{
 for(const mode of ['ambiguous','gone','changed']){
  store.complete.mockClear();deps.provider.list.mockResolvedValue(mode==='ambiguous'?[candidate,{...candidate,providerId:'67891'}]:mode==='gone'?[]:[candidate]);deps.provider.read.mockResolvedValue(mode==='changed'?{...candidate,text:candidate.text+' '} :candidate);
  await expect(completeReconciliation({} as any,principal,{...scope,candidateId:id,expectedVersion:3,imageConfirmed:true},deps)).rejects.toMatchObject({code:'CONFLICT'});expect(store.complete).not.toHaveBeenCalled();
 }
});
it('requires image confirmation and matching active account before provider reads',async()=>{
 await expect(completeReconciliation({} as any,principal,{...scope,candidateId:id,expectedVersion:3,imageConfirmed:false} as any,deps)).rejects.toMatchObject({code:'INVALID_BODY'});
 deps.resolveCredential.mockResolvedValue({channel:'instagram',bindingId:'other',accountId:'12345'});
 await expect(inspectReconciliation({} as any,principal,scope,deps)).rejects.toMatchObject({code:'REVIEW_REQUIRED'});expect(deps.provider.list).not.toHaveBeenCalled();
});
