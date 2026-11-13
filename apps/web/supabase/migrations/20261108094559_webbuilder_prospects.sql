-- Etapp 1: owner-scoped, immutable prospect evidence. No contact, message or send authority.
begin;

create table public.website_prospects (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 orgnr text not null check (orgnr ~ '^[0-9]{10}$'),
 cfar text not null check (cfar ~ '^[0-9]{1,20}$'),
 current_revision_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id, project_id), unique (project_id, created_by, cfar)
);
create table public.website_prospect_revisions (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null, project_id uuid not null,
 number bigint not null check (number > 0), content jsonb not null,
 canonical_content text not null check (octet_length(canonical_content) between 1 and 65536),
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 intent_key text not null check (intent_key ~ '^[A-Za-z0-9_-]{1,100}$'),
 created_at timestamptz not null default now(),
 foreign key (prospect_id, project_id) references public.website_prospects(id, project_id) on delete cascade,
 unique (id, prospect_id, project_id), unique (prospect_id, number), unique (prospect_id, intent_key),
 check (content = canonical_content::jsonb),
 check (sha256 = encode(sha256(convert_to(canonical_content, 'UTF8')), 'hex')),
 check ((content->>'version') = '1'),
 check (content->'company'->>'source' = 'scb'),
 check (jsonb_typeof(content->'improvements') = 'array' and jsonb_array_length(content->'improvements') in (0,3))
);
alter table public.website_prospects add foreign key (current_revision_id, id, project_id)
 references public.website_prospect_revisions(id, prospect_id, project_id);
