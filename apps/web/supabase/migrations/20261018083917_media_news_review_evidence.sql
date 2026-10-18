-- Refuse to retroactively trust a producer name that existed before its server guard.
do $guard$
begin
 if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.asset_provenance'::regclass and tgname='media_news_review_reserved_provenance')
 and exists(select 1 from public.asset_provenance where adapter_version='the-prompt-review-admission-v1')
 then raise exception 'REVIEW_ADMISSION_PREEXISTING_RECONCILIATION_REQUIRED';end if;
end $guard$;

-- The Prompt: immutable review evidence only. No dispatch/spend/schedule authority.
create table if not exists public.media_news_review_evidence (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 post_id uuid not null, revision_id uuid not null unique, revision_sha256 text not null,
 script_id uuid not null references public.media_scripts(id) on delete restrict,
 video_asset_id uuid not null references public.assets(id) on delete restrict,
 channel text not null check(channel in ('facebook','instagram','youtube')),
 snapshot jsonb not null, snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 root_idempotency_key text not null, request jsonb not null, created_by uuid not null, created_at timestamptz not null default now(),
 unique(project_id,root_idempotency_key,channel),
 foreign key(revision_id,post_id,project_id,revision_sha256) references public.social_content_revisions(id,post_id,project_id,sha256)
);
create index if not exists media_news_review_script_channel_idx on public.media_news_review_evidence(project_id,script_id,channel,created_at desc);
alter table public.media_news_review_evidence enable row level security;
revoke all on public.media_news_review_evidence from public,anon,authenticated,service_role;
grant select,insert on public.media_news_review_evidence to service_role;

create or replace function public.media_news_canonical_json(v jsonb) returns text
language plpgsql immutable strict security invoker set search_path='' as $fn$
begin
 case jsonb_typeof(v)
 when 'object' then return '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||public.media_news_canonical_json(value),',' order by key collate "C") from jsonb_each(v)),'')||'}';
 when 'array' then return '['||coalesce((select string_agg(public.media_news_canonical_json(value),',' order by ord) from jsonb_array_elements(v) with ordinality a(value,ord)),'')||']';
 else return v::text;end case;
end $fn$;

create or replace function public.media_news_review_caption(s public.media_scripts) returns text
language sql immutable security invoker set search_path='' as $fn$
 select concat_ws(E'\n',
 nullif((select string_agg(value,E'\n' order by ord) from jsonb_array_elements_text(s.captions) with ordinality a(value,ord)),''),
 nullif((select string_agg(value,' ' order by ord) from jsonb_array_elements_text(s.hashtags) with ordinality a(value,ord)),''),
 nullif(s.cta,''))
$fn$;

-- The foundation permits owner writes. Reserve this producer identity to server admission.
create or replace function public.media_news_review_guard_provenance() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
 if new.adapter_version='the-prompt-review-admission-v1' and current_user<>'service_role'
 then raise exception 'REVIEW_ADMISSION_SERVER_ONLY' using errcode='42501';end if;
 return new;
end $fn$;
drop trigger if exists media_news_review_reserved_provenance on public.asset_provenance;
create trigger media_news_review_reserved_provenance before insert on public.asset_provenance for each row execute function public.media_news_review_guard_provenance();

create or replace function public.media_news_snapshot_requirements(p_project uuid,s jsonb) returns text[]
language plpgsql security invoker set search_path='' as $fn$
declare r jsonb=s->'receipt';script public.media_scripts;news public.media_news_items;video public.assets;prov public.asset_provenance;
 a public.assets;ap public.asset_provenance;identity jsonb;plan public.social_launch_plan_revisions;expected jsonb;refs jsonb;used_costs jsonb;
