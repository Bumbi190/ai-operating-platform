-- PROPOSED ONLY. Not a canonical migration and NOT APPLIED.
-- Service-only preparation. No publication, review approval or budget increase.
begin;
create table public.social_campaigns(
 id uuid primary key,project_id uuid not null references public.projects(id),
 owner_id uuid not null references auth.users(id),conversation_id uuid not null,
 plan_revision_id uuid not null,profile_revision_id uuid not null,
 idempotency_key text not null,input_data jsonb not null,unit_ceiling_sek numeric(12,4) not null check(unit_ceiling_sek>0 and unit_ceiling_sek<=5),
 max_cost_sek numeric(12,4) not null check(max_cost_sek>0 and max_cost_sek<=5),
 cancelled_at timestamptz,created_at timestamptz not null default now(),
 unique(project_id,owner_id,idempotency_key),unique(id,project_id),
 foreign key(project_id,plan_revision_id) references public.social_launch_plan_revisions(project_id,id)
);
create table public.social_campaign_items(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.social_campaigns(id),
 ordinal integer not null check(ordinal between 1 and 3),run_id uuid not null unique references public.runs(id),
 post_id uuid not null unique default gen_random_uuid(),draft jsonb not null,
 state text not null default 'queued' check(state in ('queued','generating','asset_admitted','review_ready','blocked','uncertain','cancelled')),
 dispatch_claim_id uuid,asset_id uuid references public.assets(id),revision_id uuid references public.social_content_revisions(id),
 reason text,unique(campaign_id,ordinal)
);
alter table public.social_campaigns enable row level security;
alter table public.social_campaigns force row level security;
alter table public.social_campaign_items enable row level security;
alter table public.social_campaign_items force row level security;
revoke all on public.social_campaigns,public.social_campaign_items from public,anon,authenticated,service_role;
grant select,insert,update on public.social_campaigns,public.social_campaign_items to service_role;

create function public.social_campaign_closed(p_value jsonb,p_keys text[]) returns void
language plpgsql security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(p_value) is distinct from 'object'
 or (select count(*) from jsonb_object_keys(p_value))<>cardinality(p_keys)
 or exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_keys)))
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
end $fn$;

create function public.social_campaign_current(p_campaign public.social_campaigns) returns void
language plpgsql security invoker set search_path='' as $fn$
begin
 perform public.social_launch_assert_owner(
 jsonb_build_object('userId',p_campaign.owner_id,'allowedProjectIds',jsonb_build_array(p_campaign.project_id)),
 jsonb_build_object('projectId',p_campaign.project_id,'conversationId',p_campaign.conversation_id));
 perform public.social_content_active(p_campaign.project_id);
 if not exists(select 1 from public.social_project_profiles p where p.project_id=p_campaign.project_id and p.current_revision_id=p_campaign.profile_revision_id)
 then raise exception 'SOCIAL_CAMPAIGN_REVIEW_REQUIRED';end if;
 if not exists(select 1 from public.social_launch_plans p
 join public.social_launch_plan_revisions r on r.project_id=p.project_id and r.id=p.current_revision_id
 join public.social_launch_plan_decisions d on d.project_id=r.project_id and d.revision_id=r.id and d.sha256=r.sha256 and d.decision='approve'
 where p.project_id=p_campaign.project_id and r.id=p_campaign.plan_revision_id
 and exists(select 1 from jsonb_array_elements(r.choices) c where c->>'channel'='linkedin'))
 then raise exception 'SOCIAL_CAMPAIGN_REVIEW_REQUIRED';end if;
end $fn$;

