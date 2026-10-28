/**
 * Service-role writer for the verified in-app notice AFTER the native weekly
 * editor save. It has no email/push transport and no publish capability.
 */
import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {WeeklyNoticeRecord,ReviewNoticeWritePort} from './review-notice-store'
import {weeklyConsentReadPort} from './enrollment-store'

type Admin=ReturnType<typeof createAdminClient>
type NoticeTable={upsert:(row:WeeklyNoticeRecord,opts:{
 onConflict:'preparation_id';ignoreDuplicates:true;
})=>Promise<{error:unknown}>}
type NoticeDb={from:(table:string)=>NoticeTable}

export function weeklyReviewNoticeWritePort(db:Admin):ReviewNoticeWritePort{
 const owners=weeklyConsentReadPort(db)
 return {
  currentProjectOwner:owners.currentProjectOwner,
  async insertOnce(row){
   const {error}=await (db as unknown as NoticeDb)
    .from('family_weekly_review_notices')
    .upsert(row,{onConflict:'preparation_id',ignoreDuplicates:true})
   if(error)throw Error('WEEKLY_NOTICE_UNAVAILABLE')
  },
 }
}
