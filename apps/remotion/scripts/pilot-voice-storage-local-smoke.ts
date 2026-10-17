/**
 * REAL Supabase Storage readback against an isolated, disposable CLI instance.
 * No production credentials, network URL fetch, publishing or paid generation.
 * The exact pre-recorded Victoria MP3 is locally re-used for zero AI spend.
 *
 * PILOT_STORAGE_TEST_MODE=isolated-local
 * PILOT_STORAGE_URL=http://127.0.0.1:<isolated-port>
 * PILOT_STORAGE_SERVICE=<isolated local key>
 * PILOT_STORAGE_PACKAGE_JSON=<local existing workspace package.json>
 */
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
import {buildPilotVoiceReceipt} from '../../web/lib/media/pilot-voice-receipt'
import {verifyPilotStoredVoice} from '../../web/lib/media/pilot-voice-verify'

const url=process.env.PILOT_STORAGE_URL
if(process.env.PILOT_STORAGE_TEST_MODE!=='isolated-local'||
   !url||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)||
   !process.env.PILOT_STORAGE_SERVICE||!process.env.PILOT_STORAGE_PACKAGE_JSON)
  throw Error('Refusing nonisolated or incomplete test connection')
const require=createRequire(process.env.PILOT_STORAGE_PACKAGE_JSON)
const {createClient}=require('@supabase/supabase-js')
const db=createClient(url,process.env.PILOT_STORAGE_SERVICE,{
  auth:{persistSession:false,autoRefreshToken:false},
})
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const samples=resolve(root,'public','the-prompt-qa')
const manifest=JSON.parse(readFileSync(resolve(root,'src','compositions','data','codex-captions.json'),'utf8'))
assert.equal(manifest.voiceId,'qSeXEcewz7tA0Q0qk9fH')
const transcript=manifest.text
const words=manifest.words.map((w:{text:string;startMs:number;endMs:number})=>({
  word:w.text,startMs:w.startMs,endMs:w.endMs,
}))
const audio=readFileSync(resolve(samples,'codex.mp3'))
const durationMs=Math.round(manifest.durationSecs*1000)
const receipt=buildPilotVoiceReceipt(transcript,audio,words,durationMs)
const bucket='media-assets'
const projectId=randomUUID(),scriptId=randomUUID()
const audioPath=`audio/${projectId}/${scriptId}.mp3`
const timingPath=`data/${projectId}/${scriptId}-timing.json`
const timing=Buffer.from(JSON.stringify({words,durationMs}))
const store=db.storage.from(bucket)
let madeBucket=false,objects=[]
async function main(){
  try{
    const {error:bucketError}=await db.storage.createBucket(bucket,{
      public:false,fileSizeLimit:25*1024*1024,
    })
    assert.equal(bucketError,null, bucketError?.message)
    madeBucket=true
    for(const [path,bytes,mime]of [
      [audioPath,audio,'audio/mpeg'],
      [timingPath,timing,'application/json'],
    ] as const){
      const {error}=await store.upload(path,bytes,{contentType:mime,upsert:false})
      assert.equal(error,null,error?.message)
      objects.push(path)
    }
    const audioUrl=store.getPublicUrl(audioPath).data.publicUrl
    const timingUrl=store.getPublicUrl(timingPath).data.publicUrl
    const normal=await verifyPilotStoredVoice(db,projectId,scriptId,audioUrl,timingUrl,transcript,receipt)
    assert.deepEqual(normal,{verified:true,reason:null},'original real storage readback must pass')
    console.log('PASS real Storage Victoria MP3 and word timing readback, '+audio.byteLength+' bytes, '+words.length+' words')

    const wrong=await verifyPilotStoredVoice(db,projectId,scriptId,audioUrl,timingUrl,transcript+' altered',receipt)
    assert.deepEqual(wrong,{verified:false,reason:'invalid_receipt'})
    const foreign=await verifyPilotStoredVoice(db,randomUUID(),scriptId,audioUrl,timingUrl,transcript,receipt)
    assert.deepEqual(foreign,{verified:false,reason:'invalid_locator'})
    const swapped=Buffer.from(JSON.stringify({words:[...words].reverse(),durationMs}))
    const replace=await store.update(timingPath,swapped,{contentType:'application/json',upsert:true})
    assert.equal(replace.error,null,replace.error?.message)
    const altered=await verifyPilotStoredVoice(db,projectId,scriptId,audioUrl,timingUrl,transcript,receipt)
    assert.deepEqual(altered,{verified:false,reason:'timing_mismatch'})
    console.log('PASS modified timing/refused; foreign project and altered text refused')

    const newTiming=await store.update(timingPath,timing,{contentType:'application/json',upsert:true})
    assert.equal(newTiming.error,null,newTiming.error?.message)
    const restored=await verifyPilotStoredVoice(db,projectId,scriptId,audioUrl,timingUrl,transcript,receipt)
    assert.deepEqual(restored,{verified:true,reason:null})
    console.log('PASS immutable receipt verifies restored exact bytes')

    // A real object replacement in Storage must never inherit an old receipt.
    const changedAudio=Buffer.from(audio)
    changedAudio[120]^=1
    const changed=await store.update(audioPath,changedAudio,{
      contentType:'audio/mpeg',upsert:true,
    })
    assert.equal(changed.error,null,changed.error?.message)
    const badAudio=await verifyPilotStoredVoice(db,projectId,scriptId,audioUrl,timingUrl,transcript,receipt)
    assert.deepEqual(badAudio,{verified:false,reason:'audio_mismatch'})
    const restoreAudio=await store.update(audioPath,audio,{contentType:'audio/mpeg',upsert:true})
    assert.equal(restoreAudio.error,null,restoreAudio.error?.message)
    assert.deepEqual(await verifyPilotStoredVoice(db,projectId,scriptId,audioUrl,timingUrl,transcript,receipt),{
      verified:true,reason:null,
    })
    console.log('PASS real MP3 tampering denied and original restored')
  }finally{
    if(objects.length){const {error}=await store.remove(objects)
      if(error)throw Error('cleanup objects: '+error.message)}
    if(madeBucket){const {error}=await db.storage.deleteBucket(bucket)
      if(error)throw Error('cleanup bucket: '+error.message)}
    console.log('PASS disposable Storage objects and bucket deleted')
  }
}
main().catch(e=>{console.error('FAIL: '+String(e?.message??e).slice(0,420));process.exitCode=1})
