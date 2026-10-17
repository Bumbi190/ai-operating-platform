import {createHash} from 'node:crypto'
import {BRAND_MODEL,VICTORIA_VOICE_ID} from '../voice/config'

/** Server-side provenance receipt for audio that was generated and returned.
 * Does not independently prove that a later Storage URL still holds these bytes.
 * Not a public clip, posting approval, or license receipt. */
export interface PilotVoiceReceipt {
  kind:'the-prompt-voice-v1'
  voiceId:string
  modelId:string
  transcriptSha256:string
  audioSha256:string
  timingsSha256:string
  audioByteSize:number
  durationMs:number
  wordCount:number
}
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex')
export function buildPilotVoiceReceipt(
  transcript:string,audio:Uint8Array,words:readonly {word:string;startMs:number;endMs:number}[],
  durationMs:number,
):PilotVoiceReceipt{
  if(!transcript.trim()||audio.length<200||audio.length>25_000_000||
     !Number.isInteger(durationMs)||durationMs<8000||durationMs>90000||
     !words.length||words.length>300||
     !words.every((w,i)=>typeof w.word==='string'&&!!w.word.trim()&&
       Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)&&
       w.startMs>=0&&w.endMs>w.startMs&&
       (i===0||w.startMs>=words[i-1].startMs))||
     words.at(-1)!.endMs>durationMs+500)throw Error('PILOT_VOICE_INVALID')
  return {
    kind:'the-prompt-voice-v1',voiceId:VICTORIA_VOICE_ID,modelId:BRAND_MODEL,
    transcriptSha256:hash(transcript),audioSha256:hash(audio),
    timingsSha256:hash(JSON.stringify(words)),audioByteSize:audio.length,
    durationMs,wordCount:words.length,
  }
}
