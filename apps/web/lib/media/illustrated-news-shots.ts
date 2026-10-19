/** Pure camera plan from this story's actual speech; never provider or publish authority. */
export interface IllustratedNewsShot {
 startMs:number;imageIndex:number;scaleFrom:number;scaleTo:number;focusX:number;focusY:number
}
interface Word {word:string;startMs:number;endMs:number}
export function planIllustratedNewsShots(words:Word[],durationMs:number,imageCount:number):IllustratedNewsShot[]{
 const invalid=()=>{throw new Error('Invalid illustrated news timing or image count')}
 if(!Number.isInteger(imageCount)||imageCount<2||imageCount>5||
    !Number.isFinite(durationMs)||durationMs<8000||durationMs>90000||
    !Array.isArray(words)||words.length<10||words.length>300)invalid()
 if(!words.every((w,i)=>typeof w.word==='string'&&!!w.word.trim()&&
   Number.isFinite(w.startMs)&&Number.isFinite(w.endMs)&&w.startMs>=0&&
   w.endMs>w.startMs&&w.endMs<=durationMs&&
   (i===0||w.startMs>words[i-1].startMs)))invalid()
 // Keep each image on a distinct story section. Prefer nearby sentence starts,
 // but never invent a word or assume this is the original Replit transcript.
 const anchors=[0]
 for(let i=1;i<imageCount;i++){
  const target=Math.floor(i*words.length/imageCount)
  const lower=Math.max(anchors[i-1]+1,target-2)
  const upper=Math.min(words.length-(imageCount-i),target+2)
  const candidates=words.map((_,j)=>j).filter(j=>j>=lower&&j<=upper&&/[.!?]$/.test(words[j-1].word))
  anchors.push(candidates.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0]??Math.max(lower,Math.min(upper,target)))
 }
 const shots:IllustratedNewsShot[]=[]
 for(let i=0;i<imageCount;i++){
  const start=i===0?0:words[anchors[i]].startMs
  // One slow move for the entire image. Restart only when its image changes.
  // Repeated close-crop shots used to rewind the same image every ~3 seconds.
  shots.push({startMs:start,imageIndex:i,scaleFrom:1.02,scaleTo:1.10,focusX:50,focusY:50})
 }
 return shots
}
