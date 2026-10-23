import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const migration=(name:string)=>readFileSync(resolve(process.cwd(),'supabase/migrations/'+name),'utf8')
const core=migration('20261023120000_atlas_fallback_reservation_ceiling.sql')
const lockFix=migration('20261023122000_atlas_fallback_reservation_locktime.sql')
describe('Atlas fallback SQL budget security and concurrency contract',()=>{
 it('grants neither users nor anonymous clients access',()=>{
   expect(core).toContain('ENABLE ROW LEVEL SECURITY')
   expect(core).toContain('REVOKE ALL ON TABLE public.atlas_fallback_reservations FROM PUBLIC, anon, authenticated')
   expect(core).toContain('REVOKE ALL ON FUNCTION public.atlas_fallback_reserve')
   expect(core).toContain('GRANT EXECUTE ON FUNCTION public.atlas_fallback_reserve')
   expect(core).toContain('TO service_role;')
   expect(core).toContain('SECURITY INVOKER')
 })
 it('enforces the operator-approved shared ceilings within the global DB lock',()=>{
   expect(core).toContain('pg_advisory_xact_lock(172961, 10010)')
   expect(core).toContain('v_day_used + v_amount > 10')
   expect(core).toContain('v_month_used + v_amount > 100')
   expect(core).toContain('Europe/Stockholm')
   expect(core).toContain('request_id uuid PRIMARY KEY')
   expect(core).not.toContain('UPDATE public.atlas_fallback_reservations')
   expect(core).not.toContain('DELETE FROM public.atlas_fallback_reservations')
 })
 it('rejects cross-project news and safely timestamps AFTER acquiring the lock',()=>{
   expect(core).toContain("v_slug <> 'ai-media-automation'")
   const lockAt=lockFix.indexOf('PERFORM pg_catalog.pg_advisory_xact_lock')
   const nowAt=lockFix.indexOf('v_now := clock_timestamp();')
   expect(lockAt).toBeGreaterThan(0)
   expect(nowAt).toBeGreaterThan(lockAt)
   expect(lockFix).toContain("p_task_kind NOT IN ('news','briefing','dream','media')")
 })
})
