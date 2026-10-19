/** Optional, deterministic camera cuts for private AI-illustrated reviews. */
export interface IllustratedShot {
 startMs:number
 imageIndex:number
 scaleFrom:number
 scaleTo:number
 focusX:number
 focusY:number
}
export interface IllustratedShotState extends IllustratedShot {
 index:number
 endMs:number
 progress:number
 scale:number
}
export function getIllustratedShotAt(
 shots:IllustratedShot[],timeMs:number,imageCount:number,durationMs:number,
):IllustratedShotState|null {
 if(!shots.length)return null
 if(!Number.isInteger(imageCount)||imageCount<1||!Number.isFinite(durationMs)||durationMs<=0)
  throw new Error('Invalid illustrated shot context')
 for(let i=0;i<shots.length;i++){
  const s=shots[i]
  if(!Number.isFinite(s.startMs)||s.startMs<0||s.startMs>=durationMs||
   (i===0?s.startMs!==0:s.startMs<=shots[i-1].startMs)||
   !Number.isInteger(s.imageIndex)||s.imageIndex<0||s.imageIndex>=imageCount||
   !Number.isFinite(s.scaleFrom)||s.scaleFrom<1||s.scaleFrom>1.6||
   !Number.isFinite(s.scaleTo)||s.scaleTo<1||s.scaleTo>1.6||
   !Number.isFinite(s.focusX)||s.focusX<0||s.focusX>100||
   !Number.isFinite(s.focusY)||s.focusY<0||s.focusY>100)
   throw new Error('Invalid illustrated shot at index '+i)
 }
 if(!Number.isFinite(timeMs)||timeMs<0||timeMs>=durationMs)return null
 const index=shots.findLastIndex(s=>s.startMs<=timeMs)
 const shot=shots[index]
 const endMs=shots[index+1]?.startMs??durationMs
 const progress=Math.min(1,Math.max(0,(timeMs-shot.startMs)/(endMs-shot.startMs)))
 return {...shot,index,endMs,progress,scale:shot.scaleFrom+(shot.scaleTo-shot.scaleFrom)*progress}
}
