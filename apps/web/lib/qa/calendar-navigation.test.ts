import {it,expect} from 'vitest';
import {resolveDestination,pathToDestination} from '../nav/registry';
import {vnextNavItemsFor} from '../nav/vnext-nav';
import {resolveWorkspace} from '../atlas/workspace-registry';
import {calendarWeekFromParam} from '../calendar/time';
it('resolves Kalender independently of Planering on desktop, mobile and Atlas',()=>{
 expect(resolveDestination('calendar' as never)).toMatchObject({id:'calendar',label:'Kalender',href:'/calendar'});
 expect(pathToDestination('/calendar')).toBe('calendar');
 for(const surface of ['desktop','mobile'] as const)expect(vnextNavItemsFor(surface).some(i=>i.id==='calendar' as never&&i.href==='/calendar')).toBe(true);
 expect(resolveWorkspace('/calendar')).toMatchObject({label:'Kalender',icon:'calendar'});
 expect(resolveDestination('planning')?.href).toBe('/planning');
});
it('uses the Stockholm current day and accepts only a valid Monday parameter',()=>{
 expect(calendarWeekFromParam(undefined,'2026-10-18T22:30:00.000Z').fromDate).toBe('2026-10-19');
 expect(calendarWeekFromParam('2026-10-19','2026-10-18T12:00:00.000Z').fromDate).toBe('2026-10-19');
 for(const value of ['2026-02-30','2026-10-20',['2026-10-19'],'https://evil.test'])expect(()=>calendarWeekFromParam(value,'2026-10-18T12:00:00.000Z')).toThrow();
});
