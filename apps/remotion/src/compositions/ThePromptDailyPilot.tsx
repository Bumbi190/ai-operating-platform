import React from 'react'
import {AbsoluteFill,Audio,Img,interpolate,useCurrentFrame,useVideoConfig} from 'remotion'
import type {VideoInputProps} from '../lib/types'
import {getIllustratedShotAt,type IllustratedShot} from '../lib/illustrated-shots'

/**
 * The Prompt — dynamic daily news renderer, in a PREVIEW-ONLY draft.
 * Unlike the old Codex/recruiter demos, every story field, approved image,
 * the real Victoria audio and word timestamps must come from that day's job.
 * This module does not authorize news or publish anything.
 */
export interface DailyPilotProps extends VideoInputProps {
  /** Private illustrated review only; not documentary imagery or publish authority. */
  illustratedShots?:IllustratedShot[]
  sourceLabel:string
  sourceUrl:string
  sourcePublishedAt:string
  creativeVersion:'the-prompt-editorial-v1'
}
const TEAL='#51F1C7',WHITE='#F7FDFF',OUTRO_FRAMES=90
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const
const lerp=(frame:number,start:number,end:number,a:number,b:number)=>
  interpolate(frame,[start,end],[a,b],clamp)

export function ThePromptDailyPilot({
  hook,audioUrl,durationMs,words,images,sourceLabel,sourcePublishedAt,illustratedShots,
}:DailyPilotProps){
  const frame=useCurrentFrame()
  const {fps,durationInFrames}=useVideoConfig()
  const voiceFrames=Math.ceil(durationMs/1000*fps)
  const outro=frame>=voiceFrames
  const segmentDuration=Math.max(1,voiceFrames/Math.max(1,images.length))
  const elapsedMs=frame*1000/fps
  const illustrated=Boolean(illustratedShots?.length)
  const shot=illustrated?getIllustratedShotAt(illustratedShots!,elapsedMs,images.length,durationMs):null
  const currentWord=words.findLastIndex(w=>w.startMs<=elapsedMs&&elapsedMs<w.endMs+150)
  const groupStart=currentWord<0?0:Math.floor(currentWord/4)*4
  const captionWords=currentWord<0?[]:words.slice(groupStart,groupStart+4)
  const hookEnds=Math.min(Math.floor(fps*2.4),voiceFrames)
  const showHook=frame<hookEnds

  return <AbsoluteFill style={{fontFamily:'Arial,sans-serif',background:'#04111D',color:WHITE,overflow:'hidden'}}>
    {!outro&&<>
      <AbsoluteFill>
        {shot?<AbsoluteFill key={'shot-'+shot.index}>
          <Img src={images[shot.imageIndex]} style={{width:'100%',height:'100%',objectFit:'cover',
            transformOrigin:shot.focusX+'% '+shot.focusY+'%',
            transform:'scale('+shot.scale+')'}}/>
        </AbsoluteFill>:images.length===0?<AbsoluteFill style={{background:'#0A2434'}}/>:
          images.map((src,i)=>{
            const start=i*segmentDuration,end=(i+1)*segmentDuration
            const fadeIn=i===0?1:lerp(frame,start-8,start+8,0,1)
            const fadeOut=i===images.length-1?1:lerp(frame,end-8,end+8,1,0)
            return <AbsoluteFill key={i} style={{opacity:fadeIn*fadeOut}}>
              <Img src={src} style={{width:'100%',height:'100%',objectFit:'cover',
                transform:'scale('+lerp(frame,start,end,1.03,1.14)+')'}}/>
            </AbsoluteFill>
          })}
        <AbsoluteFill style={{background:illustrated?'linear-gradient(180deg,#04111DC9 0%,#04111D08 22%,#04111D00 56%,#04111D88 85%,#04111DDB 100%)':'linear-gradient(180deg,#04111DBA 0%,#04111D49 27%,#04111DB5 56%,#04111DF8 96%)'}}/>
      </AbsoluteFill>
      <div style={{position:'absolute',top:92,left:65,right:65,display:'flex',justifyContent:'space-between'}}>
        <div style={{fontSize:43,fontWeight:950,letterSpacing:-1}}>THE <span style={{color:TEAL}}>PROMPT</span></div>
        <div style={{fontSize:23,fontWeight:800,letterSpacing:3,color:'#D2E8F0'}}>AI NEWS</div>
      </div>
      <div style={{position:'absolute',top:158,left:65,right:65,height:4,background:'#FFFFFF49'}}>
        <div style={{height:4,width:Math.min(100,100*frame/voiceFrames)+'%',background:TEAL}}/>
      </div>
      <div style={{position:'absolute',top:214,left:65,right:65,color:'#D3E7EF',
        fontSize:22,fontWeight:850,letterSpacing:2}}>
        {sourceLabel.toUpperCase().slice(0,40)} / {sourcePublishedAt.slice(0,10)}
      </div>
      {illustrated&&<div style={{position:'absolute',top:258,left:65,padding:'9px 14px',
        borderRadius:6,background:'#04111DBF',fontSize:18,fontWeight:800,letterSpacing:1.4}}>AI ILLUSTRATIONS</div>}
      {showHook&&<div style={{position:'absolute',top:illustrated?340:775,left:65,right:65,
        opacity:lerp(frame,hookEnds-9,hookEnds,1,0)}}>
        <div style={{fontSize:83,fontWeight:950,lineHeight:1.08,letterSpacing:-3.1,
          textShadow:'0 6px 20px #000E,0 15px 45px #000'}}>{hook.trim().slice(0,110)}</div>
        <div style={{height:8,width:280,background:TEAL,borderRadius:9,marginTop:30}}/>
      </div>}
      {!!captionWords.length&&<div style={{position:'absolute',bottom:250,left:70,right:70,
        textAlign:'center',fontSize:53,fontWeight:880,lineHeight:1.25,
        textShadow:'0 4px 9px #000,0 10px 27px #000'}}>
        {captionWords.map((w,i)=><React.Fragment key={w.startMs}>
          {i>0?' ':''}<span style={{color:groupStart+i===currentWord?TEAL:WHITE}}>{w.word}</span>
        </React.Fragment>)}
      </div>}
      <div style={{position:'absolute',bottom:91,left:65,right:65,
        display:'flex',justifyContent:'space-between',gap:20,
        fontSize:17,fontWeight:800,color:'#BDD7E1',letterSpacing:1.2}}>
        <span>{illustrated?'AI-GENERATED / EDITORIAL ILLUSTRATIONS':'SOURCE-BASED / EDITORIAL VISUALS'}</span><span style={{color:TEAL}}>PILOT REVIEW</span>
      </div>
    </>}
    {outro&&<AbsoluteFill style={{background:'radial-gradient(ellipse at 50% 35%,#17484E,#04111D 76%)',
      alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:'0 55px',
        opacity:lerp(frame,voiceFrames,voiceFrames+18,0,1)*
          lerp(frame,durationInFrames-10,durationInFrames,1,0)}}>
        <div style={{fontSize:31,fontWeight:900,color:TEAL,letterSpacing:5,marginBottom:49}}>STAY AHEAD OF THE SIGNAL</div>
        <div style={{fontSize:110,fontWeight:950,lineHeight:1.06,letterSpacing:-4}}>FOLLOW<br/><span style={{color:TEAL}}>THE PROMPT.</span></div>
        <div style={{width:240,height:8,background:TEAL,borderRadius:12,margin:'63px auto 44px'}}/>
        <div style={{fontSize:41,fontWeight:800,color:'#C0E9F1'}}>AI news. Daily. No fluff.</div>
      </div>
      <div style={{position:'absolute',bottom:96,fontSize:19,letterSpacing:1.6,color:'#BDD6E2'}}>
        PRIVATE PILOT REVIEW / NOT FOR POSTING
      </div>
    </AbsoluteFill>}
    {audioUrl&&<Audio src={audioUrl}/>}
  </AbsoluteFill>
}
export const pilotDurationFrames=(durationMs:number)=>Math.ceil(durationMs/1000*30)+OUTRO_FRAMES
