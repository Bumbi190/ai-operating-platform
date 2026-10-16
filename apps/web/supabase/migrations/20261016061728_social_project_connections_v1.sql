-- Operator consent and exact destination choice. No publisher or paid dispatch.
alter table public.social_account_bindings
 drop constraint social_account_bindings_platform_valid,
 add constraint social_account_bindings_platform_valid check(platform in ('instagram','facebook','youtube','linkedin','pinterest','x')),
 drop constraint social_account_bindings_credential_source_matches_platform,
 add constraint social_account_bindings_credential_source_matches_platform check(credential_source='project_store' or platform='youtube' and credential_source='platform_env_transitional');
alter table public.platform_tokens
 drop constraint platform_tokens_platform_valid,
 add constraint platform_tokens_platform_valid check(platform in ('instagram','facebook','youtube','linkedin','pinterest','x')),
 drop constraint platform_tokens_token_type_matches_platform,
 add constraint platform_tokens_token_type_matches_platform check(platform='instagram' and token_type='user' or platform='facebook' and token_type='page' or platform='youtube' and token_type='oauth_refresh' or platform in ('linkedin','pinterest','x') and token_type='oauth_user'),
 add column binding_id uuid references public.social_account_bindings(binding_id) on delete restrict,
 add column refresh_token text,
 add column granted_scopes text[] not null default '{}',
 add column refresh_expires_at timestamptz,
 add column destination_id text,
 add column destination_label text,
 add constraint platform_tokens_new_oauth_complete check(platform not in ('linkedin','pinterest','x') or binding_id is not null and account_id is not null and expires_at is not null and cardinality(granted_scopes)>0),
 add constraint platform_tokens_destination_shape check((destination_id is null or destination_id ~ '^[A-Za-z0-9_-]{1,64}$') and (destination_label is null or char_length(destination_label) between 1 and 200 and destination_label !~ '[[:cntrl:]]')),
 add constraint platform_tokens_refresh_bounded check(refresh_token is null or octet_length(refresh_token) between 1 and 16384);
alter table public.social_credential_health
 drop constraint social_credential_health_platform_valid,
 add constraint social_credential_health_platform_valid check(platform in ('instagram','facebook','youtube','linkedin','pinterest','x'));
alter table public.platform_credential_events
 drop constraint platform_credential_events_platform_valid,
 add constraint platform_credential_events_platform_valid check(platform in ('instagram','facebook','youtube','linkedin','pinterest','x')),
 drop constraint platform_credential_events_credential_type_matches_platform,
 add constraint platform_credential_events_credential_type_matches_platform check(platform='instagram' and credential_type='user' or platform='facebook' and credential_type='page' or platform='youtube' and credential_type='oauth_refresh' or platform in ('linkedin','pinterest','x') and credential_type='oauth_user'),
 drop constraint platform_credential_events_oauth_stages_are_youtube,
 add constraint platform_credential_events_oauth_stages_are_youtube check(platform in ('youtube','linkedin','pinterest','x') or coalesce(detail->>'failure_stage','') not in ('authorization_denied','code_exchange','scope_missing','refresh_token_missing','account_ambiguous'));

create table public.social_connection_intents(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 provider text not null check(provider in ('linkedin','pinterest','x')),
 operator_id uuid not null references auth.users(id) on delete restrict,
 plan_revision_id uuid not null,
 expected_binding_id uuid references public.social_account_bindings(binding_id) on delete restrict,
 state_hash text not null unique check(state_hash ~ '^[a-f0-9]{64}$'),
 code_verifier text check(code_verifier is null or code_verifier ~ '^[A-Za-z0-9_-]{43,128}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 consumed_at timestamptz,
 access_token text check(access_token is null or octet_length(access_token) between 1 and 16384),
 refresh_token text check(refresh_token is null or octet_length(refresh_token) between 1 and 16384),
 granted_scopes text[] not null default '{}',
 credential_expires_at timestamptz,
 refresh_expires_at timestamptz,
 candidates jsonb not null default '[]' check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)<=100),
 committed_binding_id uuid references public.social_account_bindings(binding_id) on delete restrict,
 selected_key text,
 foreign key(project_id,plan_revision_id) references public.social_launch_plan_revisions(project_id,id) on delete restrict,
 check(expires_at>created_at and expires_at<=created_at+interval '10 minutes'),
 check(consumed_at is null or code_verifier is null),
 check(committed_binding_id is null or access_token is null and refresh_token is null and code_verifier is null)
);
alter table public.social_connection_intents enable row level security;
revoke all on public.social_connection_intents from public,anon,authenticated,service_role;
grant select,insert,update on public.social_connection_intents to service_role;

