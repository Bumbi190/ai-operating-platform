\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. This file supplies a bounded test dataset
-- and the schedule/publication read-only relation surfaces required by the
-- verbatim canonical social_weekly_context. The profile tables + functions,
-- content tables + functions, scheduling JSON canonicalizer and weekly reader
-- are loaded VERBATIM from the checked-in migrations by the runner.
-- No real owner, production assets, social provider, or Supabase connection.
alter table public.social_account_bindings
 add column verification text not null default 'provider_attested';
-- Fixture-only capability to simulate a provider losing verification and
-- restore it; does NOT imply a production service_role UPDATE grant.
grant update(verification) on public.social_account_bindings to service_role;

create table public.social_schedule_jobs(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 post_id uuid not null,
 revision_id uuid not null,
 state text not null default 'queued',
 publication_id uuid,
 scheduled_at timestamptz not null,
 item jsonb not null,
 channel text not null,
 occasion_id uuid not null
);
create table public.social_publications(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id),
 post_id uuid not null,
 revision_id uuid not null,
 channel text not null,
 state text not null,
 requested_at timestamptz not null,
 updated_at timestamptz not null
);
create table public.social_monthly_release_rules(
 project_id uuid primary key references public.projects(id),
 rule jsonb not null
);
alter table public.social_schedule_jobs enable row level security;
alter table public.social_publications enable row level security;
alter table public.social_monthly_release_rules enable row level security;
revoke all on public.social_schedule_jobs,public.social_publications,
 public.social_monthly_release_rules from public,anon,authenticated,service_role;
grant select on public.social_schedule_jobs,public.social_publications,
 public.social_monthly_release_rules to service_role;

-- Real profile tables have been created from canonical migration before
-- this dataset executes. These are invented fixture IDs and texts only.
insert into public.social_project_profiles(project_id)
values ('77cda551-57c9-4dc0-b019-1bb6438777f7');
insert into public.social_project_profile_revisions(
 id,project_id,sequence,sha256,profile,input_data,idempotency_key,
 created_by,conversation_id
) values(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',1,repeat('b',64),
 jsonb_build_object(
  'description','Familje-Stunden erbjuder sagor och aktiviteter med Nova och Pling.',
  'audience','Familjer med barn','tone','Varm och enkel',
  'websiteUrl','https://familje-stunden.se',
  'callToAction','Upptäck äventyret','factualBoundaries','Hitta inte på aktiviteter',
  'preferredMediaIds',jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 ),
 '{}'::jsonb,'fixture_profile_1',
 '77777777-7777-4777-8777-777777777777',
 '55555555-5555-4555-8555-555555555555'
);
update public.social_project_profiles set
 current_revision_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7';

insert into public.social_monthly_release_rules(project_id,rule)
values ('77cda551-57c9-4dc0-b019-1bb6438777f7','{"enabled":false}'::jsonb);

-- Description must come from an immutable, earlier owned content revision.
-- Native social_content_save persists the actual media snapshot and derives
-- the account binding and SHA from the owned image + approved plan.
select public.social_content_save(
 jsonb_build_object('userId','77777777-7777-4777-8777-777777777777',
   'allowedProjectIds',jsonb_build_array('77cda551-57c9-4dc0-b019-1bb6438777f7')),
 jsonb_build_object(
  'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
  'conversationId','55555555-5555-4555-8555-555555555555',
  'postId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'expectedRevisionId',null,'planRevisionId','99999999-9999-4999-8999-999999999999',
  'idempotencyKey','native_context_described_owned_jpeg',
  'draft',jsonb_build_object('channel','facebook','format','image',
   'title','Beskriven bild','text','Nova visar en aktivitet.',
   'linkUrl',null,
   'mediaIds',jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
   'mediaBrief','Nova och Pling vid pysselbordet i en egen godkänd bild.',
   'scheduledAt',null)
 )
)->'project' as seeded_project;
