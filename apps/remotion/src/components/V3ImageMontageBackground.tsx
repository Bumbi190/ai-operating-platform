/**
 * FilmCraft V3 style rendered deterministically from an authorized 1–5-image
 * private storyboard. This reads approved image URLs only: no generation,
 * provider, Storage write, cron, or public publishing hooks.
 */
import React from 'react'
import {AbsoluteFill,Img,interpolate,Sequence,useCurrentFrame} from 'remotion'
import type {V3StoryboardPlan,V3MontageShot} from '../lib/types'

function MovingEditorialShot({image,shot}:{
  image:string
  shot:V3MontageShot
}) {
  const frame=useCurrentFrame()
  const before=shot.transitionInFrames
  const progress=frame-before
  const duration=Math.max(1,shot.durationFrames)
  const zoom=interpolate(progress,[0,duration],[shot.zoomFrom,shot.zoomTo],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',
  })
  const panX=interpolate(progress,[0,duration],[shot.panFrom[0],shot.panTo[0]],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',
  })
  const panY=interpolate(progress,[0,duration],[shot.panFrom[1],shot.panTo[1]],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',
  })
  const opacity=before>0
    ?interpolate(frame,[0,before],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})
    :1
  return (
    <AbsoluteFill style={{opacity,overflow:'hidden'}}>
      <Img src={image} style={{
        width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',
        transform:`translate(${panX}px,${panY}px) scale(${zoom})`,
        transformOrigin:'center center',
      }}/>
    </AbsoluteFill>
  )
}

export function V3ImageMontageBackground({
  images,plan,
}:{
  images:string[]
  plan:V3StoryboardPlan
}){
  if(images.length<1||images.length>5||
     plan.schema!=='theprompt.v3.private-storyboard.v1'||
     plan.shots.length>15||plan.shots.length<1||
     plan.shots.some(s=>!images[s.imageIndex])){
    // Deliberately fail visually, rather than selecting an unrelated asset.
    return <AbsoluteFill style={{backgroundColor:'#07080f'}}/>
  }
  return (
    <AbsoluteFill style={{backgroundColor:'#07080f'}}>
      {plan.shots.map((shot)=>{
        const begin=shot.startFrame-shot.transitionInFrames
        const length=shot.durationFrames+shot.transitionInFrames
        return (
          <Sequence key={shot.index} from={begin} durationInFrames={length} layout="none">
            <MovingEditorialShot image={images[shot.imageIndex]} shot={shot}/>
          </Sequence>
        )
      })}
      <AbsoluteFill style={{background:'linear-gradient(to top,rgba(0,0,0,.62),transparent 44%)'}}/>
      <AbsoluteFill style={{background:'linear-gradient(to bottom,rgba(0,0,0,.45),transparent 30%)'}}/>
      {plan.editorialHold.required&&(
        <AbsoluteFill style={{
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',
          paddingTop:45,pointerEvents:'none',
        }}>
          <div style={{
            color:'#FFD58A',fontSize:22,fontWeight:800,letterSpacing:1.2,
            textAlign:'center',textShadow:'0 1px 6px #000',
          }}>EDITORIAL HOLD · NOT FOR PUBLICATION</div>
          <div style={{
            marginTop:8,color:'#E6E8EF',fontSize:15,fontWeight:600,
            letterSpacing:1.5,textAlign:'center',
          }}>AI-GENERATED ILLUSTRATIONS</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
