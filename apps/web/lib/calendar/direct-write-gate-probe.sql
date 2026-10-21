-- ISOLATED POSTGRESQL SECURITY PROBE ONLY. NEVER RUN AS A PROD MIGRATION.
-- Goal: reject a direct service_role write that failed to lock the owner/project
-- calendar source revision BEFORE locking social_publications/social_schedule_jobs.
-- This uses a transaction-bound HMAC proof to avoid a permanent marker table.
-- The live SQL RPC candidates have explicit revision bumps; those must be
-- reconciled to avoid DOUBLE counting before any trigger-based design is used.

create schema calendar_gate_private_probe;
revoke all on schema calendar_gate_private_probe from public,anon,authenticated,service_role;
create table calendar_gate_private_probe.secret (
 id integer primary key check(id=1),
 key bytea not null check(octet_length(key)=32)
);
insert into calendar_gate_private_probe.secret(id,key)
values(1,public.gen_random_bytes(32));
revoke all on calendar_gate_private_probe.secret from public,anon,authenticated,service_role;

-- The service role, NOT a normal authenticated browser user, is permitted to
-- prepare a source write. This is a SOURCE CONSISTENCY gate only, not human
-- approval or end-user identity authorization.
create or replace function public.calendar_source_gate_begin_probe(p_project uuid)
returns bigint language plpgsql security definer set search_path='' as $fn$
declare
  who uuid;
  current_revision bigint;
  signing_key bytea;
  proof text;
begin
  select p.owner_id into who from public.projects p where p.id=p_project;
  if who is null then
    raise exception 'UNKNOWN_CALENDAR_PROJECT' using errcode='23503';
  end if;
  select r.revision into current_revision
    from public.calendar_source_revision_probe r
    where r.owner_user_id=who and r.project_id=p_project for update;
  if not found then
    raise exception 'MISSING_SOURCE_REVISION' using errcode='23514';
  end if;
  select s.key into signing_key from calendar_gate_private_probe.secret s where s.id=1;
  if signing_key is null then
    raise exception 'CALENDAR_GATE_NOT_CONFIGURED' using errcode='23514';
  end if;
  proof=pg_catalog.encode(
    public.hmac(
      pg_catalog.convert_to(
        'v1|'||who::text||'|'||p_project::text||'|'||pg_catalog.txid_current()::text,'UTF8'
      ),signing_key,'sha256'
    ),'hex'
  );
  perform pg_catalog.set_config('omnira.calendar_gate_probe_v1',proof,true);
  return current_revision;
end $fn$;
revoke all on function public.calendar_source_gate_begin_probe(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.calendar_source_gate_begin_probe(uuid)
 to service_role;

-- BEFORE row trigger. It deliberately DOES NOT acquire the source lock:
-- a row may already be locked at trigger time, so waiting here could deadlock
-- against calendar_week_revision_batch_probe and the revision-first writers.
create or replace function public.calendar_source_gate_assert_probe()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare
  target_project uuid;
  who uuid;
  signing_key bytea;
  expected_proof text;
begin
  if tg_op='UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'CALENDAR_PROJECT_MOVE_REFUSED' using errcode='23514';
  end if;
  target_project=case when tg_op='DELETE' then old.project_id else new.project_id end;
  select p.owner_id into who from public.projects p where p.id=target_project;
  if who is null then
    raise exception 'UNKNOWN_CALENDAR_PROJECT' using errcode='23503';
  end if;
  select s.key into signing_key from calendar_gate_private_probe.secret s where s.id=1;
  expected_proof=pg_catalog.encode(
    public.hmac(
      pg_catalog.convert_to(
        'v1|'||who::text||'|'||target_project::text||'|'||pg_catalog.txid_current()::text,'UTF8'
      ),signing_key,'sha256'
    ),'hex'
  );
  if pg_catalog.current_setting('omnira.calendar_gate_probe_v1',true)
     is distinct from expected_proof
  then
    raise exception 'CALENDAR_WRITE_GATE_REQUIRED' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old;end if;
  return new;
end $fn$;
revoke all on function public.calendar_source_gate_assert_probe()
 from public,anon,authenticated,service_role;

-- AFTER row trigger. Because begin_probe already took the source revision
-- FOR UPDATE, the revision bump is not a new lock acquisition after row locks.
create or replace function public.calendar_source_gate_bump_probe()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare
  target_project uuid;
  who uuid;
begin
  if tg_op='UPDATE' and new is not distinct from old then
    return null;
  end if;
  target_project=case when tg_op='DELETE' then old.project_id else new.project_id end;
  select p.owner_id into who from public.projects p where p.id=target_project;
  update public.calendar_source_revision_probe r
    set revision=r.revision+1
    where r.project_id=target_project and r.owner_user_id=who;
  if not found then
    raise exception 'MISSING_SOURCE_REVISION' using errcode='23514';
  end if;
  return null;
end $fn$;
revoke all on function public.calendar_source_gate_bump_probe()
 from public,anon,authenticated,service_role;

create trigger calendar_gate_publications_before_probe
 before insert or update or delete on public.social_publications
 for each row execute function public.calendar_source_gate_assert_probe();
create trigger calendar_gate_publications_after_probe
 after insert or update or delete on public.social_publications
 for each row execute function public.calendar_source_gate_bump_probe();
create trigger calendar_gate_jobs_before_probe
 before insert or update or delete on public.social_schedule_jobs
 for each row execute function public.calendar_source_gate_assert_probe();
create trigger calendar_gate_jobs_after_probe
 after insert or update or delete on public.social_schedule_jobs
 for each row execute function public.calendar_source_gate_bump_probe();
