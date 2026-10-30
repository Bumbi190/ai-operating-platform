import {redirect} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {resolveCalendarAccess} from '@/lib/calendar/access';
import {readCalendarWeek} from '@/lib/calendar/read';
import {calendarWeekFromParam} from '@/lib/calendar/time';
import {CalendarWorkspace} from '@/components/calendar/CalendarWorkspace';
export const dynamic='force-dynamic';
export default async function CalendarPage({searchParams}:{searchParams:{week?:string|string[]}}){
 const access=await resolveCalendarAccess();
 if(!access.ok){
  if(access.response.status===401)redirect('/login');
  return <main style={{padding:32}}><h1>Kalender</h1><p>Kalendern kunde inte läsas just nu.</p><a href="/calendar">Försök igen</a></main>;
 }
 let range;
 try{range=calendarWeekFromParam(searchParams.week,new Date().toISOString());}catch{redirect('/calendar');}
 const initialWeek=await readCalendarWeek({sessionDb:access.sessionDb,adminDb:createAdminClient()},access.actor,range);
 return <CalendarWorkspace initialWeek={initialWeek} userId={access.actor.userId}/>;
}
