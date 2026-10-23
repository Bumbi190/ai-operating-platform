-- TEST-ONLY full scheduling SQL fixture candidate. Never apply as a migration.
-- The regression creates this NOLOGIN role in one transaction and rolls it back.
-- Scope: inspect, claim, publish and recover an already approved job.
-- This is an execution-compatibility probe, NOT a least-privilege role:
-- BYPASSRLS and direct job/publication UPDATE grants remain. Possession of a
-- future credential for this role would permit more than the reviewed RPC flow.
-- Do not give it a Data API identity or deploy these grants as a cutover.
create role social_schedule_full_publisher_fixture nologin bypassrls;
grant usage on schema public to social_schedule_full_publisher_fixture;
grant select on public.social_schedule_batches,
 public.social_content_revisions to social_schedule_full_publisher_fixture;
grant select on public.projects to social_schedule_full_publisher_fixture;
-- SELECT ... FOR UPDATE needs UPDATE on at least one column. Limit the grant
-- to the project key so this fixture cannot edit names, ownership or settings.
grant update(id) on public.projects to social_schedule_full_publisher_fixture;
-- The invoker needs the UPDATE grant for SELECT ... FOR UPDATE, but must
-- never change the project key, even on a row without references.
create function public.social_schedule_project_key_guard_fixture()
returns trigger language plpgsql set search_path = public, pg_temp as $guard$
begin
 if current_user = 'social_schedule_full_publisher_fixture' then
  raise exception 'SOCIAL_SCHEDULE_PROJECT_KEY_WRITE_DENIED' using errcode = '42501';
 end if;
 return new;
end $guard$;
create trigger social_schedule_project_key_guard_fixture
before update of id on public.projects
for each row execute function public.social_schedule_project_key_guard_fixture();
grant select,update on public.social_schedule_jobs,
 public.social_publications to social_schedule_full_publisher_fixture;
grant insert on public.social_schedule_events,
 public.social_publication_events to social_schedule_full_publisher_fixture;
grant execute on function public.social_schedule_fields(jsonb,text[],text[]),
 public.social_schedule_now(),
 public.social_schedule_locked_claim(jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_peek(jsonb),
 public.social_schedule_authorize_write(jsonb,jsonb),
 public.social_schedule_recover_checkpoint(jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_snapshot(public.social_schedule_jobs),
 public.social_schedule_revision(public.social_content_revisions),
 public.social_publication_record(public.social_publications)
 to social_schedule_full_publisher_fixture;

revoke insert,update on public.social_schedule_jobs,
 public.social_publications from service_role;
revoke insert on public.social_schedule_events,
 public.social_publication_events from service_role;
revoke execute on function public.social_schedule_step(jsonb,jsonb)
 from public,service_role;

-- Prepare and authority checks on an already approved claim. Read grants
-- below are for canonical invoker helpers; review against migrated ACLs.
grant select on public.social_schedule_decisions,
 public.social_monthly_release_evidence,
 public.social_content_posts,
 public.social_content_decisions,
 public.social_launch_plans,
 public.social_launch_plan_revisions,
 public.social_launch_plan_decisions,
 public.social_account_bindings,
 public.assets,
 public.project_lifecycle,
 public.platform_config,
 public.social_content_revisions to social_schedule_full_publisher_fixture;
grant insert on public.social_publications to social_schedule_full_publisher_fixture;
grant execute on function public.social_schedule_claim(jsonb),
 public.social_schedule_authority(public.social_schedule_jobs,boolean),
 public.social_schedule_item_guard(uuid,jsonb),
 public.social_content_active(uuid),
 public.social_content_requirements(uuid)
 to social_schedule_full_publisher_fixture;

-- This source gate exists in the full cross-tree replay, but the older
-- owned worker fixture does not install it.
do $source_gate_grant$
begin
 if to_regprocedure('public.calendar_source_gate_try_begin_probe(uuid)') is not null then
  grant execute on function public.calendar_source_gate_try_begin_probe(uuid),
   public.calendar_source_gate_begin_probe(uuid)
   to social_schedule_full_publisher_fixture;
 end if;
end $source_gate_grant$;

-- The owned worker fixture predates the news-review migration. A fully
-- migrated isolated branch must have this dependency set; the transaction
-- probe there asserts its presence before evaluating this candidate.
do $news_grants$
begin
 if to_regclass('public.media_news_review_evidence') is not null then
  grant select on public.media_news_review_evidence,
   public.asset_provenance, public.media_scripts, public.media_news_items,
   public.cost_events to social_schedule_full_publisher_fixture;
  grant execute on function public.media_news_review_requirements(uuid),
   public.media_news_snapshot_requirements(uuid,jsonb),
   public.media_news_canonical_json(jsonb),
   public.media_news_review_caption(public.media_scripts)
   to social_schedule_full_publisher_fixture;
 end if;
end $news_grants$;