begin
 if jsonb_typeof(s)<>'object' or (select count(*) from jsonb_object_keys(s))<>6
 or exists(select 1 from jsonb_object_keys(s) k where k not in ('video','receipt','receiptSha256','provenanceId','planRevisionId','destinations'))
 or r->>'projectId' is distinct from p_project::text or r->>'kind' is distinct from 'the-prompt-review-render-v1'
 or r->>'language' is distinct from 'en' or r->>'creativeVersion' is distinct from 'the-prompt-illustrated-smooth-v1'
 or r->>'compositionId' is distinct from 'ThePromptIllustratedNews'
 or r->>'sourceSha' !~ '^[a-f0-9]{40}$'
 or s->>'receiptSha256' is distinct from encode(sha256(convert_to(public.media_news_canonical_json(r),'UTF8')),'hex')
 then return array['news_evidence_invalid'];end if;
 select * into video from public.assets where id=(s->'video'->>'id')::uuid and project_id=p_project;
 select * into prov from public.asset_provenance where asset_id=video.id;
 if video.id is null or video.kind<>'video' or video.status<>'active' or video.visibility<>'internal' or video.storage_bucket<>'media-assets-private'
 or video.mime_type<>'video/mp4' or video.checksum_sha256 is distinct from s->'video'->>'sha256' or video.byte_size is distinct from (s->'video'->>'byteSize')::bigint
 or r->'video' is distinct from jsonb_build_object('sha256',video.checksum_sha256,'byteSize',video.byte_size)
 or s->>'provenanceId' is distinct from video.id::text or prov.asset_id is null or prov.source<>'derived'
 or prov.adapter_version is distinct from 'the-prompt-review-admission-v1' or prov.simulated
 or prov.provider_metadata->'receipt' is distinct from r
 then return array['news_evidence_changed'];end if;
 if (r->'profile'->>'width')::int<>720 or (r->'profile'->>'height')::int<>1280 or (r->'profile'->>'fps')::int<>30
 or r->'profile'->>'videoCodec'<>'h264' or r->'profile'->>'audioCodec'<>'aac'
 or video.width<>720 or video.height<>1280 or video.duration_ms is distinct from (r->'profile'->>'durationMs')::int
 or (r->'profile'->>'frames')::int<>ceil((r->>'narrationDurationMs')::numeric*30/1000)+90
 then return array['news_evidence_invalid'];end if;
 select * into script from public.media_scripts where id=(r->>'scriptId')::uuid and project_id=p_project;
 if script.id is null or script.news_item_id is null or script.video_status='private_preview' or script.raw_output->>'private_provider_preview' is not null
 or script.news_item_id is distinct from (r->'source'->>'newsItemId')::uuid
 or encode(sha256(convert_to(coalesce(script.script,''),'UTF8')),'hex') is distinct from r->>'scriptSha256'
 or encode(sha256(convert_to(coalesce(script.hook,''),'UTF8')),'hex') is distinct from r->>'hookSha256'
 or encode(sha256(convert_to(public.media_news_review_caption(script),'UTF8')),'hex') is distinct from r->>'captionSha256'
 or script.script is distinct from r->>'transcript' or script.voice_status<>'ready'
 or script.raw_output->'pilot_voice_receipt' is distinct from r->'voiceReceipt'
 or r->'voiceReceipt'->>'voiceId' is distinct from 'qSeXEcewz7tA0Q0qk9fH'
 or r->'voiceReceipt'->>'modelId' is distinct from 'eleven_turbo_v2_5'
 or r->'voiceReceipt'->>'transcriptSha256' is distinct from r->>'scriptSha256'
 or r->'voiceReceipt'->>'audioSha256' is distinct from r->'audio'->>'sha256'
 or (r->'voiceReceipt'->>'audioByteSize')::bigint is distinct from (r->'audio'->>'byteSize')::bigint
 then return array['news_evidence_changed'];end if;
 select * into news from public.media_news_items where id=script.news_item_id and project_id=p_project;
 if (news.raw_output->>'source_published_at')::timestamptz < now()-interval '48 hours'
 or (news.raw_output->>'source_published_at')::timestamptz > now()+interval '15 minutes'
 then return array['news_source_expired'];end if;
 if news.id is null or news.url is distinct from r->'source'->>'url' or news.raw_output->>'source_key' is distinct from r->'source'->>'key'
 or (news.raw_output->>'source_published_at')::timestamptz is distinct from (r->'source'->>'publishedAt')::timestamptz
 then return array['news_evidence_changed'];end if;
 if jsonb_array_length(r->'images')<>3 or (select count(distinct value->>'id') from jsonb_array_elements(r->'images'))<>3
 or jsonb_array_length(r->'usage')<>3 or coalesce(r->'qa'->>'reportText','')=''
 or encode(sha256(convert_to(r->'qa'->>'reportText','UTF8')),'hex') is distinct from r->'qa'->>'reportSha256'
 or r->'qa'->>'reviewedBy' is distinct from (select owner_id::text from public.projects where id=p_project)
 or (r->'qa'->>'reviewedAt')::timestamptz>now()
 or exists(select 1 from jsonb_array_elements(r->'usage') u where u->>'scope' is distinct from 'public_social_editorial'
 or coalesce(u->>'documentText','')='' or encode(sha256(convert_to(u->>'documentText','UTF8')),'hex') is distinct from u->>'documentSha256'
 or u->>'reviewedBy' is distinct from (select owner_id::text from public.projects where id=p_project) or (u->>'reviewedAt')::timestamptz>now())
 then return array['news_evidence_invalid'];end if;
 refs=(r->'images')||jsonb_build_array(r->'audio');
 if r->'assetProvenanceIds' is distinct from (select jsonb_agg(value->'id' order by ord) from jsonb_array_elements(refs) with ordinality a(value,ord))
 or to_jsonb(prov.reference_asset_ids) is distinct from r->'assetProvenanceIds' then return array['news_evidence_invalid'];end if;
 for identity in select value from jsonb_array_elements(refs) loop
  select * into a from public.assets where id=(identity->>'id')::uuid and project_id=p_project;
  select * into ap from public.asset_provenance where asset_id=a.id;
  if a.id is null or a.status<>'active' or a.visibility<>'internal' or a.storage_bucket<>'media-assets-private'
  or a.checksum_sha256 is distinct from identity->>'sha256' or a.byte_size is distinct from (identity->>'byteSize')::bigint
  or a.kind is distinct from (case when identity->>'id'=r->'audio'->>'id' then 'audio' else 'image' end)
  or ap.asset_id is null or ap.source<>'generated' or ap.simulated or ap.provider is distinct from (case when a.kind='audio' then 'elevenlabs' else 'ideogram' end)
  or a.kind='audio' and ap.model is distinct from r->'voiceReceipt'->>'modelId'
  or ap.cost_event_id is null or not (r->'costEventIds' ? ap.cost_event_id::text)
  or not exists(select 1 from public.cost_events c where c.id=ap.cost_event_id and c.project_id=p_project and c.provider=ap.provider)
  then return array['news_evidence_changed'];end if;
 end loop;
 select jsonb_agg(c order by c) into used_costs from (select distinct cost_prov.cost_event_id::text c from public.asset_provenance cost_prov where cost_prov.asset_id in (select (value->>'id')::uuid from jsonb_array_elements(refs))) x;
 if used_costs is distinct from (select jsonb_agg(value order by value) from jsonb_array_elements(r->'costEventIds'))
 then return array['news_evidence_invalid'];end if;
 select pr.* into plan from public.social_launch_plans p join public.social_launch_plan_revisions pr on pr.id=p.current_revision_id and pr.project_id=p.project_id
 where p.project_id=p_project and p.current_revision_id=(s->>'planRevisionId')::uuid;
 if plan.id is null or not exists(select 1 from public.social_launch_plan_decisions d where d.project_id=p_project and d.revision_id=plan.id and d.sha256=plan.sha256 and d.decision='approve')
 then return array['news_evidence_changed'];end if;
 select coalesce(jsonb_agg(jsonb_build_object('channel',c->>'channel','bindingId',b.binding_id,'accountId',b.external_account_id) order by c->>'channel'),'[]') into expected
 from jsonb_array_elements(plan.choices) c left join public.social_account_bindings b on b.project_id=p_project and b.platform=c->>'channel' and b.superseded_at is null
 where c->>'format'='video' and c->>'channel' in ('facebook','instagram','youtube');
 if expected='[]'::jsonb or expected is distinct from s->'destinations'
 or exists(select 1 from public.social_account_bindings where project_id=p_project and superseded_at is null and blocked_at is not null and platform in (select value->>'channel' from jsonb_array_elements(expected)))
 then return array['news_evidence_changed'];end if;
 if exists(select 1 from public.projects where id=p_project and execution_paused)
 or exists(select 1 from public.project_lifecycle where project_id=p_project and state<>'active')
 or exists(select 1 from public.platform_config where automation_paused) then return array['news_project_stopped'];end if;
 return array[]::text[];
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return array['news_evidence_invalid'];
end $fn$;

