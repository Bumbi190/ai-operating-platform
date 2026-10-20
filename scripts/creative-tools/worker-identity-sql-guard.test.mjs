import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const sql=readFileSync(resolve(import.meta.dirname,
 '../../apps/web/supabase/migrations/20261020235500_atlas_creative_worker_identity_p10.sql'),'utf8').toLowerCase();
test('new creative worker identities are isolated from code-work broker',()=>{
 assert.match(sql,/create table public\.atlas_creative_worker_identities/);
 assert.match(sql,/create table public\.atlas_creative_worker_nonces/);
 assert.doesNotMatch(sql,/alter table public\.atlas_code_work/);
 assert.doesNotMatch(sql,/update public\.atlas_code_work/);
});
test('identities default revoked and creative capability disabled',()=>{
 assert.match(sql,/state text not null default 'revoked'/);
 assert.match(sql,/creative_claim_enabled boolean not null default false/);
 assert.match(sql,/last_counter bigint not null default 0/);
 assert.match(sql,/primary key \(worker_id,nonce_sha256\)/);
 assert.match(sql,/unique\(worker_id,counter\)/);
});
test('browser grants denied; server may read registry but may not rewrite it',()=>{
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.atlas_creative_worker_identities\s+from public,anon,authenticated,service_role/);
 assert.match(sql,/revoke all on public\.atlas_creative_worker_nonces\s+from public,anon,authenticated,service_role/);
 assert.match(sql,/grant select on public\.atlas_creative_worker_identities to service_role/);
 assert.doesNotMatch(sql,/grant (?:insert|update|delete|all) on public\.atlas_creative_worker_identities to service_role/);
});
test('nonce and counter are checked transactionally under an identity row lock',()=>{
 assert.match(sql,/for update;/);
 assert.match(sql,/v_identity\.key_id is distinct from p_key_id/);
 assert.match(sql,/v_identity\.last_counter >= p_counter/);
 assert.match(sql,/v_identity\.project_ids @> p_project_ids/);
 assert.match(sql,/p_project_ids @> v_identity\.project_ids/);
 assert.match(sql,/insert into public\.atlas_creative_worker_nonces/);
 assert.match(sql,/set last_counter=p_counter/);
 assert.match(sql,/exception when unique_violation then\s+return false/);
});
test('one service-role-only function with no automatic enrollment or execution',()=>{
 assert.match(sql,/create function public\.atlas_creative_consume_worker_proof_p10/);
 assert.match(sql,/security definer\s+set search_path = ''/);
 assert.match(sql,/current_setting\('request\.jwt\.claim\.role',true\)/);
 assert.match(sql,/revoke all on function public\.atlas_creative_consume_worker_proof_p10/);
 assert.match(sql,/grant execute on function public\.atlas_creative_consume_worker_proof_p10[\s\S]*to service_role/);
 assert.doesNotMatch(sql,/create trigger|create policy|pg_net|enable-localuser|insert into public\.atlas_creative_worker_identities/);
});
