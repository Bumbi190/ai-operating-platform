import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {WeekProposalEditor} from '../../components/calendar/WeekProposalEditor';
import {adjustWeekProposal} from './week-adjust';
import {preflightWeekApproval} from './week-approval';
import {proposeCalendarWeek} from './week-proposal';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarWeekModel} from './types';

const fixture=():CalendarWeekModel=>({
 range:weekRange('2026-10-19'),entries:[],
 projects:[{id:'owner',name:'Ägarprojekt',color:'#fff'}],
 unscheduledTasks:[{id:'task',projectId:'owner',title:'Granska sidan',status:'pending',source:'manual',createdAt:null}],
 availability:{manual:true,social:true,workflows:true,tasks:true},
 truncated:{manual:false,social:false,workflows:false,tasks:false}
});
describe('calendar weekly read-only integration against newer main',()=>{
 it('offers a local edit but no approval, save or booking control',()=>{
  const html=renderToStaticMarkup(createElement(WeekProposalEditor,{model:fixture()}));
  expect(html).toContain('Förslag på veckoplan');
  expect(html).toContain('Flytta förslag');
  expect(html).toContain('Kontrollera utkast (bokar inget)');
  expect(html).toContain('inget bokas, sparas eller godkänns');
  expect(html).not.toMatch(/type="submit"|Godkänn plan|Boka vecka/);
 });
 it('shows a blocker rather than an edit on incomplete sources',()=>{
  const model=fixture();model.availability.manual=false;
  const html=renderToStaticMarkup(createElement(WeekProposalEditor,{model}));
  expect(html).toContain('underlag är ofullständigt');
  expect(html).not.toContain('Flytta förslag');
  expect(html).not.toContain('Kontrollera utkast (bokar inget)');
 });
 it('refuses editing a proposal when its project is outside the filtered authorized scope',()=>{
  const model=fixture(),slots=proposeCalendarWeek(model).proposals;
  model.projects=[];
  expect(adjustWeekProposal(model,slots,'task','2026-10-20T11:00')).toEqual({ok:false,reason:'UNKNOWN_TASK'});
 });
 it('keeps private busy time in conflict calculations',()=>{
  const model=fixture(),slots=proposeCalendarWeek(model).proposals;
  model.entries=[{id:'private',source:{kind:'manual',eventId:'private',version:1},title:'Privat',projectId:null,status:'scheduled',editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:resolveCalendarLocal('2026-10-20T11:00'),endUtc:resolveCalendarLocal('2026-10-20T12:00'),timeZone:'Europe/Stockholm'}}];
  const before=JSON.stringify(model);
  expect(adjustWeekProposal(model,slots,'task','2026-10-20T11:30')).toEqual({ok:false,reason:'CONFLICT'});
  expect(JSON.stringify(model)).toBe(before);
 });
 it('preflight does not mutate proposed slots and rejects a forged project',()=>{
  const model=fixture(),slots=proposeCalendarWeek(model).proposals;
  const before=JSON.stringify({model,slots});
  expect(preflightWeekApproval(model,slots)).toEqual({ok:true,count:1});
  expect(preflightWeekApproval(model,[{...slots[0],projectId:'someone-else'}])).toEqual({ok:false,reason:'INVALID_PROPOSAL'});
  expect(JSON.stringify({model,slots})).toBe(before);
 });
 it('retains current main calendar safety gates and existing UI',()=>{
  const code=readFileSync(resolve(process.cwd(),'components/calendar/CalendarWorkspace.tsx'),'utf8');
  expect(code).toContain("s.sessionReady&&!s.loading&&!s.readError&&s.filter!=='private'");
  expect(code).toContain("projects: s.filter === 'private' ? [] : s.model.projects.filter");
  expect(code).toContain('<WeekProposalEditor');
  expect(code).toContain('model={previewModel}');
  expect(code).toContain('<CalendarAttention entries={entries}');
  expect(code).toContain('<CalendarDecisions week={s.week}');
  expect(code).not.toContain('calendar_event_apply');
 });
});
