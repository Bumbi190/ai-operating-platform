-- PROPOSED ONLY / NO SUPABASE MIGRATION. This SQL must be run only in a
-- disposable verified fixture until independently approved by the owner.
-- No real dealer, license, image, model, role activation or publication.
--
-- Prerequisites: existing public.projects, auth.users and proposed
-- public.website_vehicle_capture_listings. service_role is a TRUSTED SERVER
-- principal, NEVER a browser/API token. Future caller MUST authenticate a
-- real session and prove p_reviewer_id = signed-in user before calling.
--
-- Internal helper is deliberately in a non-exposed schema, SECURITY INVOKER.
-- This is NOT directly available through supabase-js public RPC. A separately
-- reviewed backend DB connection/bridge is needed at activation.
begin;
create schema if not exists website_review_private;
revoke all on schema website_review_private from public,anon,authenticated;
grant usage on schema website_review_private to service_role;

create table public.website_vehicle_review_assignments (
 listing_id uuid not null,
 project_id uuid not null,
 owner_id uuid not null,
 reviewer_id uuid not null references auth.users(id) on delete restrict,
 active boolean not null default true,
 assigned_at timestamptz not null default now(),
 primary key (listing_id, reviewer_id),
 foreign key (listing_id,project_id,owner_id)
  references public.website_vehicle_capture_listings(id,project_id,owner_id)
  on delete restrict
);

-- Each evidence revision is immutable. A revision is a reference to data
-- already independently checked for real bytes and source rights elsewhere.
-- Neither client-claimed photo proof nor an event hash proves physical identity.
create table public.website_vehicle_review_revisions (
 revision_id uuid primary key,
 listing_id uuid not null,
 project_id uuid not null,
 owner_id uuid not null,
 capture_id uuid not null,
 asset_id text not null check (asset_id ~ '^vehicle3d:[a-z0-9][a-z0-9-]{2,80}$'),
 glb_sha256 text not null check(glb_sha256 ~ '^[a-f0-9]{64}$'),
 evidence_digest text not null check(evidence_digest ~ '^[a-f0-9]{64}$'),
 photo_proof text not null check(photo_proof = 'pixels_checked_for_human_review'),
 created_at timestamptz not null default now(),
 unique (revision_id,listing_id,project_id,owner_id),
 foreign key (listing_id,project_id,owner_id)
  references public.website_vehicle_capture_listings(id,project_id,owner_id)
  on delete restrict
);

-- Mutable pointer, modified ONLY by future trusted revision controller. Its
-- UPDATE necessarily conflicts with the append function's FOR SHARE lock.
create table public.website_vehicle_review_current (
 listing_id uuid primary key,
 project_id uuid not null,
 owner_id uuid not null,
 revision_id uuid not null,
 changed_at timestamptz not null default now(),
 foreign key (revision_id,listing_id,project_id,owner_id)
  references public.website_vehicle_review_revisions
  (revision_id,listing_id,project_id,owner_id) on delete restrict
);

-- Only a PENDING inspection can be persisted, no 'approved' status exists.
create table public.website_vehicle_review_audit (
 audit_id uuid primary key default gen_random_uuid(),
 event_id uuid not null unique,
 reviewer_id uuid not null,
 listing_id uuid not null,
 project_id uuid not null,
 owner_id uuid not null,
 capture_id uuid not null,
 asset_id text not null,
 glb_sha256 text not null check(glb_sha256 ~ '^[a-f0-9]{64}$'),
 revision_id uuid not null,
 evidence_digest text not null check(evidence_digest ~ '^[a-f0-9]{64}$'),
 event_digest text not null check(event_digest ~ '^[a-f0-9]{64}$'),
 outcome text not null check(outcome in
  ('human_review_required','revision_required','additional_evidence_required')),
 differences text[] not null default '{}',
 uncertain text[] not null default '{}',
 reviewer_note text not null check(length(reviewer_note)<=4000),
 event_created_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 foreign key (revision_id,listing_id,project_id,owner_id)
  references public.website_vehicle_review_revisions
  (revision_id,listing_id,project_id,owner_id) on delete restrict,
 foreign key (listing_id,reviewer_id)
  references public.website_vehicle_review_assignments(listing_id,reviewer_id)
  on delete restrict
);
create index on public.website_vehicle_review_audit (project_id,listing_id,recorded_at desc);

