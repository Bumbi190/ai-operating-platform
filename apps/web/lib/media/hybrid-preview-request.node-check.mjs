import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {
 parseHybridPreviewSelection,validatePreviewScriptId,isTrustedPreviewSourceUrl,HybridPreviewRefusal
} from './hybrid-preview-request.ts'

const IDs=[
'30e4b399-d3f4-4aec-9dc9-4f468c413b69',
'd806c254-0b22-46be-abb9-a52310eb6af7',
'dda65355-c200-4a41-a1ff-12f7da10e637',
'069bac8a-9c88-4f41-b872-7fdcde33a992'
]
const query=entries=>new URLSearchParams(entries)
function refused(fn,reason){
 assert.throws(fn,e=>e instanceof HybridPreviewRefusal&&e.code===reason)
}

describe('Owner-only hybrid reel preview request grammar',()=>{
 const supabase='https://iboepohjwrhtgshrqaol.supabase.co'
 const media=supabase+'/storage/v1/object/public/media-assets/audio/voice.mp3'
 it('accepts only a canonical public-media object on the configured Supabase origin',()=>{
   assert.equal(isTrustedPreviewSourceUrl(media,supabase),true)
   assert.equal(isTrustedPreviewSourceUrl(media+'?token=secret',supabase),false)
   assert.equal(isTrustedPreviewSourceUrl(media+'#fragment',supabase),false)
 })
 it('refuses impersonating origins, credentials and nonpublic media paths',()=>{
   for(const s of [
     'https://iboepohjwrhtgshrqaol.supabase.co.evil.test/storage/v1/object/public/media-assets/voice.mp3',
     'https://user:password@iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/voice.mp3',
     'http://iboepohjwrhtgshrqaol.supabase.co/storage/v1/object/public/media-assets/voice.mp3',
     supabase+'/storage/v1/object/sign/media-assets-private/clip.mp4',
     'file:///private/clip.mp4',
   ])assert.equal(isTrustedPreviewSourceUrl(s,supabase),false)
 })
 it('refuses an unset, invalid, or non-https Supabase server origin',()=>{
   for(const origin of ['',null,undefined,'http://iboepohjwrhtgshrqaol.supabase.co','invalid'])
     assert.equal(isTrustedPreviewSourceUrl(media,origin),false)
 })
 it('accepts canonical script UUID',()=>{
   assert.equal(validatePreviewScriptId('b0495f6b-9973-40dc-ae9b-156cc110ab51'),
     'b0495f6b-9973-40dc-ae9b-156cc110ab51')
 })
 it('rejects malformed script identities',()=>{
   for(const s of ['',null,undefined,'invalid','../../private','123']){
    refused(()=>validatePreviewScriptId(s),'invalid_script')
   }
 })
 it('accepts three unique canonical asset IDs aligned to the three saved images',()=>{
   const ids=parseHybridPreviewSelection(query([
    ['video_asset_id',IDs[0]],['video_asset_id',IDs[1]],['video_asset_id',IDs[2]]
   ]),3)
   assert.deepEqual(ids,IDs.slice(0,3))
 })
 it('supports intentionally retaining individual still-image scenes',()=>{
   const out=parseHybridPreviewSelection(query([
    ['video_asset_id',IDs[0]],['video_asset_id','-'],['video_asset_id',IDs[2]]
   ]),3)
   assert.deepEqual(out,[IDs[0],null,IDs[2]])
 })
 it('refuses four videos for a three-image script',()=>{
   refused(()=>parseHybridPreviewSelection(query(IDs.map(id=>['video_asset_id',id])),3),'invalid_selection')
 })
 it('refuses duplicate and non-UUID clip identities',()=>{
   for(const invalid of [[IDs[0],IDs[0],IDs[2]],[IDs[0],'-','abc']]){
    refused(()=>parseHybridPreviewSelection(query(invalid.map(v=>['video_asset_id',v])),3),'invalid_selection')
   }
 })
 it('refuses extra, undocumented or query-injected keys',()=>{
   refused(()=>parseHybridPreviewSelection(query([
    ['video_asset_id',IDs[0]],['video_asset_id',IDs[1]],['video_asset_id',IDs[2]],
    ['publish','true']
   ]),3),'invalid_selection')
 })
 it('refuses unsupported scene counts, including zero',()=>{
   for(const n of [0,-1,1.5,6,100,NaN,Infinity]){
    refused(()=>parseHybridPreviewSelection(query([]),n),'invalid_scenes')
   }
 })
 it('refuses omitted selectors: preview must be explicitly intentional',()=>{
   refused(()=>parseHybridPreviewSelection(new URLSearchParams(),3),'invalid_selection')
 })
})
