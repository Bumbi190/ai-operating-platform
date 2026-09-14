-- Project-scoped social credentials — platform_tokens holds only a project's own
-- Instagram or Facebook credential.
--
-- A stored social credential without a project is exactly the "global token" the
-- owner ruled out, so the database now refuses one: project_id is NOT NULL.
-- Alongside it, the rows the application may write are pinned to what it writes:
-- instagram with token_type 'user', facebook with token_type 'page', and an
-- account id that is a bounded provider identifier or empty.
--
-- NO ROW IS CHANGED. Every existing row already satisfies these constraints
-- (checked in production before apply: two rows, both with a project, the
-- expected type per platform and a numeric or empty account id). If one did not,
-- the migration would fail and apply nothing.

alter table public.platform_tokens
  alter column project_id set not null;

alter table public.platform_tokens
  add constraint platform_tokens_platform_valid
    check (platform in ('instagram', 'facebook')),
  add constraint platform_tokens_token_type_matches_platform
    check ((platform = 'instagram' and token_type = 'user')
        or (platform = 'facebook'  and token_type = 'page')),
  add constraint platform_tokens_account_id_shape
    check (account_id is null or account_id ~ '^[A-Za-z0-9_-]{1,64}$');

comment on column public.platform_tokens.project_id is
  'The project that owns this credential. NOT NULL: a social credential without a project would be a global credential, which the application never selects.';
