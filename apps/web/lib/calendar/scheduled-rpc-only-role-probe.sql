-- TEST ONLY: install inside the isolated replay transaction and roll back.
-- This tests the SQL privilege boundary, not a deployable Data API identity.
-- The function owner has elevated table access; the caller has none. Before a
-- production cutover, audit every definer body and its inputs, isolate media
-- and credentials, and authenticate provider receipts independently.
create role social_schedule_rpc_only_fixture nologin nobypassrls;
grant usage on schema public to social_schedule_rpc_only_fixture;

-- These six worker entry points use qualified relations and an empty search
-- path. Their invoker helpers run as the function owner in this transaction.
alter function public.social_schedule_claim(jsonb) security definer;
alter function public.social_schedule_authorize_write(jsonb,jsonb) security definer;
alter function public.social_schedule_step(jsonb,jsonb) security definer;
alter function public.social_schedule_peek(jsonb) security definer;
alter function public.social_schedule_receipt(jsonb) security definer;
alter function public.social_schedule_recover_checkpoint(jsonb) security definer;

revoke execute on function public.social_schedule_claim(jsonb),
 public.social_schedule_authorize_write(jsonb,jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_peek(jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_recover_checkpoint(jsonb)
 from public, anon, authenticated, service_role;
grant execute on function public.social_schedule_claim(jsonb),
 public.social_schedule_authorize_write(jsonb,jsonb),
 public.social_schedule_step(jsonb,jsonb),
 public.social_schedule_peek(jsonb),
 public.social_schedule_receipt(jsonb),
 public.social_schedule_recover_checkpoint(jsonb)
 to social_schedule_rpc_only_fixture;
