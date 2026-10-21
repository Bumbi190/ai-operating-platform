-- Isolated reconciliation fixture. Real proof table/constraints kept intact.
-- Inspector below models locking and owner scope only, NOT provider/media proof review.
alter table public.social_publications
 add column reconciled_at timestamptz,
 add column requested_at timestamptz not null default now();

create table public.social_publication_reconciliation_proofs(
 id uuid primary key default gen_random_uuid(),publication_id uuid not null,project_id uuid not null,
 revision_id uuid not null,revision_sha256 text not null,reviewed_asset_sha256 text not null,
 candidate jsonb not null,candidate_hash text not null check(candidate_hash~'^[a-f0-9]{64}$'),
 version integer not null check(version>0),created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 foreign key(publication_id,project_id) references public.social_publications(id,project_id),
 check(expires_at>created_at));
grant select,insert on public.social_publication_reconciliation_proofs to service_role;

-- Reduced fixture: real inspector also checks Facebook media, provider candidate
-- shape, account bindings, and content revision. It may INSERT proof rows.
-- These tests seed previously reviewed evidence rather than granting fresh proof.
create function public.social_publication_reconciliation_inspect(
 p_principal jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into r from public.social_publications
 where id=(p_input->>'publicationId')::uuid
   and project_id=(p_input->>'projectId')::uuid
   and post_id=(p_input->>'postId')::uuid for update;
 if not found then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 if r.channel<>'facebook' or r.state not in ('uncertain','published')
   or (r.state='published' and r.reconciled_at is null)
 then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 return jsonb_build_object('fixtureOnly',true);
end $fn$;
revoke all on function public.social_publication_reconciliation_inspect(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_publication_reconciliation_inspect(jsonb,jsonb)
 to service_role;
