import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
const migration=readFileSync(resolve(dir,
 '../../apps/web/supabase/migrations/20261020230500_atlas_creative_queue_staging_p7.sql'),'utf8');
const normalized=migration.toLowerCase();
test('staging is a new distinct media table and refuses browser grants',()=>{
 assert.match(normalized,/create table public\.atlas_creative_queue_staging/);
 assert.match(normalized,/references public\.projects\(id\)/);
 assert.match(normalized,/references public\.assets\(id\)/);
 assert.match(normalized,/enable row level security/);
 assert.match(normalized,/revoke all on public\.atlas_creative_queue_staging\s+from public, anon, authenticated, service_role/);
 assert.match(normalized,/grant select, insert on public\.atlas_creative_queue_staging to service_role/);
 assert.doesNotMatch(normalized,/grant (?:select|update|insert|delete|all) on public\.atlas_creative_queue_staging to (?:anon|authenticated|public)/);
 assert.doesNotMatch(normalized,/alter table public\.atlas_code_work/);
});
test('database claim is atomic, checked against project ownership, and single-use',()=>{
 assert.match(normalized,/create function public\.atlas_creative_claim_staging_p7/);
 assert.match(normalized,/security definer\s+set search_path = ''/);
 assert.match(normalized,/for update;/);
 assert.match(normalized,/v_job\.claim_fence <> 0/);
 assert.match(normalized,/v_job\.claim_id is not null/);
 assert.match(normalized,/v_job\.ticket_expires_at <= clock_timestamp\(\)/);
 assert.match(normalized,/v_job\.worker_id is distinct from p_worker_id/);
 assert.match(normalized,/v_job\.signed_ticket_sha256 is distinct from p_signed_ticket_sha256/);
 assert.match(normalized,/v_job\.approval_receipt_sha256 is distinct from p_approval_receipt_sha256/);
 for(const required of ['p_work_id','p_worker_id','p_signed_ticket_sha256',
  'p_claim_nonce_sha256','p_approval_receipt_sha256']) {
  assert.ok(normalized.includes(required+' is null'),required+' must fail closed on null');
 }
 assert.match(normalized,/v_job\.claim_nonce_sha256 is distinct from p_claim_nonce_sha256/);
 assert.match(normalized,/a\.project_id, a\.checksum_sha256, a\.kind/);
 assert.match(normalized,/v_job\.ticket_issued_at > clock_timestamp\(\) \+ interval '30 seconds'/);
 assert.match(normalized,/v_job\.operation_id = 'photocraft.convert-webp' and v_asset_kind <> 'image'/);
 assert.match(normalized,/v_job\.operation_id = 'filmcraft.demo-export-mp4' and v_asset_kind <> 'video'/);
 assert.match(normalized,/a\.status = 'active'/);
 assert.match(normalized,/v_asset_project is distinct from v_job\.project_id/);
 assert.match(normalized,/status = 'claimed_preview_only'/);
 assert.match(normalized,/claim_fence = 1/);
});
test('only service role may run this non-executing claim function',()=>{
 assert.match(normalized,/current_setting\('request\.jwt\.claim\.role', true\)/);
 assert.match(normalized,/<> 'service_role'/);
 assert.match(normalized,/revoke all on function public\.atlas_creative_claim_staging_p7\([\s\S]+?\) from public,anon,authenticated,service_role/);
 assert.match(normalized,/grant execute on function public\.atlas_creative_claim_staging_p7\([\s\S]+?\) to service_role/);
 assert.doesNotMatch(normalized,/\b(?:pg_net|http_post|dblink_exec|lo_export|copy\s+.*\s+program)\b/);
});
test('migration deliberately contains no publishing or editor activation',()=>{
 assert.doesNotMatch(normalized,/create trigger/);
 assert.doesNotMatch(normalized,/enable-localuser|photocraft-cli|filmcraft-cli/);
 assert.doesNotMatch(normalized,/insert into public\.outputs/);
 assert.doesNotMatch(normalized,/update public\.assets/);
});
