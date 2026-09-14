-- Project-scoped social credentials — owner decision 1A (2026-09-14): The Prompt's
-- existing Instagram, Facebook and YouTube accounts are bound to The Prompt from
-- the verified runtime evidence the owner approved.
--
-- NOTHING IS ASSUMED. Each binding is inserted only if its evidence still holds at
-- apply time, inside this transaction. Any drift raises, and the whole migration
-- rolls back having bound nothing:
--
--   instagram  @theprompt.news · 17841437027967629
--              The newest Instagram snapshot of the project was captured AFTER the
--              stored credential was last refreshed, carries no error, and carries
--              this user_id and username — Instagram's /me answer for the
--              credential stored now.
--   facebook   page 1138612202672850
--              It is the stored credential's account_id; the newest Facebook
--              snapshot read that page node without error; and Meta accepted a
--              Facebook post for the project after the credential was last stored.
--   youtube    channel UCUM9JDi75ziLssYcGLo8IPA
--              The newest YouTube snapshot of the project resolves the project's
--              own uploads to this channel.
--
-- NO CREDENTIAL IS TOUCHED. platform_tokens is read, never written. The YouTube
-- credential stays in Vercel (Y1) and is attached to The Prompt's binding only.
-- Labels are only what a provider attested: the Instagram username from the
-- snapshot. The Facebook page name and YouTube channel title were never stored, so
-- they stay empty until a live verification records them, and
-- verification = 'runtime_evidence' says exactly that.
--
-- FRESH DATABASES. Without the project, or without its stored credentials, there
-- is nothing to bind and the migration does nothing. A second run refuses rather
-- than binding twice.

do $$
declare
  v_project       uuid;
  v_ig_refreshed  timestamptz;
  v_fb_refreshed  timestamptz;
  v_fb_account    text;
  v_ig_raw        jsonb;
  v_ig_at         timestamptz;
  v_fb_raw        jsonb;
  v_fb_at         timestamptz;
  v_yt_raw        jsonb;
  v_yt_at         timestamptz;
  v_bound_by constant text := 'migration:social_account_bindings_the_prompt_evidence';
begin
  select id into v_project from public.projects where slug = 'ai-media-automation';
  if v_project is null then
    raise notice 'social account evidence: project ai-media-automation absent — nothing to bind';
    return;
  end if;

  select refreshed_at into v_ig_refreshed
    from public.platform_tokens where project_id = v_project and platform = 'instagram';
  select refreshed_at, account_id into v_fb_refreshed, v_fb_account
    from public.platform_tokens where project_id = v_project and platform = 'facebook';

  if v_ig_refreshed is null and v_fb_refreshed is null then
    raise notice 'social account evidence: The Prompt holds no stored credentials — nothing to bind';
    return;
  end if;
  if v_ig_refreshed is null or v_fb_refreshed is null then
    raise exception 'social account evidence: The Prompt must hold both its stored Instagram and Facebook credentials';
  end if;

  if exists (select 1 from public.social_account_bindings where project_id = v_project) then
    raise exception 'social account evidence: The Prompt already has bindings — refusing to bind twice';
  end if;

  -- ── Instagram ─────────────────────────────────────────────────────────────
  select s.raw, s.captured_at into v_ig_raw, v_ig_at
    from public.account_snapshots s
   where s.project_id = v_project and s.platform = 'instagram'
   order by s.captured_at desc
   limit 1;
  if not found
     or jsonb_typeof(v_ig_raw) is distinct from 'object'
     or v_ig_raw ? 'error'
     or (v_ig_raw ->> 'user_id') is distinct from '17841437027967629'
     or lower(v_ig_raw ->> 'username') is distinct from 'theprompt.news'
     or v_ig_at < v_ig_refreshed then
    raise exception 'social account evidence drift: instagram';
  end if;

  -- ── Facebook ──────────────────────────────────────────────────────────────
  if v_fb_account is distinct from '1138612202672850' then
    raise exception 'social account evidence drift: facebook stored account';
  end if;
  select s.raw, s.captured_at into v_fb_raw, v_fb_at
    from public.account_snapshots s
   where s.project_id = v_project and s.platform = 'facebook'
   order by s.captured_at desc
   limit 1;
  if not found
     or jsonb_typeof(v_fb_raw) is distinct from 'object'
     or v_fb_raw ? 'error'
     or (v_fb_raw ->> 'id') is distinct from '1138612202672850' then
    raise exception 'social account evidence drift: facebook snapshot';
  end if;
  if not exists (
    select 1 from public.media_scripts m
     where m.project_id = v_project
       and m.facebook_post_id is not null
       and m.published_at >= v_fb_refreshed
  ) then
    raise exception 'social account evidence drift: no facebook publication with the stored credential';
  end if;

  -- ── YouTube ───────────────────────────────────────────────────────────────
  select s.raw, s.captured_at into v_yt_raw, v_yt_at
    from public.account_snapshots s
   where s.project_id = v_project and s.platform = 'youtube'
   order by s.captured_at desc
   limit 1;
  if not found
     or jsonb_typeof(v_yt_raw) is distinct from 'object'
     or (v_yt_raw -> 'items' -> 0 ->> 'id') is distinct from 'UCUM9JDi75ziLssYcGLo8IPA' then
    raise exception 'social account evidence drift: youtube';
  end if;
  if not exists (
    select 1 from public.media_scripts m
     where m.project_id = v_project and m.youtube_video_id is not null
  ) then
    raise exception 'social account evidence drift: no youtube upload for the project';
  end if;

  insert into public.social_account_bindings
    (project_id, platform, external_account_id, account_label, credential_source, verification, verified_at, bound_by)
  values
    (v_project, 'instagram', '17841437027967629', v_ig_raw ->> 'username', 'project_store',             'runtime_evidence', v_ig_at, v_bound_by),
    (v_project, 'facebook',  '1138612202672850',  null,                    'project_store',             'runtime_evidence', v_fb_at, v_bound_by),
    (v_project, 'youtube',   'UCUM9JDi75ziLssYcGLo8IPA', null,             'platform_env_transitional', 'runtime_evidence', v_yt_at, v_bound_by);

  raise notice 'social account evidence: bound The Prompt instagram 17841437027967629, facebook 1138612202672850, youtube UCUM9JDi75ziLssYcGLo8IPA';
end;
$$;