create table public.website_prospect_decisions (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null, project_id uuid not null,
 revision_id uuid not null, sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 scope text not null default 'prospect_review' check (scope = 'prospect_review'),
 intent_key text not null check (intent_key ~ '^[A-Za-z0-9_-]{1,100}$'),
 foreign key (revision_id, prospect_id, project_id) references public.website_prospect_revisions(id, prospect_id, project_id),
 unique (prospect_id, revision_id), unique (project_id, reviewed_by, intent_key)
);
create index website_prospect_owner on public.website_prospects(created_by, project_id, updated_at desc);
create index website_prospect_revision_project on public.website_prospect_revisions(project_id);
create index website_prospect_decision_project on public.website_prospect_decisions(project_id);
alter table public.website_prospects enable row level security;
alter table public.website_prospect_revisions enable row level security;
alter table public.website_prospect_decisions enable row level security;
create policy website_prospect_owner_read on public.website_prospects for select to authenticated
 using (created_by = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy website_prospect_revision_owner_read on public.website_prospect_revisions for select to authenticated
 using (exists (select 1 from public.website_prospects p where p.id = prospect_id and p.project_id = website_prospect_revisions.project_id and p.created_by = (select auth.uid())));
create policy website_prospect_decision_owner_read on public.website_prospect_decisions for select to authenticated
 using (reviewed_by = (select auth.uid()) and exists (select 1 from public.website_prospects p where p.id = prospect_id and p.project_id = website_prospect_decisions.project_id and p.created_by = (select auth.uid())));
revoke all on public.website_prospects, public.website_prospect_revisions, public.website_prospect_decisions from anon, authenticated;
grant select on public.website_prospects, public.website_prospect_revisions, public.website_prospect_decisions to authenticated;
grant all on public.website_prospects, public.website_prospect_revisions, public.website_prospect_decisions to service_role;

create function public.website_prospect_immutable() returns trigger
 language plpgsql security invoker set search_path = '' as $$
begin raise exception 'PROSPECT_IMMUTABLE' using errcode = '55000'; end $$;
create trigger website_prospect_revision_no_update before update on public.website_prospect_revisions
 for each row execute function public.website_prospect_immutable();
create trigger website_prospect_decision_no_update before update on public.website_prospect_decisions
 for each row execute function public.website_prospect_immutable();

create function public.website_prospect_view(p_principal jsonb, p_input jsonb) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare p public.website_prospects; r public.website_prospect_revisions; d public.website_prospect_decisions;
begin
 perform public.website_build_check_access(p_principal, (p_input->>'projectId')::uuid, true);
 select * into strict p from public.website_prospects
 where id = (p_input->>'prospectId')::uuid and project_id = (p_input->>'projectId')::uuid and created_by = (p_principal->>'userId')::uuid;
 select * into strict r from public.website_prospect_revisions where id = p.current_revision_id and prospect_id = p.id and project_id = p.project_id;
 select * into d from public.website_prospect_decisions where prospect_id = p.id and revision_id = r.id and reviewed_by = p.created_by and sha256 = r.sha256;
 return jsonb_build_object('projectId', p.project_id, 'prospectId', p.id, 'revisionId', r.id, 'sha256', r.sha256,
  'number', r.number, 'content', r.content, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
  'approval', case when d.id is null then null else jsonb_build_object('id',d.id,'revisionId',d.revision_id,'sha256',d.sha256,'reviewedBy',d.reviewed_by,'reviewedAt',d.reviewed_at,'scope',d.scope) end);
end $$;

create function public.website_prospect_list(p_principal jsonb, p_input jsonb) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
 perform public.website_build_check_access(p_principal, (p_input->>'projectId')::uuid, true);
 select coalesce(jsonb_agg(public.website_prospect_view(p_principal, jsonb_build_object('projectId',p.project_id,'prospectId',p.id)) order by p.updated_at desc), '[]'::jsonb) into result
 from (select * from public.website_prospects where project_id = (p_input->>'projectId')::uuid and created_by = (p_principal->>'userId')::uuid order by updated_at desc limit 100) p;
 return result;
end $$;

-- Server-only writes. Identity, asset and build references are checked inside the transaction as well.
create function public.website_prospect_save(p_principal jsonb, p_input jsonb) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare pid uuid := (p_input->>'projectId')::uuid; uid uuid := (p_principal->>'userId')::uuid;
 p public.website_prospects; r public.website_prospect_revisions; rid uuid;
 c jsonb := p_input->'content'; canonical text := p_input->>'canonicalContent'; key text := p_input->>'idempotencyKey'; image jsonb; improvement jsonb; observation_id text;
begin
 perform public.website_build_check_access(p_principal, pid, true);
 if canonical is null or octet_length(canonical) > 65536 or canonical::jsonb is distinct from c or encode(sha256(convert_to(canonical,'UTF8')),'hex') is distinct from p_input->>'sha256'
  or key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or c->>'version' is distinct from '1' or c->'company'->>'source' is distinct from 'scb'
  or jsonb_typeof(c->'improvements') is distinct from 'array' then raise exception 'INVALID_PROSPECT' using errcode = '22023'; end if;
 if jsonb_array_length(c->'improvements') not in (0,3) then raise exception 'INVALID_PROSPECT' using errcode = '22023'; end if;
 if p_input->>'prospectId' is null then
  insert into public.website_prospects(project_id,created_by,orgnr,cfar) values(pid,uid,c->'company'->>'orgnr',c->'company'->>'cfar') on conflict(project_id,created_by,cfar) do nothing;
  select * into strict p from public.website_prospects where project_id=pid and created_by=uid and cfar=c->'company'->>'cfar' for update;
 else
  select * into strict p from public.website_prospects where id=(p_input->>'prospectId')::uuid and project_id=pid and created_by=uid for update;
 end if;
 if p.orgnr is distinct from c->'company'->>'orgnr' or p.cfar is distinct from c->'company'->>'cfar' then raise exception 'INVALID_PROSPECT' using errcode='22023'; end if;
 select * into r from public.website_prospect_revisions where prospect_id=p.id and intent_key=key;
 if found then
  if r.sha256 is distinct from p_input->>'sha256' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
  return public.website_prospect_view(p_principal,jsonb_build_object('projectId',pid,'prospectId',p.id));
 end if;
 if p.current_revision_id is distinct from (p_input->>'expectedRevisionId')::uuid then raise exception 'PROSPECT_STALE' using errcode='55000'; end if;
 if c->'website' is distinct from 'null'::jsonb and (c->'website'->>'verifiedBy')::uuid is distinct from uid then raise exception 'INVALID_PROSPECT' using errcode='22023'; end if;
 if c->'capture' is distinct from 'null'::jsonb then
  if c->'capture'->>'sourceUrl' is distinct from c->'website'->>'url' or jsonb_array_length(c->'capture'->'images') is distinct from 2 then raise exception 'INVALID_PROSPECT' using errcode='22023'; end if;
  for image in select value from jsonb_array_elements(c->'capture'->'images') loop
   if not exists(select 1 from public.assets a where a.id=(image->>'assetId')::uuid and a.project_id=pid and a.kind='image' and a.visibility='internal' and a.status='active' and a.checksum_sha256=image->>'sha256') then raise exception 'INVALID_PROSPECT_ASSET' using errcode='22023'; end if;
  end loop;
 end if;
 for improvement in select value from jsonb_array_elements(c->'improvements') loop
  if jsonb_typeof(improvement->'observationIds') is distinct from 'array' or jsonb_array_length(improvement->'observationIds') not between 1 and 8 then raise exception 'INVALID_PROSPECT' using errcode='22023'; end if;
  for observation_id in select jsonb_array_elements_text(improvement->'observationIds') loop
   if not exists(select 1 from jsonb_array_elements(c->'capture'->'observations') o where o->>'id'=observation_id) then raise exception 'INVALID_PROSPECT_EVIDENCE' using errcode='22023'; end if;
  end loop;
 end loop;
 if c->'design' is distinct from 'null'::jsonb then
  if jsonb_array_length(c->'improvements') <> 3 or not exists(select 1 from public.website_build_plan_revisions plan_revision join public.website_build_plans b on b.id=plan_revision.plan_id and b.project_id=plan_revision.project_id
   where plan_revision.id=(c->'design'->>'revisionId')::uuid and plan_revision.plan_id=(c->'design'->>'planId')::uuid and plan_revision.project_id=pid and plan_revision.sha256=c->'design'->>'sha256' and b.created_by=uid and b.conversation_id=(c->'design'->>'conversationId')::uuid) then raise exception 'INVALID_PROSPECT_DESIGN' using errcode='22023'; end if;
 end if;
 if c->'build' is distinct from 'null'::jsonb then
  if c->'design' = 'null'::jsonb or c->'build'->>'planRevisionId' is distinct from c->'design'->>'revisionId' or not exists(select 1 from public.website_build_sessions s where s.id=(c->'build'->>'sessionId')::uuid and s.project_id=pid and s.created_by=uid and s.plan_revision_id=(c->'design'->>'revisionId')::uuid) then raise exception 'INVALID_PROSPECT_BUILD' using errcode='22023'; end if;
 end if;
 if c->'demo' is distinct from 'null'::jsonb and (c->'build' = 'null'::jsonb or c->'demo'->>'artifactSha256' is distinct from c->'build'->>'sha256') then raise exception 'INVALID_PROSPECT_DEMO' using errcode='22023'; end if;
 insert into public.website_prospect_revisions(prospect_id,project_id,number,content,canonical_content,sha256,intent_key)
 values(p.id,pid,coalesce((select max(number) from public.website_prospect_revisions where prospect_id=p.id),0)+1,c,canonical,p_input->>'sha256',key) returning id into rid;
 update public.website_prospects set current_revision_id=rid,updated_at=now() where id=p.id;
 return public.website_prospect_view(p_principal,jsonb_build_object('projectId',pid,'prospectId',p.id));
end $$;

create function public.website_prospect_approve(p_principal jsonb,p_input jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare p public.website_prospects; r public.website_prospect_revisions; d public.website_prospect_decisions; key text:=p_input->>'idempotencyKey'; c jsonb;
begin
 perform public.website_build_check_access(p_principal,(p_input->>'projectId')::uuid,true);
 select * into strict p from public.website_prospects where id=(p_input->>'prospectId')::uuid and project_id=(p_input->>'projectId')::uuid and created_by=(p_principal->>'userId')::uuid for update;
 select * into strict r from public.website_prospect_revisions where id=p.current_revision_id and prospect_id=p.id;
 if r.id is distinct from (p_input->>'revisionId')::uuid or r.sha256 is distinct from p_input->>'sha256' then raise exception 'PROSPECT_STALE' using errcode='55000'; end if;
 c:=r.content;
 if c->'company'->>'inactive' is distinct from 'false' or c->'website' is null or c->'website'='null'::jsonb or c->'capture' is null or c->'capture'='null'::jsonb
  or jsonb_array_length(c->'improvements') is distinct from 3 or c->'design' is null or c->'design'='null'::jsonb or c->'build' is null or c->'build'='null'::jsonb or c->'demo' is null or c->'demo'='null'::jsonb
  or c->'demo'->>'mobileOverflow' is distinct from 'false' or c->'demo'->>'desktopOverflow' is distinct from 'false' then raise exception 'PROSPECT_REVIEW_INCOMPLETE' using errcode='55000'; end if;
 if not exists(select 1 from public.website_build_plans b join public.website_build_mockup_decisions m on m.plan_id=b.id and m.project_id=b.project_id
   where b.id=(c->'design'->>'planId')::uuid and b.current_revision_id=(c->'design'->>'revisionId')::uuid and b.project_id=p.project_id
   and m.id=b.current_mockup_decision_id and m.revision_id=b.current_revision_id and m.approved_by=p.created_by and m.mockup_id=(c->'build'->>'mockupId')::uuid and m.sha256=c->'build'->>'mockupSha256') then raise exception 'PROSPECT_DESIGN_STALE' using errcode='55000'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode='22023'; end if;
 select * into d from public.website_prospect_decisions where project_id=p.project_id and reviewed_by=p.created_by and intent_key=key;
 if found and (d.prospect_id is distinct from p.id or d.revision_id is distinct from r.id) then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
 insert into public.website_prospect_decisions(prospect_id,project_id,revision_id,sha256,reviewed_by,intent_key) values(p.id,p.project_id,r.id,r.sha256,p.created_by,key) on conflict(prospect_id,revision_id) do nothing;
 return public.website_prospect_view(p_principal,jsonb_build_object('projectId',p.project_id,'prospectId',p.id));
end $$;
do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'website_prospect_%'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop;
end $permissions$;
commit;
