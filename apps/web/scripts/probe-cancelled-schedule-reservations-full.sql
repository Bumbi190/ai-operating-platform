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
 project uuid:='11000000-0000-4000-8000-000000000001';plan jsonb;v jsonb;post uuid:=gen_random_uuid();rev jsonb;decision uuid;r jsonb;scope jsonb;candidate jsonb;proof jsonb;input jsonb;bad jsonb;manifest jsonb;first_batch jsonb;next_batch jsonb;job uuid;
begin
 plan:=public.social_launch_plan_save(p,jsonb_build_object('projectId',project,'expectedRevisionId',null,'idempotencyKey','ig_plan','choices',jsonb_build_array(jsonb_build_object('channel','instagram','purpose','Familjeaktiviteter','format','image','cadence','manual'))));
 perform public.social_launch_plan_decide(p,jsonb_build_object('projectId',project,'revisionId',plan->'currentRevision'->>'id','sha256',plan->'currentRevision'->>'sha256','decision','approve','idempotencyKey','ig_plan_approve'));
 v:=public.social_content_save(p,jsonb_build_object('projectId',project,'postId',post,'expectedRevisionId',null,'planRevisionId',plan->'currentRevision'->>'id','idempotencyKey','ig_content','draft',jsonb_build_object('channel','instagram','format','image','title','Synthetic','text','Tre aktiviteter tillsammans','linkUrl',null,'mediaIds',jsonb_build_array('41000000-0000-4000-8000-000000000001'),'mediaBrief','','scheduledAt','2026-11-01T19:30:00.000Z')));
 select x->'revision' into rev from jsonb_array_elements(v->'posts') x where x->>'id'=post::text;
 perform public.social_content_decide(p,jsonb_build_object('projectId',project,'postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decision','approve','idempotencyKey','ig_approve'));
 select id into decision from public.social_content_decisions where post_id=post;

 manifest:=jsonb_build_object('projectId',project,'items',jsonb_build_array(jsonb_build_object('postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decisionId',decision,'planRevisionId',rev->>'planRevisionId','bindingId','31000000-0000-4000-8000-000000000001','accountId','987654321','channel','instagram','asset',jsonb_build_object('id','41000000-0000-4000-8000-000000000001','sha256',repeat('a',64)),'localMinute','2026-11-01T20:30','scheduledAt','2026-11-01T19:30:00.000Z','expiresAt','2026-11-01T19:40:00.000Z','occasionId',gen_random_uuid(),'kind','ordinary','releaseCondition',null)));
 first_batch:=public.social_schedule_propose(p,jsonb_build_object('projectId',project,'manifest',manifest,'expectedRevisionId',null,'idempotencyKey','reservation_propose1'));
 first_batch:=public.social_schedule_approve(p,jsonb_build_object('projectId',project,'batchId',first_batch->>'batchId','revisionId',first_batch->>'revisionId','sha256',first_batch->>'sha256','confirmed',true,'idempotencyKey','reservation_approve1'));
 select id into job from public.social_schedule_jobs where post_id=post;
 manifest:=jsonb_set(jsonb_set(manifest,'{items,0,kind}','"month_release"'),'{items,0,releaseCondition}',jsonb_build_object('releaseMonth','2026-11','catalogSha256',repeat('b',64)));
 next_batch:=public.social_schedule_propose(p,jsonb_build_object('projectId',project,'manifest',manifest,'expectedRevisionId',first_batch->>'revisionId','idempotencyKey','reservation_propose2'));
 if (select state from public.social_schedule_jobs where id=job)<>'cancelled' then raise exception 'old job not cancelled';end if;
 next_batch:=public.social_schedule_approve(p,jsonb_build_object('projectId',project,'batchId',next_batch->>'batchId','revisionId',next_batch->>'revisionId','sha256',next_batch->>'sha256','confirmed',true,'idempotencyKey','reservation_approve2'));
 perform public.social_schedule_approve(p,jsonb_build_object('projectId',project,'batchId',next_batch->>'batchId','revisionId',next_batch->>'revisionId','sha256',next_batch->>'sha256','confirmed',true,'idempotencyKey','reservation_approve2'));
 if (select count(*) from public.social_schedule_jobs where post_id=post and state='queued')<>1 or (select count(*) from public.social_schedule_jobs where post_id=post and state='cancelled')<>1 then raise exception 'replacement count';end if;
 if (select item->>'kind' from public.social_schedule_jobs where post_id=post and state='queued')<>'month_release' then raise exception 'release lost';end if;
 -- A still-reserved row must prevent duplicates, even from privileged writers.
 begin
 insert into public.social_schedule_jobs(project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month)
 select project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month from public.social_schedule_jobs where post_id=post and state='queued';
 raise exception 'active duplicate accepted';exception when unique_violation then null;end;
 -- Even a cancelled reservation remains permanent once any receipt exists.
 insert into public.social_publications(project_id,post_id,revision_id,sha256,decision_id,binding_id,channel,account_id,state,request_input,idempotency_key,requested_by)
 values(project,post,(rev->>'id')::uuid,rev->>'sha256',decision,'31000000-0000-4000-8000-000000000001','instagram','987654321','requested','{}','synthetic_receipt',(p->>'userId')::uuid) returning id into job;
 update public.social_publications set state='uncertain' where id=job;
 update public.social_schedule_jobs set state='cancelled',publication_id=job where post_id=post and state='queued';
 begin
 insert into public.social_schedule_jobs(project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month)
 select project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,release_month from public.social_schedule_jobs where post_id=post and publication_id=job;
 raise exception 'receipt-bearing duplicate accepted';exception when unique_violation then null;end;
 select id into job from public.social_schedule_jobs where post_id=post and publication_id is null;
 if not exists(select 1 from public.social_schedule_events where job_id=job and event='revoked') then raise exception 'old history lost';end if;
end $$;
reset role;
rollback;

