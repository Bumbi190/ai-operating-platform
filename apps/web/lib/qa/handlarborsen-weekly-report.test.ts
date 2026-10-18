import {describe,it,expect} from 'vitest'
import {buildWeeklyCompetitorReport} from '@/lib/atlas/project-analytics/handlarborsen-weekly-report'
import type {HistoryRecord} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-core'
const now=new Date('2026-10-18T03:45:00.000Z')
const row=(sourceId='auto1',checkedAt='2026-10-17T10:00:00.000Z',title:string|null='Same title',status='metadata_checked'):HistoryRecord=>({sourceId,checkedAt,title,status})
const build=(rows:readonly HistoryRecord[],at=now)=>{const r=buildWeeklyCompetitorReport(rows,at);expect(r.status).toBe('ok');if(r.status!=='ok')throw Error('invalid fixture');return r}
describe('read-only weekly competitor evidence report',()=>{
 it('uses a Stockholm calendar week and never authorizes execution',()=>{
  const r=build([]);expect(r.period).toEqual({start:'2026-10-12',endExclusive:'2026-10-19',asOf:now.toISOString()})
  expect(r.automaticActive).toBe(false);expect(r.executionAllowed).toBe(false)
 })
 it('moves to the next week at local midnight, not UTC midnight',()=>{
  expect(build([],new Date('2026-10-18T21:59:59.000Z')).period.start).toBe('2026-10-12')
  expect(build([],new Date('2026-10-18T22:00:00.000Z')).period.start).toBe('2026-10-19')
 })
 it.each([
  ['2026-03-29T22:00:00.000Z','2026-03-30','2026-04-06'],
  ['2026-10-25T23:00:00.000Z','2026-10-26','2026-11-02'],
  ['2027-01-03T23:00:00.000Z','2027-01-04','2027-01-11'],
 ])('keeps Monday calendar dates across DST and year changes %s',(at,start,end)=>{
  expect(build([],new Date(at)).period).toMatchObject({start,endExclusive:end})
 })
 it('marks absent week checks as unknown and supplies no fabricated proposal',()=>{
  const r=build([]);expect(r.observedSources).toBe(0);expect(r.sources).toHaveLength(6)
  expect(r.sources.every(s=>s.state==='missing')).toBe(true);expect(r.titleChangeCount).toBeNull();expect(r.suggestions).toEqual([])
 })
 it('does not describe an older observation as a current-week check',()=>{
  const r=build([row('auto1','2026-10-11T18:00:00.000Z')]);const s=r.sources.find(s=>s.id==='auto1')!
  expect(s.state).toBe('missing');expect(s.latest).toBeNull();expect(r.observedSources).toBe(0)
 })
 it('counts a Sunday UTC observation after Stockholm Monday midnight in the new week',()=>{
  const r=build([row('auto1','2026-10-18T22:05:00.000Z')],new Date('2026-10-18T22:10:00.000Z'))
  expect(r.period.start).toBe('2026-10-19');expect(r.observedSources).toBe(1)
 })
 it('requires a successful baseline and never labels a first title as a change',()=>{
  const r=build([row()]);expect(r.sources.find(s=>s.id==='auto1')?.state).toBe('baseline_missing')
  expect(r.changes).toEqual([]);expect(r.titleChangeCount).toBeNull()
  expect(r.suggestions[0]).toMatchObject({kind:'baseline',executionAllowed:false})
 })
 it('retains source URL, both titles and exact dates for an observed title change',()=>{
  const r=build([row('auto1','2026-10-15T10:00:00.000Z','Before'),row('auto1','2026-10-17T10:00:00.000Z','After')])
  expect(r.changes).toHaveLength(1);expect(r.changes[0]).toMatchObject({sourceId:'auto1',url:'https://www.auto1.com/sv/home',previous:{title:'Before',checkedAt:'2026-10-15T10:00:00.000Z'},current:{title:'After',checkedAt:'2026-10-17T10:00:00.000Z'}})
  expect(r.titleChangeCount).toBe(1);expect(r.suggestions[0]).toMatchObject({kind:'title_review',executionAllowed:false})
  expect(r.suggestions[0].evidence).toHaveLength(2)
 })
 it('can use a prior-week baseline without reporting a prior-week change as this week',()=>{
  const r=build([row('auto1','2026-10-09T10:00:00.000Z','Old'),row('auto1','2026-10-11T10:00:00.000Z','Before'),row('auto1','2026-10-15T10:00:00.000Z','After')])
  expect(r.changes).toHaveLength(1);expect(r.changes[0].previous.checkedAt).toBe('2026-10-11T10:00:00.000Z')
 })
 it('reports unchanged titles narrowly, not unchanged prices or features',()=>{
  const r=build([row('auto1','2026-10-15T10:00:00.000Z'),row()])
  expect(r.titleChangeCount).toBe(0);expect(r.comparableSources).toBe(1);expect(r.suggestions).toEqual([])
 })
 it('marks a failed latest check unknown instead of carrying an older success forward',()=>{
  const r=build([row('auto1','2026-10-15T10:00:00.000Z'),row('auto1','2026-10-17T10:00:00.000Z',null,'fetch_failed')])
  expect(r.sources.find(s=>s.id==='auto1')?.state).toBe('unavailable');expect(r.comparableSources).toBe(0);expect(r.titleChangeCount).toBeNull()
  expect(r.suggestions[0]).toMatchObject({kind:'source_gap'});expect(r.suggestions[0].evidence[0].title).toBeNull()
 })
 it('does not bridge a failed intervening check to manufacture a comparison',()=>{
  const r=build([row('auto1','2026-10-14T10:00:00.000Z','Before'),row('auto1','2026-10-15T10:00:00.000Z',null,'http_error'),row('auto1','2026-10-17T10:00:00.000Z','After')])
  expect(r.changes).toEqual([]);expect(r.titleChangeCount).toBeNull();expect(r.sources.find(s=>s.id==='auto1')?.state).toBe('baseline_missing')
 })
 it('keeps an earlier dated change even if a later check fails',()=>{
  const r=build([row('auto1','2026-10-14T10:00:00.000Z','Before'),row('auto1','2026-10-15T10:00:00.000Z','After'),row('auto1','2026-10-17T10:00:00.000Z',null,'http_error')])
  expect(r.changes).toHaveLength(1);expect(r.sources.find(s=>s.id==='auto1')?.state).toBe('unavailable');expect(r.comparableSources).toBe(0)
 })
 it('is deterministic under input reordering and caps review suggestions at three',()=>{
  const ids=['auto1','bca','autoproff','battery-vdn-2025']
  const rows=ids.flatMap(id=>[row(id,'2026-10-15T10:00:00.000Z','Before'),row(id,'2026-10-17T10:00:00.000Z','After')])
  const r=build(rows);expect(r).toEqual(build([...rows].reverse()));expect(r.suggestions).toHaveLength(3);expect(r.changes).toHaveLength(4)
 })
 it.each([
  [row('foreign')],[row('auto1','2026-10-19T10:00:00.000Z')],[row('auto1','2026-09-01T10:00:00.000Z')],[row('auto1','2026-10-17T10:00:00.000Z','<img onerror=x>')],[row(),row()],
 ].map(rows=>[rows]))('refuses malformed, foreign, future, stale or duplicate evidence',(rows)=>{
  expect(buildWeeklyCompetitorReport(rows,now)).toEqual({status:'unavailable'})
 })
 it('refuses unavailable history and an invalid report clock',()=>{
  expect(buildWeeklyCompetitorReport(null,now)).toEqual({status:'unavailable'})
  expect(buildWeeklyCompetitorReport([],new Date('invalid'))).toEqual({status:'unavailable'})
 })
})
