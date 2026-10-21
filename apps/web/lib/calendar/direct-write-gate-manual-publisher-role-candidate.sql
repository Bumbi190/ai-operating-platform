-- ISOLATED TEST CANDIDATE ONLY. DO NOT APPLY AS A MIGRATION.
-- Evaluated inside a transaction that the regression test rolls back.
-- Models a manual publisher identity without changing the active schedule.
create role social_publisher_fixture nologin bypassrls;
grant usage on schema public to social_publisher_fixture;
grant select,update on public.projects to social_publisher_fixture;
grant select,update on public.social_publications to social_publisher_fixture;
grant insert on public.social_publication_events to social_publisher_fixture;
grant execute on function public.social_launch_assert_owner(jsonb,jsonb),
 public.social_publication_record(public.social_publications),
 public.calendar_source_gate_begin_probe(uuid),
 public.social_publication_step(jsonb,jsonb) to social_publisher_fixture;

revoke insert,update on public.social_publications from service_role;
revoke insert on public.social_publication_events from service_role;
revoke execute on function public.social_publication_step(jsonb,jsonb) from public,service_role;
