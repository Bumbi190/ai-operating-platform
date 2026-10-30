-- Weekly editorial preparation only: no queue, approval or provider authority.
create table public.social_weekly_preparations(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects,
 week_start date not null,generation integer not null check(generation=1),created_by uuid not null references auth.users,
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 unique(project_id,week_start,generation));
alter table public.social_weekly_preparations enable row level security;
revoke all on public.social_weekly_preparations from public,anon,authenticated,service_role;
grant select,insert on public.social_weekly_preparations to service_role;

create function public.social_weekly_context(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare project uuid:=(p_input->>'projectId')::uuid;v jsonb;content jsonb;profile jsonb;jobs jsonb;history jsonb;bindings jsonb;described jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','conversationId','weekStart']);
 if project<>'77cda551-57c9-4dc0-b019-1bb6438777f7' or p_input->>'conversationId' is null or coalesce(p_input->>'weekStart','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or extract(isodow from (p_input->>'weekStart')::date)<>1 then raise exception 'SOCIAL_WEEKLY_INVALID_BODY';end if;
 if (select count(*) from public.social_content_posts where project_id=project)>100 or (select count(*) from public.social_schedule_jobs where project_id=project)>500 or (select count(*) from public.social_publications where project_id=project)>500 then raise exception 'SOCIAL_WEEKLY_UNAVAILABLE';end if;
 content:=public.social_content_read(p_principal,p_input-'weekStart');
 profile:=public.social_profile_read(p_principal,p_input-'weekStart');
 if content->'hasMoreAssets'='true'::jsonb or profile->'hasMoreAssets'='true'::jsonb then raise exception 'SOCIAL_WEEKLY_UNAVAILABLE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'postId',j.post_id,'revisionId',j.revision_id,'state',j.state,'publicationId',j.publication_id,'scheduledAt',j.scheduled_at,'kind',j.item->>'kind','channel',j.channel,'occasionId',j.occasion_id,'text',r.draft->>'text','assetId',r.media->0->>'id') order by j.id),'[]') into jobs from public.social_schedule_jobs j join public.social_content_revisions r on r.id=j.revision_id and r.project_id=j.project_id where j.project_id=project;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'postId',p.post_id,'channel',p.channel,'state',p.state,'requestedAt',p.requested_at,'updatedAt',p.updated_at,'text',r.draft->>'text','assetId',r.media->0->>'id') order by p.id),'[]') into history from public.social_publications p join public.social_content_revisions r on r.id=p.revision_id where p.project_id=project;
 select coalesce(jsonb_agg(jsonb_build_object('id',binding_id,'channel',platform,'accountId',external_account_id,'blocked',blocked_at is not null,'verification',verification) order by binding_id),'[]') into bindings from public.social_account_bindings where project_id=project and superseded_at is null;
 -- Only descriptions already attached to owned content revisions qualify an image.
 select coalesce(jsonb_agg(a||jsonb_build_object('description',d.description) order by a->>'id'),'[]') into described from jsonb_array_elements(content->'assets') a cross join lateral
 (select r.draft->>'mediaBrief' description from public.social_content_revisions r where r.project_id=project and exists(select 1 from jsonb_array_elements(r.media) m where m->>'id'=a->>'id') and length(btrim(r.draft->>'mediaBrief'))>0 order by r.created_at desc limit 1) d where a->>'mimeType'='image/jpeg' and a->>'sha256'~'^[a-f0-9]{64}$' and (a->>'width')::integer between 320 and 1440 and (a->>'height')::integer>0 and (a->>'width')::numeric/(a->>'height')::numeric between 0.8 and 1.91;
 v:=jsonb_build_object('content',content,'profile',profile,'jobs',jobs,'history',history,'bindings',bindings,'describedAssets',described,'monthlyRuleEnabled',coalesce((select (rule->>'enabled')::boolean from public.social_monthly_release_rules where project_id=project),false));
 return v||jsonb_build_object('contextHash',encode(sha256(convert_to(public.social_schedule_canonical(v),'UTF8')),'hex'),'preparation',(select result from public.social_weekly_preparations where project_id=project and week_start=(p_input->>'weekStart')::date and generation=1));
end $$;

create function public.social_weekly_save(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare project uuid:=(p_input->>'projectId')::uuid;actor uuid:=(p_principal->>'userId')::uuid;prior public.social_weekly_preparations;ctx jsonb;request_hash text;d jsonb;other jsonb;result jsonb:='[]';post uuid;rid uuid;draft jsonb;stamp timestamptz;local_minute text;week date;conflict record;reasons jsonb;distinct_times integer;occupied integer;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','conversationId','weekStart','generation','contextHash','idempotencyKey','drafts']);
 if project<>'77cda551-57c9-4dc0-b019-1bb6438777f7' or p_input->>'conversationId' is null or p_input->'generation' is distinct from '1'::jsonb or coalesce(p_input->>'contextHash','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(p_input->'drafts') is distinct from 'array' or jsonb_array_length(p_input->'drafts') not between 2 and 4 then raise exception 'SOCIAL_WEEKLY_INVALID_BODY';end if;
 week:=(p_input->>'weekStart')::date;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 request_hash:=encode(sha256(convert_to(public.social_schedule_canonical(p_input-'conversationId'-'idempotencyKey'-'contextHash'),'UTF8')),'hex');
 select * into prior from public.social_weekly_preparations where project_id=project and week_start=week and generation=1;
 if found then if prior.created_by<>actor or prior.request_hash<>request_hash then raise exception 'SOCIAL_WEEKLY_CONFLICT';end if;return prior.result;end if;
 ctx:=public.social_weekly_context(p_principal,p_input-'generation'-'contextHash'-'idempotencyKey'-'drafts');
 if ctx->>'contextHash' is distinct from p_input->>'contextHash' then raise exception 'SOCIAL_WEEKLY_CONFLICT';end if;
 if ctx->'profile'->'revision' is null or ctx->'profile'->'revision'='null'::jsonb or ctx->'content'->'planApproved' is distinct from 'true'::jsonb then raise exception 'SOCIAL_WEEKLY_REVIEW_REQUIRED';end if;
 -- Count unique occupied ordinary times, with cancelled/no-attempt reservations excluded.
 select count(distinct x.t) into occupied from (
 select (j->>'scheduledAt')::timestamptz t from jsonb_array_elements(ctx->'jobs') j where (j->>'state'<>'cancelled' or j->>'publicationId' is not null) and j->>'kind'='ordinary'
 union select (p->'revision'->'draft'->>'scheduledAt')::timestamptz from jsonb_array_elements(ctx->'content'->'posts') p where p->'revision'->'draft'->>'scheduledAt' is not null and not exists(select 1 from jsonb_array_elements(ctx->'jobs') j where j->>'postId'=p->>'id' and j->>'revisionId'=p->'revision'->>'id')
 ) x where (x.t at time zone 'Europe/Stockholm')::date>=week and (x.t at time zone 'Europe/Stockholm')::date<week+7;
 select count(distinct value->>'scheduledAt') into distinct_times from jsonb_array_elements(p_input->'drafts');
 if occupied+distinct_times>2 then raise exception 'SOCIAL_WEEKLY_CONFLICT';end if;
 for d in select value from jsonb_array_elements(p_input->'drafts') loop
  perform public.social_schedule_fields(d,array['slotKey','channel','assetId','text','title','sourceReferences','scheduledAt']);
  stamp:=(d->>'scheduledAt')::timestamptz;local_minute:=to_char(stamp at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI');
  if d->>'channel' not in ('facebook','instagram') or d->>'slotKey' is distinct from local_minute||':ordinary' or local_minute not in (to_char(week+1,'YYYY-MM-DD')||'T17:00',to_char(week+4,'YYYY-MM-DD')||'T20:30') or stamp<=clock_timestamp() or stamp>clock_timestamp()+interval '366 days' or stamp<>public.social_schedule_resolve_minute(local_minute) then raise exception 'SOCIAL_WEEKLY_INVALID_BODY';end if;
  if (select count(*) from jsonb_array_elements(p_input->'drafts') x where x->>'scheduledAt'=d->>'scheduledAt')<>2 or (select count(distinct x->>'channel') from jsonb_array_elements(p_input->'drafts') x where x->>'scheduledAt'=d->>'scheduledAt')<>2 then raise exception 'SOCIAL_WEEKLY_INVALID_BODY';end if;
  if not exists(select 1 from jsonb_array_elements(ctx->'describedAssets') a where a->>'id'=d->>'assetId') or not exists(select 1 from jsonb_array_elements(ctx->'bindings') b where b->>'channel'=d->>'channel' and b->'blocked'='false'::jsonb and b->>'verification'='provider_attested') then raise exception 'SOCIAL_WEEKLY_REVIEW_REQUIRED';end if;
  if d->'sourceReferences' is distinct from jsonb_build_array('profile:'||(ctx->'profile'->'revision'->>'sha256')) then raise exception 'SOCIAL_WEEKLY_INVALID_BODY';end if;
  if exists(select 1 from jsonb_array_elements(ctx->'jobs') j where (j->>'state'<>'cancelled' or j->>'publicationId' is not null) and (j->>'scheduledAt')::timestamptz=stamp) or exists(select 1 from jsonb_array_elements(ctx->'content'->'posts') p where (p->'revision'->'draft'->>'scheduledAt')::timestamptz=stamp and not exists(select 1 from jsonb_array_elements(ctx->'jobs') j where j->>'postId'=p->>'id' and j->>'revisionId'=p->'revision'->>'id')) then raise exception 'SOCIAL_WEEKLY_CONFLICT';end if;
  reasons:='[]';
  -- History and all future intended drafts are read under the same project lock.
  for other in select value from jsonb_array_elements(ctx->'history') union all select j||jsonb_build_object('requestedAt',j->>'scheduledAt') from jsonb_array_elements(ctx->'jobs') j where j->>'state'<>'cancelled' or j->>'publicationId' is not null union all select jsonb_build_object('text',p->'revision'->'draft'->>'text','channel',p->'revision'->'draft'->>'channel','requestedAt',p->'revision'->'draft'->>'scheduledAt','assetId',p->'revision'->'media'->0->>'id') from jsonb_array_elements(ctx->'content'->'posts') p where p->'revision'->'draft'->>'scheduledAt' is not null and not exists(select 1 from jsonb_array_elements(ctx->'jobs') j where j->>'postId'=p->>'id' and j->>'revisionId'=p->'revision'->>'id') union all select jsonb_build_object('text',x->>'text','channel',x->>'channel','requestedAt',x->>'scheduledAt','assetId',x->>'assetId') from jsonb_array_elements(p_input->'drafts') x where x is distinct from d loop
   if other->>'channel'<>d->>'channel' and (other->>'requestedAt')::timestamptz=stamp then continue;end if;
   if public.social_repeat_normalize(other->>'text')=public.social_repeat_normalize(d->>'text') then raise exception 'SOCIAL_WEEKLY_DUPLICATE';end if;
   if (other->>'state' in ('uncertain','creating','publishing','processing') or other->>'requestedAt' is null or abs(extract(epoch from stamp-(other->>'requestedAt')::timestamptz))<=14*86400) and (public.social_repeat_similarity(other->>'text',d->>'text')>=0.8 or other->>'assetId'=d->>'assetId' and public.social_repeat_similarity(other->>'text',d->>'text')>=0.65) then reasons:=jsonb_build_array('similar_recent_content');end if;
  end loop;
  post:=gen_random_uuid();
  draft:=jsonb_build_object('channel',d->>'channel','format','image','title',d->>'title','text',d->>'text','linkUrl',null,'mediaIds',jsonb_build_array(d->>'assetId'),'mediaBrief',(select a->>'description' from jsonb_array_elements(ctx->'describedAssets') a where a->>'id'=d->>'assetId'),'scheduledAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  perform public.social_content_save(p_principal,jsonb_build_object('projectId',project,'conversationId',p_input->>'conversationId','postId',post,'expectedRevisionId',null,'planRevisionId',ctx->'content'->>'currentPlanRevisionId','idempotencyKey','weekly_'||replace(post::text,'-',''),'draft',draft));
  select current_revision_id into rid from public.social_content_posts where id=post;
  result:=result||jsonb_build_array(jsonb_build_object('postId',post,'revisionId',rid,'slotKey',d->>'slotKey','channel',d->>'channel','reviewReasons',reasons));
 end loop;
 result:=jsonb_build_object('preparationId',gen_random_uuid(),'posts',result,'workspaceUrl',ctx->'content'->>'workspaceUrl','status','editorial_review_required','publicationAuthority',false);
 insert into public.social_weekly_preparations(id,project_id,week_start,generation,created_by,request_hash,result) values((result->>'preparationId')::uuid,project,week,1,actor,request_hash,result);
 return result;
end $$;
revoke all on function public.social_weekly_context(jsonb,jsonb),public.social_weekly_save(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_weekly_context(jsonb,jsonb),public.social_weekly_save(jsonb,jsonb) to service_role;

-- Pure text comparison helpers contain no data access; service needs them for draft checks.
grant execute on function public.social_repeat_normalize(text),public.social_repeat_similarity(text,text) to service_role;
