-- Synthetic app shell AFTER real GoTrue/Storage migrations. Never deploy this file.
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id),execution_paused boolean not null default false);
create table public.conversations(id uuid primary key,user_id uuid not null references auth.users(id),project_id uuid references public.projects(id));
create table public.conversation_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations(id) on delete cascade,role text not null,content text,tool_data jsonb,created_at timestamptz default now());
create table public.project_lifecycle(project_id uuid primary key references public.projects(id),owner_id uuid not null,state text not null);
create table public.project_budgets(project_id uuid primary key references public.projects(id),monthly_sek numeric not null);
create table public.website_content(id uuid primary key);
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
create policy fixture_projects_owner on public.projects for select to authenticated using(owner_id=auth.uid());
create policy fixture_conversations_owner on public.conversations for select to authenticated using(user_id=auth.uid());
create policy fixture_messages_owner on public.conversation_messages for select to authenticated using(conversation_id in(select id from public.conversations where user_id=auth.uid()));
grant select on public.projects,public.conversations,public.conversation_messages to authenticated;
-- Canonical asset migration relies on default API privileges; its actual RLS remains in force.
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
