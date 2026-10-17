/** Precise, private-English-narration captions from ElevenLabs Scribe timestamps.
 * No invented words, no fixed 12s timings, no background provider calls. */
export interface NarrationWord {
  text: string
  startMs: number
  endMs: number
}
export interface NarrationCaption {
  text: string
  words: NarrationWord[]
  startMs: number
  endMs: number
}
const SENTENCE_END = /[.!?]$/
const SOFT_END = /[,;:]$/
const MAX_WORDS = 6
const MAX_GAP_MS = 310
const MIN_DISPLAY_MS = 270
const END_PADDING_MS = 90

/** Ensure no missed/duplicated words; preserve punctuation in the source order. */
export function groupNarrationWords(words:readonly NarrationWord[]):NarrationCaption[] {
  if (!Array.isArray(words) || !words.length) return []
  const groups:NarrationCaption[]=[]
  let current:NarrationWord[]=[]
  const finish=()=>{
    if (!current.length)return
    const startMs=current[0].startMs
    const endMs=Math.max(current.at(-1)!.endMs+END_PADDING_MS,startMs+MIN_DISPLAY_MS)
    groups.push({text:current.map(x=>x.text).join(' '),words:current,startMs,endMs})
    current=[]
  }
  for(let i=0;i<words.length;i++){
    const w=words[i]
    if(!w||!w.text.trim()||!Number.isFinite(w.startMs)||!Number.isFinite(w.endMs)||
      w.startMs<0||w.endMs<w.startMs)throw Error('INVALID_NARRATION_WORD')
    if(current.length){
      const last=current.at(-1)!
      if(w.startMs<last.startMs || w.startMs-last.endMs>MAX_GAP_MS)finish()
    }
    current.push(w)
    const next=words[i+1]
    const sentence=SENTENCE_END.test(w.text)
    const length=current.length
    if(sentence || length>=MAX_WORDS || (SOFT_END.test(w.text)&&length>=3) ||
      (next && next.startMs-w.endMs>MAX_GAP_MS)) finish()
  }
  finish()
  // Never let a caption stay up over the next one.
  for(let i=0;i<groups.length-1;i++)groups[i].endMs=Math.min(groups[i].endMs,groups[i+1].startMs)
  return groups
}
export function captionAtTime(groups:readonly NarrationCaption[], timeMs:number):NarrationCaption|null {
  if(!Number.isFinite(timeMs)||timeMs<0)return null
  return groups.find(g=>g.startMs<=timeMs && timeMs<g.endMs)??null
}
export function activeWordIndex(caption:NarrationCaption|null,timeMs:number):number {
  if(!caption)return -1
  let last=-1
  for(let i=0;i<caption.words.length;i++){
    if(timeMs>=caption.words[i].startMs)last=i
    else break
  }
  return last
}
