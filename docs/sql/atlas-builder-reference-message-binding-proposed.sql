-- PROPOSAL ONLY. Never apply to an existing Supabase project from this test.
-- Requires the separately reviewed private reference-ticket schema.
begin;
create table public.website_build_reference_messages (
 message_id uuid primary key references public.conversation_messages(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 idempotency_key uuid not null,
 message_sha256 text not null check(message_sha256 ~ '^[0-9a-f]{64}$'),
 reference_sha256 text not null check(reference_sha256 ~ '^[0-9a-f]{64}$'),
 binding_sha256 text not null check(binding_sha256 ~ '^[0-9a-f]{64}$'),
 images jsonb not null check(jsonb_typeof(images)='array' and jsonb_array_length(images) between 1 and 4),
 created_at timestamptz not null default now(),
 unique(owner_id,conversation_id,idempotency_key)
);
alter table public.website_build_reference_messages enable row level security;
alter table public.website_build_reference_messages force row level security;
-- Explicit REVOKE matters when default privileges already grant API roles ALL.
revoke all on public.website_build_reference_messages from public,anon,authenticated,service_role;
grant select on public.website_build_reference_messages to service_role;

create function public.website_build_persist_reference_turn(
 p_owner_id uuid,p_project_id uuid,p_conversation_id uuid,p_idempotency_key uuid,
 p_message_text text,p_images jsonb
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare
 img jsonb; source_id uuid; message_id uuid;
 text_sha text; refs_sha text; binding_sha text; canonical_refs text;
 existing public.website_build_reference_messages%rowtype;
 lifecycle_state text; lifecycle_owner uuid;
begin
 if p_owner_id is null or p_project_id is null or p_conversation_id is null or p_idempotency_key is null
    or p_message_text is null or length(btrim(p_message_text,E' \t\r\n'))=0 or length(p_message_text)>10000
    or jsonb_typeof(p_images) is distinct from 'array'
 then raise exception 'ATLAS_REFERENCE_INVALID'; end if;
 if jsonb_array_length(p_images) not between 1 and 4 or pg_column_size(p_images)>8192
 then raise exception 'ATLAS_REFERENCE_INVALID'; end if;

 -- Serialize same-project writes and prevent owner/pause changes during commit.
 -- No provider work is done while these bounded database locks are held.
 perform 1 from public.projects p where p.id=p_project_id and p.owner_id=p_owner_id
   and p.execution_paused=false for update;
 if not found then raise exception 'ATLAS_REFERENCE_NOT_FOUND'; end if;
 select l.state,l.owner_id into lifecycle_state,lifecycle_owner from public.project_lifecycle l
   where l.project_id=p_project_id for share;
 if found and (lifecycle_state is distinct from 'active' or lifecycle_owner is distinct from p_owner_id)
 then raise exception 'ATLAS_REFERENCE_NOT_FOUND'; end if;
 perform 1 from public.conversations c where c.id=p_conversation_id
   and c.user_id=p_owner_id and c.project_id=p_project_id for update;
 if not found then raise exception 'ATLAS_REFERENCE_NOT_FOUND'; end if;

 for img in select value from jsonb_array_elements(p_images) loop
   if jsonb_typeof(img) is distinct from 'object' then raise exception 'ATLAS_REFERENCE_INVALID'; end if;
   if (select count(*) from jsonb_object_keys(img))<>4
      or not(img ?& array['ticketId','assetId','mimeType','sha256'])
      or jsonb_typeof(img->'ticketId')<>'string' or jsonb_typeof(img->'assetId')<>'string'
      or jsonb_typeof(img->'mimeType')<>'string' or jsonb_typeof(img->'sha256')<>'string'
      or (img->>'ticketId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or (img->>'assetId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or (img->>'sha256') !~ '^[0-9a-f]{64}$' or img->>'mimeType'<>'image/webp'
   then raise exception 'ATLAS_REFERENCE_INVALID'; end if;
 end loop;
 if (select count(distinct value->>'ticketId') from jsonb_array_elements(p_images))<>jsonb_array_length(p_images)
 then raise exception 'ATLAS_REFERENCE_INVALID'; end if;

 -- The strings below contain only validated UUIDs/hex, so this canonical JSON
 -- matches JSON.stringify in TypeScript without JSONB whitespace differences.
 select '['||string_agg(format('["%s","%s","%s"]',e.value->>'ticketId',e.value->>'assetId',e.value->>'sha256'),',' order by e.ordinality)||']'
 into canonical_refs from jsonb_array_elements(p_images) with ordinality e;
 text_sha:=encode(sha256(convert_to(p_message_text,'UTF8')),'hex');
 refs_sha:=encode(sha256(convert_to(canonical_refs,'UTF8')),'hex');

 select * into existing from public.website_build_reference_messages r
   where r.owner_id=p_owner_id and r.conversation_id=p_conversation_id and r.idempotency_key=p_idempotency_key;
 if found then
   if existing.project_id<>p_project_id or existing.message_sha256<>text_sha
      or existing.reference_sha256<>refs_sha or existing.images<>p_images
   then raise exception 'ATLAS_REFERENCE_CONFLICT'; end if;
   perform 1 from public.conversation_messages m where m.id=existing.message_id
     and m.conversation_id=p_conversation_id and m.role='user' and m.content=p_message_text for share;
   if not found then raise exception 'ATLAS_REFERENCE_CONFLICT'; end if;
 end if;

 -- Revalidate even on replay: an old receipt never restores revoked sources.
 for img in select value from jsonb_array_elements(p_images) loop
   select t.id into source_id from public.website_build_reference_tickets t
   join public.assets a on a.id=t.asset_id
   join public.asset_provenance ap on ap.asset_id=a.id
   where t.id=(img->>'ticketId')::uuid and t.owner_id=p_owner_id
     and t.project_id=p_project_id and t.conversation_id=p_conversation_id and t.state='ready'
     and a.id=(img->>'assetId')::uuid and a.project_id=p_project_id and a.visibility='internal'
     and a.kind='image' and a.status='active' and a.mime_type='image/webp'
     and a.byte_size between 1 and 10485760 and a.checksum_sha256=img->>'sha256'
     and a.storage_bucket='media-assets-private'
     and a.storage_path='website/references/'||p_project_id::text||'/'||p_conversation_id::text||'/'||t.id::text||'.webp'
     and ap.source='uploaded' and ap.provider_metadata->>'purpose'='atlas-website-reference'
     and ap.provider_metadata->>'ticketId'=t.id::text
   for share of t,a,ap;
   if not found then raise exception 'ATLAS_REFERENCE_NOT_FOUND'; end if;
 end loop;

 if existing.message_id is not null then
   message_id:=existing.message_id; binding_sha:=existing.binding_sha256;
 else
   message_id:=gen_random_uuid();
   binding_sha:=encode(sha256(convert_to(format('["omnira.website-reference-turn.v1","%s","%s","%s","%s","%s","%s"]',
     p_owner_id,p_project_id,p_conversation_id,message_id,text_sha,refs_sha),'UTF8')),'hex');
   insert into public.conversation_messages(id,conversation_id,role,content,tool_data)
     values(message_id,p_conversation_id,'user',p_message_text,null);
   insert into public.website_build_reference_messages
     (message_id,owner_id,project_id,conversation_id,idempotency_key,message_sha256,reference_sha256,binding_sha256,images)
     values(message_id,p_owner_id,p_project_id,p_conversation_id,p_idempotency_key,text_sha,refs_sha,binding_sha,p_images);
 end if;
 return jsonb_build_object('messageId',message_id,'projectId',p_project_id,'conversationId',p_conversation_id,
   'messageSha256',text_sha,'referenceSha256',refs_sha,'bindingSha256',binding_sha,'imageCount',jsonb_array_length(p_images));
end $$;
revoke all on function public.website_build_persist_reference_turn(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.website_build_persist_reference_turn(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
comment on function public.website_build_persist_reference_turn(uuid,uuid,uuid,uuid,text,jsonb) is
 'Server-only persistence. Owner must come from authentication. Not provider dispatch, budget approval or current-turn execution authority.';
commit;