alter table public.website_vehicle_review_assignments enable row level security;
alter table public.website_vehicle_review_revisions enable row level security;
alter table public.website_vehicle_review_current enable row level security;
alter table public.website_vehicle_review_audit enable row level security;
revoke all on public.website_vehicle_review_assignments,
 public.website_vehicle_review_revisions,
 public.website_vehicle_review_current,
 public.website_vehicle_review_audit from PUBLIC,anon,authenticated;
-- Not even a valid signed-in user can directly write or browse the review
-- register. Service role is authorized only for reviewed backend operations.
grant select,insert,update on public.website_vehicle_review_assignments to service_role;
grant select,insert on public.website_vehicle_review_revisions to service_role;
grant select,insert,update on public.website_vehicle_review_current to service_role;
grant select,insert on public.website_vehicle_review_audit to service_role;
grant select on public.website_vehicle_capture_listings,public.projects to service_role;
-- PostgreSQL FOR SHARE row locks need UPDATE privilege for the invoker.
-- Grant only the ownership/state columns, not general client UPDATE rights.
grant update(owner_id) on public.projects to service_role;
grant update(state) on public.website_vehicle_capture_listings to service_role;

-- Security-critical historical facts cannot be UPDATEd/deleted, including by
-- a service-role caller. Deliberate revision changes use new evidence records
-- and updates to the separate current pointer.
create function website_review_private.reject_history_mutation()
returns trigger language plpgsql security invoker
set search_path='' as $$
begin
 raise exception 'VEHICLE_REVIEW_IMMUTABLE_HISTORY';
end $$;
create trigger vehicle_review_immutable_revision
 before update or delete on public.website_vehicle_review_revisions
 for each row execute function website_review_private.reject_history_mutation();
create trigger vehicle_review_immutable_audit
 before update or delete on public.website_vehicle_review_audit
 for each row execute function website_review_private.reject_history_mutation();

create function website_review_private.append_pending(
 p_event_id uuid,p_reviewer_id uuid,p_project_id uuid,p_listing_id uuid,
 p_capture_id uuid,p_revision_id uuid,p_asset_id text,p_glb_sha256 text,
 p_evidence_digest text,p_event_digest text,p_event_created_at timestamptz,
 p_outcome text,p_differences text[],p_uncertain text[],p_note text
) returns table(stored boolean,reason text,audit_id uuid)
language plpgsql security invoker set search_path='' as $$
declare
 v_owner uuid;
 v_listing uuid;
 v_current uuid;
 v_assigned uuid;
 v_evidence uuid;
 v_inserted uuid;
