'use client'
import {useRef,useState,type CSSProperties,type ReactNode} from 'react'
import {Sparkles} from 'lucide-react'
import styles from './AtlasBuilderStudio.module.css'
export function StudioLayout({chat,website,desktop,files,tasks}:{chat:ReactNode;website:ReactNode;desktop:ReactNode;files:ReactNode;tasks:ReactNode}){
 const [mobile,setMobile]=useState<'chat'|'website'|'desktop'>('chat'),[area,setArea]=useState<'website'|'desktop'|'files'|'tasks'>('website'),[split,setSplit]=useState(38)
 const root=useRef<HTMLDivElement>(null)
 const choose=(value:typeof area)=>{setArea(value);setMobile(value==='desktop'?'desktop':'website')}
 return <div className={styles.layout} ref={root} style={{'--studio-split':split+'%'} as CSSProperties}>
  <div className={styles.mobileTabs} role="tablist" aria-label="Byggvy">{([['chat','Chatt'],['website','Webbplats'],['desktop','Desktop']] as const).map(([id,label])=><button type="button" key={id} role="tab" aria-selected={mobile===id} onClick={()=>{setMobile(id);if(id!=='chat')setArea(id)}}>{label}</button>)}</div>
  <div className={styles.columns}>
   <div className={styles.chat} data-mobile-hidden={mobile!=='chat'}><div className={styles.chatHeading}><Sparkles size={17} aria-hidden/><strong>Atlas</strong><span>Din byggpartner</span></div><div className={styles.chatBody}>{chat}</div></div>
   <div className={styles.divider} role="separator" aria-label="Bredd på Atlas-panelen" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70} aria-valuenow={split} tabIndex={0} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setSplit(v=>e.key==='Home'?25:e.key==='End'?70:Math.max(25,Math.min(70,v+(e.key==='ArrowRight'?2:-2))))}}} onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)&&root.current){const b=root.current.getBoundingClientRect();setSplit(Math.max(25,Math.min(70,100*(e.clientX-b.left)/b.width)))}}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}/>
   <div className={styles.work} data-mobile-hidden={mobile==='chat'}>
    <div className={styles.areaTabs} role="tablist" aria-label="Arbetsyta">{([['website','Webbplats'],['desktop','Desktop'],['files','Filer'],['tasks','Uppgifter']] as const).map(([id,label])=><button type="button" key={id} role="tab" aria-selected={area===id} onClick={()=>choose(id)}>{label}</button>)}</div>
    <div className={styles.canvas}>{area==='website'?website:area==='desktop'?desktop:area==='files'?files:tasks}</div>
   </div>
  </div>
 </div>
}
