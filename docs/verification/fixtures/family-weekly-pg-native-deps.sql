-- Isolated disposable PG fixture for the EXACT native social_weekly_save body.
-- Dependencies are constrained TEST DOUBLES; native weekly-save itself is
-- loaded verbatim from apps/web/supabase/migrations/20261026090516_...
-- No external provider, application, or production DB connection.
alter table public.social_weekly_preparations
 add column generation integer not null default 1,
 add column request_hash text not null default repeat('a',64);
alter table public.social_weekly_preparations
 add constraint synthetic_preparation_week_unique unique(project_id,week_start,generation);

create table public.social_content_posts(
 id uuid primary key,
 project_id uuid not null references public.projects(id),
 current_revision_id uuid not null
);
grant select,insert on public.social_content_posts to service_role;

create function public.social_launch_assert_owner(p_principal jsonb,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_principal) is distinct from 'object'
 or jsonb_typeof(p_principal->'allowedProjectIds') is distinct from 'array'
 or not coalesce((p_principal->'allowedProjectIds') ? (p_input->>'projectId'),false)
 or not exists(select 1 from public.projects p
    where p.id=(p_input->>'projectId')::uuid and p.owner_id=(p_principal->>'userId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
 if p_input->>'conversationId' is not null and not exists(
  select 1 from public.conversations c
  where c.id=(p_input->>'conversationId')::uuid
    and c.user_id=(p_principal->>'userId')::uuid
    and c.project_id=(p_input->>'projectId')::uuid)
 then raise exception 'SOCIAL_LAUNCH_NOT_FOUND' using errcode='P0002'; end if;
end $$;

create function public.social_schedule_fields(p_input jsonb,p_names text[])
returns void language plpgsql as $$
begin
 if jsonb_typeof(p_input) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_input) key where key<>all(p_names))
  or exists(select 1 from unnest(p_names) key where not p_input ? key)
 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY'; end if;
end $$;

create function public.social_content_active(p_project uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.projects where id=p_project and execution_paused)
 or exists(select 1 from public.project_lifecycle
  where project_id=p_project and state<>'active')
 or exists(select 1 from public.platform_config where automation_paused)
 then raise exception 'SOCIAL_CONTENT_STOPPED'; end if;
end $$;

create function public.social_schedule_canonical(v jsonb)
returns text language sql immutable as $$ select v::text $$;

-- Real production timezone conversion (including Europe/Stockholm DST).
create function public.social_schedule_resolve_minute(v text)
returns timestamptz language plpgsql immutable set search_path='' as $$
declare naive timestamptz;c timestamptz;result timestamptz;
 matches integer=0;offset_minutes integer;
begin
 if v is null or v !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 naive=v::timestamp at time zone 'UTC';
 if to_char(naive at time zone 'UTC','YYYY-MM-DD"T"HH24:MI')<>v
 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 foreach offset_minutes in array array[60,120] loop
  c=naive-make_interval(mins=>offset_minutes);
  if to_char(c at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI')=v
  then matches=matches+1;result=c;end if;
 end loop;
 if matches<>1 then raise exception 'SOCIAL_SCHEDULE_INVALID_BODY';end if;
 return result;
end $$;

create function public.social_repeat_normalize(v text)
returns text language sql immutable as $$select lower(btrim(coalesce(v,'')))$$;
create function public.social_repeat_similarity(a text,b text)
returns numeric language sql immutable as $$select 0.0::numeric$$;

-- Verified context fixture: exact face/IG accounts, an owned described image,
-- approved channel plan, source profile sha and no occupied Jan 2027 slots.
-- Native save computes hash/duplicates/permissions against this supplied
-- fixture, but external profile/content readers are deliberately stubbed.
create function public.social_weekly_context(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform public.social_schedule_fields(p_input,array['projectId','conversationId','weekStart']);
 if p_input->>'weekStart' is distinct from '2027-01-04'
 then raise exception 'SYNTHETIC_WEEK_REJECTED';end if;
 return jsonb_build_object(
 'contextHash',repeat('a',64),
 'profile',jsonb_build_object('revision',jsonb_build_object('sha256',repeat('b',64))),
 'content',jsonb_build_object(
  'planApproved',true,'posts','[]'::jsonb,
  'currentPlanRevisionId','99999999-9999-4999-8999-999999999999',
  'workspaceUrl','https://app.omniraos.se/projects/familje-stunden/social#content'),
 'jobs','[]'::jsonb,'history','[]'::jsonb,
 'describedAssets',jsonb_build_array(jsonb_build_object(
  'id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'description','Godkänd bild av Nova och Pling')),
 'bindings',jsonb_build_array(
  jsonb_build_object('channel','facebook','blocked',false,
    'verification','provider_attested'),
  jsonb_build_object('channel','instagram','blocked',false,
    'verification','provider_attested'))
 );
end $$;

-- Native save calls this existing content writer to save 4 review-only posts.
-- Only this dependency is a deliberate test double (new UUID revisions).
create function public.social_content_save(p_principal jsonb,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_post uuid:=(p_input->>'postId')::uuid;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if p_input->>'planRevisionId' <> '99999999-9999-4999-8999-999999999999'
 or p_input->'draft'->>'channel' not in ('facebook','instagram')
 or p_input->'draft'->>'scheduledAt' is null
 then raise exception 'SYNTHETIC_CONTENT_WRITE_BLOCKED';end if;
 insert into public.social_content_posts(id,project_id,current_revision_id)
 values(v_post,(p_input->>'projectId')::uuid,gen_random_uuid());
 return jsonb_build_object('postId',v_post);
end $$;

grant execute on function public.social_launch_assert_owner(jsonb,jsonb),
 public.social_schedule_fields(jsonb,text[]),
 public.social_content_active(uuid),
 public.social_schedule_canonical(jsonb),
 public.social_schedule_resolve_minute(text),
 public.social_repeat_normalize(text),
 public.social_repeat_similarity(text,text),
 public.social_weekly_context(jsonb,jsonb),
 public.social_content_save(jsonb,jsonb) to service_role;
