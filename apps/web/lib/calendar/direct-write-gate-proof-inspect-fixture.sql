-- ISOLATED PostgreSQL STAND-IN, NEVER PRODUCTION SQL.
-- Deliberately reduced social_publication_reconciliation_inspect.
-- Tests only source-first gate, project/publication locking, owner scope and
-- proof insertion/idempotent replay. It DOES NOT check real provider candidates,
-- account binding, text, media, asset SHA, timestamps or proof authenticity.
create or replace function public.social_publication_reconciliation_inspect(
 p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 r public.social_publications;
 v jsonb;
 verified_proofs jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object'
   or not (p_input ?& array['projectId','postId','publicationId'])
   or exists(
     select 1 from jsonb_object_keys(p_input) key
     where key not in ('projectId','postId','publicationId','candidates')
   )
 then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;

 -- The real candidate injects precisely this call before locking projects
 -- and publications. The signed token applies only to the current project
 -- and current SQL transaction.
 perform public.calendar_source_gate_begin_probe((p_input->>'projectId')::uuid);
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

 if p_input ? 'candidates' then
  if r.state<>'uncertain'
    or jsonb_typeof(p_input->'candidates') is distinct from 'array'
    or jsonb_array_length(p_input->'candidates')>5
  then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
  for v in select value from jsonb_array_elements(p_input->'candidates') loop
   -- TEST SHAPE ONLY. THIS IS NOT REAL FACEBOOK PROOF VALIDATION.
   if jsonb_typeof(v) is distinct from 'object'
      or coalesce(v->>'candidateHash','') !~ '^[a-f0-9]{64}$'
      or coalesce(v->>'providerId','') = ''
      or coalesce(v->>'permalink','') = ''
   then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
   if not exists(
    select 1 from public.social_publication_reconciliation_proofs p
    where p.publication_id=r.id and p.project_id=r.project_id
      and p.candidate_hash=v->>'candidateHash'
      and p.version=r.version and p.expires_at>clock_timestamp()
   ) then
    insert into public.social_publication_reconciliation_proofs(
     publication_id,project_id,revision_id,revision_sha256,
     reviewed_asset_sha256,candidate,candidate_hash,version)
    values(
     r.id,r.project_id,r.revision_id,r.sha256,repeat('c',64),
     jsonb_build_object('providerId',v->>'providerId','permalink',v->>'permalink'),
     v->>'candidateHash',r.version
    );
   end if;
  end loop;
 end if;

 select coalesce(jsonb_agg(p.candidate || jsonb_build_object(
    'id',p.id,'version',p.version,'candidateHash',p.candidate_hash)
    order by p.created_at),'[]'::jsonb)
 into verified_proofs
 from public.social_publication_reconciliation_proofs p
 where p.publication_id=r.id and p.project_id=r.project_id
   and p.expires_at>clock_timestamp();
 return jsonb_build_object('fixtureOnly',true,'proofs',verified_proofs);
end $fn$;
revoke all on function public.social_publication_reconciliation_inspect(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_publication_reconciliation_inspect(jsonb,jsonb)
 to service_role;
