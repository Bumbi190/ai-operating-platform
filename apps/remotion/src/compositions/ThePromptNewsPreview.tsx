import React from 'react'
import {
  AbsoluteFill, Audio, Img, Easing, interpolate, staticFile,
  useCurrentFrame, useVideoConfig,
} from 'remotion'
import codexNarration from './data/codex-captions.json'
import recruiterNarration from './data/recruiter-captions.json'
import {
  activeWordIndex, captionAtTime, groupNarrationWords, type NarrationWord,
} from '../lib/news-captions'

/**
 * Isolated 9:16 editorial review videos.
 * Images are explicitly illustrative assets from older The Prompt renders,
 * not screenshots of real conversations, devices or products.
 * Neither composition is used by the scheduled publishing pipeline.
 */
type Story = 'codex' | 'recruiter'
const TEAL = '#51F1C7'
const WHITE = '#F7FDFF'
const clamp = {extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const
const ease = Easing.bezier(.18,.9,.24,1)
const anim=(f:number,a:number,b:number,x:number,y:number)=>
  interpolate(f,[a,b],[x,y],{...clamp,easing:ease})
const STORIES={
  codex:{
    audio:'the-prompt-qa/codex.mp3',narration:codexNarration,
    label:'AI / CODING',kicker:'THE CODEX EXPERIMENT',
    starts:[0,5329,10089,17519],
    beats:[
      'OPENAI TESTED\nA PERSISTENT\nCODEX MODE.',
      'AN AGENT THAT\nKEEPS WORKING\nBETWEEN TASKS.',
      'IMPORTANT: THIS\nWAS NOT A\nPRODUCT LAUNCH.',
      'WOULD YOU\nTRUST IT?',
    ],
    concepts:[
      ['CODEX AGENT','REPORTED TEST','01 / CONTEXT'],
      ['CURRENT TASK','NEXT TASK','02 / PROACTIVE WORK'],
      ['EXPERIMENT','NOT ANNOUNCED','03 / STATUS'],
      ['AUTONOMY','YOUR CHOICE','04 / THE QUESTION'],
    ],
  },
  recruiter:{
    audio:'the-prompt-qa/recruiter.mp3',narration:recruiterNarration,
    label:'AI / WORK',kicker:'THE AI-TO-AI INTERVIEW',
    starts:[0,3541,10716,17206],
    beats:[
      'AI RECRUITERS\nWERE GOING\nSILENT.',
      'TWO BOTS\nTALKED FOR\nTEN MINUTES.',
      'NO HUMAN\nFOLLOW-UP.\nNO CONFIRMED HIRE.',
      'WHO IS\nEVALUATING\nTHE PERSON?',
    ],
    concepts:[
      ['JOB SEEKER','AI RECRUITER','01 / THE SETUP'],
      ['CHATGPT VOICE','AI RECRUITER','02 / THE CALL'],
      ['FOLLOW-UP','NONE RECEIVED','03 / THE OUTCOME'],
      ['AUTOMATED HIRING','HUMAN JUDGMENT','04 / THE QUESTION'],
    ],
  },
} as const

const CAPTIONS={
  codex:groupNarrationWords(codexNarration.words as NarrationWord[]),
  recruiter:groupNarrationWords(recruiterNarration.words as NarrationWord[]),
}
const seconds=(ms:number)=>ms/1000

function EditorialDiagram({story,phase,local}:{
  story:Story;phase:number;local:number
}){
  const c=STORIES[story].concepts[phase]
  const fade=anim(local,0,13,0,1)
  const shift=anim(local,0,24,56,0)
  const pulse=anim(local,0,60,0,1)
  const active=phase===2
  return <div style={{
    position:'absolute',top:338,left:58,right:58,height:375,
    background:'linear-gradient(145deg,rgba(5,21,34,.92),rgba(16,54,70,.87))',
    borderRadius:27,border:'2px solid rgba(81,241,199,.47)',
    boxShadow:'0 20px 80px #000A, inset 0 0 90px #51F1C70D',
    padding:'30px 35px',opacity:fade,transform:`translateY(${shift}px)`,
    overflow:'hidden',
  }}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
      color:TEAL,fontSize:23,fontWeight:900,letterSpacing:3}}>
      <span>{c[2]}</span>
      <span style={{color:'#A3C0CE',fontSize:17}}>EXPLAINER VISUAL</span>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      gap:15,marginTop:50}}>
      <div style={{width:346,minHeight:132,display:'flex',alignItems:'center',justifyContent:'center',
        padding:16,textAlign:'center',fontSize:32,fontWeight:900,color:WHITE,
        lineHeight:1.2,borderRadius:18,background:'#0E263C',
        border:'2px solid #83D9FF66',boxShadow:'0 8px 40px #0008'}}>{c[0]}</div>
      <div style={{width:87,height:7,position:'relative',background:TEAL,
        boxShadow:'0 0 23px #51F1C777',borderRadius:12}}>
        <div style={{position:'absolute',width:21,height:21,right:-5,top:-7,
          transform:'rotate(45deg)',borderTop:'5px solid '+TEAL,borderRight:'5px solid '+TEAL}}/>
        <div style={{position:'absolute',width:18,height:18,borderRadius:18,
          background:TEAL,left:Math.min(62,pulse*62),top:-5}}/>
      </div>
      <div style={{width:346,minHeight:132,display:'flex',alignItems:'center',
        justifyContent:'center',padding:15,textAlign:'center',fontSize:32,fontWeight:900,
        lineHeight:1.2,color:active?'#FFC966':TEAL,borderRadius:18,
        background:active?'#30271C':'#102B34',border:'2px solid '+(active?'#FFC96688':'#51F1C777')}}>{c[1]}</div>
    </div>
    <div style={{textAlign:'center',fontSize:20,fontWeight:750,color:'#B3D0DB',
      letterSpacing:2,marginTop:35}}>ILLUSTRATIVE EDITORIAL DIAGRAM — NOT A PRODUCT SCREENSHOT</div>
  </div>
}

