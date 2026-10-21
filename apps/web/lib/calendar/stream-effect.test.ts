import {it,expect} from 'vitest';
import {decodeCalendarEffect,calendarChangedForResult} from './stream-effect';
const id='11111111-1111-4111-8111-111111111111';
const effect={event:'calendar_changed',conversationId:id,mutationId:id,eventId:id,version:1,calendarHref:'/calendar?week=2026-10-19'};
it('accepts only a bounded effect for the current owned conversation',()=>{
 expect(decodeCalendarEffect(effect,id)).toEqual(effect);
 for(const patch of [{conversationId:'22222222-2222-4222-8222-222222222222'},{version:0},{eventId:'bad'},{calendarHref:'/calendar?week=2026-10-20'},{calendarHref:'https://evil.test/calendar'},{calendarHref:'/calendar?week=2026-02-30'},{calendarHref:'/calendar?week=2026-10-19&owner=other'}])
  expect(decodeCalendarEffect({...effect,...patch},id)).toBeNull();
});
it('builds an effect only from a successful saved mutation tool receipt',()=>{
 const receipt={ok:true,mutationId:id,event:{id,version:1},calendarHref:effect.calendarHref};
 expect(calendarChangedForResult('create_calendar_event',receipt,id)).toEqual(effect);
 expect(calendarChangedForResult('get_calendar',receipt,id)).toBeNull();
 expect(calendarChangedForResult('create_calendar_event',{ok:false},id)).toBeNull();
 expect(decodeCalendarEffect({event:'tool_result',result:effect},id)).toBeNull();
 expect(decodeCalendarEffect({event:'text',text:JSON.stringify(effect)},id)).toBeNull();
});