create or replace function public.media_news_review_requirements(p_revision uuid) returns text[]
language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions;e public.media_news_review_evidence;receipt jsonb;reasons text[];
begin
 select * into strict r from public.social_content_revisions where id=p_revision;
 select * into e from public.media_news_review_evidence where revision_id=r.id and project_id=r.project_id;
 if e.id is null then
  if exists(select 1 from public.media_news_review_evidence where post_id=r.post_id and project_id=r.project_id)
  or exists(select 1 from jsonb_array_elements(r.media) m join public.asset_provenance ap on ap.asset_id=(m->>'id')::uuid where ap.adapter_version='the-prompt-review-admission-v1')
  then return array['news_evidence_required'];end if;return array[]::text[];
 end if;
 receipt=e.snapshot->'receipt';
 if e.snapshot_sha256 is distinct from encode(sha256(convert_to(public.media_news_canonical_json(e.snapshot),'UTF8')),'hex')
 or r.draft->>'format'<>'video' or r.draft->>'channel' is distinct from e.channel or r.draft->'mediaIds' is distinct from jsonb_build_array(e.video_asset_id)
 or r.draft->>'title' is distinct from (select hook from public.media_scripts where id=e.script_id and project_id=r.project_id)
 or r.draft->>'text' is distinct from (select public.media_news_review_caption(s) from public.media_scripts s where id=e.script_id and project_id=r.project_id)
 or r.draft->>'linkUrl' is distinct from receipt->'source'->>'url'
 then return array['news_evidence_changed'];end if;
 return public.media_news_snapshot_requirements(r.project_id,e.snapshot);
