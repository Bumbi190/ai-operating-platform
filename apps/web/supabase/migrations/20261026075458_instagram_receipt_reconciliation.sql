-- Extend read-only receipt reconciliation to Instagram IMAGE posts.
-- Keep completion, scheduler metadata and publication state transitions unchanged.
create or replace function public.social_publication_reconciliation_inspect(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_publications;c public.social_content_revisions;v jsonb;proofs jsonb;proof_id uuid;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','publicationId','candidates')) or not(p_input?&array['projectId','postId','publicationId']) then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into r from public.social_publications where id=(p_input->>'publicationId')::uuid and project_id=(p_input->>'projectId')::uuid and post_id=(p_input->>'postId')::uuid for update;
 if not found then raise exception 'SOCIAL_PUBLICATION_NOT_FOUND' using errcode='P0002';end if;
 if r.channel not in ('facebook','instagram') or r.state not in ('uncertain','published') or r.state='published' and r.reconciled_at is null then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 select * into c from public.social_content_revisions where id=r.revision_id and post_id=r.post_id and project_id=r.project_id and sha256=r.sha256;
 if c.id is null or c.draft->>'format'<>'image' or jsonb_array_length(c.media)<>1
 or not exists(select 1 from public.social_account_bindings b where b.binding_id=r.binding_id and b.project_id=r.project_id and b.platform=r.channel and b.external_account_id=r.account_id and b.superseded_at is null and b.blocked_at is null)
 then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED';end if;
 if p_input?'candidates' then
  if r.state<>'uncertain' or jsonb_typeof(p_input->'candidates') is distinct from 'array' or jsonb_array_length(p_input->'candidates')>50 or (r.channel='instagram' and jsonb_array_length(p_input->'candidates')<>1) then raise exception 'SOCIAL_PUBLICATION_INVALID_BODY';end if;
  for v in select value from jsonb_array_elements(p_input->'candidates') loop
   if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>9 or exists(select 1 from jsonb_object_keys(v) k where k not in ('id','providerId','accountId','createdAt','text','permalink','photoId','imageUrl','candidateHash'))
   or exists(select 1 from jsonb_each(v) e where jsonb_typeof(e.value) is distinct from 'string')
   or v->>'accountId' is distinct from r.account_id or coalesce(v->>'providerId','')='' or (r.channel='facebook' and v->>'providerId' !~ ('^'||r.account_id||'_[0-9]{1,80}$')) or (r.channel='instagram' and (v->>'providerId' !~ '^[0-9]{1,80}$' or v->>'photoId' is distinct from v->>'providerId'))
   or v->>'text' is distinct from c.draft->>'text' or (v->>'createdAt')::timestamptz not between r.requested_at-interval '60 seconds' and r.requested_at+interval '5 minutes'
   or coalesce(v->>'photoId','') !~ '^[0-9]{1,80}$' or coalesce(v->>'candidateHash','') !~ '^[a-f0-9]{64}$'
   or (r.channel='facebook' and (coalesce(v->>'permalink','') !~ '^https://www[.]facebook[.]com/[^[:space:]]+$' or coalesce(v->>'imageUrl','') !~ '^https://scontent[.a-z0-9-]*[.]fbcdn[.]net/[^[:space:]]+$'))
   or (r.channel='instagram' and (coalesce(v->>'permalink','') !~ '^https://(www[.])?instagram[.]com/p/[A-Za-z0-9_-]{1,128}/?$' or coalesce(v->>'imageUrl','') !~ '^https://scontent[.a-z0-9-]*[.](cdninstagram[.]com|fbcdn[.]net)/[^[:space:]#]+$'))
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
