-- Harden internal public-schema tables flagged by Supabase Advisor.
--
-- These tables are written/read through server-side service-role clients and do
-- not need direct anon/authenticated Data API access. Enabling RLS with no
-- policies makes client roles default-deny while service_role keeps its
-- bypass-RLS server access.

alter table public.atlas_actions enable row level security;
alter table public.cron_heartbeat enable row level security;
alter table public.token_health enable row level security;

revoke all on public.atlas_actions from anon, authenticated;
revoke all on public.cron_heartbeat from anon, authenticated;
revoke all on public.token_health from anon, authenticated;

grant all on public.atlas_actions to service_role;
grant all on public.cron_heartbeat to service_role;
grant all on public.token_health to service_role;
