-- Omnira collaborator review queue. This is a non-executing proposal ledger.
-- All client table privileges are revoked. Application routes must authenticate
-- the principal, verify org membership and project scope before using service role.
create table if not exists public.omnira_collaborator_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  author_id uuid not null references auth.users(id),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  detail text not null check (char_length(btrim(detail)) between 10 and 4000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_by uuid references auth.users(id),
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 600),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint omnira_proposal_decision_consistency check (
    (status = 'pending' and decision_by is null and decided_at is null)
    or (status in ('approved','rejected') and decision_by is not null and decided_at is not null and decision_by <> author_id)
  )
);
create index if not exists omnira_proposals_project_created
  on public.omnira_collaborator_proposals (project_id, created_at desc);
alter table public.omnira_collaborator_proposals enable row level security;
alter table public.omnira_collaborator_proposals force row level security;
revoke all on public.omnira_collaborator_proposals from public, anon, authenticated;
grant select, insert, update on public.omnira_collaborator_proposals to service_role;

create table if not exists public.omnira_collaborator_proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.omnira_collaborator_proposals(id),
  actor_id uuid not null references auth.users(id),
  event text not null check (event in ('submitted','approved','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists omnira_proposal_events_proposal_created
  on public.omnira_collaborator_proposal_events (proposal_id, created_at);
alter table public.omnira_collaborator_proposal_events enable row level security;
alter table public.omnira_collaborator_proposal_events force row level security;
revoke all on public.omnira_collaborator_proposal_events from public, anon, authenticated;
grant select, insert on public.omnira_collaborator_proposal_events to service_role;

-- Append-only audit entries inserted transactionally by a regular INVOKER trigger.
-- No trigger or API route launches a workflow, changes code, or deploys.
create or replace function public.omnira_collaborator_proposal_record_event()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.omnira_collaborator_proposal_events(proposal_id, actor_id, event)
      values (NEW.id, NEW.author_id, 'submitted');
  elsif OLD.status is distinct from NEW.status then
    insert into public.omnira_collaborator_proposal_events(proposal_id, actor_id, event)
      values (NEW.id, NEW.decision_by, NEW.status);
  end if;
  return NEW;
end;
$$;
revoke all on function public.omnira_collaborator_proposal_record_event() from public, anon, authenticated;
drop trigger if exists omnira_collaborator_proposal_audit on public.omnira_collaborator_proposals;
create trigger omnira_collaborator_proposal_audit
after insert or update of status on public.omnira_collaborator_proposals
for each row execute function public.omnira_collaborator_proposal_record_event();

comment on table public.omnira_collaborator_proposals is
  'Human-reviewed change suggestions only; approval is NEVER execution authorization.';
