import {expect,it} from 'vitest';
import {resolveOwnedPreviewMedia,resolveLegacyScriptVideo} from './owned-media';
import type {AdminDb} from '../calendar/types';
const project='10000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001',actor={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[project]},ref={assetId:id,sha256:'a'.repeat(64),name:'Bild',mimeType:'image/jpeg'};
const asset={id,project_id:project,status:'active',kind:'image',mime_type:'image/jpeg',checksum_sha256:ref.sha256,byte_size:123,storage_bucket:'media-assets-private',storage_path:project+'/image.jpg'};
const db=(patch:Record<string,unknown>={})=>({from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{...asset,...patch},error:null})})})})})}) as unknown as AdminDb;
it('returns only an owned hash-bound same-origin media endpoint',async()=>{
 const result=await resolveOwnedPreviewMedia(db(),actor,project,ref);expect(result).toMatchObject({id,kind:'image'});expect(result?.src).toBe('/api/social-content/media?projectId='+project+'&assetId='+id+'&sha256='+ref.sha256);
 for(const patch of [{project_id:'other'},{checksum_sha256:'b'.repeat(64)},{status:'archived'},{mime_type:'text/html'},{storage_bucket:'arbitrary'}])expect(await resolveOwnedPreviewMedia(db(patch),actor,project,ref)).toBe(null);
 expect(await resolveOwnedPreviewMedia(db(),{...actor,allowedProjectIds:[]},project,ref)).toBe(null);
});
it('allows legacy producer video only at exact script/render/bucket path and configured S3 region',()=>{
 const input={scriptId:id,videoUrl:'https://s3.eu-north-1.amazonaws.com/remotionlambda-testbucket/renders/render123/'+id+'.mp4',renderId:'render123',bucket:'remotionlambda-testbucket',region:'eu-north-1'};
 expect(resolveLegacyScriptVideo(input)?.src).toBe(input.videoUrl);
 for(const videoUrl of [input.videoUrl+'?token=bad',input.videoUrl.replace('render123','other123'),input.videoUrl.replace(id,'other'),input.videoUrl.replace('s3.eu-north-1.amazonaws.com','evil.example'),input.videoUrl.replace('https:','http:')])expect(resolveLegacyScriptVideo({...input,videoUrl})).toBe(null);
});
