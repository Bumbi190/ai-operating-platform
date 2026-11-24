/**
 * The Prompt: offline deterministic evidence selection for editorial QA.
 *
 * Never invents source facts: returned spans are verbatim substrings (except
 * newline normalization and whitespace between selected blocks). Source text
 * remains untrusted context for the model, not instructions and not an
 * independent reviewer signature. No providers, network, DB, or writes.
 */
const WORD=/[\p{L}\p{N}]+/gu
const STOPWORDS=new Set([
 'the','and','that','this','with','from','have','will','what','which',
 'into','their','there','they','them','were','been','said','says','about',
 'could','would','should','after','before','under','when','some',
 'source','today','news','video','model','models','reports','reported',
 'are','for','not','you','your','how','why','can','did','its',
])

const terms=(v:string):Set<string>=>new Set(
 (v.toLocaleLowerCase('en').match(WORD)??[])
  .filter(x=>(x.length>=4||/^\d+$/.test(x))&&!STOPWORDS.has(x))
)

/** Split very long blocks at sentence boundaries, retaining exact wording. */
function segments(text:string,maxSegmentSize=1100):string[]{
 const paragraphs=text.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean)
 const out:string[]=[]
 for(const paragraph of paragraphs){
  if(paragraph.length<=maxSegmentSize){out.push(paragraph);continue}
  const sentences=paragraph.split(/(?<=[.!?])\s+(?=[A-Z])/)
  let chunk=''
  for(const sentence of sentences){
   const words=sentence.match(/\S+\s*/g)??[]
   for(const word of words){
    if(chunk.length+word.length>maxSegmentSize&&chunk.trim()){
     out.push(chunk.trim());chunk=''
    }
    if(word.length>maxSegmentSize){
     // Invalid extremely long token: cut only as an already-existing
     // substring, never replace it with plausible text.
     for(let i=0;i<word.length;i+=maxSegmentSize){
      const piece=word.slice(i,i+maxSegmentSize)
      if(chunk.trim()){out.push(chunk.trim());chunk=''}
      out.push(piece.trim())
     }
    }else chunk+=word
   }
  }
  if(chunk.trim())out.push(chunk.trim())
 }
 return out
}

/**
 * Keep the source lead and the most claim-relevant later spans within 4.4k
 * chars. Do not force a quote that is absent from the original source.
 * If a full article fits, retain it unchanged.
 */
export function selectEditorialQaSourceEvidence(
 sourceContext:string,
 hook:string,
 script:string,
 maxChars=4400,
):string{
 if(typeof sourceContext!=='string'||!sourceContext.trim())return ''
 if(!Number.isSafeInteger(maxChars)||maxChars<500||maxChars>10000)
   throw new Error('QUALITY_SOURCE_EVIDENCE_BUDGET_INVALID')
 const text=sourceContext.replace(/\r\n/g,'\n').trim()
 if(text.length<=maxChars)return text
 const parts=segments(text)
 if(!parts.length)return ''
 const wanted=terms(hook+' '+script)
 const ranked=parts.slice(1).map((part,i)=>{
  const found=terms(part)
  let score=0
  for(const token of wanted){
   if(found.has(token))score+=/^\d+$/.test(token)?5:2
  }
  // A modest lead preference for explanatory sections; never replaces
  // claim-token matching, which preserves late numbers and qualifications.
  return {part,index:i+1,score}
 }).sort((a,b)=>b.score-a.score||a.index-b.index)
 const selected=[{part:parts[0],index:0,score:0}]
 let remaining=maxChars-parts[0].length
 if(remaining<0)return parts[0].slice(0,maxChars)
 for(const item of ranked){
  const cost=item.part.length+2
  if(cost<=remaining){selected.push(item);remaining-=cost}
 }
 selected.sort((a,b)=>a.index-b.index)
 return selected.map(v=>v.part).join('\n\n')
}