create function public.social_connection_guard() returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if tg_op='DELETE' or tg_op='TRUNCATE' then raise exception 'SOCIAL_CONNECTION_IMMUTABLE' using errcode='42501'; end if;
 if row(new.id,new.project_id,new.provider,new.operator_id,new.plan_revision_id,new.expected_binding_id,new.state_hash,new.created_at)
  is distinct from row(old.id,old.project_id,old.provider,old.operator_id,old.plan_revision_id,old.expected_binding_id,old.state_hash,old.created_at)
  or new.expires_at>old.expires_at or old.consumed_at is not null and new.consumed_at is distinct from old.consumed_at
  or old.committed_binding_id is not null
 then raise exception 'SOCIAL_CONNECTION_IMMUTABLE' using errcode='42501'; end if;
 return new;
end $fn$;
create trigger social_connection_guard_update before update or delete on public.social_connection_intents for each row execute function public.social_connection_guard();
create trigger social_connection_no_truncate before truncate on public.social_connection_intents for each statement execute function public.social_connection_guard();

create function public.social_connection_owner(p_principal jsonb,p_project uuid) returns void language plpgsql security invoker set search_path='' as $fn$
begin
 if jsonb_typeof(p_principal->'allowedProjectIds') is distinct from 'array'
  or not coalesce((p_principal->'allowedProjectIds') ? p_project::text,false)
  or not exists(select 1 from public.projects where id=p_project and owner_id=(p_principal->>'userId')::uuid)
 then raise exception 'SOCIAL_CONNECTION_NOT_FOUND' using errcode='P0002'; end if;
end $fn$;
create function public.social_connection_fence(p_principal jsonb,p_project uuid,p_provider text,p_plan uuid,p_binding uuid) returns void language plpgsql security invoker set search_path='' as $fn$
declare current_binding uuid;
begin
 perform public.social_connection_owner(p_principal,p_project);
 if not exists(select 1 from public.social_launch_plans p join public.social_launch_plan_revisions r on r.project_id=p.project_id and r.id=p.current_revision_id
  join public.social_launch_plan_decisions d on d.project_id=r.project_id and d.revision_id=r.id and d.sha256=r.sha256 and d.decision='approve'
  where p.project_id=p_project and r.id=p_plan and exists(select 1 from jsonb_array_elements(r.choices) c where c->>'channel'=p_provider))
 then raise exception 'SOCIAL_CONNECTION_PLAN_REVIEW_REQUIRED'; end if;
 select binding_id into current_binding from public.social_account_bindings where project_id=p_project and platform=p_provider and superseded_at is null for update;
 if current_binding is distinct from p_binding then raise exception 'SOCIAL_CONNECTION_BINDING_CHANGED'; end if;
end $fn$;

