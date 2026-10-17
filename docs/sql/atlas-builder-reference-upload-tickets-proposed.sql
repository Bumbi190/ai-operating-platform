-- Atlas Builder Studio reference-image staging. This migration is NOT applied by this draft PR.
-- Signed upload tokens bypass object RLS, so their paths MUST be server-minted,
-- short-lived, private and bound to a verified owner/project/conversation.
begin;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('atlas-reference-staging','atlas-reference-staging',false,10485760,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='atlas-reference-staging' and public=false
      and file_size_limit=10485760
      and allowed_mime_types @> array['image/png','image/jpeg','image/webp']::text[]
      and cardinality(allowed_mime_types)=3
  ) then raise exception 'ATLAS_REFERENCE_STAGING_BUCKET_MISMATCH'; end if;
end $$;

-- No storage.objects policies: anonymous/authenticated reads and writes are
-- denied. Only the trusted server can mint signed upload capabilities.
create table public.website_build_reference_tickets (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 project_id uuid not null references public.projects(id),
 conversation_id uuid not null references public.conversations(id),
 draft_id uuid not null,
 slot smallint not null check (slot between 0 and 3),
 mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
 object_path text not null unique,
 state text not null default 'issued'
   check (state in ('issued','processing','ready','rejected')),
 asset_id uuid references public.assets(id),
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '2 hours'),
 updated_at timestamptz not null default now(),
 unique (owner_id, conversation_id, draft_id, slot),
 constraint website_reference_state_asset_check
   check ((state='ready') = (asset_id is not null)),
 constraint website_reference_ttl_check
   check (expires_at > issued_at and expires_at <= issued_at + interval '2 hours')
);
create index website_reference_tickets_project on public.website_build_reference_tickets
 (project_id,conversation_id,issued_at desc);
alter table public.website_build_reference_tickets enable row level security;
alter table public.website_build_reference_tickets force row level security;
revoke all on public.website_build_reference_tickets from public,anon,authenticated,service_role;
grant select,insert,update on public.website_build_reference_tickets to service_role;

-- No public definer RPC, no authenticated table privileges and no broadened
-- storage policy. Signed tokens must never be logged or stored in this table.
commit;
