'use client';
import {useEffect,useRef,useState} from 'react';
import {Clock3,Check} from 'lucide-react';
import styles from './Calendar.module.css';

type Props={label:string;value:string;onChange:(value:string)=>void;disabled?:boolean};
const pad=(value:number)=>String(value).padStart(2,'0');
const valid=(value:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function CalendarTimePicker({label,value,onChange,disabled}:Props){
 const [open,setOpen]=useState(false);
 const [part,setPart]=useState<'hour'|'minute'>('hour');
 const root=useRef<HTMLDivElement>(null);
 const popover=useRef<HTMLDivElement>(null);
 const hour=valid(value)?Number(value.slice(0,2)):9;
 const minute=valid(value)?Number(value.slice(3,5)):0;
 useEffect(()=>{
  if(!open)return;
  const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
  document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape);};
 },[open]);
 // Keep the expanded in-panel clock reachable in shorter scrolling dialogs.
 useEffect(()=>{if(open)popover.current?.scrollIntoView({block:'nearest',inline:'nearest'});},[open]);
 const pickHour=(next:number)=>{onChange(pad(next)+':'+pad(minute));setPart('minute');};
 const pickMinute=(next:number)=>{onChange(pad(hour)+':'+pad(next));setOpen(false);setPart('hour');};
 const options=part==='hour'?Array.from({length:12},(_,i)=>i+1):Array.from({length:12},(_,i)=>i*5);
 return <div ref={root} className={styles.timePicker} data-open={open?'true':undefined}>
  <span className={styles.timePickerLabel}>{label}</span>
  <button type="button" className={styles.timePickerTrigger} aria-label={label} aria-expanded={open} disabled={disabled} onClick={()=>{setOpen(!open);setPart('hour');}}>
   <strong>{value||'Välj tid'}</strong><Clock3 size={16} aria-hidden="true"/>
  </button>
  {open&&<div ref={popover} className={styles.timePickerPopover} role="group" aria-label={'Välj '+label.toLowerCase()}>
   <div className={styles.timePickerDigits}>
    <button type="button" aria-pressed={part==='hour'} onClick={()=>setPart('hour')}>{pad(hour)}</button><span>:</span>
    <button type="button" aria-pressed={part==='minute'} onClick={()=>setPart('minute')}>{pad(minute)}</button>
   </div>
   <div className={styles.timePickerDial} aria-label={part==='hour'?'Välj timme':'Välj minut'}>
    <div className={styles.timePickerHand} style={{transform:'rotate('+((part==='hour'?hour%12:minute/5)*30)+'deg)'}}/>
    {options.map((n,i)=><button key={n} type="button" className={styles.timePickerNumber} data-selected={part==='hour'?hour%12===n%12:minute===n} style={{left:(50+39*Math.sin(i*Math.PI/6))+'%',top:(50-39*Math.cos(i*Math.PI/6))+'%'}} onClick={()=>part==='hour'?pickHour(hour>=12?(n%12)+12:n%12):pickMinute(n)}>{part==='minute'?pad(n):n}</button>)}
   </div>
   {part==='hour'&&<div className={styles.timePickerPeriod}><button type="button" aria-pressed={hour<12} onClick={()=>pickHour(hour%12)}>Förmiddag</button><button type="button" aria-pressed={hour>=12} onClick={()=>pickHour(hour%12+12)}>Eftermiddag</button></div>}
   <div className={styles.timePickerQuick}>{['08:00','09:00','10:00','12:00','15:00','18:00'].map(t=><button type="button" key={t} onClick={()=>{onChange(t);setOpen(false);}}>{t}</button>)}</div>
   <button type="button" className={styles.timePickerDone} onClick={()=>setOpen(false)}><Check size={14}/> Klar</button>
  </div>}
 </div>;
}
