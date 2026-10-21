-- TEST-ONLY full scheduling SQL fixture candidate. Never apply as a migration.
-- The regression creates this NOLOGIN role in one transaction and rolls it back.
-- Scope: complete an already approved, claimed and publishing job.
create role social_schedule_full_publisher_fixture nologin bypassrls;
grant usage on schema public to social_schedule_full_publisher_fixture;
grant select on public.social_schedule_batches,
 public.social_content_revisions to social_schedule_full_publisher_fixture;
grant select,update on public.projects,
 public.social_schedule_jobs,
 public.social_publications to social_schedule_full_publisher_fixture;
grant insert on public.social_schedule_events,
 public.social_publication_events to social_schedule_full_publisher_fixture;
grant execute on function public.social_schedule_fields(jsonb,text[],text[]),
 public.social_schedule_now(),
 public.social_schedule_locked_claim(jsonb),
 public.social_schedule_step(jsonb,jsonb),
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
 public.media_news_review_evidence,
 public.asset_provenance to social_schedule_full_publisher_fixture;
grant insert on public.social_publications to social_schedule_full_publisher_fixture;
grant execute on function public.social_schedule_authority(public.social_schedule_jobs,boolean),
 public.social_schedule_item_guard(uuid,jsonb),
 public.social_content_active(uuid),
 public.social_content_requirements(uuid),
 public.media_news_review_requirements(uuid)
 to social_schedule_full_publisher_fixture;
