begin;
-- Deliberately empty: deployment provisions neither principals nor approvals.
create table public.handlarborsen_test_data_operator_grants(
 user_id uuid not null,project_id uuid not null references public.projects(id),
 operator_binding_id uuid not null unique,
 allow_inventory boolean not null default false,
 allowed_operations text[] not null default '{}' check(allowed_operations <@ array['quarantine','restore']::text[] and cardinality(allowed_operations)<=2),
 expires_at timestamptz not null,revoked_at timestamptz,
 primary key(user_id,project_id),
 check(project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3')
);
create table public.handlarborsen_test_data_reviews(
 package_id uuid primary key,review_ref uuid not null unique default gen_random_uuid(),
 user_id uuid not null,project_id uuid not null references public.projects(id),
 -- Immutable audit identity; live ownership is checked by every authority RPC.
 conversation_id uuid not null,
 operator_binding_id uuid not null,operation text not null check(operation in('quarantine','restore')),
 package_view jsonb not null,package_fingerprint text not null check(package_fingerprint ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,state text not null default 'pending' check(state in('pending','approved','rejected')),decided_at timestamptz,
 check(project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'),
 check((state='pending')=(decided_at is null))
);
create table public.handlarborsen_test_data_executions(
 execution_id uuid primary key default gen_random_uuid(),package_id uuid not null unique references public.handlarborsen_test_data_reviews(package_id),
 idempotency_key uuid not null unique default gen_random_uuid(),
 state text not null default 'pending' check(state in('pending','dispatching','unknown','applied','needs_new_review','not_applied')),
 claim_token uuid unique,claimed_at timestamptz,receipt jsonb,
 rejection_status text check(rejection_status in('needs_new_review','denied','disabled')),
 check((state='not_applied')=(rejection_status is not null)),
 check((state='pending')=(claim_token is null)),check((claim_token is null)=(claimed_at is null)),
 check((state in('applied','needs_new_review'))=(receipt is not null))
);
alter table public.handlarborsen_test_data_operator_grants enable row level security;
alter table public.handlarborsen_test_data_operator_grants force row level security;
alter table public.handlarborsen_test_data_reviews enable row level security;
alter table public.handlarborsen_test_data_reviews force row level security;
alter table public.handlarborsen_test_data_executions enable row level security;
alter table public.handlarborsen_test_data_executions force row level security;
revoke all on public.handlarborsen_test_data_operator_grants,public.handlarborsen_test_data_reviews,public.handlarborsen_test_data_executions from public,anon,authenticated,service_role;

create function public.handlarborsen_test_data_immutable() returns trigger language plpgsql set search_path='' as $fn$
begin
 if tg_op in('DELETE','TRUNCATE') then raise exception using errcode='42501',message='test_data_immutable';end if;
 if (to_jsonb(new)-array['state','decided_at']) is distinct from (to_jsonb(old)-array['state','decided_at'])
 or old.state<>'pending' or new.state not in('approved','rejected') or new.decided_at is null
 then raise exception using errcode='42501',message='test_data_immutable';end if;
 return new;
end $fn$;
revoke all on function public.handlarborsen_test_data_immutable() from public,anon,authenticated,service_role;
create trigger test_data_review_immutable before update or delete on public.handlarborsen_test_data_reviews for each row execute function public.handlarborsen_test_data_immutable();
create trigger test_data_review_no_truncate before truncate on public.handlarborsen_test_data_reviews for each statement execute function public.handlarborsen_test_data_immutable();

create function public.handlarborsen_resolve_test_data_operator(p_user_id uuid,p_project_id uuid,p_conversation_id uuid,p_operation text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare g public.handlarborsen_test_data_operator_grants%rowtype;m text;
begin
 if p_project_id is distinct from '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
 or (p_operation is not null and p_operation not in('quarantine','restore'))
 then raise exception using errcode='42501',message='test_data_forbidden';end if;
 select atlas_mode into m from public.projects where id=p_project_id and owner_id=p_user_id and slug='handlarborsen' for share;
 if not found or m not in('observer','active') then raise exception using errcode='42501',message='test_data_forbidden';end if;
 perform 1 from public.conversations where id=p_conversation_id and user_id=p_user_id and (project_id is null or project_id=p_project_id) for share;
 if not found then raise exception using errcode='42501',message='test_data_forbidden';end if;
 select * into g from public.handlarborsen_test_data_operator_grants where user_id=p_user_id and project_id=p_project_id for share;
 if not found or not g.allow_inventory or g.revoked_at is not null or g.expires_at<=clock_timestamp()
 or (p_operation is not null and not p_operation=any(g.allowed_operations))
 then raise exception using errcode='42501',message='test_data_forbidden';end if;
 return jsonb_build_object('userId',p_user_id,'projectId',p_project_id,'conversationId',p_conversation_id,'operatorBindingId',g.operator_binding_id,'allowedOperations',g.allowed_operations,'atlasMode',m);
end $fn$;

create function public.handlarborsen_test_data_claim(p_user_id uuid,p_project_id uuid,p_conversation_id uuid,p_package_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.handlarborsen_test_data_reviews%rowtype;e public.handlarborsen_test_data_executions%rowtype;a jsonb;dispatch boolean:=false;
begin
 a:=public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,null);
 select * into r from public.handlarborsen_test_data_reviews where package_id=p_package_id and user_id=p_user_id and project_id=p_project_id and conversation_id=p_conversation_id for update;
 if not found or r.state<>'approved' or r.operator_binding_id::text<>a->>'operatorBindingId' then return null;end if;
 select * into e from public.handlarborsen_test_data_executions where package_id=p_package_id for update;
 if not found then return null;end if;
 if e.state='pending' then
  perform public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,r.operation);
  if r.expires_at<=clock_timestamp() or p_claim_token is null then return null;end if;
  update public.handlarborsen_test_data_executions set state='dispatching',claim_token=p_claim_token,claimed_at=clock_timestamp() where execution_id=e.execution_id returning * into e;
  dispatch:=true;
 end if;
 return jsonb_build_object('packageId',r.package_id,'approvalRef',r.review_ref,'executionId',e.execution_id,'idempotencyKey',e.idempotency_key,'packageView',r.package_view,'state',e.state,'dispatch',dispatch,'receipt',e.receipt)
 || case when e.rejection_status is not null then jsonb_build_object('rejectionStatus',e.rejection_status) else '{}'::jsonb end;
end $fn$;

-- A held one-use claim may acknowledge after revocation. A read-only reconciliation
-- must independently retain read authority. Neither path can start another mutation.
create function public.handlarborsen_test_data_finish(p_package_id uuid,p_execution_id uuid,p_user_id uuid,p_conversation_id uuid,p_claim_token uuid,p_receipt jsonb)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare r public.handlarborsen_test_data_reviews%rowtype;e public.handlarborsen_test_data_executions%rowtype;
begin
 select * into r from public.handlarborsen_test_data_reviews where package_id=p_package_id and user_id=p_user_id and conversation_id=p_conversation_id for update;
 if not found or r.state<>'approved' then return false;end if;
 select * into e from public.handlarborsen_test_data_executions where execution_id=p_execution_id and package_id=p_package_id for update;
 if not found or e.state='pending' then return false;end if;
 if p_claim_token is null then
  perform public.handlarborsen_resolve_test_data_operator(p_user_id,r.project_id,p_conversation_id,null);
 else
  if p_claim_token is distinct from e.claim_token then return false;end if;
 end if;
 if e.receipt is not null then return p_receipt=e.receipt;end if;
 if p_receipt is null then
  if p_claim_token is null then return false;end if;
  update public.handlarborsen_test_data_executions set state='unknown' where execution_id=e.execution_id;
  return true;
 end if;
 if jsonb_typeof(p_receipt)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(p_receipt) k) is distinct from array['afterSha256','beforeSha256','committedAt','counts','executionId','operation','outcome','packageId']::text[]
 or p_receipt->>'packageId' is distinct from p_package_id::text or p_receipt->>'executionId' is distinct from p_execution_id::text
 or p_receipt->>'operation' is distinct from r.operation or p_receipt->>'outcome' not in('applied','needs_new_review')
 or p_receipt->>'beforeSha256' !~ '^[a-f0-9]{64}$' or p_receipt->>'afterSha256' !~ '^[a-f0-9]{64}$'
 or p_receipt->'counts' is distinct from r.package_view->'counts'
 or ((p_receipt->>'outcome'='applied') is distinct from (p_receipt->>'committedAt' is not null))
 then return false;end if;
 update public.handlarborsen_test_data_executions set state=p_receipt->>'outcome',receipt=p_receipt where execution_id=e.execution_id;
 return true;
end $fn$;

revoke all on function public.handlarborsen_resolve_test_data_operator(uuid,uuid,uuid,text),public.handlarborsen_test_data_claim(uuid,uuid,uuid,uuid,uuid),public.handlarborsen_test_data_finish(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.handlarborsen_resolve_test_data_operator(uuid,uuid,uuid,text),public.handlarborsen_test_data_claim(uuid,uuid,uuid,uuid,uuid),public.handlarborsen_test_data_finish(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
commit;
