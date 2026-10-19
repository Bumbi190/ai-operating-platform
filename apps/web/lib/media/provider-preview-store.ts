import {PREVIEW_ID,PREVIEW_PROJECT_ID,PREVIEW_KIND,PREVIEW_INPUT_HASH,type PreviewAttempt} from './provider-preview'
import {ILLUSTRATED_NEWS_PROFILE} from './illustrated-news-profile'
import {toJson} from '../supabase/json'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {Database} from '../supabase/types'
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
function decode(row:{project_id:string|null;raw_output:unknown}):PreviewAttempt{
 const raw=row.raw_output as Record<string,unknown>|null
 const s=raw?.private_provider_preview as PreviewAttempt|undefined
 if(row.project_id!==PREVIEW_PROJECT_ID||raw?.pilot_image_profile!==ILLUSTRATED_NEWS_PROFILE||
    !s||s.kind!==PREVIEW_KIND||s.inputHash!==PREVIEW_INPUT_HASH||
    !['claimed','ready','review_required'].includes(s.state)||!Array.isArray(s.imageIds)||
    s.imageIds.length>3||!s.imageIds.every(x=>typeof x==='string'&&UUID.test(x))||
    new Set(s.imageIds).size!==s.imageIds.length||
    (s.audioId!==undefined&&!UUID.test(s.audioId))||
    (s.state==='ready'&&(s.imageIds.length!==3||!s.audioId||!s.voiceReceipt||!s.words||!s.durationMs)))
  throw Error('PREVIEW_RECORD_NOT_VERIFIED')
 return s
}
export function createProviderPreviewStore(db:SupabaseClient<Database>){
 const raw=(s:PreviewAttempt)=>toJson({pilot_image_profile:ILLUSTRATED_NEWS_PROFILE,private_provider_preview:s})
 return{
  async read():Promise<PreviewAttempt|null>{
   const {data,error}=await db.from('media_scripts').select('project_id,raw_output')
    .eq('id',PREVIEW_ID).eq('project_id',PREVIEW_PROJECT_ID).maybeSingle()
   if(error)throw Error('PREVIEW_READ_FAILED')
   return data?decode(data):null
  },
  async claim(s:PreviewAttempt):Promise<boolean>{
   const {data,error}=await db.from('media_scripts').insert({
    id:PREVIEW_ID,project_id:PREVIEW_PROJECT_ID,hook:'Private provider QA',
    script:'Private provider QA; not scheduled content.',status:'pending_review',
    voice_status:'none',video_status:'private_preview',images:[],raw_output:raw(s),
   }).select('id').maybeSingle()
   if(error?.code==='23505')return false
   if(error||!data)throw Error('PREVIEW_CLAIM_FAILED')
   return true
  },
  async save(s:PreviewAttempt):Promise<void>{
   const {data,error}=await db.from('media_scripts').update({raw_output:raw(s)})
    .eq('id',PREVIEW_ID).eq('project_id',PREVIEW_PROJECT_ID)
    .eq('raw_output->private_provider_preview->>inputHash',PREVIEW_INPUT_HASH)
    .select('id').maybeSingle()
   if(error||!data)throw Error('PREVIEW_SAVE_FAILED')
  },
 }
}
