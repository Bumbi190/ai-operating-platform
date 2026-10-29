-- Disposable PostgreSQL ONLY: narrow non-binding dependencies.
-- For native-binding mode the account table, CHECKs, unique indexes,
-- immutable identity guards, block guard and rebind RPC are loaded verbatim
-- from 20260914120000_social_account_bindings.sql, not reimplemented here.
-- The plan/assets tables in this mode remain clearly synthetic.
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
insert into public.assets(id,project_id,status,kind,mime_type,checksum_sha256,width,height)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',
 'active','image','image/jpeg',repeat('c',64),1080,1080);
grant select on public.social_launch_plan_revisions,public.social_launch_plans,
 public.social_launch_plan_decisions,public.assets to service_role;
