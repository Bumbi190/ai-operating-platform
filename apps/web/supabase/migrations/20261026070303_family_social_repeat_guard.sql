-- Family marketing only. No new publication authority, queue edits or retry.
create function public.social_repeat_normalize(p text) returns text
language sql immutable security invoker set search_path='' as $$
 select btrim(regexp_replace(lower(normalize(coalesce(p,''),NFKC)),'[^[:alnum:]]+',' ','g'))
$$;
create function public.social_repeat_similarity(a text,b text) returns numeric
language sql immutable security invoker set search_path='' as $$
 with words as (select regexp_split_to_array(public.social_repeat_normalize(a),' ') x,regexp_split_to_array(public.social_repeat_normalize(b),' ') y),
 ax as (select distinct array_to_string(x[i:i+2],' ') g from words,generate_subscripts(x,1) i where i<=array_length(x,1)-2),
 bys as (select distinct array_to_string(y[i:i+2],' ') g from words,generate_subscripts(y,1) i where i<=array_length(y,1)-2),
 aw as (select distinct unnest(x) w from words),bw as (select distinct unnest(y) w from words)
 select case when (select least(cardinality(x),cardinality(y)) from words)<3 then
  case when (select count(*) from aw join bw using(w))>=2 then
   2.0*(select count(*) from aw join bw using(w))/nullif((select count(*) from aw)+(select count(*) from bw),0) else 0 end
 else coalesce(2.0*(select count(*) from ax join bys using(g))/nullif((select count(*) from ax)+(select count(*) from bys),0),0) end
$$;
revoke all on function public.social_repeat_normalize(text),public.social_repeat_similarity(text,text) from public,anon,authenticated,service_role;

create function public.social_repeat_conflict(p_project uuid,p_account text,p_channel text,p_revision uuid,p_at timestamptz,p_exclude uuid default null)
returns table(post_id uuid,publication_id uuid,at timestamptz,reason text)
language plpgsql security definer set search_path='' as $$
declare c public.social_content_revisions; h record; norm text; score numeric; same_image boolean; n integer:=0;
begin
 if not exists(select 1 from public.projects where id=p_project and slug='familje-stunden') then return; end if;
 select * into c from public.social_content_revisions where id=p_revision and project_id=p_project;
 if not found or c.draft->>'channel' is distinct from p_channel or p_at is null or p_account is null then
  reason:='repeat_history_unavailable';return next;return;
 end if;
 norm:=public.social_repeat_normalize(c.draft->>'text');
 if length(norm)<3 or cardinality(regexp_split_to_array(norm,' '))<3 then reason:='short_content_review';return next;return;end if;
 -- Complete bounded history; never silently pass when the bound is exceeded.
 select count(*) into n from (
  select 1 from public.social_publications p where p.project_id=p_project and p.account_id=p_account and p.channel=p_channel
   and p.id is distinct from p_exclude and p.state in ('requested','creating','processing','publishing','published','uncertain')
  union all
  select 1 from public.social_schedule_jobs j where j.project_id=p_project and j.channel=p_channel and j.item->>'accountId'=p_account
   and j.post_id<>c.post_id and j.state in ('queued','waiting','claimed')
  limit 2001
 ) bounded;
 if n>2000 then reason:='repeat_history_unavailable';return next;return;end if;
 for h in
  select p.post_id,p.id as publication_id,case when p.state='published' then greatest(p.requested_at,p.updated_at) else p.requested_at end as at,r.draft->>'text' as caption,r.media
  from public.social_publications p join public.social_content_revisions r on r.id=p.revision_id and r.project_id=p.project_id
  where p.project_id=p_project and p.account_id=p_account and p.channel=p_channel and p.id is distinct from p_exclude
   and p.state in ('requested','creating','processing','publishing','published','uncertain')
  union all
  select j.post_id,null::uuid,j.scheduled_at,r.draft->>'text',r.media
  from public.social_schedule_jobs j join public.social_content_revisions r on r.id=j.revision_id and r.project_id=j.project_id
  where j.project_id=p_project and j.channel=p_channel and j.item->>'accountId'=p_account and j.post_id<>c.post_id
   and j.state in ('queued','waiting','claimed')
 loop
  if public.social_repeat_normalize(h.caption)=norm then
   post_id:=h.post_id;publication_id:=h.publication_id;at:=h.at;reason:='duplicate_content';return next;return;
  end if;
 end loop;
 -- A separate pass prioritizes exact copies over any similarity finding.
 for h in
  select p.post_id,p.id as publication_id,case when p.state='published' then greatest(p.requested_at,p.updated_at) else p.requested_at end as at,r.draft->>'text' as caption,r.media
  from public.social_publications p join public.social_content_revisions r on r.id=p.revision_id and r.project_id=p.project_id
  where p.project_id=p_project and p.account_id=p_account and p.channel=p_channel and p.id is distinct from p_exclude
   and p.state in ('requested','creating','processing','publishing','published','uncertain')
   and (p.state<>'published' or greatest(p.requested_at,p.updated_at) between p_at-interval '14 days' and p_at+interval '14 days')
  union all
  select j.post_id,null::uuid,j.scheduled_at,r.draft->>'text',r.media
  from public.social_schedule_jobs j join public.social_content_revisions r on r.id=j.revision_id and r.project_id=j.project_id
  where j.project_id=p_project and j.channel=p_channel and j.item->>'accountId'=p_account and j.post_id<>c.post_id
   and j.state in ('queued','waiting','claimed') and j.scheduled_at between p_at-interval '14 days' and p_at+interval '14 days'
 loop
  score:=public.social_repeat_similarity(c.draft->>'text',h.caption);
  same_image:=exists(select 1 from jsonb_array_elements(coalesce(c.media,'[]')) a,jsonb_array_elements(coalesce(h.media,'[]')) b
    where length(a->>'sha256')=64 and a->>'sha256'=b->>'sha256');
  if score>=0.80 or same_image and score>=0.65 then
   post_id:=h.post_id;publication_id:=h.publication_id;at:=h.at;reason:='similar_recent_content';return next;return;
  end if;
 end loop;
 return;
