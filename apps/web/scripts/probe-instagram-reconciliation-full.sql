-- Canonical RPC/constraint integration on the fully reconstructed local schema.
begin;
insert into auth.users(id) values('91000000-0000-4000-8000-000000000001');
insert into public.projects(id,owner_id,name,slug) values('11000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Repeat local fixture','familje-stunden');
insert into public.social_account_bindings(binding_id,project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by)
values('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','instagram','987654321','Synthetic only','project_store','provider_attested',now(),'user:91000000-0000-4000-8000-000000000001');

insert into public.assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path,width,height)
 values('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','image','image/jpeg',1000,repeat('a',64),'media-assets-private','synthetic-only.jpg',320,400);
set local role service_role;
do $$ declare
 p jsonb:='{"userId":"91000000-0000-4000-8000-000000000001","allowedProjectIds":["11000000-0000-4000-8000-000000000001"]}';
 project uuid:='11000000-0000-4000-8000-000000000001';plan jsonb;v jsonb;post uuid:=gen_random_uuid();rev jsonb;decision uuid;r jsonb;scope jsonb;candidate jsonb;proof jsonb;input jsonb;bad jsonb;
begin
 plan:=public.social_launch_plan_save(p,jsonb_build_object('projectId',project,'expectedRevisionId',null,'idempotencyKey','ig_plan','choices',jsonb_build_array(jsonb_build_object('channel','instagram','purpose','Familjeaktiviteter','format','image','cadence','manual'))));
 perform public.social_launch_plan_decide(p,jsonb_build_object('projectId',project,'revisionId',plan->'currentRevision'->>'id','sha256',plan->'currentRevision'->>'sha256','decision','approve','idempotencyKey','ig_plan_approve'));
 v:=public.social_content_save(p,jsonb_build_object('projectId',project,'postId',post,'expectedRevisionId',null,'planRevisionId',plan->'currentRevision'->>'id','idempotencyKey','ig_content','draft',jsonb_build_object('channel','instagram','format','image','title','Synthetic','text','Tre aktiviteter tillsammans','linkUrl',null,'mediaIds',jsonb_build_array('41000000-0000-4000-8000-000000000001'),'mediaBrief','','scheduledAt',null)));
 select x->'revision' into rev from jsonb_array_elements(v->'posts') x where x->>'id'=post::text;
 perform public.social_content_decide(p,jsonb_build_object('projectId',project,'postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decision','approve','idempotencyKey','ig_approve'));
 select id into decision from public.social_content_decisions where post_id=post;
 r:=public.social_publication_prepare(p,jsonb_build_object('projectId',project,'postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decisionId',decision,'bindingId','31000000-0000-4000-8000-000000000001','idempotencyKey','ig_request','confirmed',true));
 scope:=jsonb_build_object('projectId',project,'postId',post,'publicationId',r->>'id');
 r:=public.social_publication_step(p,scope||jsonb_build_object('expectedVersion',r->'version','action','claim_create','capabilityHash',repeat('a',64)))->'record';
 r:=public.social_publication_step(p,scope||jsonb_build_object('expectedVersion',r->'version','action','uncertain','failureCode','provider_unavailable'))->'record';
 candidate:=jsonb_build_object('id','67890','providerId','67890','accountId','987654321','createdAt',r->>'requestedAt','text','Tre aktiviteter tillsammans','permalink','https://www.instagram.com/p/Test_123/','photoId','67890','imageUrl','https://scontent-arn2-1.cdninstagram.com/test.jpg?rotating=1','candidateHash',repeat('b',64));
 for bad in select value from jsonb_array_elements(jsonb_build_array(jsonb_build_object('accountId','999'),jsonb_build_object('createdAt',null),jsonb_build_object('photoId','999'),jsonb_build_object('permalink','https://instagram.com.evil.test/p/Test/'),jsonb_build_object('imageUrl','https://evil.test/a.jpg'),jsonb_build_object('text','Changed'))) loop
  begin perform public.social_publication_reconciliation_inspect(p,scope||jsonb_build_object('candidates',jsonb_build_array(candidate||bad)));raise exception 'unsafe candidate accepted';exception when others then if SQLERRM<>'SOCIAL_PUBLICATION_INVALID_BODY' then raise;end if;end;
 end loop;
 begin perform public.social_publication_reconciliation_inspect(p,scope||jsonb_build_object('candidates',jsonb_build_array(candidate,candidate)));raise exception 'multiple candidates accepted';exception when others then if SQLERRM<>'SOCIAL_PUBLICATION_INVALID_BODY' then raise;end if;end;
 v:=public.social_publication_reconciliation_inspect(p,scope||jsonb_build_object('candidates',jsonb_build_array(candidate)));proof:=v->'proofs'->0;
 if proof is null then raise exception 'no proof';end if;
 input:=scope||jsonb_build_object('candidateId',proof->>'id','expectedVersion',r->'version','imageConfirmed',true,'candidateHash',repeat('b',64),'readAt',clock_timestamp());
 begin perform public.social_publication_reconciliation_complete(p,input||'{"imageConfirmed":false}');raise exception 'unconfirmed image accepted';exception when others then if SQLERRM<>'SOCIAL_PUBLICATION_INVALID_BODY' then raise;end if;end;
 v:=public.social_publication_reconciliation_complete(p,input);
 if v->>'state'<>'published' or v->>'providerId'<>'67890' then raise exception 'receipt not verified';end if;
 perform public.social_publication_reconciliation_complete(p,input);
 if (select count(*) from public.social_publication_events where publication_id=(r->>'id')::uuid and event='reconcile_verified')<>1 then raise exception 'duplicate event';end if;
 if not(v?'authoritySource') then raise exception 'scheduler metadata lost';end if;
end $$;
reset role;
rollback;
