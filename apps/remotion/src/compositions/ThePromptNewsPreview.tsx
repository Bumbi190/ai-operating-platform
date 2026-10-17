import React from 'react'
import {
  AbsoluteFill, Audio, Img, Easing, interpolate, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion'
import codexNarration from './data/codex-captions.json'
import recruiterNarration from './data/recruiter-captions.json'
import {activeWordIndex, captionAtTime, groupNarrationWords, type NarrationWord} from '../lib/news-captions'

/**
 * Clean, cinematic, English-first review composition.
 * No central cards or explainer boxes. Images are illustrations only,
 * not documentary screenshots. NEVER used by the publishing cron.
 */
type Story = 'codex' | 'recruiter'
const TEAL = '#51F1C7'
const WHITE = '#F7FDFF'
const clamp = {extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const
const ease = Easing.bezier(.18,.9,.24,1)
const anim = (f:number,a:number,b:number,x:number,y:number) =>
  interpolate(f,[a,b],[x,y],{...clamp,easing:ease})
const STORIES = {
  codex: {
    audio:'the-prompt-qa/codex.mp3',narration:codexNarration,
    label:'AI / CODING',kicker:'THE CODEX EXPERIMENT',
    starts:[0,5329,10089,17519],
    beats:[
      'AN AI THAT\nNEVER SLEEPS?',
      'CODEX COULD\nKEEP WORKING.',
      'A TEST.\nNOT A LAUNCH.',
      'WOULD YOU\nTRUST IT?',
    ],
    micro:['01 / THE SIGNAL','02 / THE IDEA','03 / THE FACTS','04 / YOUR TAKE'],
  },
  recruiter: {
    audio:'the-prompt-qa/recruiter.mp3',narration:recruiterNarration,
    label:'AI / WORK',kicker:'THE AI-TO-AI INTERVIEW',
    starts:[0,3541,10716,17206],
    beats:[
      'AI INTERVIEWED\nANOTHER AI.',
      'TWO BOTS.\nTEN MINUTES.',
      'NO HUMAN\nFOLLOW-UP.',
      'WHO IS\nREALLY HIRING?',
    ],
    micro:['01 / THE SETUP','02 / THE CALL','03 / THE OUTCOME','04 / THE QUESTION'],
  },
} as const
const CAPTIONS = {
  codex:groupNarrationWords(codexNarration.words as NarrationWord[]),
  recruiter:groupNarrationWords(recruiterNarration.words as NarrationWord[]),
}
function TimedCaptions({story,timeMs}:{story:Story;timeMs:number}) {
  const caption=captionAtTime(CAPTIONS[story],timeMs)
  if (!caption)return null
  const active=activeWordIndex(caption,timeMs)
  const appear=anim(timeMs,caption.startMs,caption.startMs+125,0,1)
  return <div style={{
    position:'absolute',bottom:256,left:72,right:72,
    minHeight:132,display:'flex',alignItems:'center',justifyContent:'center',
    opacity:appear,transform:`translateY(${anim(timeMs,caption.startMs,caption.startMs+125,16,0)}px)`,
  }}>
    <div style={{
      fontSize:52,lineHeight:1.25,fontWeight:850,letterSpacing:-.7,
      textAlign:'center',color:WHITE,overflowWrap:'break-word',
      textShadow:'0 5px 11px #00121C,0 8px 35px #000,0 1px 3px #000',
    }}>
      {caption.words.map((w,i)=><React.Fragment key={w.startMs}>
        {i>0?' ':''}
        <span style={{color:i===active?TEAL:WHITE,fontWeight:i===active?950:850}}>
          {w.text}
        </span>
      </React.Fragment>)}
    </div>
  </div>
}
export function ThePromptNewsPreview({story}:{story:Story}){
  const frame=useCurrentFrame()
  const {fps,durationInFrames}=useVideoConfig()
  const timeMs=frame/fps*1000
  const p=STORIES[story]
  const phase=p.starts.reduce((count,start)=>timeMs>=start?count+1:count,0)-1
  const segment=Math.max(0,Math.min(3,phase))
  const startFrame=Math.ceil(p.starts[segment]/1000*fps)
  const local=Math.max(0,frame-startFrame)
  const opening=anim(local,0,13,0,1)
  const disappearing=interpolate(frame,[durationInFrames-7,durationInFrames],[1,0],clamp)
  const sceneImage=staticFile('the-prompt-qa/'+story+'-'+[0,1,2,0][segment]+'.png')
  return <AbsoluteFill style={{fontFamily:'Arial,sans-serif',color:WHITE,background:'#04111D',overflow:'hidden'}}>
    <AbsoluteFill>
      <Img src={sceneImage} style={{
        width:'100%',height:'100%',objectFit:'cover',
        transform:`scale(${anim(local,0,165,1.05,1.17)}) translateY(${anim(local,0,165,0,-22)}px)`,
      }}/>
      <AbsoluteFill style={{
        background:'linear-gradient(180deg,#02121EA3 0%,#03121E48 22%,#03121EA0 45%,#03121EDB 67%,#03111EF8 100%)',
      }}/>
    </AbsoluteFill>
    {/* Brand chrome only, never a dominant visual card. */}
    <div style={{position:'absolute',top:90,left:62,right:62,display:'flex',
      alignItems:'center',justifyContent:'space-between'}}>
      <div style={{fontSize:42,fontWeight:950,letterSpacing:-1}}>
        THE <span style={{color:TEAL}}>PROMPT</span>
      </div>
      <div style={{fontSize:22,color:'#B1DEEB',letterSpacing:3,fontWeight:800}}>{p.label}</div>
    </div>
    <div style={{position:'absolute',top:155,left:62,right:62,height:4,background:'#FFFFFF44'}}>
      <div style={{height:4,width:frame/durationInFrames*100+'%',background:TEAL}}/>
    </div>
    <div style={{position:'absolute',top:198,left:62,right:62,
      fontSize:22,letterSpacing:3.6,fontWeight:850,color:'#D2E8F0'}}>{p.kicker}</div>

    {/* Image first. A small scene label + headline replace every central box. */}
    <div style={{position:'absolute',top:805,left:65,right:65,
      opacity:opening,transform:`translateY(${anim(local,0,17,65,0)}px)`}}>
      <div style={{fontSize:26,fontWeight:900,letterSpacing:4,color:TEAL,marginBottom:26}}>
        {p.micro[segment]}
      </div>
      <div style={{
        fontSize:segment===3?90:87,lineHeight:1.07,fontWeight:950,
        letterSpacing:-3.5,whiteSpace:'pre-line',overflowWrap:'break-word',
        textShadow:'0 6px 15px #000E,0 13px 45px #00131FE6',
      }}>{p.beats[segment]}</div>
      <div style={{
        marginTop:27,height:7,width:anim(local,8,35,0,330),
        borderRadius:20,background:TEAL,boxShadow:'0 0 21px #51F1C77A',
      }}/>
    </div>

    <TimedCaptions story={story} timeMs={timeMs}/>
    <div style={{position:'absolute',bottom:99,left:60,right:60,
      fontSize:16,fontWeight:800,letterSpacing:1.5,display:'flex',
      justifyContent:'space-between',gap:30,color:'#D0E7EF'}}>
      <div>WIRED / ILLUSTRATIVE VISUALS — NOT A PRODUCT SCREENSHOT</div>
      <div style={{color:TEAL,textAlign:'right'}}>PRIVATE REVIEW / NOT FOR POSTING</div>
    </div>
    <AbsoluteFill style={{opacity:1-disappearing,background:'#04111D',pointerEvents:'none'}}/>
    <Audio src={staticFile(p.audio)}/>
  </AbsoluteFill>
}
export const previewDuration=(story:Story)=>Math.ceil(STORIES[story].narration.durationSecs*30)
