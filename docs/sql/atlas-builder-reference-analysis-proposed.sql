-- PROPOSAL ONLY. Requires reviewed reference ticket/message proposals.
-- Apply ONLY inside disposable integration fixtures this session.
begin;
create table public.website_build_reference_analyses(
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null unique references public.website_build_reference_messages(message_id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 binding_sha256 text not null check(binding_sha256 ~ '^[0-9a-f]{64}$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 model text not null default 'claude-haiku-4-5-20251001' check(model='claude-haiku-4-5-20251001'),
 max_tokens integer not null default 3072 check(max_tokens=3072),
 maximum_sek numeric(12,4) not null check(maximum_sek>0 and maximum_sek<=10),
 quote_token uuid not null default gen_random_uuid(),
 quote_expires_at timestamptz not null default now()+interval '10 minutes',
 status text not null default 'quoted' check(status in('quoted','processing','succeeded','failed','unknown')),
 claim_token uuid,
 canonical_result text check(octet_length(canonical_result)<=24000),
 result_sha256 text check(result_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),claimed_at timestamptz,completed_at timestamptz,
 check((status='quoted' and claim_token is null) or (status<>'quoted' and claim_token is not null)),
 check((status='succeeded' and canonical_result is not null and result_sha256 is not null) or
       (status<>'succeeded' and canonical_result is null and result_sha256 is null))
);
alter table public.website_build_reference_analyses enable row level security;
alter table public.website_build_reference_analyses force row level security;
revoke all on public.website_build_reference_analyses from public,anon,authenticated,service_role;
grant select on public.website_build_reference_analyses to service_role;

-- Same project -> conversation -> source lock order as immutable message persistence.
-- Bounded DB metadata checks supplement, never replace, application byte verification.
create function public.website_build_reference_analysis_scope(
 p_owner_id uuid,p_project_id uuid,p_conversation_id uuid,p_message_id uuid,p_binding_sha256 text
) returns void language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare source public.website_build_reference_messages%rowtype; img jsonb; life text; life_owner uuid;
begin
 perform 1 from public.projects where id=p_project_id and owner_id=p_owner_id and execution_paused=false for update;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 select state,owner_id into life,life_owner from public.project_lifecycle where project_id=p_project_id for share;
 if found and (life is distinct from 'active' or life_owner is distinct from p_owner_id)
 then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 perform 1 from public.project_budgets where project_id=p_project_id and monthly_sek is not null for share;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 perform 1 from public.conversations where id=p_conversation_id and user_id=p_owner_id and project_id=p_project_id for update;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 select * into source from public.website_build_reference_messages where message_id=p_message_id
  and owner_id=p_owner_id and project_id=p_project_id and conversation_id=p_conversation_id
  and binding_sha256=p_binding_sha256 for share;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 perform 1 from public.conversation_messages where id=p_message_id and conversation_id=p_conversation_id and role='user'
  and encode(sha256(convert_to(content,'UTF8')),'hex')=source.message_sha256 for share;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 for img in select value from jsonb_array_elements(source.images) loop
  perform 1 from public.website_build_reference_tickets t
   join public.assets a on a.id=t.asset_id join public.asset_provenance ap on ap.asset_id=a.id
   where t.id=(img->>'ticketId')::uuid and t.owner_id=p_owner_id and t.project_id=p_project_id
    and t.conversation_id=p_conversation_id and t.state='ready' and a.id=(img->>'assetId')::uuid
    and a.project_id=p_project_id and a.visibility='internal' and a.kind='image' and a.status='active'
    and a.mime_type='image/webp' and a.byte_size between 1 and 10485760 and a.checksum_sha256=img->>'sha256'
    and a.storage_bucket='media-assets-private'
    and a.storage_path='website/references/'||p_project_id::text||'/'||p_conversation_id::text||'/'||t.id::text||'.webp'
    and ap.source='uploaded' and ap.provider_metadata->>'purpose'='atlas-website-reference'
    and ap.provider_metadata->>'ticketId'=t.id::text for share of t,a,ap;
  if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 end loop;
end $$;

create function public.website_build_reference_analysis_quote(
 p_owner_id uuid,p_project_id uuid,p_conversation_id uuid,p_message_id uuid,
 p_binding_sha256 text,p_payload_sha256 text,p_maximum_sek numeric
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare r public.website_build_reference_analyses%rowtype;
begin
 if p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$' or p_maximum_sek is null
  or p_maximum_sek<=0 or p_maximum_sek>10 or p_maximum_sek<>round(p_maximum_sek,4)
 then raise exception 'ATLAS_ANALYSIS_CONFLICT'; end if;
 perform public.website_build_reference_analysis_scope(p_owner_id,p_project_id,p_conversation_id,p_message_id,p_binding_sha256);
 select * into r from public.website_build_reference_analyses where message_id=p_message_id for update;
 if found then
  if r.owner_id<>p_owner_id or r.project_id<>p_project_id or r.conversation_id<>p_conversation_id or r.binding_sha256<>p_binding_sha256
  then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
  if r.status='quoted' then
   update public.website_build_reference_analyses set payload_sha256=p_payload_sha256,maximum_sek=p_maximum_sek,
    quote_token=gen_random_uuid(),quote_expires_at=now()+interval '10 minutes' where id=r.id returning * into r;
  end if;
 else
  insert into public.website_build_reference_analyses(message_id,owner_id,project_id,conversation_id,binding_sha256,payload_sha256,maximum_sek)
   values(p_message_id,p_owner_id,p_project_id,p_conversation_id,p_binding_sha256,p_payload_sha256,p_maximum_sek) returning * into r;
 end if;
 return to_jsonb(r)-'claim_token';
end $$;

create function public.website_build_reference_analysis_claim(
 p_owner_id uuid,p_project_id uuid,p_conversation_id uuid,p_message_id uuid,p_analysis_id uuid,
 p_quote_token uuid,p_approved_maximum_sek numeric,p_binding_sha256 text,p_payload_sha256 text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare r public.website_build_reference_analyses%rowtype;
begin
 perform public.website_build_reference_analysis_scope(p_owner_id,p_project_id,p_conversation_id,p_message_id,p_binding_sha256);
 select * into r from public.website_build_reference_analyses where id=p_analysis_id and message_id=p_message_id
  and owner_id=p_owner_id and project_id=p_project_id and conversation_id=p_conversation_id for update;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 if r.quote_token is distinct from p_quote_token or r.maximum_sek is distinct from p_approved_maximum_sek
  or r.binding_sha256 is distinct from p_binding_sha256 or r.payload_sha256 is distinct from p_payload_sha256
 then raise exception 'ATLAS_ANALYSIS_CONFLICT'; end if;
 if r.status<>'quoted' then return jsonb_build_object('job',to_jsonb(r)-'claim_token','claimed',false); end if;
 if r.quote_expires_at<=clock_timestamp() then raise exception 'ATLAS_ANALYSIS_CONFLICT'; end if;
 update public.website_build_reference_analyses set status='processing',claim_token=gen_random_uuid(),claimed_at=clock_timestamp()
  where id=r.id returning * into r;
 return jsonb_build_object('job',to_jsonb(r)-'claim_token','claimed',true,'claimToken',r.claim_token);
end $$;

-- Completion owns only the already claimed outcome; no fresh spend or disclosure.
-- Deliberately allowed after pause/ownership change so paid outcomes are not lost.
create function public.website_build_reference_analysis_finish(
 p_owner_id uuid,p_project_id uuid,p_conversation_id uuid,p_message_id uuid,
 p_analysis_id uuid,p_claim_token uuid,p_status text,p_canonical_result text
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare r public.website_build_reference_analyses%rowtype; sha text;
begin
 if p_status is null or p_status not in('succeeded','failed','unknown') or
  (p_status='succeeded' and (p_canonical_result is null or octet_length(p_canonical_result)>24000)) or
  (p_status<>'succeeded' and p_canonical_result is not null)
 then raise exception 'ATLAS_ANALYSIS_CONFLICT'; end if;
 if p_status='succeeded' then
  if (p_canonical_result::jsonb)->>'version' is distinct from 'reference-analysis.v1'
  then raise exception 'ATLAS_ANALYSIS_CONFLICT'; end if;
  sha:=encode(sha256(convert_to(p_canonical_result,'UTF8')),'hex');
 end if;
 select * into r from public.website_build_reference_analyses where id=p_analysis_id and message_id=p_message_id
  and owner_id=p_owner_id and project_id=p_project_id and conversation_id=p_conversation_id
  and claim_token=p_claim_token for update;
 if not found then raise exception 'ATLAS_ANALYSIS_NOT_FOUND'; end if;
 if r.status<>'processing' then
  if r.status<>p_status or r.canonical_result is distinct from p_canonical_result
  then raise exception 'ATLAS_ANALYSIS_CONFLICT'; end if;
  return to_jsonb(r)-'claim_token';
 end if;
 update public.website_build_reference_analyses set status=p_status,canonical_result=p_canonical_result,
  result_sha256=sha,completed_at=clock_timestamp() where id=r.id returning * into r;
 return to_jsonb(r)-'claim_token';
end $$;

revoke all on function public.website_build_reference_analysis_scope(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.website_build_reference_analysis_quote(uuid,uuid,uuid,uuid,text,text,numeric) from public,anon,authenticated,service_role;
revoke all on function public.website_build_reference_analysis_claim(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,text) from public,anon,authenticated,service_role;
revoke all on function public.website_build_reference_analysis_finish(uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.website_build_reference_analysis_quote(uuid,uuid,uuid,uuid,text,text,numeric) to service_role;
grant execute on function public.website_build_reference_analysis_claim(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,text) to service_role;
grant execute on function public.website_build_reference_analysis_finish(uuid,uuid,uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