end $$;
revoke all on function public.social_repeat_conflict(uuid,text,text,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;

create function public.social_repeat_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare conflict record;
begin
 if tg_op='UPDATE' and not(new.state in ('creating','publishing') and new.state is distinct from old.state) then return new;end if;
 if tg_op='INSERT' and new.state<>'requested' then
  -- A direct insertion at an applied/uncertain phase must not bypass this gate.
  if exists(select 1 from public.projects where id=new.project_id and slug='familje-stunden') then
   raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED' using errcode='23514';
  end if;
  return new;
 end if;
 -- All normal writers already lock the project before the publication. This
 -- same lock also serializes different new IDs claiming identical content.
 perform 1 from public.projects where id=new.project_id for update;
 select * into conflict from public.social_repeat_conflict(new.project_id,new.account_id,new.channel,new.revision_id,clock_timestamp(),new.id);
 if found then raise exception 'SOCIAL_PUBLICATION_REVIEW_REQUIRED' using errcode='23514',detail=conflict.reason;end if;
 return new;
end $$;
revoke all on function public.social_repeat_publication_guard() from public,anon,authenticated,service_role;
create trigger social_repeat_publication_guard before insert or update of state on public.social_publications
for each row execute function public.social_repeat_publication_guard();

create function public.social_content_repeat_check(p_principal jsonb,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c record; conflict record; result jsonb:='[]'; own_id uuid;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if jsonb_typeof(p_input)<>'object' or not(p_input?'projectId') or exists(select 1 from jsonb_object_keys(p_input) k where k<>'projectId') then
  raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 if not exists(select 1 from public.projects where id=(p_input->>'projectId')::uuid and slug='familje-stunden') then return result;end if;
 if (select count(*) from (select 1 from public.social_content_posts where project_id=(p_input->>'projectId')::uuid limit 501) bounded)>500 then
  raise exception 'SOCIAL_CONTENT_UNAVAILABLE';end if;
 for c in select r.*,b.external_account_id from public.social_content_posts p
  join public.social_content_revisions r on r.id=p.current_revision_id and r.project_id=p.project_id
  join public.social_account_bindings b on b.binding_id=r.binding_id and b.project_id=r.project_id
  where p.project_id=(p_input->>'projectId')::uuid
 loop
  -- Display of an existing attempt does not create another attempt. The DB
  -- trigger still excludes only its own publication ID at actual dispatch.
  select id into own_id from public.social_publications where post_id=c.post_id and project_id=c.project_id;
  select * into conflict from public.social_repeat_conflict(c.project_id,c.external_account_id,c.draft->>'channel',c.id,
   coalesce((c.draft->>'scheduledAt')::timestamptz,clock_timestamp()),own_id);
  if found then result:=result||jsonb_build_array(jsonb_build_object('postId',c.post_id,'revisionId',c.id,'conflictPostId',conflict.post_id,
   'publicationId',conflict.publication_id,'at',conflict.at,'reason',conflict.reason));end if;
 end loop;
 return result;
end $$;
revoke all on function public.social_content_repeat_check(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.social_content_repeat_check(jsonb,jsonb) to service_role;