create function public.social_connection_begin(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare project uuid=(p_input->>'projectId')::uuid;intent uuid;provider text=p_input->>'provider';
begin
 perform public.social_connection_owner(p_principal,project);
 if provider='x' then raise exception 'SOCIAL_CONNECTION_COST_POLICY_REQUIRED'; end if;
 if coalesce(provider,'') not in ('linkedin','pinterest')
  or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('projectId','provider','planRevisionId','expectedBindingId','stateHash','verifier'))
  or not(p_input ? 'expectedBindingId') or coalesce(p_input->>'stateHash','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'verifier','') !~ '^[A-Za-z0-9_-]{43,128}$'
 then raise exception 'SOCIAL_CONNECTION_INVALID_BODY'; end if;
 perform 1 from public.projects where id=project for update;
 perform public.social_connection_fence(p_principal,project,provider,(p_input->>'planRevisionId')::uuid,(p_input->>'expectedBindingId')::uuid);
 -- Clear expired transient grants for this owner/project before another attempt.
 update public.social_connection_intents set access_token=null,refresh_token=null,code_verifier=null,candidates='[]'
  where project_id=project and operator_id=(p_principal->>'userId')::uuid and committed_binding_id is null and expires_at<=now();
 insert into public.social_connection_intents(project_id,provider,operator_id,plan_revision_id,expected_binding_id,state_hash,code_verifier)
 values(project,provider,(p_principal->>'userId')::uuid,(p_input->>'planRevisionId')::uuid,(p_input->>'expectedBindingId')::uuid,p_input->>'stateHash',p_input->>'verifier') returning id into intent;
 insert into public.platform_credential_events(operation_id,project_id,platform,credential_type,actor,outcome,event_version)
 values(intent,project,provider,'oauth_user','user:'||(p_principal->>'userId'),'attempted',2);
 return jsonb_build_object('intentId',intent);
end $fn$;

create function public.social_connection_consume(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_connection_intents;verifier text;
begin
 select * into r from public.social_connection_intents where state_hash=p_input->>'stateHash' and provider=p_input->>'provider' and operator_id=(p_principal->>'userId')::uuid;
 if r.id is null then raise exception 'SOCIAL_CONNECTION_NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.projects where id=r.project_id for update;
 perform public.social_connection_fence(p_principal,r.project_id,r.provider,r.plan_revision_id,r.expected_binding_id);
 select * into r from public.social_connection_intents where id=r.id for update;
 if r.provider='x' then raise exception 'SOCIAL_CONNECTION_COST_POLICY_REQUIRED'; end if;
 if r.expires_at<=now() or r.consumed_at is not null then raise exception 'SOCIAL_CONNECTION_EXPIRED'; end if;
 verifier=r.code_verifier;
 update public.social_connection_intents set consumed_at=now(),code_verifier=null where id=r.id;
 return jsonb_build_object('intentId',r.id,'projectId',r.project_id,'provider',r.provider,'planRevisionId',r.plan_revision_id,'expectedBindingId',r.expected_binding_id,'verifier',verifier);
end $fn$;

create function public.social_connection_read(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_connection_intents;
begin
 perform public.social_connection_owner(p_principal,(p_input->>'projectId')::uuid);
 select * into r from public.social_connection_intents where id=(p_input->>'intentId')::uuid and project_id=(p_input->>'projectId')::uuid and operator_id=(p_principal->>'userId')::uuid;
 if r.id is null then raise exception 'SOCIAL_CONNECTION_NOT_FOUND' using errcode='P0002'; end if;
 if r.committed_binding_id is null and r.expires_at<=now() then raise exception 'SOCIAL_CONNECTION_EXPIRED'; end if;
 if r.committed_binding_id is null and r.access_token is null then raise exception 'SOCIAL_CONNECTION_UNAVAILABLE'; end if;
 return jsonb_build_object('intentId',r.id,'projectId',r.project_id,'provider',r.provider,'status',case when r.committed_binding_id is null then 'awaiting_selection' else 'connected' end,
  'candidates',r.candidates,'bindingId',r.committed_binding_id,'selectedKey',r.selected_key,'expiresAt',r.expires_at);
end $fn$;

create function public.social_connection_stage(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_connection_intents;grant_data jsonb=p_input->'grant';item jsonb;seen text[]='{}';required text[];
begin
 select * into r from public.social_connection_intents where id=(p_input->>'intentId')::uuid and operator_id=(p_principal->>'userId')::uuid;
 if r.id is null then raise exception 'SOCIAL_CONNECTION_NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.projects where id=r.project_id for update;
 perform public.social_connection_fence(p_principal,r.project_id,r.provider,r.plan_revision_id,r.expected_binding_id);
 select * into r from public.social_connection_intents where id=r.id for update;
 if r.provider='x' then raise exception 'SOCIAL_CONNECTION_COST_POLICY_REQUIRED'; end if;
 if r.expires_at<=now() or r.consumed_at is null or r.committed_binding_id is not null then raise exception 'SOCIAL_CONNECTION_EXPIRED'; end if;
 required=case when r.provider='linkedin' then array['r_organization_admin','w_organization_social'] else array['user_accounts:read','boards:read','pins:read','pins:write'] end;
 if jsonb_typeof(grant_data) is distinct from 'object' or jsonb_typeof(grant_data->'scopes') is distinct from 'array' or not(grant_data->'scopes' ?& required)
  or jsonb_typeof(grant_data->'candidates') is distinct from 'array' or jsonb_array_length(grant_data->'candidates') not between 1 and 100
  or jsonb_typeof(grant_data->'accessToken') is distinct from 'string' or octet_length(grant_data->>'accessToken') not between 1 and 16384
  or (grant_data->>'expiresAt')::timestamptz<=now()
 then raise exception 'SOCIAL_CONNECTION_INVALID_BODY'; end if;
 for item in select value from jsonb_array_elements(grant_data->'candidates') loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'key','') !~ '^[A-Za-z0-9_-]{1,64}$' or item->>'key'=any(seen)
   or coalesce(item->>'accountId','') !~ '^[A-Za-z0-9_-]{1,64}$' or char_length(coalesce(item->>'accountLabel','')) not between 1 and 200 or item->>'accountLabel' ~ '[[:cntrl:]]'
   or r.provider='linkedin' and (item->>'key' is distinct from item->>'accountId' or item->>'destinationId' is not null)
   or r.provider='pinterest' and (item->>'key' is distinct from item->>'destinationId' or char_length(coalesce(item->>'destinationLabel','')) not between 1 and 200)
  then raise exception 'SOCIAL_CONNECTION_INVALID_BODY'; end if;
  seen=array_append(seen,item->>'key');
 end loop;
 if r.access_token is not null then
  if r.access_token is distinct from grant_data->>'accessToken' or r.candidates is distinct from grant_data->'candidates' then raise exception 'SOCIAL_CONNECTION_CONFLICT'; end if;
 else
  update public.social_connection_intents set access_token=grant_data->>'accessToken',refresh_token=grant_data->>'refreshToken',
   granted_scopes=array(select jsonb_array_elements_text(grant_data->'scopes')),credential_expires_at=(grant_data->>'expiresAt')::timestamptz,
   refresh_expires_at=(grant_data->>'refreshExpiresAt')::timestamptz,candidates=grant_data->'candidates' where id=r.id;
 end if;
 return public.social_connection_read(p_principal,jsonb_build_object('projectId',r.project_id,'intentId',r.id));
end $fn$;

create function public.social_connection_commit(p_principal jsonb,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.social_connection_intents;candidate jsonb;new_binding uuid;action text;
begin
 perform public.social_connection_owner(p_principal,(p_input->>'projectId')::uuid);
 select * into r from public.social_connection_intents where id=(p_input->>'intentId')::uuid and project_id=(p_input->>'projectId')::uuid and operator_id=(p_principal->>'userId')::uuid;
 if r.id is null then raise exception 'SOCIAL_CONNECTION_NOT_FOUND' using errcode='P0002'; end if;
 perform 1 from public.projects where id=r.project_id for update;
 perform public.social_connection_owner(p_principal,r.project_id);
 select * into r from public.social_connection_intents where id=r.id for update;
 if r.committed_binding_id is not null then
  if r.selected_key is distinct from p_input->>'candidateKey' then raise exception 'SOCIAL_CONNECTION_CONFLICT'; end if;
  return public.social_connection_read(p_principal,p_input);
 end if;
 if r.provider='x' then raise exception 'SOCIAL_CONNECTION_COST_POLICY_REQUIRED'; end if;
 if r.expires_at<=now() or r.access_token is null or r.credential_expires_at<=now() then raise exception 'SOCIAL_CONNECTION_EXPIRED'; end if;
 select value into candidate from jsonb_array_elements(r.candidates) where value->>'key'=p_input->>'candidateKey';
 if candidate is null then raise exception 'SOCIAL_CONNECTION_INVALID_BODY'; end if;
 perform public.social_connection_fence(p_principal,r.project_id,r.provider,r.plan_revision_id,r.expected_binding_id);
 if r.expected_binding_id is null then
  insert into public.social_account_bindings(project_id,platform,external_account_id,account_label,credential_source,verification,verified_at,bound_by)
  values(r.project_id,r.provider,candidate->>'accountId',candidate->>'accountLabel','project_store','provider_attested',now(),'user:'||r.operator_id::text) returning binding_id into new_binding;
  action='created';
 else
  new_binding=public.social_account_rebind(p_project_id=>r.project_id,p_platform=>r.provider,p_expected_binding_id=>r.expected_binding_id,p_external_account_id=>candidate->>'accountId',p_account_label=>candidate->>'accountLabel',p_bound_by=>'user:'||r.operator_id::text);
  action='rebound';
 end if;
 insert into public.platform_tokens(project_id,platform,token_type,access_token,account_id,expires_at,refreshed_at,binding_id,refresh_token,granted_scopes,refresh_expires_at,destination_id,destination_label)
 values(r.project_id,r.provider,'oauth_user',r.access_token,candidate->>'accountId',r.credential_expires_at,now(),new_binding,r.refresh_token,r.granted_scopes,r.refresh_expires_at,candidate->>'destinationId',candidate->>'destinationLabel')
 on conflict(project_id,platform,token_type) do update set access_token=excluded.access_token,account_id=excluded.account_id,expires_at=excluded.expires_at,refreshed_at=excluded.refreshed_at,binding_id=excluded.binding_id,refresh_token=excluded.refresh_token,granted_scopes=excluded.granted_scopes,refresh_expires_at=excluded.refresh_expires_at,destination_id=excluded.destination_id,destination_label=excluded.destination_label;
 insert into public.platform_credential_events(operation_id,project_id,platform,credential_type,actor,outcome,event_version,external_account_id,binding_action)
 values(r.id,r.project_id,r.provider,'oauth_user','user:'||r.operator_id::text,'replaced',2,candidate->>'accountId',action);
 insert into public.social_credential_health(project_id,platform,binding_id,status,identity_verified,verified_account_id,checked_at,expires_at,days_left,last_refreshed_at)
 values(r.project_id,r.provider,new_binding,'ok',true,candidate->>'accountId',now(),r.credential_expires_at,floor(extract(epoch from r.credential_expires_at-now())/86400)::integer,now())
 on conflict(project_id,platform) do update set binding_id=excluded.binding_id,status=excluded.status,identity_verified=excluded.identity_verified,verified_account_id=excluded.verified_account_id,checked_at=excluded.checked_at,expires_at=excluded.expires_at,days_left=excluded.days_left,last_refreshed_at=excluded.last_refreshed_at,last_warned_threshold=null;
 update public.social_connection_intents set committed_binding_id=new_binding,selected_key=p_input->>'candidateKey',access_token=null,refresh_token=null,code_verifier=null where id=r.id;
 return public.social_connection_read(p_principal,p_input);
end $fn$;
revoke all on function public.social_connection_guard(),public.social_connection_owner(jsonb,uuid),public.social_connection_fence(jsonb,uuid,text,uuid,uuid),public.social_connection_begin(jsonb,jsonb),public.social_connection_consume(jsonb,jsonb),public.social_connection_read(jsonb,jsonb),public.social_connection_stage(jsonb,jsonb),public.social_connection_commit(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.social_connection_guard(),public.social_connection_owner(jsonb,uuid),public.social_connection_fence(jsonb,uuid,text,uuid,uuid),public.social_connection_begin(jsonb,jsonb),public.social_connection_consume(jsonb,jsonb),public.social_connection_read(jsonb,jsonb),public.social_connection_stage(jsonb,jsonb),public.social_connection_commit(jsonb,jsonb) to service_role;
comment on table public.social_connection_intents is 'Server-only operator/project/approved-plan/binding-fenced OAuth state and transient grant. Safe candidate view only; no publication authority.';
