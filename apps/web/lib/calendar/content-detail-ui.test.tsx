import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CalendarWeek} from '../../components/calendar/CalendarWeek';
import {CalendarEventPanel} from '../../components/calendar/CalendarEventPanel';
import type {CalendarEntry} from './types';
import {weekRange} from './time';
Object.assign(globalThis,{React});
const entry:CalendarEntry={id:'media:p:s',source:{kind:'media',projectId:'p',scriptId:'s'},title:'Dagens film',dateBasis:'approval',displayLabel:'Utan klockslag',time:{kind:'all_day',startDate:'2026-10-26',endDateExclusive:'2026-10-27',timeZone:'Europe/Stockholm'},projectId:'p',status:'media_waiting',editable:false,href:'/scripts',pendingChange:null};
it('shows a compact clickable untimed film rather than claiming a full-day booking',()=>{
 const html=renderToStaticMarkup(<CalendarWeek entries={[entry]} range={weekRange('2026-10-26')} projects={[]} selectedDay="2026-10-26" onDay={()=>{}} onSelect={()=>{}} onCreate={()=>{}}/>);
 expect(html).toContain('Dagens film · Utan klockslag · Godkänt · väntar');expect(html).not.toContain('Dagens film · Heldag');
});
it('renders selected film detail reader in the sidebar without render/publish/time-edit controls',()=>{
 const state={selected:entry,form:null,userId:'u',closePanel:()=>{},saveError:'',model:{projects:[]}} as any;
 const html=renderToStaticMarkup(<CalendarEventPanel state={state}/>);expect(html).toContain('Läser innehållet');expect(html).not.toMatch(/Publicera nu|Föreslå ny tid|Starta rendering/);
});
