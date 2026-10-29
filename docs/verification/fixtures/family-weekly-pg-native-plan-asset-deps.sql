-- Disposable PostgreSQL fixture ONLY. The social launch-plan tables,
-- constraints, immutable triggers and owner/planning RPCs, together with the
-- assets table and its actual integrity/ownership checks, are loaded VERBATIM
-- from canonical migrations in the separate native-plan-assets runner branch.
-- Only core projects/runs/conversations and publication/schedule surfaces
-- remain synthetic; no production DB or external storage/provider access.
drop function public.social_content_save(jsonb,jsonb);
drop table public.social_content_posts;
alter table public.projects add column name text not null default 'Familje-Stunden';