-- Caller must hold the project lock before changing campaign/item state.
create function public.social_campaign_snapshot(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare c public.social_campaigns;items jsonb;slug text;campaign_state text;
begin
 select * into c from public.social_campaigns where id=p_id;
 if c.id is null then raise exception 'SOCIAL_CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
 select p.slug into slug from public.projects p where p.id=c.project_id;
 select jsonb_agg(jsonb_build_object('id',i.id,'runId',i.run_id,'postId',i.post_id,'state',i.state,
 'unitCeilingSek',c.unit_ceiling_sek,'draft',i.draft,'assetId',i.asset_id,'revisionId',i.revision_id,'reason',i.reason) order by i.ordinal) into items
 from public.social_campaign_items i where i.campaign_id=c.id;
 campaign_state=case
 when c.cancelled_at is not null then 'cancelled'
 when not exists(select 1 from public.social_campaign_items where campaign_id=c.id and state<>'review_ready') then 'review_ready'
 when exists(select 1 from public.social_campaign_items where campaign_id=c.id and state='uncertain') then 'uncertain'
 when exists(select 1 from public.social_campaign_items where campaign_id=c.id and state in ('generating','asset_admitted')) then 'working'
 when exists(select 1 from public.social_campaign_items where campaign_id=c.id and state='review_ready') then 'partial'
 when exists(select 1 from public.social_campaign_items where campaign_id=c.id and state='queued') then 'queued'
 else 'blocked' end;
 return jsonb_build_object('id',c.id,'projectId',c.project_id,'conversationId',c.conversation_id,'status',campaign_state,'items',coalesce(items,'[]'::jsonb),
 'workspaceUrl','/projects/'||slug||'/social/campaigns/'||c.id,'contentUrl','/projects/'||slug||'/social#content','maxCostSek',c.max_cost_sek,'publicationAuthority',false);
end $fn$;

create function public.social_campaign_read(p_principal jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare c public.social_campaigns;
begin
 perform public.social_campaign_closed(p_input,array['projectId','campaignId']);
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into c from public.social_campaigns where id=(p_input->>'campaignId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid;
 if c.id is null then raise exception 'SOCIAL_CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
 return public.social_campaign_snapshot(c.id);
end $fn$;

create function public.social_campaign_enqueue(p_principal jsonb,p_input jsonb,p_unit_ceiling_sek numeric) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare c public.social_campaigns;previous public.social_campaigns;item jsonb;k text;t timestamptz;local_time timestamp;run uuid;item_id uuid;n integer;ord integer=0;
begin
 perform public.social_campaign_closed(p_input,array['projectId','campaignId','conversationId','planRevisionId','profileRevisionId','idempotencyKey','items']);
 foreach k in array array['projectId','campaignId','conversationId','planRevisionId','profileRevisionId'] loop
 if jsonb_typeof(p_input->k) is distinct from 'string' or p_input->>k !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;end loop;
 if jsonb_typeof(p_input->'idempotencyKey') is distinct from 'string' or p_input->>'idempotencyKey' !~ '^[A-Za-z0-9_-]{1,100}$'
 or jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 n=jsonb_array_length(p_input->'items');
 if n<1 or n>3 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 if p_unit_ceiling_sek is null or p_unit_ceiling_sek::text in ('NaN','Infinity','-Infinity')
 or p_unit_ceiling_sek<=0 or ceil(p_unit_ceiling_sek*10000)/10000*n>5 then raise exception 'SOCIAL_CAMPAIGN_COST_LIMIT';end if;
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 -- Lock the source owner through enqueue/commit; never reassign its project.
 perform 1 from public.conversations where id=(p_input->>'conversationId')::uuid for share;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into previous from public.social_campaigns where project_id=(p_input->>'projectId')::uuid
 and owner_id=(p_principal->>'userId')::uuid and idempotency_key=p_input->>'idempotencyKey';
 if previous.id is not null then
 if previous.input_data is distinct from p_input or previous.unit_ceiling_sek is distinct from ceil(p_unit_ceiling_sek*10000)/10000
 then raise exception 'SOCIAL_CAMPAIGN_CONFLICT';end if;
 return public.social_campaign_snapshot(previous.id);end if;
 if exists(select 1 from public.social_campaigns where id=(p_input->>'campaignId')::uuid) then raise exception 'SOCIAL_CAMPAIGN_CONFLICT';end if;
 for item in select value from jsonb_array_elements(p_input->'items') loop
 perform public.social_campaign_closed(item,array['title','text','imagePrompt','localMinute','scheduledAt']);
 foreach k in array array['title','text','imagePrompt'] loop
 if jsonb_typeof(item->k) is distinct from 'string' or length(btrim(item->>k))<1
 or length(item->>k)>(case k when 'title' then 150 when 'text' then 5000 else 2000 end)
 or item->>k ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;end loop;
 if jsonb_typeof(item->'scheduledAt') is distinct from 'string' or item->>'scheduledAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$'
 or jsonb_typeof(item->'localMinute') is distinct from 'string' or item->>'localMinute' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 begin t=(item->>'scheduledAt')::timestamptz;local_time=(item->>'localMinute')::timestamp;
 exception when others then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end;
 if t<=clock_timestamp() or t>clock_timestamp()+interval '366 days'
 or to_char(t at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI')<>item->>'localMinute'
 -- Reject a Stockholm fold even if a caller hand-picks either UTC interpretation.
 or to_char((t-interval '1 hour') at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI')=item->>'localMinute'
 or to_char((t+interval '1 hour') at time zone 'Europe/Stockholm','YYYY-MM-DD"T"HH24:MI')=item->>'localMinute'
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 end loop;
 if (select count(distinct value->>'scheduledAt') from jsonb_array_elements(p_input->'items'))<>n then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 c.id=(p_input->>'campaignId')::uuid;c.project_id=(p_input->>'projectId')::uuid;c.owner_id=(p_principal->>'userId')::uuid;
 c.conversation_id=(p_input->>'conversationId')::uuid;c.plan_revision_id=(p_input->>'planRevisionId')::uuid;c.profile_revision_id=(p_input->>'profileRevisionId')::uuid;
 perform public.social_campaign_current(c);
 if (select count(*) from public.social_campaigns where project_id=c.project_id and created_at>now()-interval '24 hours')>=20
 then raise exception 'SOCIAL_CAMPAIGN_COST_LIMIT';end if;
 insert into public.social_campaigns(id,project_id,owner_id,conversation_id,plan_revision_id,profile_revision_id,idempotency_key,input_data,unit_ceiling_sek,max_cost_sek)
 values(c.id,c.project_id,c.owner_id,c.conversation_id,c.plan_revision_id,c.profile_revision_id,p_input->>'idempotencyKey',p_input,ceil(p_unit_ceiling_sek*10000)/10000,ceil(p_unit_ceiling_sek*10000)/10000*n);
 for item in select value from jsonb_array_elements(p_input->'items') loop
 ord=ord+1;run=gen_random_uuid();item_id=gen_random_uuid();
 insert into public.runs(id,project_id,workflow_id,status,kind,input,context,max_attempts)
 values(run,c.project_id,null,'pending','social.campaign.image.v1',jsonb_build_object('campaignId',c.id,'itemId',item_id),jsonb_build_object('source','social_campaign','campaignId',c.id),1);
 insert into public.social_campaign_items(id,campaign_id,ordinal,run_id,draft) values(item_id,c.id,ord,run,item);
 end loop;
 return public.social_campaign_snapshot(c.id);
end $fn$;

-- Consistent lock order: destination project, source conversation, campaign, run, item.
-- Evidence recording intentionally permits cancelled/expired work ONLY for the exact dispatch claim.
create function public.social_campaign_lock(p_writer jsonb,p_evidence boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare c public.social_campaigns;i public.social_campaign_items;r public.runs;k text;
begin
 perform public.social_campaign_closed(p_writer,array['projectId','campaignId','itemId','runId','claimId']);
 foreach k in array array['projectId','campaignId','itemId','runId','claimId'] loop
 if jsonb_typeof(p_writer->k) is distinct from 'string' or p_writer->>k !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;end loop;
 perform 1 from public.projects where id=(p_writer->>'projectId')::uuid for update;
 select * into c from public.social_campaigns where id=(p_writer->>'campaignId')::uuid and project_id=(p_writer->>'projectId')::uuid;
 if c.id is null then raise exception 'SOCIAL_CAMPAIGN_FENCED';end if;
 perform 1 from public.conversations where id=c.conversation_id for share;
 select * into c from public.social_campaigns where id=c.id for update;
 select * into r from public.runs where id=(p_writer->>'runId')::uuid for update;
 select * into i from public.social_campaign_items where id=(p_writer->>'itemId')::uuid and campaign_id=c.id and run_id=r.id for update;
 if i.id is null or r.project_id is distinct from c.project_id or r.kind is distinct from 'social.campaign.image.v1'
 then raise exception 'SOCIAL_CAMPAIGN_FENCED';end if;
 if p_evidence then
 if i.dispatch_claim_id is distinct from (p_writer->>'claimId')::uuid then raise exception 'SOCIAL_CAMPAIGN_FENCED';end if;
 else
 if r.status is distinct from 'running' or r.claim_id is distinct from (p_writer->>'claimId')::uuid or r.lease_until is null or r.lease_until<=clock_timestamp()
 or r.reconciliation_required then raise exception 'SOCIAL_CAMPAIGN_FENCED';end if;
 if c.cancelled_at is not null or r.cancel_requested then raise exception 'SOCIAL_CAMPAIGN_CANCELLED';end if;
 perform public.social_campaign_current(c);
 end if;
 return jsonb_build_object('campaign',to_jsonb(c),'item',to_jsonb(i));
end $fn$;

create function public.social_campaign_claim_item(p_writer jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare snap jsonb;i public.social_campaign_items;c public.social_campaigns;generate boolean=false;v jsonb;
begin
 perform public.social_campaign_closed(p_input,array[]::text[]);
 snap=public.social_campaign_lock(p_writer);
 select * into c from public.social_campaigns where id=(p_writer->>'campaignId')::uuid;
 select * into i from public.social_campaign_items where id=(p_writer->>'itemId')::uuid;
 if i.state='queued' then
 update public.social_campaign_items set state='generating',dispatch_claim_id=(p_writer->>'claimId')::uuid where id=i.id;
 generate=true;
 elsif i.state='generating' then
 update public.social_campaign_items set state='uncertain',reason='previous_dispatch' where id=i.id;
 end if;
 v=public.social_campaign_snapshot(c.id);
 return jsonb_build_object('campaign',v,'item',(select value from jsonb_array_elements(v->'items') where value->>'id'=i.id::text),'shouldGenerate',generate);
end $fn$;

create function public.social_campaign_record_asset(p_writer jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare snap jsonb;i public.social_campaign_items;v jsonb;asset uuid;
begin
 perform public.social_campaign_closed(p_input,array['assetId']);
 if jsonb_typeof(p_input->'assetId') is distinct from 'string' or p_input->>'assetId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 snap=public.social_campaign_lock(p_writer,true);asset=(p_input->>'assetId')::uuid;
 select * into i from public.social_campaign_items where id=(p_writer->>'itemId')::uuid;
 if i.asset_id is not null and i.asset_id<>asset then raise exception 'SOCIAL_CAMPAIGN_CONFLICT';end if;
 if not exists(select 1 from public.assets where id=asset and project_id=(p_writer->>'projectId')::uuid and kind='image' and status='active'
 and checksum_sha256~'^[a-f0-9]{64}$' and mime_type in ('image/png','image/jpeg','image/webp') and width>0 and height>0)
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 update public.social_campaign_items set asset_id=asset,state=case when state in ('generating','asset_admitted') then 'asset_admitted' else state end where id=i.id;
 v=public.social_campaign_snapshot((p_writer->>'campaignId')::uuid);
 return jsonb_build_object('item',(select value from jsonb_array_elements(v->'items') where value->>'id'=i.id::text),'campaign',v);
end $fn$;

create function public.social_campaign_commit_item(p_writer jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare snap jsonb;c public.social_campaigns;i public.social_campaign_items;p jsonb;input jsonb;saved jsonb;rid uuid;v jsonb;
begin
 perform public.social_campaign_closed(p_input,array[]::text[]);
 snap=public.social_campaign_lock(p_writer);
 select * into c from public.social_campaigns where id=(p_writer->>'campaignId')::uuid;
 select * into i from public.social_campaign_items where id=(p_writer->>'itemId')::uuid;
 if i.state<>'review_ready' then
 if i.state<>'asset_admitted' or i.asset_id is null then raise exception 'SOCIAL_CAMPAIGN_UNCERTAIN';end if;
 p=jsonb_build_object('userId',c.owner_id,'allowedProjectIds',jsonb_build_array(c.project_id));
 input=jsonb_build_object('projectId',c.project_id,'conversationId',c.conversation_id,'postId',i.post_id,'expectedRevisionId',null,
 'planRevisionId',c.plan_revision_id,'idempotencyKey','campaign_'||i.id::text,'draft',
 jsonb_build_object('channel','linkedin','format','image','title',i.draft->>'title','text',i.draft->>'text','linkUrl',null,
 'mediaIds',jsonb_build_array(i.asset_id),'mediaBrief',left(i.draft->>'imagePrompt',1000),'scheduledAt',i.draft->>'scheduledAt'));
 -- Canonical revision + campaign receipt share this transaction and authority locks.
 saved=public.social_content_save(p,input);
 select r.id into rid from public.social_content_revisions r where r.project_id=c.project_id and r.post_id=i.post_id and r.idempotency_key='campaign_'||i.id::text;
 if rid is null then raise exception 'SOCIAL_CAMPAIGN_UNAVAILABLE';end if;
 update public.social_campaign_items set state='review_ready',revision_id=rid,reason=null where id=i.id;
 end if;
 v=public.social_campaign_snapshot(c.id);
 return jsonb_build_object('item',(select value from jsonb_array_elements(v->'items') where value->>'id'=i.id::text),'campaign',v);
end $fn$;

create function public.social_campaign_mark_item(p_writer jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare snap jsonb;i public.social_campaign_items;v jsonb;
begin
 perform public.social_campaign_closed(p_input,array['reason','uncertain']);
 if jsonb_typeof(p_input->'uncertain') is distinct from 'boolean' or coalesce(p_input->>'reason','') not in
 ('provider_unknown','admission_failed','save_failed','deadline','disabled','context_changed','cancelled','cost_limit','provider_refused')
 then raise exception 'SOCIAL_CAMPAIGN_INVALID_BODY';end if;
 -- Evidence path only after dispatch latch; queued refusal uses fresh live authority.
 select * into i from public.social_campaign_items where id=(p_writer->>'itemId')::uuid;
 snap=public.social_campaign_lock(p_writer,i.dispatch_claim_id is not null);
 if i.state not in ('review_ready','cancelled') then
 update public.social_campaign_items set state=case when (p_input->>'uncertain')::boolean then 'uncertain' else 'blocked' end,reason=p_input->>'reason' where id=i.id;
 end if;
 v=public.social_campaign_snapshot((p_writer->>'campaignId')::uuid);
 return jsonb_build_object('item',(select value from jsonb_array_elements(v->'items') where value->>'id'=i.id::text),'campaign',v);
end $fn$;

create function public.social_campaign_cancel(p_principal jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare c public.social_campaigns;
begin
 perform public.social_campaign_closed(p_input,array['projectId','campaignId']);
 perform public.social_launch_assert_owner(p_principal,p_input);
 perform 1 from public.projects where id=(p_input->>'projectId')::uuid for update;
 perform public.social_launch_assert_owner(p_principal,p_input);
 select * into c from public.social_campaigns where id=(p_input->>'campaignId')::uuid and project_id=(p_input->>'projectId')::uuid and owner_id=(p_principal->>'userId')::uuid for update;
 if c.id is null then raise exception 'SOCIAL_CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
 update public.social_campaigns set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where id=c.id;
 update public.runs set cancel_requested=true where id in (select run_id from public.social_campaign_items where campaign_id=c.id and state<>'review_ready') and status in ('pending','running');
 update public.social_campaign_items set state='cancelled',reason='cancelled' where campaign_id=c.id and state='queued';
 return public.social_campaign_snapshot(c.id);
end $fn$;

-- Include every helper; invoker privileges do not imply client access.
revoke all on function public.social_campaign_closed(jsonb,text[]),public.social_campaign_current(public.social_campaigns),
 public.social_campaign_snapshot(uuid),public.social_campaign_read(jsonb,jsonb),public.social_campaign_enqueue(jsonb,jsonb,numeric),
 public.social_campaign_lock(jsonb,boolean),public.social_campaign_claim_item(jsonb,jsonb),public.social_campaign_record_asset(jsonb,jsonb),
 public.social_campaign_commit_item(jsonb,jsonb),public.social_campaign_mark_item(jsonb,jsonb),public.social_campaign_cancel(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_campaign_closed(jsonb,text[]),public.social_campaign_current(public.social_campaigns),
 public.social_campaign_snapshot(uuid),public.social_campaign_read(jsonb,jsonb),public.social_campaign_enqueue(jsonb,jsonb,numeric),
 public.social_campaign_lock(jsonb,boolean),public.social_campaign_claim_item(jsonb,jsonb),public.social_campaign_record_asset(jsonb,jsonb),
 public.social_campaign_commit_item(jsonb,jsonb),public.social_campaign_mark_item(jsonb,jsonb),public.social_campaign_cancel(jsonb,jsonb) to service_role;
comment on table public.social_campaigns is 'Bounded image preparation only. Not a publishing schedule, approval, or budget increase.';
comment on table public.social_campaign_items is 'Once-only image dispatch latch and canonical content receipts. Unknown outcomes never automatically regenerate.';
commit;
