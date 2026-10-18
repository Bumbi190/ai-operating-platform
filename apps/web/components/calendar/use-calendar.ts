'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAtlasConversation} from '@/lib/atlas/conversation/provider';
import type {CalendarEntry,CalendarEvent,CalendarEventDraft,CalendarMutation,CalendarRange,CalendarWeekModel} from '@/lib/calendar/types';
import {addCalendarDays,resolveCalendarLocal,stockholmDate,stockholmMinute,weekRange} from '@/lib/calendar/time';
import {parseCalendarMutation} from '@/lib/calendar/validate';

export type CalendarForm={title:string;description:string;location:string;kind:'private'|'work_block';projectId:string;taskId:string;workStatus:'planned'|'in_progress'|'done';allDay:boolean;noEnd:boolean;startDate:string;startTime:string;endDate:string;endTime:string};
const hhmm=(minute:number)=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
function blankForm(date:string,minute=9*60):CalendarForm{return {title:'',description:'',location:'',kind:'private',projectId:'',taskId:'',workStatus:'planned',allDay:false,noEnd:true,startDate:date,startTime:hhmm(minute),endDate:date,endTime:''};}
function formForEvent(event:CalendarEvent):CalendarForm {
 const t=event.time;
 const local=t.kind==='timed'?stockholmMinute(t.startUtc):t.startDate+'T09:00';
 const end=t.kind==='timed'&&t.endUtc?stockholmMinute(t.endUtc):null;
 return {...blankForm(local.slice(0,10)),title:event.title,description:event.description,location:event.location,kind:event.kind,projectId:event.projectId??'',taskId:event.taskId??'',workStatus:event.workStatus??'planned',allDay:t.kind==='all_day',noEnd:t.kind==='timed'&&t.endUtc===null,startTime:local.slice(11,16),endDate:t.kind==='all_day'?addCalendarDays(t.endDateExclusive,-1):end?.slice(0,10)??local.slice(0,10),endTime:end?.slice(11,16)??''};
}
function draftForForm(form:CalendarForm):CalendarEventDraft {
 const time=form.allDay?{kind:'all_day' as const,startDate:form.startDate,endDateExclusive:addCalendarDays(form.endDate,1),timeZone:'Europe/Stockholm' as const}:{kind:'timed' as const,startUtc:resolveCalendarLocal(form.startDate+'T'+form.startTime),endUtc:form.noEnd?null:resolveCalendarLocal(form.endDate+'T'+form.endTime),timeZone:'Europe/Stockholm' as const};
 return {kind:form.kind,title:form.title,description:form.description,location:form.location,projectId:form.projectId||null,taskId:form.taskId||null,time,workStatus:form.kind==='work_block'?form.workStatus:null};
}
function emptyWeek(range:CalendarRange,projects:CalendarWeekModel['projects']):CalendarWeekModel{return {range,entries:[],unscheduledTasks:[],projects,availability:{manual:false,social:false,workflows:false,tasks:false},truncated:{manual:false,social:false,workflows:false,tasks:false}};}
function failure(code:string,read=false):string {
 if(code==='CONFLICT')return 'Händelsen har ändrats sedan du öppnade den. Läs om veckan och öppna händelsen igen.';
 if(code==='UNAUTHORIZED')return 'Sessionen har gått ut. Logga in igen.';
 if(code==='INVALID_INPUT')return 'Kontrollera titel, datum och tider. Sluttiden måste vara efter starten. En tid vid sommartidsbyte kan behöva ändras.';
 return read?'Veckan kunde inte läsas. Försök igen.':'Händelsen kunde inte sparas. Dina ändringar finns kvar. Försök igen.';
}
export function useCalendarWorkspace(initialWeek:CalendarWeekModel,userId:string){
 const {controller}=useAtlasConversation();
 const [week,setWeek]=useState(initialWeek.range.fromDate),[model,setModel]=useState(initialWeek);
 const [selectedDay,setSelectedDay]=useState(()=>{const today=stockholmDate(new Date().toISOString());return today>=initialWeek.range.fromDate&&today<initialWeek.range.toDateExclusive?today:initialWeek.range.fromDate;});
 const [loading,setLoading]=useState(false),[readError,setReadError]=useState(''),[saveError,setSaveError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 const [filter,setFilter]=useState('all'),[panelOpen,setPanelOpen]=useState(false),[form,setForm]=useState<CalendarForm|null>(null),[selected,setSelected]=useState<CalendarEntry|null>(null);
 const mounted=useRef(true),owner=useRef(userId),sequence=useRef(0),abort=useRef<AbortController|null>(null),savingGate=useRef(false);
 const write=useRef<{eventId:string;key:string;payload:string|null}>({eventId:'',key:'',payload:null});
 useEffect(()=>{mounted.current=true;owner.current=userId;return()=>{mounted.current=false;sequence.current++;abort.current?.abort();};},[userId]);
 const loadWeek=useCallback(async(target:string)=>{
  const range=weekRange(target),current=++sequence.current,identity=userId;
  abort.current?.abort();const request=new AbortController();abort.current=request;
  setLoading(true);setReadError('');
  setModel(old=>old.range.fromDate===target?old:emptyWeek(range,old.projects));
  try{
   const response=await fetch('/api/calendar?fromDate='+range.fromDate+'&toDateExclusive='+range.toDateExclusive,{signal:request.signal,cache:'no-store'});
   const value=await response.json();
   if(!response.ok)throw Object.assign(Error(),{code:value.code});
   if(!value||value.range?.fromDate!==target||!Array.isArray(value.entries)||!Array.isArray(value.projects))throw Error();
   if(mounted.current&&identity===owner.current&&current===sequence.current)setModel(value);
  }catch(error){
   if(mounted.current&&identity===owner.current&&current===sequence.current&&!request.signal.aborted)setReadError(failure((error as {code?:string}).code??'',true));
  }finally{if(mounted.current&&identity===owner.current&&current===sequence.current)setLoading(false);}
 },[userId]);
 useEffect(()=>{void loadWeek(week);const url=new URL(window.location.href);url.searchParams.set('week',week);window.history.replaceState(null,'',url.pathname+url.search);},[week,loadWeek]);
 useEffect(()=>controller.subscribeCalendarChanged(()=>{setNotice('Atlas uppdaterade kalendern.');void loadWeek(week);}),[controller,loadWeek,week]);
 const changeWeek=(date:string)=>{
  const next=weekRange(date).fromDate;sequence.current++;abort.current?.abort();setSelectedDay(date);setWeek(next);
  if(next===week)void loadWeek(next);
 };
 const newEvent=(date=selectedDay,minute=9*60,task?:CalendarWeekModel['unscheduledTasks'][number])=>{
  if(form&&!panelOpen&&!task){setPanelOpen(true);return;}
  setSelected(null);setForm({...blankForm(date,minute),...(task?{title:task.title,kind:'work_block' as const,projectId:task.projectId,taskId:task.id}:{})});
  write.current={eventId:crypto.randomUUID(),key:crypto.randomUUID(),payload:null};setSaveError('');setPanelOpen(true);
 };
 const selectEntry=(entry:CalendarEntry)=>{
  setSelected(entry);setSaveError('');setPanelOpen(true);
  write.current={eventId:entry.source.kind==='manual'?entry.source.eventId:'',key:crypto.randomUUID(),payload:null};
  if(entry.source.kind==='manual'){
   setForm(entry.manualEvent?formForEvent(entry.manualEvent):null);
   if(!entry.manualEvent)setSaveError('Händelsens detaljer kunde inte läsas. Läs om veckan.');
  }else if(entry.source.kind==='social'&&entry.editable&&entry.time.kind==='timed'){
   const local=stockholmMinute(entry.pendingChange?.time.kind==='timed'?entry.pendingChange.time.startUtc:entry.time.startUtc);
   setForm({...blankForm(local.slice(0,10)),title:entry.title,startTime:local.slice(11,16)});
  }else setForm(null);
 };
 const patchForm=(patch:Partial<CalendarForm>)=>setForm(old=>{
  if(!old)return old;
  const next={...old,...patch};
  if(patch.startDate&&old.endDate===old.startDate)next.endDate=patch.startDate;
  if(patch.projectId!==undefined&&patch.projectId!==old.projectId)next.taskId='';
  return next;
 });
 const perform=async(body:Record<string,unknown>)=>{
  const identity=userId,forWeek=week;
  const payload=JSON.stringify({...body,idempotencyKey:undefined});
  if(write.current.payload!==null&&write.current.payload!==payload)write.current.key=crypto.randomUUID();
  write.current.payload=payload;
  const response=await fetch('/api/calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,idempotencyKey:write.current.key})});
  const receipt=await response.json();if(!response.ok||receipt.ok!==true)throw Object.assign(Error(),{code:receipt.code});
  if(!mounted.current||identity!==owner.current)return;
  setNotice(receipt.reviewRequired?'Tidsförslaget är sparat och behöver granskas.':'Händelsen är sparad.');
  setPanelOpen(false);setForm(null);setSelected(null);setSaveError('');void loadWeek(forWeek);
 };
 const save=async()=>{
  if(savingGate.current||!form)return;savingGate.current=true;setSaving(true);setSaveError('');
  try{
   if(selected?.source.kind==='social'){
    await perform({operation:'source_move',source:selected.source,localMinute:form.startDate+'T'+form.startTime});
   }else{
    const draft=draftForForm(form),source=selected?.source;
    const body:CalendarMutation=source?.kind==='manual'?{operation:'update',eventId:source.eventId,expectedVersion:source.version,idempotencyKey:write.current.key,draft}:{operation:'create',eventId:write.current.eventId,idempotencyKey:write.current.key,draft};
    await perform(parseCalendarMutation(body));
   }
  }catch(error){if(mounted.current)setSaveError(failure((error as {code?:string}).code??''));}
  finally{savingGate.current=false;if(mounted.current)setSaving(false);}
 };
 const changeStatus=async(operation:'cancel'|'restore')=>{
  if(savingGate.current||selected?.source.kind!=='manual')return;
  savingGate.current=true;setSaving(true);setSaveError('');
  try{await perform(parseCalendarMutation({operation,eventId:selected.source.eventId,expectedVersion:selected.source.version,idempotencyKey:write.current.key}));}
  catch(error){if(mounted.current)setSaveError(failure((error as {code?:string}).code??''));}
  finally{savingGate.current=false;if(mounted.current)setSaving(false);}
 };
 return {userId,week,range:weekRange(week),model,selectedDay,setSelectedDay,loading,readError,saveError,saving,notice,filter,setFilter,panelOpen,form,selected,patchForm,newEvent,selectEntry,save,changeStatus,closePanel:()=>setPanelOpen(false),discard:()=>{setPanelOpen(false);setForm(null);setSelected(null);setSaveError('');},resume:()=>setPanelOpen(true),reload:()=>void loadWeek(week),previous:()=>changeWeek(addCalendarDays(week,-7)),next:()=>changeWeek(addCalendarDays(week,7)),today:()=>changeWeek(stockholmDate(new Date().toISOString()))};
}
export type CalendarWorkspaceState=ReturnType<typeof useCalendarWorkspace>;
