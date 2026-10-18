import * as React from 'react'
import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {HandlarborsenWeeklyReport} from '@/components/platform/vnext/HandlarborsenWeeklyReport'
import {evaluateCompetitorHistory,type HistoryRecord} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
;(globalThis as unknown as {React:typeof React}).React=React
const now=new Date('2026-10-18T03:45:00.000Z')
const row=(checkedAt:string,title:string|null,status='metadata_checked'):HistoryRecord=>({sourceId:'auto1',checkedAt,title,status})
const render=(rows:HistoryRecord[]|null,enabled=true)=>renderToStaticMarkup(React.createElement(HandlarborsenWeeklyReport,{enabled,history:rows?evaluateCompetitorHistory(rows,now):null,asOf:now}))
describe('weekly evidence panel',()=>{
 it('keeps disabled and failed history reads distinct and never shows invented counts',()=>{
  expect(render(null,false)).toContain('Historikläsning är avstängd')
  const failed=render(null);expect(failed).toContain('Veckounderlaget kunde inte verifieras');expect(failed).not.toContain('<dl')
 })
 it('shows an empty current week without saying there were no changes',()=>{
  const html=render([]);expect(html).toContain('Inga sparade kontroller denna vecka')
  expect(html).toContain('Ej jämförbart');expect(html).not.toContain('Inga förändringar')
 })
 it('separates title metadata, interpretation and review action with dated source links',()=>{
  const html=render([row('2026-10-15T10:00:00.000Z','Before'),row('2026-10-17T10:00:00.000Z','After')])
  for(const text of ['Veckounderlag','Vad har observerats?','Vad betyder det för Handlarbörsen?','Atlas föreslår nästa granskning','Sidtitlar','Hittills denna vecka','Automatisk bevakning är avstängd'])expect(html).toContain(text)
  expect(html).toContain('https://www.auto1.com/sv/home');expect(html).toContain('2026-10-15T10:00:00.000Z');expect(html).toContain('2026-10-17T10:00:00.000Z')
  expect(html).not.toMatch(/<button|<form|<input|<script/)
 })
 it('dates an observed difference without claiming when the underlying change happened',()=>{
  const html=render([row('2026-10-11T10:00:00.000Z','Before'),row('2026-10-15T10:00:00.000Z','After')])
  expect(html).toContain('Titelskillnader observerade denna vecka')
  expect(html).toContain('inte när ändringen skedde')
  expect(html).toContain('2026-10-11T10:00:00.000Z')
 })
 it('does not claim new commercial offers from title words',()=>{
  const html=render([row('2026-10-15T10:00:00.000Z','Before'),row('2026-10-17T10:00:00.000Z','Nytt pris 500 kr')])
  expect(html).toContain('verifierar inte nya priser');expect(html).toContain('Förslag att granska')
 })
 it('shows a failed source and its real check date as a gap',()=>{
  const html=render([row('2026-10-17T10:00:00.000Z',null,'robots_unavailable')])
  expect(html).toContain('Kunde inte verifieras');expect(html).toContain('2026-10-17T10:00:00.000Z')
 })
 it('escapes valid entity-like title text, ampersands and quotes',()=>{
  const html=render([row('2026-10-17T10:00:00.000Z','&lt;img src=x&gt; \"quoted\" & safe')])
  expect(html).toContain('&amp;lt;img src=x&amp;gt;');expect(html).toContain('&quot;quoted&quot; &amp; safe');expect(html).not.toContain('<img')
 })
 it('rejects malformed title payloads',()=>{
  expect(render([row('2026-10-17T10:00:00.000Z','<img src=x onerror=alert(1)>')])).not.toContain('<img')
 })
})