function TimedCaptions({story,timeMs}:{story:Story;timeMs:number}){
  const caption=captionAtTime(CAPTIONS[story],timeMs)
  if(!caption)return null
  const active=activeWordIndex(caption,timeMs)
  const appearance=anim(timeMs,caption.startMs,caption.startMs+140,0,1)
  return <div style={{position:'absolute',bottom:251,left:55,right:55,minHeight:148,
    display:'flex',alignItems:'center',justifyContent:'center',padding:'19px 28px',
    background:'rgba(2,15,27,.92)',borderRadius:22,
    border:'2px solid rgba(185,221,233,.32)',
    boxShadow:'0 22px 60px #000B',opacity:appearance}}>
    <div style={{fontSize:49,lineHeight:1.2,letterSpacing:-.7,fontWeight:780,
      textAlign:'center',color:WHITE,overflowWrap:'break-word'}}>
      {caption.words.map((w,i)=><React.Fragment key={w.startMs}>
        {i>0?' ':''}<span style={{color:i===active?TEAL:WHITE,
          textShadow:i===active?'0 0 21px #51F1C755':'0 2px 8px #0008',
          fontWeight:i===active?950:780}}>{w.text}</span>
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
  const clampedPhase=Math.max(0,Math.min(3,phase))
  const startFrame=Math.ceil(p.starts[clampedPhase]/1000*fps)
  const local=frame-startFrame
  const fadeIn=anim(local,0,9,0,1)
  const sceneUrls=[0,1,2,0].map(i=>staticFile('the-prompt-qa/'+story+'-'+i+'.png'))
  const endFade=interpolate(frame,[durationInFrames-7,durationInFrames],[1,0],clamp)

  return <AbsoluteFill style={{fontFamily:'Arial,sans-serif',color:WHITE,background:'#04111D'}}>
    <AbsoluteFill>
      <Img src={sceneUrls[clampedPhase]} style={{width:'100%',height:'100%',
        objectFit:'cover',transform:`scale(${anim(local,0,150,1.07,1.17)})`}}/>
      <AbsoluteFill style={{background:'linear-gradient(180deg,#03101EBB 0%,#03101E8D 32%,#03101EDB 62%,#03101BF7 100%)'}}/>
    </AbsoluteFill>
    <div style={{position:'absolute',top:90,left:62,right:62,display:'flex',
      justifyContent:'space-between',alignItems:'center'}}>
      <div style={{fontSize:42,fontWeight:950,letterSpacing:-1}}>
        THE <span style={{color:TEAL}}>PROMPT</span>
      </div>
      <div style={{fontSize:23,color:'#B1DEEB',letterSpacing:3,fontWeight:800}}>{p.label}</div>
    </div>
    <div style={{position:'absolute',top:158,left:62,right:62,height:5,background:'#FFFFFF55'}}>
      <div style={{height:5,width:(frame/durationInFrames*100)+'%',background:TEAL,
        boxShadow:'0 0 22px #51F1C780'}}/>
    </div>
    <div style={{position:'absolute',top:206,left:62,right:62,fontSize:25,
      letterSpacing:4,fontWeight:900,color:'#B1DEEB'}}>{p.kicker}</div>

    <EditorialDiagram story={story} phase={clampedPhase} local={local}/>
    <div style={{position:'absolute',top:817,left:62,right:62,
      opacity:fadeIn,transform:`translateY(${anim(local,0,17,64,0)}px)`}}>
      <div style={{fontSize:25,fontWeight:900,letterSpacing:3,color:TEAL,marginBottom:25}}>
        {['01 / THE SIGNAL','02 / HOW IT WORKS','03 / THE REALITY','04 / THE QUESTION'][clampedPhase]}
      </div>
      <div style={{whiteSpace:'pre-line',fontSize:clampedPhase===3?79:78,
        fontWeight:950,lineHeight:1.08,letterSpacing:-2.8,
        textShadow:'0 7px 29px #00101DDD'}}>{p.beats[clampedPhase]}</div>
      <div style={{width:anim(local,5,28,0,450),height:10,borderRadius:8,
        marginTop:26,background:TEAL}}/>
    </div>

    <TimedCaptions story={story} timeMs={timeMs}/>
    <div style={{position:'absolute',bottom:106,left:62,right:62,display:'flex',
      justifyContent:'space-between',alignItems:'center',gap:20}}>
      <div style={{fontSize:20,letterSpacing:1.8,color:'#CEE2ED'}}>WIRED / ILLUSTRATIVE VISUALS</div>
      <div style={{fontSize:19,letterSpacing:1.7,fontWeight:900,color:TEAL}}>PRIVATE REVIEW / NOT FOR POSTING</div>
    </div>
    <AbsoluteFill style={{opacity:1-endFade,background:'#04111D',pointerEvents:'none'}}/>
    <Audio src={staticFile(p.audio)}/>
  </AbsoluteFill>
}

export const previewDuration=(story:Story)=>
  Math.ceil(STORIES[story].narration.durationSecs*30)
