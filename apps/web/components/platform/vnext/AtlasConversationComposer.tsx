'use client'
import {useRef,type RefObject} from 'react'
import {ArrowUp,Loader2,Mic,Square} from 'lucide-react'
import {COMPOSER_HINT,COMPOSER_PLACEHOLDER,DISCLAIMER} from '@/lib/os/chat-shared'
import styles from './AtlasChat.module.css'
export function AtlasConversationComposer({value,onChange,onSend,disabled,capturing,onVoice,onStopSpeech,inputSource='text',captureAvailable=true,captureError,inputRef,pending=false,sendDisabled=false,variant='default'}:{value:string;onChange:(value:string)=>void;onSend:()=>void;disabled:boolean;capturing:boolean;onVoice:()=>void;onStopSpeech:()=>void;inputSource?:'text'|'voice';captureAvailable?:boolean;captureError?:string|null;inputRef?:RefObject<HTMLTextAreaElement>;pending?:boolean;sendDisabled?:boolean;variant?:'default'|'studio'}){
 const local=useRef<HTMLTextAreaElement>(null),ref=inputRef??local
 return <div className={[styles.dock,variant==='studio'?styles.studioComposer:''].filter(Boolean).join(' ')}>
  {captureAvailable&&<div className={styles.voiceControls}><button type="button" onClick={onVoice} disabled={disabled}>{variant==='studio'&&<Mic size={14} aria-hidden/>}{capturing?'Avbryt mikrofon':'Prata med Atlas'}</button><button type="button" onClick={onStopSpeech}>{variant==='studio'&&<Square size={12} aria-hidden/>}Stoppa uppläsning</button></div>}
  {inputSource==='voice'&&<p role="status">Kontrollera rösttexten och skicka när den stämmer.</p>}
  {captureError&&<p role="alert">{captureError}</p>}
  <form className={styles.composer} onSubmit={event=>{event.preventDefault();if(!disabled&&!sendDisabled&&value.trim())onSend()}}>
   <label className={styles.srOnly} htmlFor="atlas-chat-composer">{inputSource==='voice'?'Redigera rösttranskript':'Meddelande till Atlas'}</label>
   <textarea id="atlas-chat-composer" ref={ref} className={styles.input} value={value} onChange={event=>{onChange(event.target.value);event.target.style.height='auto';event.target.style.height=Math.min(event.target.scrollHeight,192)+'px';event.target.style.overflowY=event.target.scrollHeight>192?'auto':'hidden'}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!disabled&&!sendDisabled&&value.trim())onSend()}}} placeholder={COMPOSER_PLACEHOLDER} rows={1} disabled={disabled}/>
   <button type="submit" className={styles.send} disabled={disabled||sendDisabled||!value.trim()} aria-label="Skicka">{pending?<Loader2 className={styles.spin} aria-hidden/>:<ArrowUp aria-hidden/>}</button>
  </form>
  <p className={styles.composerHint}><span className={styles.hintKeys}>{COMPOSER_HINT} · </span>{DISCLAIMER}</p>
 </div>
}