end $fn$;

create or replace function public.media_news_review_guard_evidence() returns trigger
language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions;
begin
 perform 1 from public.projects where id=new.project_id for update;
 perform 1 from public.social_content_posts where id=new.post_id and project_id=new.project_id and current_revision_id=new.revision_id for update;
 if not found then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 if exists(select 1 from public.social_content_decisions where revision_id=new.revision_id) then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;
 select * into r from public.social_content_revisions where id=new.revision_id and post_id=new.post_id and project_id=new.project_id and sha256=new.revision_sha256;
 if r.id is null or new.script_id::text is distinct from new.snapshot->'receipt'->>'scriptId' or new.video_asset_id::text is distinct from new.snapshot->'video'->>'id'
 or new.snapshot_sha256 is distinct from encode(sha256(convert_to(public.media_news_canonical_json(new.snapshot),'UTF8')),'hex')
 or cardinality(public.media_news_snapshot_requirements(new.project_id,new.snapshot))<>0
 then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;
 return new;
end $fn$;
drop trigger if exists media_news_review_insert_guard on public.media_news_review_evidence;
create trigger media_news_review_insert_guard before insert on public.media_news_review_evidence for each row execute function public.media_news_review_guard_evidence();
create or replace function public.media_news_review_reject_mutation() returns trigger language plpgsql security invoker set search_path='' as $fn$
begin raise exception 'media_news_review_evidence is append-only' using errcode='23001';end $fn$;
drop trigger if exists media_news_review_no_mutation on public.media_news_review_evidence;
create trigger media_news_review_no_mutation before update or delete on public.media_news_review_evidence for each row execute function public.media_news_review_reject_mutation();
drop trigger if exists media_news_review_no_truncate on public.media_news_review_evidence;
create trigger media_news_review_no_truncate before truncate on public.media_news_review_evidence for each statement execute function public.media_news_review_reject_mutation();

