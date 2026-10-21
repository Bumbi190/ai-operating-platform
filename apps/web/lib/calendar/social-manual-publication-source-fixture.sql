-- Isolated manual-publication SQL fixture; never a production migration.
-- Retains table constraints relevant to manual idempotency, not full provider
-- authentication, content review, RLS or social account binding schemas.
alter table public.social_content_revisions
 add column draft jsonb,
 add column binding jsonb,
 add column binding_id uuid;
create table public.social_content_posts(
 id uuid primary key,
 project_id uuid not null references public.projects(id)
);
grant select on public.social_content_posts to service_role;

alter table public.social_publications
 add column revision_id uuid,
 add column sha256 text,
 add column decision_id uuid,
 add column binding_id uuid,
 add column channel text,
 add column account_id text,
 add column account_label text,
 add column request_input jsonb,
 add column idempotency_key text,
 add column requested_by uuid,
 add column authority_source text not null default 'manual',
 add column job_id uuid,
 add column container_id text,
 add column provider_id text,
 add column permalink text,
 add column confirmation text;
alter table public.social_publications
 alter column state set default 'requested';
create unique index social_manual_post_unique_probe on
 public.social_publications(post_id);
create unique index social_manual_idempotency_unique_probe on
 public.social_publications(project_id,idempotency_key);

create or replace function public.social_publication_record(
 r public.social_publications
) returns jsonb language sql immutable security invoker set search_path='' as $fn$
 select jsonb_build_object('id',r.id,'projectId',r.project_id,
  'postId',r.post_id,'state',r.state,'version',r.version,
  'authoritySource',r.authority_source,'providerId',r.provider_id,
  'confirmation',r.confirmation,'failureCode',r.failure_code);
$fn$;
revoke all on function public.social_publication_record(public.social_publications)
 from public,anon,authenticated,service_role;
grant execute on function public.social_publication_record(public.social_publications)
 to service_role;

-- Intentional stub of real social_publication_guard: basic owner/post/revision
-- linkage only. Actual plan, account binding, media, content approval and
-- provider safety validation remains a full-schema release blocker.
create or replace function public.social_publication_guard(
 p_principal jsonb,p_input jsonb
) returns public.social_content_revisions
language plpgsql security invoker set search_path='' as $fn$
declare c public.social_content_revisions;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 select r.* into c from public.social_content_revisions r
 join public.social_content_posts p
   on p.id=r.post_id and p.project_id=r.project_id
 where r.project_id=(p_input->>'projectId')::uuid
   and r.post_id=(p_input->>'postId')::uuid
   and r.id=(p_input->>'revisionId')::uuid
   and r.sha256=p_input->>'sha256'
   and r.binding_id=(p_input->>'bindingId')::uuid;
 if not found then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 return c;
end $fn$;
revoke all on function public.social_publication_guard(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_publication_guard(jsonb,jsonb)
 to service_role;
