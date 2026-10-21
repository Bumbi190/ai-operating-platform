-- ISOLATED REVIEW CANDIDATE, not a migration. Last reconciler body comes
-- from 20261018071209_social_schedule_batches.sql (not the earlier definition).
-- Source lock precedes the inspect RPC because inspect locks project/publication.
-- Only a genuine uncertain->published state update bumps the source revision.
-- Authenticated end-user identity still depends on the trusted service caller.
create or replace function public.social_publication_reconciliation_complete(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;p public.social_publication_reconciliation_proofs;v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>8 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','candidateId','expectedVersion','imageConfirmed','candidateHash','readAt'))
 or p_input->'imageConfirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or coalesce(p_input->>'candidateHash','') !~ '^[a-f0-9]{64}$'
 then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 -- Source first: inspect itself takes project/publication row locks.
 perform public.calendar_social_source_lock_probe(p_principal,p_input);
 v=public.social_publication_reconciliation_inspect(p_principal,jsonb_build_object('projectId',p_input->>'projectId','postId',p_input->>'postId','publicationId',p_input->>'publicationId'));
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid for update;
 select * into p from public.social_publication_reconciliation_proofs where id=(p_input->>'candidateId')::uuid and publication_id=r.id and project_id=r.project_id;
 if p.id is null or p.expires_at<clock_timestamp() or p.candidate_hash is distinct from p_input->>'candidateHash'
 or p.revision_id<>r.revision_id or p.revision_sha256<>r.sha256 or p.version<>(p_input->>'expectedVersion')::integer
 or (p_input->>'readAt')::timestamptz not between clock_timestamp()-interval '30 seconds' and clock_timestamp()+interval '5 seconds'
 then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
 if r.state='published' then
  if r.provider_id=p.candidate->>'providerId' and r.permalink=p.candidate->>'permalink' then return public.social_publication_record(r);end if;
  raise exception 'SOCIAL_PUBLICATION_CONFLICT';
 end if;
 if r.state<>'uncertain' or r.version<>p.version then raise exception 'SOCIAL_PUBLICATION_CONFLICT';end if;
 update public.social_publications set state='published',version=version+1,updated_at=clock_timestamp(),reconciled_at=clock_timestamp(),provider_id=p.candidate->>'providerId',permalink=p.candidate->>'permalink',confirmation='provider_id',failure_code=null,capability_hash=null,capability_expires_at=null where id=r.id returning * into r;
 insert into public.social_publication_events(publication_id,project_id,event,from_state,to_state,version,actor,details)
 values(r.id,r.project_id,'reconcile_verified','uncertain','published',r.version,(p_principal->>'userId')::uuid,jsonb_build_object('revisionId',p.revision_id,'revisionSha256',p.revision_sha256,'reviewedAssetSha256',p.reviewed_asset_sha256,'accountId',r.account_id,'providerId',r.provider_id,'candidateHash',p.candidate_hash,'readAt',p_input->>'readAt'));
 if r.authority_source='scheduled' then
  update public.social_schedule_jobs set state='published',version=version+1,reason=null,lease_expires_at=null,updated_at=public.social_schedule_now() where id=r.job_id and project_id=r.project_id and publication_id=r.id;
  insert into public.social_schedule_events(project_id,job_id,event,actor_kind,actor,details) values(r.project_id,r.job_id,'receipt_reconciled','owner',(p_principal->>'userId')::uuid,jsonb_build_object('publicationId',r.id,'providerId',r.provider_id));
 end if;
 perform public.calendar_social_source_bump_probe(p_principal,p_input);
 return public.social_publication_record(r);
end $fn$;
revoke all on function public.social_publication_reconciliation_complete(jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.social_publication_reconciliation_complete(jsonb,jsonb)
 to service_role;
