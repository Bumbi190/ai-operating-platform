-- Disposable PG ONLY: dependencies for the verbatim canonical social_content_save.
-- The native content tables, validate, requirements, read and save bodies
-- are loaded from the canonical migration by the PowerShell fixture runner.
-- No Supabase connection, no social API, no provider or production data.
drop function public.social_content_save(jsonb,jsonb);
drop table public.social_content_posts;

alter table public.projects
 add column name text not null default 'Familje-Stunden';

create table public.social_launch_plan_revisions(
 id uuid primary key,
 project_id uuid not null references public.projects(id),
 sha256 text not null,
 choices jsonb not null,
 unique(project_id,id)
);
create table public.social_launch_plans(
 project_id uuid primary key references public.projects(id),
 current_revision_id uuid references public.social_launch_plan_revisions(id)
);
create table public.social_launch_plan_decisions(
 project_id uuid not null references public.projects(id),
 revision_id uuid not null references public.social_launch_plan_revisions(id),
 sha256 text not null,
 decision text not null
);
create table public.social_account_bindings(
 binding_id uuid primary key,
 project_id uuid not null references public.projects(id),
 platform text not null,
 external_account_id text not null,
 account_label text not null,
 blocked_at timestamptz,
 superseded_at timestamptz
);
create table public.assets(
 id uuid primary key,
 project_id uuid not null references public.projects(id),
 status text not null,
 kind text not null,
 mime_type text not null,
 checksum_sha256 text not null,
 width integer not null,
 height integer not null,
 created_at timestamptz not null default clock_timestamp()
);

insert into public.social_launch_plan_revisions(id,project_id,sha256,choices)
 values('99999999-9999-4999-8999-999999999999',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 repeat('d',64),'[{"channel":"facebook"},{"channel":"instagram"}]'::jsonb);
insert into public.social_launch_plans(project_id,current_revision_id)
 values('77cda551-57c9-4dc0-b019-1bb6438777f7',
 '99999999-9999-4999-8999-999999999999');
insert into public.social_launch_plan_decisions(project_id,revision_id,sha256,decision)
 values('77cda551-57c9-4dc0-b019-1bb6438777f7',
 '99999999-9999-4999-8999-999999999999',repeat('d',64),'approve');
insert into public.social_account_bindings(binding_id,project_id,platform,external_account_id,account_label)
 values
 ('11111111-1111-4111-8111-111111111111','77cda551-57c9-4dc0-b019-1bb6438777f7',
  'facebook','fixture-fb','Fixture Facebook'),
 ('22222222-2222-4222-8222-222222222222','77cda551-57c9-4dc0-b019-1bb6438777f7',
  'instagram','fixture-ig','Fixture Instagram');
insert into public.assets(id,project_id,status,kind,mime_type,checksum_sha256,width,height)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 'active','image','image/jpeg',repeat('c',64),1080,1080);

-- Match service-role read/write surfaces of native content code.
grant select on public.social_launch_plan_revisions,public.social_launch_plans,
 public.social_launch_plan_decisions,public.social_account_bindings,public.assets
 to service_role;
