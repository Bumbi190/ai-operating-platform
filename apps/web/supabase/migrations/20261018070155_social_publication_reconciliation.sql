
alter table public.social_publications add column reconciled_at timestamptz;
alter table public.social_publication_events add column details jsonb not null default '{}';
alter table public.social_publication_events drop constraint social_publication_events_event_check;
alter table public.social_publication_events add constraint social_publication_events_event_check check(event in ('requested','claim_create','container_ready','claim_publish','complete','fail','uncertain','confirm_published','reconcile_verified'));
create table public.social_publication_reconciliation_proofs(
 id uuid primary key default gen_random_uuid(),publication_id uuid not null,project_id uuid not null,
 revision_id uuid not null,revision_sha256 text not null,reviewed_asset_sha256 text not null,
 candidate jsonb not null,candidate_hash text not null check(candidate_hash~'^[a-f0-9]{64}$'),
 version integer not null check(version>0),created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 foreign key(publication_id,project_id) references public.social_publications(id,project_id),
 check(expires_at>created_at));
alter table public.social_publication_reconciliation_proofs enable row level security;
revoke all on public.social_publication_reconciliation_proofs from public,anon,authenticated,service_role;
grant select,insert on public.social_publication_reconciliation_proofs to service_role;
create function public.social_publication_reconciliation_inspect(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;c public.social_content_revisions;v jsonb;proofs jsonb;proof_id uuid;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','candidates')) or not(p_input?&array['projectId','postId','publicationId']) then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid and project_id=(p_input->>'projectId')::uuid and post_id=(p_input->>'postId')::uuid for update;
 if not found then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 if r.channel<>'facebook' or r.state not in ('uncertain','published') or r.state='published' and r.reconciled_at is null then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 select * into c from public.social_content_revisions where id=r.revision_id and post_id=r.post_id and project_id=r.project_id and sha256=r.sha256;
 if c.id is null or c.draft->>'format'<>'image' or jsonb_array_length(c.media)<>1
 or not exists(select 1 from public.social_account_bindings b where b.binding_id=r.binding_id and b.project_id=r.project_id and b.platform='facebook' and b.external_account_id=r.account_id and b.superseded_at is null and b.blocked_at is null)
 then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 if p_input?'candidates' then
  if r.state<>'uncertain' or jsonb_typeof(p_input->'candidates') is distinct from 'array' or jsonb_array_length(p_input->'candidates')>50 then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
  for v in select value from jsonb_array_elements(p_input->'candidates') loop
   if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>9 or exists(select 1 from jsonb_object_keys(v) k where k not in ('id','providerId','accountId','createdAt','text','permalink','photoId','imageUrl','candidateHash'))
   or v->>'accountId' is distinct from r.account_id or v->>'providerId' !~ ('^'||r.account_id||'_[0-9]{1,80}$')
   or v->>'text' is distinct from c.draft->>'text' or (v->>'createdAt')::timestamptz not between r.requested_at-interval '60 seconds' and r.requested_at+interval '5 minutes'
   or coalesce(v->>'photoId','') !~ '^[0-9]{1,80}$' or coalesce(v->>'candidateHash','') !~ '^[a-f0-9]{64}$'
   or coalesce(v->>'permalink','') !~ '^https://www[.]facebook[.]com/[^[:space:]]+$'
   or coalesce(v->>'imageUrl','') !~ '^https://scontent[.a-z0-9-]*[.]fbcdn[.]net/[^[:space:]]+$'
   then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
   select id into proof_id from public.social_publication_reconciliation_proofs where publication_id=r.id and candidate_hash=v->>'candidateHash' and version=r.version and expires_at>clock_timestamp() order by created_at desc limit 1;
   if proof_id is null then
    insert into public.social_publication_reconciliation_proofs(publication_id,project_id,revision_id,revision_sha256,reviewed_asset_sha256,candidate,candidate_hash,version)
    values(r.id,r.project_id,c.id,c.sha256,c.media->0->>'sha256',v-'id'-'candidateHash',v->>'candidateHash',r.version);
   end if;
  end loop;
 end if;
 select coalesce(jsonb_agg(p.candidate||jsonb_build_object('id',p.id,'publicationId',p.publication_id,'revisionId',p.revision_id,'revisionSha256',p.revision_sha256,'reviewedAssetSha256',p.reviewed_asset_sha256,'candidateHash',p.candidate_hash,'version',p.version,'expiresAt',p.expires_at) order by p.created_at),'[]') into proofs from public.social_publication_reconciliation_proofs p where p.publication_id=r.id and p.expires_at>clock_timestamp() and (p.version=r.version or r.state='published');
 return jsonb_build_object('snapshot',jsonb_build_object('publication',public.social_publication_record(r),'revision',jsonb_build_object('id',c.id,'sequence',c.sequence,'sha256',c.sha256,'planRevisionId',c.plan_revision_id,'draft',c.draft,'media',c.media,'binding',c.binding,'createdAt',c.created_at)),'proofs',proofs);
end $fn$;
create function public.social_publication_reconciliation_complete(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;p public.social_publication_reconciliation_proofs;v jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>8 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','candidateId','expectedVersion','imageConfirmed','candidateHash','readAt'))
 or p_input->'imageConfirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_input->'expectedVersion') is distinct from 'number' or coalesce(p_input->>'candidateHash','') !~ '^[a-f0-9]{64}$'
 then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
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
 return public.social_publication_record(r);
end $fn$;
revoke all on function public.social_publication_reconciliation_inspect(jsonb,jsonb),public.social_publication_reconciliation_complete(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_publication_reconciliation_inspect(jsonb,jsonb),public.social_publication_reconciliation_complete(jsonb,jsonb) to service_role;
create or replace function public.social_publication_record(r public.social_publications) returns jsonb language sql immutable security invoker set search_path='' as $fn$
 select jsonb_build_object('id',r.id,'projectId',r.project_id,'postId',r.post_id,'revisionId',r.revision_id,'sha256',r.sha256,'decisionId',r.decision_id,'bindingId',r.binding_id,'channel',r.channel,'accountId',r.account_id,'accountLabel',r.account_label,'state',r.state,'version',r.version,'containerId',r.container_id,'providerId',r.provider_id,'permalink',r.permalink,'failureCode',r.failure_code,'confirmation',r.confirmation,'requestedAt',r.requested_at,'updatedAt',r.updated_at,'reconciledAt',r.reconciled_at);
$fn$;
