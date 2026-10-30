import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {CalendarWeek} from '../../components/calendar/CalendarWeek';
import {CalendarAttention} from '../../components/calendar/CalendarAttention';
import type {CalendarEntry} from './types';
import {weekRange} from './time';
// Existing TSX components rely on Next's automatic JSX runtime. Vitest's
// minimal transform uses the classic runtime for server-rendered fixtures.
Object.assign(globalThis,{React});
const e:CalendarEntry={id:'social:1',source:{kind:'social',projectId:'p',postId:'post',revisionId:'r',sha256:'a'.repeat(64),jobId:'j'},title:'Familjeinlägg',projectId:'p',status:'published',editable:false,href:'/project',pendingChange:null,time:{kind:'all_day',startDate:'2026-10-23',endDateExclusive:'2026-10-24',timeZone:'Europe/Stockholm'}};
it('renders unverified publication orange and includes readable status in the event name',()=>{
 const html=renderToStaticMarkup(<CalendarWeek entries={[e]} range={weekRange('2026-10-19')} projects={[]} selectedDay="2026-10-23" onDay={()=>{}} onSelect={()=>{}} onCreate={()=>{}}/>);
 expect(html).toContain('data-tone="review"');expect(html).toContain('Familjeinlägg · Heldag · Publicering behöver bekräftas');
 expect(html).not.toContain('data-tone="success" title=');
});
it('calendar attention links back to the affected post and does not imply push delivery',()=>{
 const html=renderToStaticMarkup(<CalendarAttention entries={[e,e]} onSelect={()=>{}}/>);
 expect(html).toContain('Behöver din uppmärksamhet (1)');expect(html).toContain('Öppna kalendernotis: Familjeinlägg');
 expect(html).not.toContain('Publicerat');
});
it('completed or cancelled entries do not leave stale attention items',()=>{
 expect(renderToStaticMarkup(<CalendarAttention entries={[{...e,status:'cancelled'}]} onSelect={()=>{}}/>)).toBe('');
});
