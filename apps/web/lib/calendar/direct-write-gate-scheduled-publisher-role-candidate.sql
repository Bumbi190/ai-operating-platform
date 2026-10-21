-- ISOLATED TEST CANDIDATE ONLY. DO NOT APPLY AS A MIGRATION.
-- Evaluated inside a savepoint and rolled back by the worker regression.
-- Completion of an existing approved claim only; no provider authentication.
create role social_schedule_publisher_fixture nologin bypassrls;
grant usage on schema public to social_schedule_publisher_fixture;
grant select,update on public.projects to social_schedule_publisher_fixture;
grant select,update on public.social_publications,
 public.social_schedule_jobs to social_schedule_publisher_fixture;
grant insert on public.social_publication_events,
 public.social_schedule_events to social_schedule_publisher_fixture;
grant execute on function public.social_schedule_fields(jsonb,text[],text[]),
 public.social_schedule_locked_claim(jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_snapshot(public.social_schedule_jobs),
 public.social_publication_record(public.social_publications),
 public.social_schedule_now(),
 public.calendar_source_gate_begin_probe(uuid)
 to social_schedule_publisher_fixture;

revoke insert,update on public.social_publications,
 public.social_schedule_jobs from service_role;
revoke insert on public.social_publication_events,
 public.social_schedule_events from service_role;
revoke execute on function public.social_schedule_step(jsonb,jsonb)
 from public,service_role;
