import {beforeEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {publishReviewedLinkedInImage,type LinkedInImageIntent} from './linkedin-adapter'
const bytes=new Uint8Array([137,80,78,71,13,10,26,10])
const intent:LinkedInImageIntent={projectId:'p',postId:'post',revisionId:'revision',contentSha256:'a'.repeat(64),bindingId:'binding',organizationUrn:'urn:li:organization:123',text:'Approved dealer text',title:'Title',imageSha256:createHash('sha256').update(bytes).digest('hex')}
const image={bytes,mimeType:'image/png' as const,width:512,height:512}
function authority(){return {assertCurrent:vi.fn().mockResolvedValue({...intent,deliveryAuthorized:true,accessToken:'test-token',apiVersion:'202610'}),beginCreate:vi.fn().mockResolvedValue(true),recordImage:vi.fn().mockResolvedValue(undefined)}}
function provider(last:Response|Error=new Response(null,{status:201,headers:{'x-restli-id':'urn:li:share:12345'}})){
 return vi.fn().mockResolvedValueOnce(Response.json({value:{image:'urn:li:image:Image123',uploadUrl:'https://www.linkedin.com/dms-uploads/Image123/uploaded-image/0?signature=test',uploadUrlExpiresAt:Date.now()+60000}})).mockResolvedValueOnce(new Response(null,{status:201})).mockResolvedValueOnce(Response.json({id:'urn:li:image:Image123',owner:intent.organizationUrn,status:'AVAILABLE'})).mockImplementationOnce(()=>last instanceof Error?Promise.reject(last):Promise.resolve(last))
}
beforeEach(()=>{vi.stubEnv('SOCIAL_LINKEDIN_PUBLISHER','1')})
it('is default-disabled before token retrieval or any provider request',async()=>{vi.stubEnv('SOCIAL_LINKEDIN_PUBLISHER','');const a=authority(),fetcher=provider();expect(await publishReviewedLinkedInImage(intent,image,a,{fetcher})).toMatchObject({status:'blocked',reason:'disabled'});expect(a.assertCurrent).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()})
it('uploads exact image and creates one company post only after fresh authority and durable create latch',async()=>{
 const a=authority(),fetcher=provider(),result=await publishReviewedLinkedInImage(intent,image,a,{fetcher})
 expect(result).toMatchObject({status:'published',postUrn:'urn:li:share:12345'})
 expect(fetcher).toHaveBeenCalledTimes(4)
 const calls=fetcher.mock.calls as unknown as [string,RequestInit][]
 expect(calls[0][0]).toBe('https://api.linkedin.com/rest/images?action=initializeUpload')
 expect(JSON.parse(calls[0][1].body as string)).toEqual({initializeUploadRequest:{owner:intent.organizationUrn}})
 expect(calls[1][1]).toMatchObject({method:'PUT',redirect:'error'})
 expect(calls[3][0]).toBe('https://api.linkedin.com/rest/posts')
 expect(JSON.parse(calls[3][1].body as string)).toMatchObject({author:intent.organizationUrn,commentary:intent.text,content:{media:{id:'urn:li:image:Image123'}},lifecycleState:'PUBLISHED'})
 expect(new Headers(calls[3][1].headers).get('Linkedin-Version')).toBe('202610')
 expect(a.beginCreate).toHaveBeenCalledTimes(1);expect(a.recordImage).toHaveBeenCalledWith('urn:li:image:Image123')
})
it('stale exact revision or different bytes cannot upload',async()=>{const a=authority(),fetcher=provider();a.assertCurrent.mockResolvedValue({...intent,revisionId:'stale',deliveryAuthorized:true,accessToken:'test-token',apiVersion:'202610'});expect(await publishReviewedLinkedInImage(intent,image,a,{fetcher})).toMatchObject({status:'blocked'});expect(fetcher).not.toHaveBeenCalled();expect(await publishReviewedLinkedInImage(intent,{...image,bytes:new Uint8Array([0])},authority(),{fetcher})).toMatchObject({status:'blocked'});expect(fetcher).not.toHaveBeenCalled()})
it('never forwards credential to an unexpected upload origin',async()=>{const a=authority(),fetcher=vi.fn().mockResolvedValue(Response.json({value:{image:'urn:li:image:Image123',uploadUrl:'https://evil.example/upload',uploadUrlExpiresAt:Date.now()+60000}}));expect(await publishReviewedLinkedInImage(intent,image,a,{fetcher})).toMatchObject({status:'blocked'});expect(fetcher).toHaveBeenCalledTimes(1)})
it.each([new Error('network timeout'),new Response(null,{status:201}),new Response(null,{status:503})])('an ambiguous create outcome is never retried',async last=>{const fetcher=provider(last),result=await publishReviewedLinkedInImage(intent,image,authority(),{fetcher});expect(result).toMatchObject({status:'uncertain',imageUrn:'urn:li:image:Image123'});expect(fetcher).toHaveBeenCalledTimes(4)})
it('consumed durable create latch refuses a repeat post',async()=>{const a=authority();a.beginCreate.mockResolvedValue(false);const fetcher=provider();expect(await publishReviewedLinkedInImage(intent,image,a,{fetcher})).toMatchObject({status:'blocked',reason:'create_already_started'});expect(fetcher).toHaveBeenCalledTimes(3)})
it('revoked authority between upload and create never creates a post',async()=>{const a=authority();a.assertCurrent.mockResolvedValueOnce({...intent,deliveryAuthorized:true,accessToken:'test-token',apiVersion:'202610'}).mockRejectedValue(new Error('revoked'));const fetcher=provider();expect(await publishReviewedLinkedInImage(intent,image,a,{fetcher})).toMatchObject({status:'blocked'});expect(fetcher.mock.calls.some(call=>call[0]==='https://api.linkedin.com/rest/posts')).toBe(false)})
