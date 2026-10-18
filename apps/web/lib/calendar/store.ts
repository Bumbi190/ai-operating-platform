import 'server-only';
import {CalendarError,type CalendarDb,type CalendarRange,type CalendarEventPage,type CalendarMutation,type CalendarReceipt,type CalendarFailure} from './types';
import {parseCalendarRange,parseCalendarMutation} from './validate';
const codes:CalendarFailure['code'][]=['UNAUTHORIZED','NOT_FOUND','INVALID_INPUT','CONFLICT','UNAVAILABLE'];
function result<T>(data:unknown,error:unknown):T {
 if(error||!data||typeof data!=='object')throw new CalendarError('UNAVAILABLE');
 const failed=data as CalendarFailure;
 if(failed.ok===false)throw new CalendarError(codes.includes(failed.code)?failed.code:'UNAVAILABLE');
 return data as T;
}
export async function listCalendarEvents(db:CalendarDb,range:CalendarRange):Promise<CalendarEventPage>{
 const {data,error}=await db.rpc('calendar_event_list',{p_input:parseCalendarRange(range)});
 return result<CalendarEventPage>(data,error);
}
export async function mutateCalendarEvent(db:CalendarDb,input:CalendarMutation):Promise<CalendarReceipt>{
 const {data,error}=await db.rpc('calendar_event_apply',{p_input:parseCalendarMutation(input)});
 const receipt=result<CalendarReceipt>(data,error);
 if(receipt.ok!==true||!receipt.mutationId||!receipt.event?.id)throw new CalendarError('UNAVAILABLE');
 return receipt;
}
