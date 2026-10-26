-- Canonical RPC/constraint integration on the fully reconstructed local schema.
begin;
insert into auth.users(id) values('91000000-0000-4000-8000-000000000001');
insert into public.projects(id,owner_id,name,slug) values('77cda551-57c9-4dc0-b019-1bb6438777f7','91000000-0000-4000-8000-000000000001','Repeat local fixture','familje-stunden');
insert into public.social_account_bindings(binding_id,project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by)
values('31000000-0000-4000-8000-000000000001','77cda551-57c9-4dc0-b019-1bb6438777f7','instagram','987654321','Synthetic only','project_store','provider_attested',now(),'user:91000000-0000-4000-8000-000000000001');

insert into public.assets(id,project_id,kind,mime_type,byte_size,checksum_sha256,storage_bucket,storage_path,width,height)
 values('41000000-0000-4000-8000-000000000001','77cda551-57c9-4dc0-b019-1bb6438777f7','image','image/jpeg',1000,repeat('a',64),'media-assets-private','synthetic-only.jpg',320,400);
insert into public.conversations(id,user_id,project_id) values('51000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','77cda551-57c9-4dc0-b019-1bb6438777f7');
insert into public.social_account_bindings(binding_id,project_id,platform,external_account_id,credential_source,verification,verified_at,bound_by) values('31000000-0000-4000-8000-000000000002','77cda551-57c9-4dc0-b019-1bb6438777f7','facebook','987654322','project_store','provider_attested',now(),'user:91000000-0000-4000-8000-000000000001');
set local role service_role;
do $$ declare
 p jsonb:='{"userId":"91000000-0000-4000-8000-000000000001","allowedProjectIds":["77cda551-57c9-4dc0-b019-1bb6438777f7"]}';
 project uuid:='77cda551-57c9-4dc0-b019-1bb6438777f7';plan jsonb;v jsonb;post uuid:=gen_random_uuid();rev jsonb;decision uuid;r jsonb;scope jsonb;candidate jsonb;proof jsonb;input jsonb;bad jsonb;batch jsonb;ctx jsonb;drafts jsonb;outcome jsonb;ch text;minute text;idx integer;
