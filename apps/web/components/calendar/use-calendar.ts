'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useAtlasConversation} from '@/lib/atlas/conversation/provider';
import type {CalendarEntry,CalendarEvent,CalendarEventDraft,CalendarMutation,CalendarRange,CalendarWeekModel} from '@/lib/calendar/types';
import {addCalendarDays,resolveCalendarLocal,stockholmDate,stockholmMinute,weekRange} from '@/lib/calendar/time';
import {parseCalendarMutation} from '@/lib/calendar/validate';

export type CalendarForm={title:string;description:string;location:string;kind:'private'|'work_block';projectId:string;taskId:string;workStatus:'planned'|'in_progress'|'done';allDay:boolean;noEnd:boolean;startDate:string;startTime:string;endDate:string;endTime:string;repeat:'none'|'daily'|'weekly';repeatUntil:string};
const hhmm=(minute:number)=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
function blankForm(date:string,minute=9*60):CalendarForm{return {title:'',description:'',location:'',kind:'private',projectId:'',taskId:'',workStatus:'planned',allDay:false,noEnd:true,startDate:date,startTime:hhmm(minute),endDate:date,endTime:'',repeat:'none',repeatUntil:''};}
function formForEvent(event:CalendarEvent):CalendarForm {
 const t=event.time;
 const local=t.kind==='timed'?stockholmMinute(t.startUtc):t.startDate+'T09:00';
 const end=t.kind==='timed'&&t.endUtc?stockholmMinute(t.endUtc):null;
 return {...blankForm(local.slice(0,10)),title:event.title,description:event.description,location:event.location,kind:event.kind,projectId:event.projectId??'',taskId:event.taskId??'',workStatus:event.workStatus??'planned',allDay:t.kind==='all_day',noEnd:t.kind==='timed'&&t.endUtc===null,startTime:local.slice(11,16),endDate:t.kind==='all_day'?addCalendarDays(t.endDateExclusive,-1):end?.slice(0,10)??local.slice(0,10),endTime:end?.slice(11,16)??''};
}
function draftForForm(form:CalendarForm,original?:CalendarEvent):CalendarEventDraft {
 const saved=original?.time.kind==='timed'?original.time:null;
 // Unchanged wall-minute controls retain the known instant, including seconds and DST-fold identity.
 const instant=(local:string,previous:string|null|undefined)=>previous&&stockholmMinute(previous)===local?previous:resolveCalendarLocal(local);
 const time=form.allDay?{kind:'all_day' as const,startDate:form.startDate,endDateExclusive:addCalendarDays(form.endDate,1),timeZone:'Europe/Stockholm' as const}:{kind:'timed' as const,startUtc:instant(form.startDate+'T'+form.startTime,saved?.startUtc),endUtc:form.noEnd?null:instant(form.endDate+'T'+form.endTime,saved?.endUtc),timeZone:'Europe/Stockholm' as const};
 return {kind:form.kind,title:form.title,description:form.description,location:form.location,projectId:form.projectId||null,taskId:form.taskId||null,time,workStatus:form.kind==='work_block'?form.workStatus:null};
}
function emptyWeek(range:CalendarRange,projects:CalendarWeekModel['projects']):CalendarWeekModel{return {range,entries:[],unscheduledTasks:[],projects,availability:{manual:false,social:false,workflows:false,tasks:false},truncated:{manual:false,social:false,workflows:false,tasks:false}};}
function failure(code:string,read=false):string {
 if(code==='CONFLICT')return 'Händelsen har ändrats sedan du öppnade den. Läs om veckan och öppna händelsen igen.';
 if(code==='UNAUTHORIZED')return 'Sessionen har gått ut. Logga in igen.';
 if(code==='INVALID_INPUT')return 'Kontrollera titel, datum och tider. Sluttiden måste vara efter starten. En tid vid sommartidsbyte kan behöva ändras.';
 return read?'Veckan kunde inte läsas. Försök igen.':'Händelsen kunde inte sparas. Dina ändringar finns kvar. Försök igen.';
}
type Attempt={ownerGeneration:number;editorGeneration:number};
export function useCalendarWorkspace(initialWeek:CalendarWeekModel,userId:string){
 const {controller}=useAtlasConversation();
 const [week,setWeek]=useState(initialWeek.range.fromDate),[model,setModel]=useState(initialWeek);
 const [selectedDay,setSelectedDay]=useState(()=>{const today=stockholmDate(new Date().toISOString());return today>=initialWeek.range.fromDate&&today<initialWeek.range.toDateExclusive?today:initialWeek.range.fromDate;});
 const [loading,setLoading]=useState(false),[readError,setReadError]=useState(''),[saveError,setSaveError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[sessionReady,setSessionReady]=useState(true);
 const [filter,setFilter]=useState('all'),[panelOpen,setPanelOpen]=useState(false),[form,setForm]=useState<CalendarForm|null>(null),[selected,setSelected]=useState<CalendarEntry|null>(null);
 const mounted=useRef(true),owner=useRef<string|null>(userId),ownerGeneration=useRef(0),editorGeneration=useRef(0),currentWeek=useRef(week);
 const sequence=useRef(0),abort=useRef<AbortController|null>(null),savingGate=useRef(false),savingEditor=useRef<number|null>(null);
 const write=useRef<{eventId:string;key:string;payload:string|null}>({eventId:'',key:'',payload:null});
 const active=()=>mounted.current&&owner.current===userId;
 const owns=(attempt:Attempt)=>active()&&attempt.ownerGeneration===ownerGeneration.current;
 useEffect(()=>{mounted.current=true;owner.current=userId;return()=>{mounted.current=false;owner.current=null;ownerGeneration.current++;sequence.current++;abort.current?.abort();};},[userId]);
 const loadWeek=useCallback(async(target:string)=>{
  if(owner.current!==userId||!mounted.current)return;
  const range=weekRange(target),current=++sequence.current,generation=ownerGeneration.current;
  const isCurrent=()=>mounted.current&&owner.current===userId&&generation===ownerGeneration.current&&current===sequence.current;
  abort.current?.abort();const request=new AbortController();abort.current=request;
  setLoading(true);setReadError('');
  setModel(old=>old.range.fromDate===target?old:emptyWeek(range,old.projects));
  try{
   const response=await fetch('/api/calendar?fromDate='+range.fromDate+'&toDateExclusive='+range.toDateExclusive,{signal:request.signal,cache:'no-store'});
   const value=await response.json();
   if(!response.ok)throw Object.assign(Error(),{code:value.code});
   if(!value||value.range?.fromDate!==target||!Array.isArray(value.entries)||!Array.isArray(value.projects))throw Error();
   if(isCurrent())setModel(value);
  }catch(error){
   if(isCurrent()&&!request.signal.aborted)setReadError(failure((error as {code?:string}).code??'',true));
  }finally{if(isCurrent())setLoading(false);}
 },[userId]);
 useEffect(()=>{
  const {data}=createClient().auth.onAuthStateChange((_event,session)=>{
   const next=session?.user.id??null;
   if(next===userId&&owner.current===userId)return;
   ownerGeneration.current++;editorGeneration.current++;sequence.current++;abort.current?.abort();
   owner.current=next===userId?userId:null;savingGate.current=false;savingEditor.current=null;
   write.current={eventId:'',key:'',payload:null};
   setModel(emptyWeek(weekRange(currentWeek.current),[]));setFilter('all');setForm(null);setSelected(null);setPanelOpen(false);
   setLoading(false);setSaving(false);setReadError('');setSaveError('');setSessionReady(next===userId);
   setNotice(next===userId?'':'Sessionen har ändrats. Ladda om sidan för att öppna rätt kalender.');
   if(next===userId)void loadWeek(currentWeek.current);
  });
  return()=>data.subscription.unsubscribe();
 },[userId,loadWeek]);
 useEffect(()=>{currentWeek.current=week;void loadWeek(week);const url=new URL(window.location.href);url.searchParams.set('week',week);window.history.replaceState(null,'',url.pathname+url.search);},[week,loadWeek]);
 useEffect(()=>controller.subscribeCalendarChanged(()=>{if(owner.current!==userId)return;setNotice('Atlas uppdaterade kalendern.');void loadWeek(currentWeek.current);}),[controller,loadWeek,userId]);
 const changeWeek=(date:string)=>{
  const next=weekRange(date).fromDate;currentWeek.current=next;sequence.current++;abort.current?.abort();setSelectedDay(date);setWeek(next);
  if(next===week)void loadWeek(next);
 };
 const newEvent=(date=selectedDay,minute=9*60,task?:CalendarWeekModel['unscheduledTasks'][number])=>{
  if(!active())return;
  if(form&&!panelOpen&&!task){setPanelOpen(true);return;}
  editorGeneration.current++;setSelected(null);setForm({...blankForm(date,minute),...(task?{title:task.title,kind:'work_block' as const,projectId:task.projectId,taskId:task.id}:{})});
  write.current={eventId:crypto.randomUUID(),key:crypto.randomUUID(),payload:null};setSaveError('');setPanelOpen(true);
 };
 const selectEntry=(entry:CalendarEntry)=>{
  if(!active())return;
  editorGeneration.current++;setSelected(entry);setSaveError('');setPanelOpen(true);
  write.current={eventId:entry.source.kind==='manual'?entry.source.eventId:'',key:crypto.randomUUID(),payload:null};
  if(entry.source.kind==='manual'){
   setForm(entry.manualEvent?formForEvent(entry.manualEvent):null);
   if(!entry.manualEvent)setSaveError('Händelsens detaljer kunde inte läsas. Läs om veckan.');
  }else if(entry.source.kind==='social'&&entry.editable&&entry.time.kind==='timed'){
   const local=stockholmMinute(entry.pendingChange?.time.kind==='timed'?entry.pendingChange.time.startUtc:entry.time.startUtc);
   setForm({...blankForm(local.slice(0,10)),title:entry.title,startTime:local.slice(11,16)});
  }else setForm(null);
 };
 const patchForm=(patch:Partial<CalendarForm>)=>{
  if(!active()||(savingGate.current&&savingEditor.current===editorGeneration.current))return;
  setForm(old=>{
   if(!old)return old;
   const next={...old,...patch};
   if(patch.startDate&&old.endDate===old.startDate)next.endDate=patch.startDate;
   if(patch.projectId!==undefined&&patch.projectId!==old.projectId)next.taskId='';
   return next;
  });
 };
 const perform=async(body:Record<string,unknown>,attempt:Attempt)=>{
  const payload=JSON.stringify({...body,idempotencyKey:undefined});
  if(write.current.payload!==null&&write.current.payload!==payload)write.current.key=crypto.randomUUID();
  write.current.payload=payload;
  const response=await fetch('/api/calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,idempotencyKey:write.current.key})});
  const receipt=await response.json();if(!response.ok||receipt.ok!==true)throw Object.assign(Error(),{code:receipt.code});
  if(!owns(attempt))return;
  setNotice(receipt.reviewRequired?'Tidsförslaget är sparat och behöver granskas.':'Händelsen är sparad.');
  if(attempt.editorGeneration===editorGeneration.current){setPanelOpen(false);setForm(null);setSelected(null);setSaveError('');}
  void loadWeek(currentWeek.current);
 };
 const save=async()=>{
  if(!active()||savingGate.current||!form)return;
  if(selected?.source.kind!=='social'&&form.repeat!=='none'){
   setSaveError('Återkommande bokningar är inte aktiverade i databasen ännu. Välj Ingen för att spara ett engångsmöte.');
   return;
  }
  const attempt={ownerGeneration:ownerGeneration.current,editorGeneration:editorGeneration.current};
  savingGate.current=true;savingEditor.current=attempt.editorGeneration;setSaving(true);setSaveError('');
  try{
   if(selected?.source.kind==='social'){
    await perform({operation:'source_move',source:selected.source,localMinute:form.startDate+'T'+form.startTime},attempt);
   }else{
    const draft=draftForForm(form,selected?.manualEvent),source=selected?.source;
    const body:CalendarMutation=source?.kind==='manual'?{operation:'update',eventId:source.eventId,expectedVersion:source.version,idempotencyKey:write.current.key,draft}:{operation:'create',eventId:write.current.eventId,idempotencyKey:write.current.key,draft};
    await perform(parseCalendarMutation(body),attempt);
   }
  }catch(error){if(owns(attempt)&&attempt.editorGeneration===editorGeneration.current)setSaveError(failure((error as {code?:string}).code??''));}
  finally{if(owns(attempt)){savingGate.current=false;savingEditor.current=null;setSaving(false);}}
 };
 const changeStatus=async(operation:'cancel'|'restore')=>{
  if(!active()||savingGate.current||selected?.source.kind!=='manual')return;
  const attempt={ownerGeneration:ownerGeneration.current,editorGeneration:editorGeneration.current};
  savingGate.current=true;savingEditor.current=attempt.editorGeneration;setSaving(true);setSaveError('');
  try{await perform(parseCalendarMutation({operation,eventId:selected.source.eventId,expectedVersion:selected.source.version,idempotencyKey:write.current.key}),attempt);}
  catch(error){if(owns(attempt)&&attempt.editorGeneration===editorGeneration.current)setSaveError(failure((error as {code?:string}).code??''));}
  finally{if(owns(attempt)){savingGate.current=false;savingEditor.current=null;setSaving(false);}}
 };
 return {userId,week,range:weekRange(week),model,selectedDay,setSelectedDay,loading,readError,saveError,saving,editorSaving:saving&&savingEditor.current===editorGeneration.current,sessionReady,notice,filter,setFilter,panelOpen,form,selected,patchForm,newEvent,selectEntry,save,changeStatus,closePanel:()=>setPanelOpen(false),discard:()=>{editorGeneration.current++;setPanelOpen(false);setForm(null);setSelected(null);setSaveError('');},resume:()=>{if(active())setPanelOpen(true)},reload:()=>void loadWeek(currentWeek.current),previous:()=>changeWeek(addCalendarDays(week,-7)),next:()=>changeWeek(addCalendarDays(week,7)),today:()=>changeWeek(stockholmDate(new Date().toISOString()))};
}
export type CalendarWorkspaceState=ReturnType<typeof useCalendarWorkspace>;