begin
 if p_event_id is null or p_reviewer_id is null or p_project_id is null
    or p_listing_id is null or p_capture_id is null or p_revision_id is null
    or p_glb_sha256 is null or p_glb_sha256 !~ '^[a-f0-9]{64}$'
    or p_evidence_digest is null or p_evidence_digest !~ '^[a-f0-9]{64}$'
    or p_event_digest is null or p_event_digest !~ '^[a-f0-9]{64}$'
    or p_outcome is null
    or p_outcome not in ('human_review_required','revision_required','additional_evidence_required')
    or p_asset_id is null or p_asset_id !~ '^vehicle3d:[a-z0-9][a-z0-9-]{2,80}$'
    or p_note is null or length(p_note)>4000
    or p_event_created_at is null
    or abs(extract(epoch from (now()-p_event_created_at)))>300
    or p_differences is null or p_uncertain is null
    or cardinality(p_differences)>20 or cardinality(p_uncertain)>20 then
   return query select false,'invalid_input'::text,null::uuid;
   return;
 end if;

 -- Lock the ownership row against a concurrent project transfer.
 select p.owner_id into v_owner from public.projects p
  where p.id=p_project_id for share;
 if v_owner is null then
  return query select false,'no_permission'::text,null::uuid; return;
 end if;
 -- A concurrent listing revoke must also conflict with this lock.
 select l.id into v_listing from public.website_vehicle_capture_listings l
 where l.id=p_listing_id and l.project_id=p_project_id
   and l.owner_id=v_owner and l.state='evidence_only'
 for share;
 if v_listing is null then
  return query select false,'no_permission'::text,null::uuid; return;
 end if;

 -- These row locks serialize against an assignment revoke (UPDATE active)
 -- and evidence switch (UPDATE current.revision_id). If the switch commits
 -- first, the append sees it and refuses. If append locks first, the switch
 -- waits until its transaction commits. No SELECT then unguarded INSERT.
 select c.revision_id into v_current
 from public.website_vehicle_review_current c
 where c.listing_id=p_listing_id and c.project_id=p_project_id
  and c.owner_id=v_owner
 for share;
 if v_current is distinct from p_revision_id then
  return query select false,'stale_revision'::text,null::uuid; return;
 end if;

 select a.reviewer_id into v_assigned
 from public.website_vehicle_review_assignments a
 where a.listing_id=p_listing_id and a.project_id=p_project_id
  and a.owner_id=v_owner and a.reviewer_id=p_reviewer_id and a.active
 for share;
 if v_assigned is null then
  return query select false,'no_permission'::text,null::uuid; return;
 end if;

 select e.revision_id into v_evidence
 from public.website_vehicle_review_revisions e
 where e.revision_id=p_revision_id and e.listing_id=p_listing_id
  and e.project_id=p_project_id and e.owner_id=v_owner
  and e.capture_id=p_capture_id and e.asset_id=p_asset_id
  and e.glb_sha256=p_glb_sha256 and e.evidence_digest=p_evidence_digest
  and e.photo_proof='pixels_checked_for_human_review';
 if v_evidence is null then
  return query select false,'stale_revision'::text,null::uuid; return;
 end if;

 insert into public.website_vehicle_review_audit (
  event_id,reviewer_id,listing_id,project_id,owner_id,capture_id,asset_id,
  glb_sha256,revision_id,evidence_digest,event_digest,outcome,
  differences,uncertain,reviewer_note,event_created_at
 ) values (
  p_event_id,p_reviewer_id,p_listing_id,p_project_id,v_owner,p_capture_id,
  p_asset_id,p_glb_sha256,p_revision_id,p_evidence_digest,p_event_digest,
  p_outcome,p_differences,p_uncertain,p_note,p_event_created_at
 ) on conflict (event_id) do nothing returning website_vehicle_review_audit.audit_id into v_inserted;
 if v_inserted is null then
  return query select false,'duplicate'::text,null::uuid; return;
 end if;
 return query select true,null::text,v_inserted;
end $$;

revoke all on function website_review_private.reject_history_mutation() from PUBLIC,anon,authenticated;
revoke all on function website_review_private.append_pending(
 uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,text,text[],text[],text
) from PUBLIC,anon,authenticated;
grant execute on function website_review_private.append_pending(
 uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,timestamptz,text,text[],text[],text
) to service_role;
commit;

-- !!! NOT RELEASE-READY !!!
-- This contract is only for TRUSTED BACKEND with signed-in user ID verified
-- from its server session. service_role can impersonate any reviewer by design,
-- and MUST NEVER be reachable from a browser or an untrusted RPC.
-- A separate trusted revision/revoke writer MUST use the same locking model.
-- This stores a pending visual assessment, not proof of physical-car identity,
-- a human signature, accepted license, digital twin or publish permission.
-- Verify isolated A/B, replay, revoke, revision race, immutable history, and
-- grant audits BEFORE any owner-authorized production migration.
