-- G1: gör platform_tokens projekt-medveten (multi-tenant social-lager).
-- The Prompt, Familje-Stunden, GainPilot m.fl. kan ha egna IG/FB-konton utan specialfall.
alter table public.platform_tokens add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.platform_tokens add column if not exists account_id text;

-- Backfill: befintliga tokens tillhör The Prompt (ai-media-automation).
update public.platform_tokens
   set project_id = (select id from public.projects where slug = 'ai-media-automation')
 where project_id is null;

-- Byt unik-nyckel: (platform, token_type) → (project_id, platform, token_type).
alter table public.platform_tokens drop constraint if exists platform_tokens_platform_token_type_key;
create unique index if not exists platform_tokens_project_platform_type_key
  on public.platform_tokens (project_id, platform, token_type);
