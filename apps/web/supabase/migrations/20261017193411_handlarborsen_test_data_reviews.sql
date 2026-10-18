begin;
create function public.handlarborsen_test_data_review_view(p_package_id uuid) returns jsonb
language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object('packageView',r.package_view,'reviewRef',r.review_ref,'decisionState',r.state,'executionId',e.execution_id,'receipt',e.receipt)
 || case when e.rejection_status is not null then jsonb_build_object('rejectionStatus',e.rejection_status)
 when e.state='pending' and r.expires_at<=clock_timestamp() then jsonb_build_object('rejectionStatus','needs_new_review') else '{}'::jsonb end
 from public.handlarborsen_test_data_reviews r left join public.handlarborsen_test_data_executions e using(package_id) where r.package_id=p_package_id
$fn$;
revoke all on function public.handlarborsen_test_data_review_view(uuid) from public,anon,authenticated,service_role;

create function public.handlarborsen_test_data_save_review(p_user_id uuid,p_project_id uuid,p_conversation_id uuid,p_package_view jsonb,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a jsonb;r public.handlarborsen_test_data_reviews%rowtype;expiry timestamptz;v_package uuid;
begin
 a:=public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,p_package_view->>'operation');
 if p_package_view->>'operation' is null or p_package_view->>'status' is distinct from 'prepared'
 or (select array_agg(k order by k) from jsonb_object_keys(p_package_view) k) is distinct from array['blockers','classificationRevision','conversationId','counts','expiresAt','graphSha256','operation','operatorBindingId','organisationIds','packageId','projectId','status']::text[]
 or p_package_view->>'projectId' is distinct from p_project_id::text or p_package_view->>'conversationId' is distinct from p_conversation_id::text
 or p_package_view->>'operatorBindingId' is distinct from a->>'operatorBindingId'
 or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p_package_view->'organisationIds') is distinct from 'array' or jsonb_array_length(p_package_view->'organisationIds') not between 1 and 25
 or p_package_view->'blockers' is distinct from '[]'::jsonb
 or p_package_view->'organisationIds' ?| array['23b45965-71f8-4e95-a4eb-32872234664d','d679116a-fc8f-4f80-85c5-1dbecfff8257']
 then return null;end if;
 v_package:=(p_package_view->>'packageId')::uuid;expiry:=(p_package_view->>'expiresAt')::timestamptz;
 if v_package is null or expiry is null or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '10 minutes' then return null;end if;
 insert into public.handlarborsen_test_data_reviews(package_id,user_id,project_id,conversation_id,operator_binding_id,operation,package_view,package_fingerprint,expires_at)
 values(v_package,p_user_id,p_project_id,p_conversation_id,(a->>'operatorBindingId')::uuid,p_package_view->>'operation',p_package_view,p_fingerprint,expiry) on conflict do nothing;
 select * into r from public.handlarborsen_test_data_reviews where handlarborsen_test_data_reviews.package_id=v_package for update;
 if not found or r.user_id<>p_user_id or r.project_id<>p_project_id or r.conversation_id<>p_conversation_id or r.package_view<>p_package_view or r.package_fingerprint<>p_fingerprint then return null;end if;
 return public.handlarborsen_test_data_review_view(v_package);
end $fn$;

create function public.handlarborsen_test_data_read_review(p_user_id uuid,p_project_id uuid,p_conversation_id uuid,p_package_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a jsonb;
begin
 a:=public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,null);
 perform 1 from public.handlarborsen_test_data_reviews where package_id=p_package_id and user_id=p_user_id and project_id=p_project_id and conversation_id=p_conversation_id and operator_binding_id::text=a->>'operatorBindingId';
 if not found then return null;end if;
 return public.handlarborsen_test_data_review_view(p_package_id);
end $fn$;

create function public.handlarborsen_test_data_decide_review(p_user_id uuid,p_project_id uuid,p_conversation_id uuid,p_package_id uuid,p_review_ref uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a jsonb;r public.handlarborsen_test_data_reviews%rowtype;
begin
 if p_decision is null or p_decision not in('approve','reject') then return null;end if;
 a:=public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,null);
 select * into r from public.handlarborsen_test_data_reviews where package_id=p_package_id and review_ref=p_review_ref and user_id=p_user_id and project_id=p_project_id and conversation_id=p_conversation_id for update;
 if not found or r.operator_binding_id::text<>a->>'operatorBindingId' then return null;end if;
 perform public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,r.operation);
 if r.state='pending' then
  if r.expires_at<=clock_timestamp() then return null;end if;
  update public.handlarborsen_test_data_reviews set state=case p_decision when 'approve' then 'approved' else 'rejected' end,decided_at=clock_timestamp() where package_id=p_package_id;
  if p_decision='approve' then insert into public.handlarborsen_test_data_executions(package_id) values(p_package_id);end if;
 elsif (r.state='approved') is distinct from (p_decision='approve') then return null;
 end if;
 return public.handlarborsen_test_data_review_view(p_package_id);
end $fn$;

