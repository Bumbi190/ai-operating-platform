// Disposable local replay prerequisite only. Never execute the full marketing source.
import {sha256} from './migration-replay-preflight.mjs';
export const RUNS_DISPATCH_FIXTURE=Object.freeze({
 kind:'synthetic',path:'synthetic/runs_dispatch_schema_only',
 sourcePath:'supabase/migrations/20260603_marketing_engine_foundation.sql',
 sourceLfSha256:'90ab8c043371e706db0c304dcee1085f184d3779572dc5b94518b2bb16371b60',
 extractedLfSha256:'cd70326b4f9a43a20c44854424377fd9d7d8e5541ff5ac586eae11dc4a80224a',
 lfSha256:'035cdda7ccbf3a3a4297b3c9130737db4252565c05b68a8c53eb319a10f025ce',
 limitation:'Empty local baseline runs dispatch DDL only; no campaign tables, rows, handlers, functions, schedules or hosted parity claim.',
});
// Executed by the existing --single-transaction executor: lock, absence check and DDL are atomic.
const GUARD=`LOCK TABLE ONLY public.runs IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.rolname=current_user
    WHERE c.oid='public.runs'::regclass AND c.relkind='r' AND NOT c.relispartition
      AND (r.rolsuper OR r.rolbypassrls OR c.relowner=r.oid)
  ) OR EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid='public.runs'::regclass OR inhparent='public.runs'::regclass)
    OR EXISTS (SELECT 1 FROM ONLY public.runs)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.runs'::regclass AND attname='kind' AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.runs'::regclass AND attname='workflow_id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
    OR pg_catalog.to_regclass('public.runs_kind_pending_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'runs dispatch fixture requires owned empty baseline runs with required workflow_id and absent kind/index';
  END IF;
END
$guard$;
`;
export function extractRunsDispatchSchema(source){
 const lf=source.replace(/\r\n/g,'\n');
 if(sha256(lf)!==RUNS_DISPATCH_FIXTURE.sourceLfSha256) throw new Error('runs dispatch source SHA mismatch');
 const matches=[...lf.matchAll(/^alter table public\.runs add column if not exists kind text;\nalter table public\.runs alter column workflow_id drop not null;\ncreate index if not exists runs_kind_pending_idx\n  on public\.runs \(created_at\) where status = 'pending' and kind is not null;\n/gm)];
 if(matches.length!==1) throw new Error('runs dispatch extraction ambiguous');
 const extracted=matches[0][0];
 if(sha256(extracted)!==RUNS_DISPATCH_FIXTURE.extractedLfSha256) throw new Error('runs dispatch extraction SHA mismatch');
 const body=GUARD+extracted;
 if(sha256(body)!==RUNS_DISPATCH_FIXTURE.lfSha256) throw new Error('runs dispatch executable SHA mismatch');
 return {extracted,body};
}
