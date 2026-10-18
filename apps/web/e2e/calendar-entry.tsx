import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarWorkspace} from '../components/calendar/CalendarWorkspace';
import type {CalendarWeekModel} from '../lib/calendar/types';
const A='20000000-0000-4000-8000-000000000001',B='20000000-0000-4000-8000-000000000002';
const week=new URLSearchParams(location.search).get('week')??'2026-10-19',end=new Date(week+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+7);
const url='/api/calendar?fromDate='+week+'&toDateExclusive='+end.toISOString().slice(0,10);
const initial=await fetch(url).then(r=>r.json()) as CalendarWeekModel;
const preview=new URLSearchParams(location.search).get('preview')==='1';
function Fixture(){
 const [user,setUser]=useState(/calendar_test_user=([a-f0-9-]+)/.exec(document.cookie)?.[1]??A),[model,setModel]=useState(initial);
 return <><div style={{padding:'6px 20px',background:'#112235'}}>{preview?<span style={{fontSize:12,color:'#b8cddc'}}>Förhandsvisning med exempelposter · inget ändras i din riktiga kalender</span>:<button onClick={()=>{const next=user===A?B:A;document.cookie='calendar_test_user='+next+'; Path=/';setModel({...model,entries:[],unscheduledTasks:[]});setUser(next);}}>Byt testkonto</button>}</div><CalendarWorkspace initialWeek={model} userId={user}/></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