create function public.handlarborsen_test_data_read_job(p_user_id uuid,p_project_id uuid,p_conversation_id uuid,p_package_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a jsonb;r public.handlarborsen_test_data_reviews%rowtype;e public.handlarborsen_test_data_executions%rowtype;
begin
 a:=public.handlarborsen_resolve_test_data_operator(p_user_id,p_project_id,p_conversation_id,null);
 select * into r from public.handlarborsen_test_data_reviews where package_id=p_package_id and user_id=p_user_id and project_id=p_project_id and conversation_id=p_conversation_id;
 if not found or r.state<>'approved' or r.operator_binding_id::text<>a->>'operatorBindingId' then return null;end if;
 select * into e from public.handlarborsen_test_data_executions where package_id=p_package_id;
 if not found then return null;end if;
 return jsonb_build_object('packageId',r.package_id,'approvalRef',r.review_ref,'executionId',e.execution_id,'idempotencyKey',e.idempotency_key,'packageView',r.package_view,'state',e.state,'dispatch',false,'receipt',e.receipt)
 || case when e.rejection_status is not null then jsonb_build_object('rejectionStatus',e.rejection_status) else '{}'::jsonb end;
end $fn$;
revoke all on function public.handlarborsen_test_data_save_review(uuid,uuid,uuid,jsonb,text),public.handlarborsen_test_data_read_review(uuid,uuid,uuid,uuid),public.handlarborsen_test_data_decide_review(uuid,uuid,uuid,uuid,uuid,text),public.handlarborsen_test_data_read_job(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.handlarborsen_test_data_save_review(uuid,uuid,uuid,jsonb,text),public.handlarborsen_test_data_read_review(uuid,uuid,uuid,uuid),public.handlarborsen_test_data_decide_review(uuid,uuid,uuid,uuid,uuid,text),public.handlarborsen_test_data_read_job(uuid,uuid,uuid,uuid) to service_role;
create or replace function public.handlarborsen_test_data_finish(p_package_id uuid,p_execution_id uuid,p_user_id uuid,p_conversation_id uuid,p_claim_token uuid,p_receipt jsonb)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare r public.handlarborsen_test_data_reviews%rowtype;e public.handlarborsen_test_data_executions%rowtype;
begin
 select * into r from public.handlarborsen_test_data_reviews where package_id=p_package_id and user_id=p_user_id and conversation_id=p_conversation_id for update;
 if not found or r.state<>'approved' then return false;end if;
 select * into e from public.handlarborsen_test_data_executions where execution_id=p_execution_id and package_id=p_package_id for update;
 if not found or e.state in('pending','not_applied') then return false;end if;
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
 if jsonb_typeof(p_receipt->'beforeSha256') is distinct from 'string' or jsonb_typeof(p_receipt->'afterSha256') is distinct from 'string'
 or (p_receipt->>'outcome'='applied' and (jsonb_typeof(p_receipt->'committedAt') is distinct from 'string' or p_receipt->>'committedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$'))
 or jsonb_typeof(p_receipt)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(p_receipt) k) is distinct from array['afterSha256','beforeSha256','committedAt','counts','executionId','operation','outcome','packageId']::text[]
 or p_receipt->>'packageId' is distinct from p_package_id::text or p_receipt->>'executionId' is distinct from p_execution_id::text
 or p_receipt->>'operation' is distinct from r.operation or p_receipt->>'outcome' not in('applied','needs_new_review')
 or p_receipt->>'beforeSha256' !~ '^[a-f0-9]{64}$' or p_receipt->>'afterSha256' !~ '^[a-f0-9]{64}$'
 or p_receipt->'counts' is distinct from r.package_view->'counts'
 or ((p_receipt->>'outcome'='applied') is distinct from (p_receipt->>'committedAt' is not null))
 then return false;end if;
 update public.handlarborsen_test_data_executions set state=p_receipt->>'outcome',receipt=p_receipt where execution_id=e.execution_id;
 return true;
end $fn$;


-- A definitive pre-execution refusal is audit evidence, never an invented H receipt.
create function public.handlarborsen_test_data_reject_execution(p_package_id uuid,p_execution_id uuid,p_user_id uuid,p_conversation_id uuid,p_claim_token uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare r public.handlarborsen_test_data_reviews%rowtype;e public.handlarborsen_test_data_executions%rowtype;
begin
 if p_status is null or p_status not in('needs_new_review','denied','disabled') or p_claim_token is null then return false;end if;
 select * into r from public.handlarborsen_test_data_reviews where package_id=p_package_id and user_id=p_user_id and conversation_id=p_conversation_id for update;
 if not found or r.state<>'approved' then return false;end if;
 select * into e from public.handlarborsen_test_data_executions where execution_id=p_execution_id and package_id=p_package_id for update;
 if not found or e.claim_token is distinct from p_claim_token or e.receipt is not null or e.state not in('dispatching','unknown','not_applied') then return false;end if;
 if e.state='not_applied' then return e.rejection_status=p_status;end if;
 update public.handlarborsen_test_data_executions set state='not_applied',rejection_status=p_status where execution_id=e.execution_id;
 return true;
end $fn$;
revoke all on function public.handlarborsen_test_data_reject_execution(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.handlarborsen_test_data_reject_execution(uuid,uuid,uuid,uuid,uuid,text) to service_role;

commit;