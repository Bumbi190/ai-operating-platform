import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {HANDLARBORSEN_PROJECT_ID} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  weeklyWatchPeriod,validWatchPeriod,validWatchUuid,validWatchFinish,parseWatchRunReply,
  unknownWatchResult,WATCH_RUN_LEASE_SECONDS,type WatchFinish,type WatchJournalResult,type WatchRunOutcome,
} from './handlarborsen-watch-runs-core'

interface JournalDb {
  rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>
}
interface Dependencies {enabled:()=>boolean;db:()=>JournalDb}
export const isWatchRunJournalEnabled=()=>process.env.HANDLARBORSEN_WATCH_RUN_JOURNAL_ENABLED==='true'
const live:Dependencies={
  enabled:isWatchRunJournalEnabled,db:()=>createAdminClient() as unknown as JournalDb,
}

/**
 * Internal journal storage only, not a user route or an execution gate.
 * Future callers must separately authorize role/project and every external dispatch.
 * Disabled by default; unknown acknowledgements are never automatically retried.
 */
export function createWatchRunJournal(deps:Dependencies=live) {
  const result=(status:'disabled'|'invalid'):WatchJournalResult=>({status,executionAllowed:false})
  async function call(
    name:string,args:Record<string,unknown>,expected:{id?:string;period?:string;outcomes?:readonly WatchRunOutcome[]},
  ):Promise<WatchJournalResult>{
    try {
      const reply=await deps.db().rpc(name,{p_project_id:HANDLARBORSEN_PROJECT_ID,...args})
      return reply.error?unknownWatchResult():parseWatchRunReply(reply.data,expected)
    }catch{return unknownWatchResult()}
  }
  function gate():WatchJournalResult|null {
    try{return deps.enabled()===true?null:result('disabled')}catch{return unknownWatchResult()}
  }
  return {
    async enqueue(now:Date=new Date()):Promise<WatchJournalResult>{
      const blocked=gate();if(blocked)return blocked
      const period=weeklyWatchPeriod(now)
      if(!validWatchPeriod(period))return result('invalid')
      return call('handlarborsen_watch_enqueue_v1',{p_period_start:period},{period,outcomes:['queued','existing']})
    },
    async claim(id:string,claimToken:string):Promise<WatchJournalResult>{
      const blocked=gate();if(blocked)return blocked
      if(!validWatchUuid(id)||!validWatchUuid(claimToken))return result('invalid')
      return call('handlarborsen_watch_claim_v1',{
        p_run_id:id,p_claim_token:claimToken,p_lease_seconds:WATCH_RUN_LEASE_SECONDS,
      },{id,outcomes:['claimed','already_running','busy','blocked_review','not_current_period','not_found','conflict']})
    },
    async finish(input:WatchFinish):Promise<WatchJournalResult>{
      const blocked=gate();if(blocked)return blocked
      if(!validWatchFinish(input))return result('invalid')
      return call('handlarborsen_watch_finish_v1',{
        p_run_id:input.id,p_claim_token:input.claimToken,p_expected_revision:input.expectedRevision,
        p_state:input.state,p_outcome:input.outcome,p_http_count:input.httpRequestCount,p_evidence_digest:input.evidenceDigest,
      },{id:input.id,outcomes:['finished','already_finished','conflict','stale_claim','uncertain','not_found']})
    },
  }
}