begin
 plan:=public.social_launch_plan_save(p,jsonb_build_object('projectId',project,'expectedRevisionId',null,'idempotencyKey','ig_plan','choices',jsonb_build_array(jsonb_build_object('channel','instagram','purpose','Familjeaktiviteter','format','image','cadence','manual'),jsonb_build_object('channel','facebook','purpose','Familjeaktiviteter','format','image','cadence','manual'))));
 perform public.social_launch_plan_decide(p,jsonb_build_object('projectId',project,'revisionId',plan->'currentRevision'->>'id','sha256',plan->'currentRevision'->>'sha256','decision','approve','idempotencyKey','ig_plan_approve'));
 v:=public.social_content_save(p,jsonb_build_object('projectId',project,'postId',post,'expectedRevisionId',null,'planRevisionId',plan->'currentRevision'->>'id','idempotencyKey','ig_content','draft',jsonb_build_object('channel','instagram','format','image','title','Synthetic','text','Build a bright paper rocket together and explore imaginary planets at home','linkUrl',null,'mediaIds',jsonb_build_array('41000000-0000-4000-8000-000000000001'),'mediaBrief','Owned fixture illustration of leaves','scheduledAt','2026-11-10T16:00:00.000Z')));
 select x->'revision' into rev from jsonb_array_elements(v->'posts') x where x->>'id'=post::text;
 perform public.social_content_decide(p,jsonb_build_object('projectId',project,'postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decision','approve','idempotencyKey','ig_approve'));
 select id into decision from public.social_content_decisions where post_id=post;


 -- Pin the original revision to a future unpublished job, then edit current content.
 batch:=public.social_schedule_propose(p,jsonb_build_object('projectId',project,'expectedRevisionId',null,'idempotencyKey','pinned_job_propose','manifest',jsonb_build_object('projectId',project,'items',jsonb_build_array(jsonb_build_object('postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decisionId',decision,'planRevisionId',rev->>'planRevisionId','bindingId','31000000-0000-4000-8000-000000000001','accountId','987654321','channel','instagram','asset',jsonb_build_object('id','41000000-0000-4000-8000-000000000001','sha256',repeat('a',64)),'localMinute','2026-11-10T17:00','scheduledAt','2026-11-10T16:00:00.000Z','expiresAt','2026-11-10T16:10:00.000Z','occasionId',gen_random_uuid(),'kind','ordinary','releaseCondition',null)))));
 perform public.social_schedule_approve(p,jsonb_build_object('projectId',project,'batchId',batch->>'batchId','revisionId',batch->>'revisionId','sha256',batch->>'sha256','confirmed',true,'idempotencyKey','pinned_job_approve'));
 perform public.social_content_save(p,jsonb_build_object('projectId',project,'postId',post,'expectedRevisionId',rev->>'id','planRevisionId',rev->>'planRevisionId','idempotencyKey','edit_after_reservation','draft',(rev->'draft')||jsonb_build_object('text','A different current draft about friendship and bedtime reading','scheduledAt',null)));
 perform public.social_profile_save(p,jsonb_build_object('projectId',project,'expectedRevisionId',null,'idempotencyKey','weekly_profile','profile',jsonb_build_object('description','Family stories and shared activities','audience','Families with children','tone','Warm and concrete','websiteUrl','https://familje-stunden.se','callToAction','Discover activities','factualBoundaries','Use only known stories and activities','preferredMediaIds',jsonb_build_array('41000000-0000-4000-8000-000000000001'))));
 scope:=jsonb_build_object('projectId',project,'conversationId','51000000-0000-4000-8000-000000000001','weekStart','2026-11-02');
 ctx:=public.social_weekly_context(p,scope);
 drafts:='[]';
 for idx in 1..2 loop
 minute:=case when idx=1 then '2026-11-03T16:00:00.000Z' else '2026-11-06T19:30:00.000Z' end;
 foreach ch in array array['facebook','instagram'] loop
 drafts:=drafts||jsonb_build_array(jsonb_build_object('slotKey',case when idx=1 then '2026-11-03T17:00:ordinary' else '2026-11-06T20:30:ordinary' end,'scheduledAt',minute,'channel',ch,'assetId','41000000-0000-4000-8000-000000000001','title','Weekly test','text',case when idx=1 then 'Gather leaves and make a colorful collage together this afternoon' else 'Read a magical bedtime story while discovering moonlight and friendship' end,'sourceReferences',jsonb_build_array('profile:'||(ctx->'profile'->'revision'->>'sha256'))));
 end loop;end loop;
 input:=scope||jsonb_build_object('generation',1,'contextHash',ctx->>'contextHash','idempotencyKey','weekly_save','drafts',drafts);

 if has_function_privilege('anon','public.social_weekly_save(jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.social_weekly_context(jsonb,jsonb)','execute') then raise exception 'client access';end if;
 begin perform public.social_weekly_save(p,input||jsonb_build_object('contextHash',repeat('f',64)));raise exception 'stale context accepted';exception when others then if SQLERRM<>'SOCIAL_WEEKLY_CONFLICT' then raise;end if;end;
 begin perform public.social_weekly_save(p,jsonb_set(input,'{drafts,3,assetId}','"41000000-0000-4000-8000-000000000099"'));raise exception 'foreign asset accepted';exception when others then if SQLERRM<>'SOCIAL_WEEKLY_REVIEW_REQUIRED' then raise;end if;end;
 if (select count(*) from public.social_content_posts where project_id=project)<>1 then raise exception 'partial write leaked';end if;
 begin perform public.social_weekly_context(p,scope||jsonb_build_object('conversationId','51000000-0000-4000-8000-000000000099'));raise exception 'foreign conversation accepted';exception when no_data_found then null;end;

 begin perform public.social_weekly_save(p,jsonb_set(input,'{drafts,0,text}','"Build a bright paper rocket together and explore imaginary planets at home"'));raise exception 'pinned job duplicate accepted';exception when others then if SQLERRM<>'SOCIAL_WEEKLY_DUPLICATE' then raise;end if;end;

 input:=jsonb_set(jsonb_set(input,'{drafts,0,text}','"Build a bright paper rocket together and explore imaginary planets at home tonight"'),'{drafts,1,text}','"Build a bright paper rocket together and explore imaginary planets at home tonight"');
 outcome:=public.social_weekly_save(p,input);
 if not ((outcome->'posts'->0->'reviewReasons') ? 'similar_recent_content') then raise exception 'pinned similar content not marked for review';end if;
 if jsonb_array_length(outcome->'posts')<>4 or outcome->'publicationAuthority'<>'false'::jsonb then raise exception 'wrong proposal result';end if;
 if public.social_weekly_save(p,input||jsonb_build_object('idempotencyKey','different_transport_retry'))<>outcome then raise exception 'replay changed';end if;
 begin perform public.social_weekly_save(p,jsonb_set(input,'{drafts,0,text}','"Different text"'));raise exception 'changed retry accepted';exception when others then if SQLERRM<>'SOCIAL_WEEKLY_CONFLICT' then raise;end if;end;
 if (select count(*) from public.social_schedule_jobs where project_id=project)<>1 or (select count(*) from public.social_publications where project_id=project)<>0 then raise exception 'publication authority created';end if;
 if (select count(*) from public.social_content_posts where project_id=project)<>5 then raise exception 'duplicate posts';end if;
end $$;
reset role;
rollback;
