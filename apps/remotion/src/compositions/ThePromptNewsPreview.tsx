import React from 'react'
import {AbsoluteFill, Audio, Img, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion'

/** Private local QA only. Illustrative legacy images, verified script sources,
 * original English narration. No connection to publishing or Lambda. */
type Story='codex'|'recruiter'
const STORIES={
 codex:{audio:'the-prompt-qa/codex.mp3',duration:21.6,label:'AI / CODING',
 title:'AN AI THAT\nKEEPS WORKING?',kicker:'THE CODEX EXPERIMENT',
 source:'WIRED REPORTING',beats:[
  'OPENAI TESTED\nA PERSISTENT\nCODEX MODE.',
  'PROACTIVE TASKS.\nNO NEW PROMPT\nBETWEEN JOBS.',
  'BUT THIS WAS\nAN EXPERIMENT,\nNOT A LAUNCH.',
  'WOULD YOU\nTRUST IT TO\nDECIDE WHAT’S NEXT?',
 ]},
 recruiter:{audio:'the-prompt-qa/recruiter.mp3',duration:23.12,label:'AI / WORK',
 title:'AI INTERVIEWED\nANOTHER AI.',kicker:'A HIRING EXPERIMENT',
 source:'WIRED REPORTING',beats:[
  'A JOB SEEKER\nUSED CHATGPT\nTO TAKE A CALL.',
  'TWO BOTS TALKED\nFOR TEN MINUTES.',
  'A HUMAN FOLLOW-UP\nWAS PROMISED.\nNONE CAME.',
  'WHEN BOTS SCREEN\nBOTS, WHO MEETS\nTHE CANDIDATE?',
 ]},
} as const
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const
const ease=Easing.bezier(.18,.9,.24,1)
const move=(f:number,a:number,b:number,x:number,y:number)=>
 interpolate(f,[a,b],[x,y],{...clamp,easing:ease})
export function ThePromptNewsPreview({story}:{story:Story}){
 const frame=useCurrentFrame()
 const {fps,durationInFrames}=useVideoConfig()
 const p=STORIES[story]
 const phase=Math.min(3,Math.floor(frame/(durationInFrames/4)))
 const phaseStart=Math.floor(phase*durationInFrames/4)
 const local=frame-phaseStart
 const photos=[0,1,2,0].map(i=>staticFile('the-prompt-qa/'+story+'-'+i+'.png'))
 const photo=photos[phase]
 const fadeOut=interpolate(local,[Math.max(0,durationInFrames/4-12),durationInFrames/4],[1,0],clamp)
 const fadeIn=move(local,0,10,0,1)
 const opacity=fadeIn*fadeOut
 const text=p.beats[phase]
 return <AbsoluteFill style={{fontFamily:'Arial,sans-serif',color:'#F7FDFF',background:'#04111D'}}>
  <AbsoluteFill>
   <Img src={photo} style={{width:'100%',height:'100%',objectFit:'cover',
    transform:`scale(${move(local,0,durationInFrames/4,1.08,1.22)}) translateY(${move(local,0,durationInFrames/4,0,-20)}px)`}}/>
   <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(3,12,23,.55) 0%,rgba(3,12,23,.33) 27%,rgba(3,12,23,.79) 57%,#04111DF5 95%)'}}/>
  </AbsoluteFill>
  <div style={{position:'absolute',top:90,left:62,right:62,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
   <div style={{fontSize:42,fontWeight:950,letterSpacing:-1}}>THE <span style={{color:'#51F1C7'}}>PROMPT</span></div>
   <div style={{fontSize:23,color:'#B1DEEB',letterSpacing:3,fontWeight:800}}>{p.label}</div>
  </div>
  <div style={{position:'absolute',top:158,left:62,right:62,height:5,background:'#FFFFFF55'}}>
   <div style={{height:5,width:(frame/durationInFrames*100)+'%',background:'#51F1C7',boxShadow:'0 0 22px #51F1C780'}}/>
  </div>
  <div style={{position:'absolute',top:205,left:62,right:62,fontSize:25,letterSpacing:4,fontWeight:900,color:'#B1DEEB'}}>{p.kicker}</div>
  <div style={{position:'absolute',top:860,left:62,right:62,opacity,
   transform:`translateY(${move(local,0,18,76,0)}px)`}}>
   <div style={{fontSize:26,fontWeight:900,letterSpacing:3,color:'#51F1C7',marginBottom:20}}>0{phase+1} / EXPLAINED</div>
   <div style={{whiteSpace:'pre-line',fontSize:phase===3?77:82,fontWeight:950,
    lineHeight:1.06,letterSpacing:-2.5,textShadow:'0 8px 35px #00101DDD'}}>{text}</div>
   <div style={{width:move(local,8,30,0,490),height:11,borderRadius:6,marginTop:32,background:'#51F1C7'}}/>
  </div>
  <div style={{position:'absolute',bottom:110,left:62,right:62,display:'flex',justifyContent:'space-between',alignItems:'center',gap:18}}>
   <div style={{fontSize:20,letterSpacing:2,color:'#CEE2ED'}}>{p.source} / ILLUSTRATIVE VISUALS</div>
   <div style={{fontSize:20,letterSpacing:2,fontWeight:800,color:'#51F1C7'}}>PRIVATE REVIEW / NOT FOR POSTING</div>
  </div>
  <Audio src={staticFile(p.audio)}/>
 </AbsoluteFill>
}
export const previewDuration=(story:Story)=>Math.ceil(STORIES[story].duration*30)