create or replace function public.media_news_review_read(p_principal jsonb,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;post uuid=(p_input->>'postId')::uuid;r public.social_content_revisions;e public.media_news_review_evidence;reasons text[];pub text[]=array['video_transport_unavailable','release_authority_missing','schedule_not_activated'];receipt jsonb;
begin
 perform public.social_launch_assert_owner(p_principal,jsonb_build_object('projectId',project));
 if (select count(*) from jsonb_object_keys(p_input))<>2 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId')) then raise exception 'NEWS_REVIEW_INVALID_BODY';end if;
 select rv.* into r from public.social_content_posts p join public.social_content_revisions rv on rv.id=p.current_revision_id and rv.project_id=p.project_id and rv.post_id=p.id where p.project_id=project and p.id=post;
 if r.id is null then raise exception 'NEWS_REVIEW_NOT_FOUND' using errcode='P0002';end if;
 select * into e from public.media_news_review_evidence where revision_id=r.id and project_id=project;
 reasons=public.media_news_review_requirements(r.id);
 if e.id is null and cardinality(reasons)=0 then reasons=array['news_evidence_required'];end if;
 if not exists(select 1 from public.social_content_decisions where revision_id=r.id and sha256=r.sha256 and decision='approve') then pub=array_append(pub,'review_required');end if;
 if r.binding_id is null then pub=array_append(pub,'account_required');end if;
 pub=pub||public.social_content_requirements(r.id);
 receipt=e.snapshot->'receipt';
 return jsonb_build_object('projectId',project,'postId',post,'revisionId',r.id,'evidenceSha256',e.snapshot_sha256,
 'review_packet_ready',e.id is not null and cardinality(reasons)=0,'blockers',to_jsonb(reasons),'publicationBlockers',to_jsonb(pub),'canPublish',false,'dispatchEnabled',false,
 'source',case when e.id is null then null else receipt->'source' end,'creativeVersion',receipt->>'creativeVersion',
 'video',e.snapshot->'video','imageCount',3,'voiceLabel','Victoria','aiDisclosure','AI-GENERATED / EDITORIAL ILLUSTRATIONS');
end $fn$;

create or replace function public.media_news_review_prepare(p_principal jsonb,p_input jsonb,p_snapshot jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;actor uuid=(p_principal->>'userId')::uuid;v_script_id uuid=(p_input->>'scriptId')::uuid;video uuid=(p_input->>'videoAssetId')::uuid;
 previous public.media_news_review_evidence;revision public.social_content_revisions;post uuid;expected uuid;destination jsonb;draft jsonb;body jsonb;result jsonb='[]';fingerprint text;reasons text[];channel text;caption text;title text;
begin
 perform public.social_launch_assert_owner(p_principal,jsonb_build_object('projectId',project));
 if (select count(*) from jsonb_object_keys(p_input))<>4 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','scriptId','videoAssetId','idempotencyKey'))
 or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$'
 or p_snapshot->'receipt'->>'projectId' is distinct from project::text or p_snapshot->'receipt'->>'scriptId' is distinct from v_script_id::text
 or p_snapshot->'video'->>'id' is distinct from video::text then raise exception 'NEWS_REVIEW_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,jsonb_build_object('projectId',project));perform public.social_content_active(project);
 perform 1 from public.media_scripts where id=v_script_id and project_id=project for update;
 perform 1 from public.media_news_items where id=(p_snapshot->'receipt'->'source'->>'newsItemId')::uuid and project_id=project for update;
 perform 1 from public.assets where project_id=project and id in (select (value->>'id')::uuid from jsonb_array_elements((p_snapshot->'receipt'->'images')||jsonb_build_array(p_snapshot->'receipt'->'audio',p_snapshot->'video'))) order by id for update;
 perform 1 from public.asset_provenance where asset_id in (select (value->>'id')::uuid from jsonb_array_elements((p_snapshot->'receipt'->'images')||jsonb_build_array(p_snapshot->'receipt'->'audio',p_snapshot->'video'))) order by asset_id for share;
 perform 1 from public.cost_events where project_id=project and id in (select value::uuid from jsonb_array_elements_text(p_snapshot->'receipt'->'costEventIds')) order by id for share;
 perform 1 from public.social_account_bindings where project_id=project and superseded_at is null order by binding_id for share;
 fingerprint=encode(sha256(convert_to(public.media_news_canonical_json(p_snapshot),'UTF8')),'hex');
 select e.* into previous from public.media_news_review_evidence e where e.project_id=project and e.root_idempotency_key=p_input->>'idempotencyKey' order by e.channel limit 1;
 if previous.id is not null and (previous.request is distinct from p_input or previous.snapshot_sha256 is distinct from fingerprint or previous.created_by<>actor) then raise exception 'NEWS_REVIEW_REVISION_CONFLICT';end if;
 reasons=public.media_news_snapshot_requirements(project,p_snapshot);
 if cardinality(reasons)>0 then
 if previous.id is not null then raise exception 'NEWS_REVIEW_REVISION_CONFLICT';end if;
 raise exception 'NEWS_REVIEW_REVIEW_REQUIRED: %',reasons;end if;
 for destination in select value from jsonb_array_elements(p_snapshot->'destinations') loop
  channel=destination->>'channel';
  select * into previous from public.media_news_review_evidence where project_id=project and root_idempotency_key=p_input->>'idempotencyKey' and media_news_review_evidence.channel=destination->>'channel';
  if previous.id is not null then
   if not exists(select 1 from public.social_content_posts where id=previous.post_id and project_id=project and current_revision_id=previous.revision_id) then raise exception 'NEWS_REVIEW_REVISION_CONFLICT';end if;
   post=previous.post_id;
  else
   select e.post_id into post from public.media_news_review_evidence e where e.project_id=project and e.script_id=v_script_id and e.channel=destination->>'channel' order by e.created_at desc,e.id limit 1;
   expected=null;
   if post is null then post=gen_random_uuid();else select current_revision_id into expected from public.social_content_posts where id=post and project_id=project for update;end if;
   select s.hook,public.media_news_review_caption(s) into title,caption from public.media_scripts s where s.id=v_script_id and s.project_id=project;
   draft=jsonb_build_object('channel',channel,'format','video','title',title,'text',caption,'linkUrl',p_snapshot->'receipt'->'source'->>'url','mediaIds',jsonb_build_array(video),'mediaBrief','AI editorial illustrations','scheduledAt',null);
   body=jsonb_build_object('projectId',project,'postId',post,'expectedRevisionId',expected,'planRevisionId',p_snapshot->>'planRevisionId','idempotencyKey',encode(sha256(convert_to(p_input->>'idempotencyKey'||':'||channel,'UTF8')),'hex'),'draft',draft);
   perform public.social_content_save(p_principal,body);
   select rv.* into revision from public.social_content_posts p join public.social_content_revisions rv on rv.id=p.current_revision_id and rv.post_id=p.id and rv.project_id=p.project_id where p.id=post and p.project_id=project;
   insert into public.media_news_review_evidence(project_id,post_id,revision_id,revision_sha256,script_id,video_asset_id,channel,snapshot,snapshot_sha256,root_idempotency_key,request,created_by)
   values(project,post,revision.id,revision.sha256,v_script_id,video,channel,p_snapshot,fingerprint,p_input->>'idempotencyKey',p_input,actor);
  end if;
  result=result||jsonb_build_array(public.media_news_review_read(p_principal,jsonb_build_object('projectId',project,'postId',post)));
 end loop;
 return result;
end $fn$;

revoke all on function public.media_news_canonical_json(jsonb),public.media_news_review_caption(public.media_scripts),public.media_news_review_guard_provenance(),public.media_news_snapshot_requirements(uuid,jsonb),public.media_news_review_requirements(uuid),public.media_news_review_guard_evidence(),public.media_news_review_reject_mutation(),public.media_news_review_read(jsonb,jsonb),public.media_news_review_prepare(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.media_news_canonical_json(jsonb),public.media_news_review_caption(public.media_scripts),public.media_news_review_guard_provenance(),public.media_news_snapshot_requirements(uuid,jsonb),public.media_news_review_requirements(uuid),public.media_news_review_guard_evidence(),public.media_news_review_reject_mutation(),public.media_news_review_read(jsonb,jsonb),public.media_news_review_prepare(jsonb,jsonb,jsonb) to service_role;
comment on table public.media_news_review_evidence is 'Immutable source/voice/usage/render evidence bound to exact social content revision. Grants no publication, scheduling or spend authority.';


create or replace function public.social_content_requirements(p_revision uuid) returns text[] language plpgsql security invoker set search_path='' as $fn$
declare r public.social_content_revisions; reasons text[]=array['activation_required']; active_binding uuid; blocked timestamptz;
begin
 select * into strict r from public.social_content_revisions where id=p_revision;
 if not exists(select 1 from public.social_launch_plans p join public.social_launch_plan_revisions pr on pr.id=p.current_revision_id and pr.project_id=p.project_id
 join public.social_launch_plan_decisions d on d.project_id=pr.project_id and d.revision_id=pr.id and d.sha256=pr.sha256 and d.decision='approve'
 where p.project_id=r.project_id and p.current_revision_id=r.plan_revision_id) then reasons=array_append(reasons,'plan_changed'); end if;
 select binding_id,blocked_at into active_binding,blocked from public.social_account_bindings where project_id=r.project_id and platform=r.draft->>'channel' and superseded_at is null;
 if active_binding is distinct from r.binding_id or blocked is not null then reasons=array_append(reasons,'destination_changed');elsif active_binding is null then reasons=array_append(reasons,'account_required');end if;
 if r.draft->>'format' in ('image','video') and jsonb_array_length(r.media)=0 then reasons=array_append(reasons,'media_required');end if;
 if exists(select 1 from jsonb_array_elements(r.media) m where not exists(select 1 from public.assets a where a.id=(m->>'id')::uuid and a.project_id=r.project_id and a.status='active' and a.checksum_sha256=m->>'sha256' and a.kind=m->>'kind' and a.mime_type=m->>'mimeType')) then reasons=array_append(reasons,'media_changed');end if;
 if r.draft->>'scheduledAt' is not null and (r.draft->>'scheduledAt')::timestamptz<=now() then reasons=array_append(reasons,'time_passed');end if;
 return reasons || public.media_news_review_requirements(p_revision);
end $fn$;

create or replace function public.social_content_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare p public.projects; result jsonb; asset_list jsonb; plan_id uuid; approved boolean;
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','conversationId')) then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 select * into strict p from public.projects where id=(p_input->>'projectId')::uuid;
 select current_revision_id into plan_id from public.social_launch_plans where project_id=p.id;
 approved=exists(select 1 from public.social_launch_plan_decisions where project_id=p.id and revision_id=plan_id and decision='approve');
 select coalesce(jsonb_agg(entry order by created_at desc),'[]') into result from (
 select posts.created_at,jsonb_build_object('id',posts.id,'revision',jsonb_build_object('id',r.id,'sequence',r.sequence,'sha256',r.sha256,'planRevisionId',r.plan_revision_id,'draft',r.draft,'media',r.media,'binding',r.binding,'createdAt',r.created_at),
 'decision',case when d.id is null then null else jsonb_build_object('id',d.id,'decision',d.decision,'revisionId',d.revision_id,'sha256',d.sha256,'decidedAt',d.decided_at) end,
 'status',case when reasons && array['plan_changed','destination_changed','media_changed','time_passed','news_evidence_required','news_evidence_invalid','news_evidence_changed','news_source_expired','news_project_stopped'] then 'needs_review' when d.decision='approve' then 'approved' when d.decision='reject' then 'rejected' else 'proposal' end,'requirements',to_jsonb(reasons)) || case when exists(select 1 from public.media_news_review_evidence e where e.project_id=posts.project_id and e.post_id=posts.id)
 or exists(select 1 from jsonb_array_elements(r.media) m join public.asset_provenance ap on ap.asset_id=(m->>'id')::uuid where ap.adapter_version='the-prompt-review-admission-v1')
 then jsonb_build_object('newsReview',public.media_news_review_read(p_principal,jsonb_build_object('projectId',p.id,'postId',posts.id))) else '{}'::jsonb end entry
 from public.social_content_posts posts join public.social_content_revisions r on r.id=posts.current_revision_id and r.project_id=posts.project_id and r.post_id=posts.id
 left join public.social_content_decisions d on d.revision_id=r.id cross join lateral (select public.social_content_requirements(r.id) reasons) checks where posts.project_id=p.id) entries;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'sha256',a.checksum_sha256,'mimeType',a.mime_type,'width',a.width,'height',a.height)),'[]') into asset_list
 from (select * from public.assets where project_id=p.id and status='active' and kind in ('image','video') and mime_type in ('image/png','image/jpeg','image/webp','image/gif','image/avif','video/mp4','video/webm') order by created_at desc,id limit 100) a;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug),'posts',result,'assets',asset_list,'hasMoreAssets',(select count(*)>100 from public.assets where project_id=p.id and status='active' and kind in ('image','video')),
 'plannedChannels',coalesce((select choices from public.social_launch_plan_revisions where id=plan_id),'[]'::jsonb),'currentPlanRevisionId',plan_id,'planApproved',approved,'workspaceUrl','/projects/'||p.slug||'/social#content','dispatchEnabled',false,'publicationReady',false);
