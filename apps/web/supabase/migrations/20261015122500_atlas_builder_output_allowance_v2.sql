-- Give the unchanged, factory-managed builder room for a complete multi-page package.
-- Monthly budgets, decisions, custom agent settings and provider retries are unchanged.
begin;
create or replace function public.website_build_studio_ensure(p_principal jsonb,p_input jsonb,p_preset jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; pid uuid; aid uuid; cid uuid; slug text; title text;
 key text:=p_input->>'idempotencyKey'; normalized jsonb:=p_input-'idempotencyKey'; old public.website_build_studio_intents;
 result jsonb; base jsonb; location jsonb; folder text;
begin
 uid:=public.website_build_studio_require_owner(p_principal);
 if p_input->>'kind'='new' and not exists(select 1 from public.projects where owner_id=uid and coalesce(p_principal->'allowedProjectIds' ? id::text,false)) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
 if key is null or key !~ '^[A-Za-z0-9_-]{1,100}$' or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 if p_input->>'kind'='existing' then
  pid:=(p_input->>'projectId')::uuid;
  perform public.website_build_studio_require_owner(p_principal,pid);
 elsif p_input->>'kind' is distinct from 'new' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('atlas-studio:'||uid::text||':'||key,0));
 select * into old from public.website_build_studio_intents where owner_id=uid and intent_key=key;
 if found then
  if old.input is distinct from normalized then raise exception 'STUDIO_KEY_CONFLICT' using errcode='23505'; end if;
  perform public.website_build_studio_require_active(old.project_id);
  if not exists(select 1 from public.projects where id=old.project_id and owner_id=uid) then raise exception 'WEBSITE_BUILD_NOT_FOUND' using errcode='P0002'; end if;
  return old.result;
 end if;
 if p_input->>'kind'='new' then
  title:=btrim(p_input->>'name');
  if title is null or length(title) not between 1 and 120 or not coalesce((p_preset->>'version'='atlas-web-builder-v1' and (p_preset->>'maxTokens')::integer=6000) or (p_preset->>'version'='atlas-web-builder-v2' and (p_preset->>'maxTokens')::integer=12000),false) or p_preset->>'model' is distinct from 'claude-sonnet-4-6' then raise exception 'INVALID_STUDIO_INPUT' using errcode='22023'; end if;
  pid:=gen_random_uuid(); aid:=gen_random_uuid(); slug:='webb-'||replace(pid::text,'-','');
  insert into public.projects(id,owner_id,name,slug) values(pid,uid,title,slug);
  insert into public.agents(id,project_id,name,model,system_prompt,config,skill_ids) values(aid,pid,'Webbbyggare (Atlas)',p_preset->>'model',p_preset->>'systemPrompt',jsonb_build_object('max_tokens',(p_preset->>'maxTokens')::integer,'atlas_builder_preset',p_preset-'systemPrompt'),array['design-taste-frontend','impeccable']);
  select default_root into base from public.website_build_operator_settings where owner_id=uid;
  if base is not null then
   folder:=slug;
   location:=base||jsonb_build_object('projectId',pid,'folderName',folder,'root',(base->>'root')||case when base->>'os'='windows' then chr(92) else '/' end||folder,'status','pending_runner');
  end if;
  insert into public.website_build_project_settings(project_id,builder_agent_id,location) values(pid,aid,location);
 else
  perform public.website_build_studio_require_active(pid);
  perform public.website_build_studio_require_owner(p_principal,pid);
  select name,projects.slug into title,slug from public.projects where id=pid and owner_id=uid;
 end if;
 cid:=gen_random_uuid();
 insert into public.conversations(id,user_id,project_id,title) values(cid,uid,pid,'Bygg med Atlas · '||title);
 result:=jsonb_build_object('projectId',pid,'projectSlug',slug,'conversationId',cid);
 insert into public.website_build_studio_intents(owner_id,project_id,conversation_id,intent_key,input,result) values(uid,pid,cid,key,normalized,result);
 return result;
end $$;

-- Upgrade only the exact v1 factory configuration/provenance. A customized cap,
-- prompt, skill list, model or config field is outside this migration.
update public.agents a
set config=jsonb_build_object('max_tokens',12000,'atlas_builder_preset',
  (a.config->'atlas_builder_preset')||'{"version":"atlas-web-builder-v2","maxTokens":12000}'::jsonb)
where a.name='Webbbyggare (Atlas)' and a.model='claude-sonnet-4-6'
 and a.system_prompt='Du är projektets webbbyggare i Atlas. Planera syfte, målgrupp, sidor och arkitektur med användaren. Bygg endast inom godkänd plan och verifierade verktygsrättigheter. Be om avgörande information som saknas och fortsätt självständigt med oberoende godkända uppgifter. Bevara befintliga projekt och deras struktur. Följ exakt det efterfrågade utdataformatet. Påstå aldrig att filer, dator, bildgenerering, betalningar eller publicering fungerar utan verkliga kvitton. Domäner kontrolleras först hos Strato. Stripe är förval endast när projektet behöver betalningar. En produktbild är underlag, inte verifierade produktfakta.'
 and a.skill_ids=array['design-taste-frontend','impeccable']::text[]
 and a.config='{"max_tokens":6000,"atlas_builder_preset":{"version":"atlas-web-builder-v1","model":"claude-sonnet-4-6","maxTokens":6000,"skillIds":["design-taste-frontend","impeccable"],"skills":[{"id":"design-taste-frontend","commit":"a60a36dc2bb3bb77ccf17f2f62041f5ca8a458b9","sha256":"fcf8ac6e5a55f3cc067e16e3d651670d59c4ab0980743051c3438f54141a031e"},{"id":"impeccable","commit":"2f98774f86bc05563876643db37e6c37c322850f","sha256":"3c5eae6363d8fbf062c0b146063b968d757d236671326b011a8adfad651ca578"}]}}'::jsonb
 and exists(select 1 from public.website_build_project_settings s where s.project_id=a.project_id and s.builder_agent_id=a.id);
commit;
