-- Canonical RPC/constraint integration on the fully reconstructed local schema.
begin;
insert into auth.users(id) values('91000000-0000-4000-8000-000000000001');
insert into public.projects(id,owner_id,name,slug) values('11000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Repeat local fixture','familje-stunden');
insert into public.social_account_bindings(binding_id,project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by)
values('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','facebook','987654321','Synthetic only','project_store','provider_attested',now(),'user:91000000-0000-4000-8000-000000000001');
set local role service_role;
do $$ declare
 p jsonb:='{"userId":"91000000-0000-4000-8000-000000000001","allowedProjectIds":["11000000-0000-4000-8000-000000000001"]}';
 project uuid:='11000000-0000-4000-8000-000000000001';plan jsonb;v jsonb;post uuid;rev jsonb;decision uuid;input jsonb;r jsonb;first_input jsonb;second_input jsonb;other_input jsonb;similar_input jsonb;caption text;n integer;
begin
 plan:=public.social_launch_plan_save(p,jsonb_build_object('projectId',project,'expectedRevisionId',null,'idempotencyKey','repeat_plan','choices',jsonb_build_array(jsonb_build_object('channel','facebook','purpose','Familjeaktiviteter','format','text','cadence','manual'))));
 perform public.social_launch_plan_decide(p,jsonb_build_object('projectId',project,'revisionId',plan->'currentRevision'->>'id','sha256',plan->'currentRevision'->>'sha256','decision','approve','idempotencyKey','repeat_plan_approve'));
 for n in 1..4 loop
  post:=gen_random_uuid();caption:=case when n=3 then 'Bygg en rolig rymdraket av kartong tillsammans idag' when n=4 then 'En sagostund med Nova och Pling under stjärnorna ikväll' else 'En sagostund med Nova och Pling under stjärnorna' end;
  v:=public.social_content_save(p,jsonb_build_object('projectId',project,'postId',post,'expectedRevisionId',null,'planRevisionId',plan->'currentRevision'->>'id','idempotencyKey','repeat_content_'||n,
    'draft',jsonb_build_object('channel','facebook','format','text','title','Synthetic repeat test','text',caption,'linkUrl',null,'mediaIds','[]'::jsonb,'mediaBrief','','scheduledAt',null)));
  select x->'revision' into rev from jsonb_array_elements(v->'posts') x where x->>'id'=post::text;
  perform public.social_content_decide(p,jsonb_build_object('projectId',project,'postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decision','approve','idempotencyKey','repeat_approve_'||n));
  select id into decision from public.social_content_decisions where post_id=post;
  input:=jsonb_build_object('projectId',project,'postId',post,'revisionId',rev->>'id','sha256',rev->>'sha256','decisionId',decision,'bindingId','31000000-0000-4000-8000-000000000001','idempotencyKey','repeat_request_'||n,'confirmed',true);
  if n=1 then first_input:=input;elsif n=2 then second_input:=input;elsif n=3 then other_input:=input;else similar_input:=input;end if;
 end loop;
 r:=public.social_publication_prepare(p,first_input);
 if public.social_publication_prepare(p,first_input)->>'id'<>r->>'id' then raise exception 'idempotent request changed';end if;
 v:=public.social_publication_step(p,jsonb_build_object('projectId',project,'postId',first_input->>'postId','publicationId',r->>'id','expectedVersion',r->'version','action','claim_create'));
 r:=v->'record';
 perform public.social_publication_step(p,jsonb_build_object('projectId',project,'postId',first_input->>'postId','publicationId',r->>'id','expectedVersion',r->'version','action','uncertain','failureCode','provider_unavailable'));
 begin perform public.social_publication_prepare(p,second_input);raise exception 'canonical duplicate accepted';exception when check_violation then null;end;
 begin perform public.social_publication_prepare(p,similar_input);raise exception 'canonical near-copy accepted';exception when check_violation then null;end;
 perform public.social_publication_prepare(p,other_input);
 v:=public.social_content_repeat_check(p,jsonb_build_object('projectId',project));
 if jsonb_array_length(v)<>2 then raise exception 'canonical preflight expected 2 conflicts, got %',v;end if;
 if not exists(select 1 from jsonb_array_elements(v) x where x->>'reason'='duplicate_content') then raise exception 'missing duplicate reason';end if;
 if not exists(select 1 from jsonb_array_elements(v) x where x->>'reason'='similar_recent_content') then raise exception 'missing similarity reason';end if;
end $$;
reset role;
rollback;