end $fn$;

create or replace function public.social_content_decide(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;actor uuid=(p_principal->>'userId')::uuid;r public.social_content_revisions;d public.social_content_decisions;reasons text[];
begin
 perform public.social_launch_assert_owner(p_principal,p_input);
 if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','postId','revisionId','sha256','decision','idempotencyKey'))
 or coalesce(p_input->>'decision','') not in ('approve','reject') or coalesce(p_input->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'idempotencyKey','') !~ '^[A-Za-z0-9_-]{1,100}$' then raise exception 'SOCIAL_CONTENT_INVALID_BODY';end if;
 perform 1 from public.projects where id=project for update;perform public.social_launch_assert_owner(p_principal,p_input);perform public.social_content_active(project);
 select * into d from public.social_content_decisions where project_id=project and idempotency_key=p_input->>'idempotencyKey';
 if d.id is not null then
 if d.post_id is distinct from (p_input->>'postId')::uuid or d.revision_id is distinct from (p_input->>'revisionId')::uuid or d.sha256 is distinct from p_input->>'sha256' or d.decision is distinct from p_input->>'decision' or d.decided_by<>actor then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));end if;
 select r0.* into r from public.social_content_posts p join public.social_content_revisions r0 on r0.id=p.current_revision_id and r0.post_id=p.id and r0.project_id=p.project_id where p.id=(p_input->>'postId')::uuid and p.project_id=project for update of p;
 if r.id is null or r.id is distinct from (p_input->>'revisionId')::uuid or r.sha256 is distinct from p_input->>'sha256' then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 if p_input->>'decision'='approve' then
 reasons=public.social_content_requirements(r.id);if 'media_required'=any(reasons) then raise exception 'SOCIAL_CONTENT_MEDIA_REQUIRED';end if;
 if reasons && array['plan_changed','destination_changed','media_changed','time_passed','news_evidence_required','news_evidence_invalid','news_evidence_changed','news_source_expired','news_project_stopped'] then raise exception 'SOCIAL_CONTENT_REVIEW_REQUIRED';end if;end if;
 select * into d from public.social_content_decisions where revision_id=r.id;
 if d.id is not null then
 if d.decision is distinct from p_input->>'decision' or d.decided_by<>actor then raise exception 'SOCIAL_CONTENT_REVISION_CONFLICT';end if;
 else insert into public.social_content_decisions(project_id,post_id,revision_id,sha256,decision,idempotency_key,decided_by) values(project,r.post_id,r.id,r.sha256,p_input->>'decision',p_input->>'idempotencyKey',actor);end if;
 return public.social_content_read(p_principal,jsonb_build_object('projectId',project));
end $fn$;