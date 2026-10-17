import React from 'react'
import {AbsoluteFill, Img, Easing, interpolate, staticFile, useCurrentFrame} from 'remotion'

/**
 * English-first editorial creative lab. This composition is never connected
 * to the production news pipeline or any publishing route.
 * It must not claim to have generated a verified video about a real event.
 */
export interface ThePromptEditorialLabProps {
  /** A short, independently verified story hook. Blank defaults to a DEMO. */
  headline?: string
  /** 1 sentence of sourced context, max 115 chars recommended. */
  context?: string
  /** Evidence-based reason for relevance, max 100 chars recommended. */
  takeaway?: string
  /** English source credit, not a made-up organization. */
  sourceName?: string
  /** Optional licensed/approved scene images. No synthetic screenshots. */
  imageUrls?: string[]
}

const SEA = '#56F5D5'
const CYAN = '#83D9FF'
const NAVY = '#07121F'
const WHITE = '#F3F9FC'
const FONT = 'Inter, "Arial", sans-serif'
const clamp = {extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const
const anim = (frame:number,frames:[number,number],values:[number,number]) =>
  interpolate(frame,frames,values,{...clamp,easing:Easing.bezier(.2,1,.3,1)})
const FADE=11
const SECTIONS=[
  {start:0,end:84,section:'01 / THE SIGNAL'},
  {start:84,end:184,section:'02 / THE CONTEXT'},
  {start:184,end:290,section:'03 / WHY IT MATTERS'},
  {start:290,end:360,section:'04 / THE PROMPT'},
] as const

function sceneOpacity(frame:number,start:number,end:number) {
  const inputEnd=Math.max(start+1,end)
  const appear=start===0?1:anim(frame,[start,start+FADE],[0,1])
  const disappear=end===360?1:anim(frame,[inputEnd-FADE,inputEnd],[1,0])
  return Math.min(appear,disappear)
}
function StoryImage({source,frame,scene}:{source?:string;frame:number;scene:number}){
  if(!source) {
    const pulse=anim(frame,[0,360],[0,1])
    return <AbsoluteFill style={{
      background:`radial-gradient(ellipse at ${scene%2===0?'26%':'72%'} 38%, #184E69 0%, #0C273C 36%, #07121F 74%)`,
      transform:`scale(${1+pulse*.04})`,
    }}>
      <div style={{position:'absolute',top:540,left:140,width:800,height:800,borderRadius:'50%',
        border:'2px solid #56F5D533',transform:`rotate(${frame*.12}deg)`}}/>
      <div style={{position:'absolute',top:760,left:300,width:520,height:520,borderRadius:80,
        background:'linear-gradient(120deg,#56F5D51B,#83D9FF08)',border:'2px solid #56F5D53D',
        transform:`perspective(850px) rotateY(-21deg) rotateX(11deg) translateY(${Math.sin(frame/17)*18}px)`,
        boxShadow:'0 35px 100px #020B15EE'}}/>
    </AbsoluteFill>
  }
  const src=source.startsWith('/')?staticFile(source):source
  return <AbsoluteFill>
    <Img src={src} style={{width:'100%',height:'100%',objectFit:'cover',
      transform:`scale(${anim(frame,[0,360],[1.06,1.20])})`}}/>
    <AbsoluteFill style={{background:'linear-gradient(180deg,#06101BD6 0%,#06101B88 37%,#06101BD9 77%,#06101B 100%)'}}/>
  </AbsoluteFill>
}

function Headline({children,accent=false}:{children:React.ReactNode;accent?:boolean}) {
  return <div style={{fontFamily:FONT,fontWeight:900,fontSize:86,lineHeight:1.06,
    letterSpacing:-3.4,color:accent?SEA:WHITE,overflowWrap:'break-word'}}>
    {children}
  </div>
}
function SurfaceCard({index,label,body,emphasis}:{index:string;label:string;body:string;emphasis?:boolean}) {
  return <div style={{padding:'34px 38px',borderRadius:24,border:'2px solid #56F5D539',
    background:'linear-gradient(125deg,#051420E6,#16334BD6)',boxShadow:'0 35px 90px #0009'}}>
    <div style={{display:'flex',alignItems:'center',gap:16,color:SEA,fontWeight:900,fontSize:26,
      letterSpacing:3,marginBottom:22}}>
      <span>{index}</span><span style={{height:2,background:SEA,flex:1,opacity:.6}}/><span>{label}</span>
    </div>
    <div style={{fontSize:emphasis?51:44,fontWeight:750,lineHeight:1.28,letterSpacing:-1.1,
      color:WHITE,overflowWrap:'break-word'}}>{body}</div>
  </div>
}

export function ThePromptEditorialLab({
  headline='AI is changing the rules.',
  context='A sharper look at the technology behind the headlines.',
  takeaway='The important question is what changes next.',
  sourceName='EDITORIAL CONCEPT',
  imageUrls=[],
}:ThePromptEditorialLabProps) {
  const frame=useCurrentFrame()
  const opening=sceneOpacity(frame,0,84)
  const explainer=sceneOpacity(frame,84,184)
  const payoff=sceneOpacity(frame,184,290)
  const outro=sceneOpacity(frame,290,360)
  const sources=[imageUrls[0],imageUrls[1],imageUrls[2]]
  const phases=[opening,explainer,payoff]
  const maxPhase=phases.indexOf(Math.max(...phases))
  const selectedImage=sources[maxPhase] || sources[0]
  const progress=interpolate(frame,[0,360],[0,1],clamp)
  const microMove=frame*.05

  return <AbsoluteFill style={{background:NAVY,fontFamily:FONT,overflow:'hidden',color:WHITE}}>
    <StoryImage source={selectedImage} frame={frame} scene={maxPhase}/>
    <AbsoluteFill style={{background:'linear-gradient(90deg,#06101BEE 0%,transparent 100%)'}}/>

    {/* Structured editorial chrome remains legible throughout all 4 scenes. */}
    <div style={{position:'absolute',top:92,left:62,right:62,display:'flex',
      justifyContent:'space-between',alignItems:'center'}}>
      <div style={{fontWeight:900,letterSpacing:2.1,fontSize:37}}>THE <span style={{color:SEA}}>PROMPT</span></div>
      <div style={{fontSize:22,letterSpacing:3,fontWeight:800,color:CYAN}}>AI / BRIEFING</div>
    </div>
    <div style={{position:'absolute',top:165,left:62,width:956,height:4,background:'#FFFFFF33'}}>
      <div style={{height:'100%',width:100*progress+'%',background:SEA}}/>
    </div>
    <div style={{position:'absolute',left:62,right:62,top:195,display:'flex',justifyContent:'space-between'}}>
      <div style={{fontSize:21,letterSpacing:3,fontWeight:800,color:'#B2C5D3'}}>
        {SECTIONS.find(s=>frame>=s.start&&frame<s.end)?.section??SECTIONS[3].section}
      </div>
      <div style={{fontSize:21,fontWeight:800,letterSpacing:2,color:'#B2C5D3'}}>12 SEC / 9:16</div>
    </div>

    {/* Fast story-specific hook: high hierarchy, animated underline and 2D parallax. */}
    <AbsoluteFill style={{opacity:opening}}>
      <div style={{position:'absolute',top:440,left:64,right:65,
        transform:`translateY(${anim(frame,[0,20],[85,0])}px)`}}>
        <div style={{fontSize:30,fontWeight:900,letterSpacing:4,color:SEA,marginBottom:35}}>THE STORY IN 12 SECONDS</div>
        <Headline>{headline}</Headline>
        <div style={{marginTop:44,height:11,width:anim(frame,[8,45],[0,510]),
          background:SEA,borderRadius:8,boxShadow:'0 0 48px #56F5D588'}}/>
      </div>
      <div style={{position:'absolute',bottom:270,left:64,right:64,fontSize:31,lineHeight:1.3,
        color:'#DBE8F2',fontWeight:600,transform:`translateX(${anim(frame,[9,33],[110,0])}px)`}}>
        THE FACTS. THE IMPACT. NO FILLER.
      </div>
    </AbsoluteFill>

    {/* Editorial card with room for a sourced story visual. */}
    <AbsoluteFill style={{opacity:explainer}}>
      <div style={{position:'absolute',top:490,left:62,right:62,
        transform:`translateY(${anim(frame,[84,113],[80,0])}px)`}}>
        <div style={{fontSize:68,fontWeight:900,letterSpacing:-1.5,color:WHITE,marginBottom:44}}>BEYOND THE <span style={{color:SEA}}>HEADLINE.</span></div>
        <SurfaceCard index="01" label="CONTEXT" body={context}/>
      </div>
    </AbsoluteFill>

    {/* Payoff beat: a second information design, not the same card repeated. */}
    <AbsoluteFill style={{opacity:payoff}}>
      <div style={{position:'absolute',top:480,left:62,right:62,
        transform:`translateX(${anim(frame,[184,207],[100,0])}px)`}}>
        <div style={{fontSize:30,letterSpacing:4,fontWeight:900,color:SEA,marginBottom:36}}>THE TAKEAWAY</div>
        <Headline accent>{takeaway}</Headline>
        <div style={{marginTop:80,width:840,height:270,overflow:'hidden',
          background:'#081B2BDA',borderRadius:20,border:'2px solid #56F5D53A',padding:28}}>
          <div style={{color:'#B4D1E3',fontWeight:900,letterSpacing:2,fontSize:25}}>SIGNAL / NOT NOISE</div>
          <div style={{display:'flex',alignItems:'end',gap:9,height:145,marginTop:18}}>
            {Array.from({length:22},(_,i)=>(
              <div key={i} style={{width:27,borderRadius:8,
                height:22+Math.abs(Math.sin(i*.73+microMove*.25))*108,
                background:i%4===0?SEA:CYAN,opacity:i%3===0?1:.45}}/>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>

    {/* Brand closeout is short and restrained, not a static product card. */}
    <AbsoluteFill style={{opacity:outro,background:'linear-gradient(150deg,#051420E8,#123C48ED)'}}>
      <div style={{position:'absolute',top:650,left:56,right:56,textAlign:'center',
        transform:`translateY(${anim(frame,[290,313],[65,0])}px)`}}>
        <div style={{fontSize:37,fontWeight:800,letterSpacing:5,color:SEA,marginBottom:40}}>STAY AHEAD OF THE SIGNAL</div>
        <div style={{fontSize:106,fontWeight:900,letterSpacing:-4,lineHeight:1.07}}>FOLLOW<br/><span style={{color:SEA}}>THE PROMPT.</span></div>
        <div style={{width:220,height:7,background:SEA,borderRadius:8,margin:'70px auto 50px'}}/>
        <div style={{fontSize:37,fontWeight:700,color:'#BDE9F5'}}>AI news. Daily. No fluff.</div>
      </div>
    </AbsoluteFill>
    <div style={{position:'absolute',bottom:80,left:62,right:62,display:'flex',
      justifyContent:'space-between',alignItems:'center',gap:25}}>
      <span style={{fontSize:18,color:'#ACBFC9',letterSpacing:1.7,whiteSpace:'nowrap',maxWidth:600,
        overflow:'hidden',textOverflow:'ellipsis'}}>{sourceName}</span>
      <span style={{fontSize:18,fontWeight:900,letterSpacing:1.8,color:SEA}}>CONCEPT PREVIEW / NOT FOR POSTING</span>
    </div>
  </AbsoluteFill>
}
