-- Disposable fixtures; no external SMTP/provider operations.
begin;
create function pg_temp.initial_fixture(label text) returns jsonb language plpgsql as $$
declare f jsonb:=sales_regression_fixture('initial-'||label);mb uuid:=gen_random_uuid();pol uuid:=gen_random_uuid();h sales_contact_history_revisions;j jsonb;ref jsonb;d sales_draft_revisions;hd jsonb;sources jsonb;begin
 perform sales_host_authorize(f->'principal',jsonb_build_object('projectId',f->>'projectId','workerId',f->>'workerId'));
 insert into sales_mailbox_connections(id,project_id,worker_id,owner_id,public_jwk,kid,key_generation,generation,email,status) values(mb,(f->>'projectId')::uuid,(f->>'workerId')::uuid,(f->'principal'->>'userId')::uuid,'{}',repeat('a',64),1,1,'info@handlarborsen.se','authenticated');
 insert into sales_inbox_configs(mailbox_id,project_id,worker_id,owner_id,version,mailbox_generation,folder,since_at,state,uid_validity) values(mb,(f->>'projectId')::uuid,(f->>'workerId')::uuid,(f->'principal'->>'userId')::uuid,1,1,'INBOX',clock_timestamp()-interval '60 days','enabled',1);
 perform sales_fixture_review_timing((f->>'projectId')::uuid);
 select * into h from sales_contact_history_revisions where project_id=(f->>'projectId')::uuid order by version desc limit 1;
 select jsonb_agg(value||'{"state":"gap"}') into sources from jsonb_array_elements(h.data->'sources');
 hd:=h.data||jsonb_build_object('history','unknown','olderHistoryAttestation',null,'sources',sources);
 perform sales_timing_save_history(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',h.id,'contactId',f->>'contactId','expectedContactVersion',1,'data',hd,'confirmed',true));
 j:=sales_prepare_editorial_job(f->'principal',f->'input'||'{"preparationMode":"editorial_only"}');ref:=sales_claim_job(f->>'token','{}')->'ref';
 perform sales_commit_research(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));
 perform sales_reserve_attempt(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 perform sales_commit_drafts(f->>'token',ref||jsonb_build_object('drafts',jsonb_build_array(f->'draft')));
 select * into d from sales_draft_revisions where job_id=(j->>'id')::uuid and is_current;
 perform resolve_approval(d.approval_id,d.run_id,d.project_id,'approved',null);
 insert into sales_initial_send_policies(id,project_id,owner_id,mailbox_id,worker_id,recipient,sender_email,sender_name,contact_id,offer_revision_id,entity_key,allow_history_gap,version,expires_at,enabled)
 values(pol,d.project_id,(f->'principal'->>'userId')::uuid,mb,(f->>'workerId')::uuid,d.data->>'toEmail','info@handlarborsen.se','Andre',(f->>'contactId')::uuid,(f->'input'->>'offerRevisionId')::uuid,'verified-branch-'||label,true,1,clock_timestamp()+interval '1 hour',true);
 return f||jsonb_build_object('mailboxId',mb,'policyId',pol,'revisionId',d.id,'revisionHash',d.sha256);
end$$;
create function pg_temp.initial_request(f jsonb) returns jsonb language sql as $$
 select jsonb_build_object('projectId',f->>'projectId','revisionId',f->>'revisionId','expectedRevisionHash',f->>'revisionHash','expectedMailboxGeneration',1,'expectedHistoryRevisionId',p->>'historyRevisionId','expectedRuleRevisionId',p->>'ruleRevisionId','expectedPolicyVersion',1,'acceptHistoryGap',true,'idempotencyKey',gen_random_uuid()) from (select sales_initial_send_preview(f->'principal',jsonb_build_object('projectId',f->>'projectId','revisionId',f->>'revisionId')) p) x
$$;
create function pg_temp.initial_refused(statement text,wanted text default null) returns void language plpgsql as $$
declare caught text;begin begin execute statement;exception when others then get stacked diagnostics caught=returned_sqlstate;end;
 perform sales_test_assert(caught is not null and (wanted is null or caught=wanted),'initial send must refuse: '||coalesce(caught,'SUCCESS'));
end$$;
-- TESTS_BEGIN: race runner reuses only fixture declarations above.
do $$declare f jsonb:=pg_temp.initial_fixture('positive');v jsonb:=pg_temp.initial_request(f);j jsonb;c jsonb;p jsonb;begin
 perform sales_test_assert(sales_initial_send_preview(f->'principal',v-'expectedRevisionHash'-'expectedMailboxGeneration'-'expectedHistoryRevisionId'-'expectedRuleRevisionId'-'expectedPolicyVersion'-'acceptHistoryGap'-'idempotencyKey')->>'requiresHistoryGapAcceptance'='true','gap is visible');
 perform pg_temp.initial_refused(format('select sales_initial_send_confirm(%L,%L)',f->'principal',v||'{"acceptHistoryGap":false}'),'55000');
 j:=sales_initial_send_confirm(f->'principal',v);perform sales_test_assert(j->>'status'='queued','approved initial queues only after explicit gap acceptance');
 perform sales_test_assert(sales_initial_send_confirm(f->'principal',v)->>'id'=j->>'id','exact replay');
 perform sales_test_assert(sales_initial_send_confirm(f->'principal',v||jsonb_build_object('idempotencyKey',gen_random_uuid()))->>'id'=j->>'id','different keys do not duplicate');
 perform pg_temp.initial_refused(format('select sales_initial_send_confirm(%L,%L)',f->'principal',v||'{"toEmail":"evil@example.se"}'),'22023');
 c:=sales_initial_send_claim(f->>'token','{}');perform sales_test_assert(c->'ref'->>'sendJobId'=j->>'id','initial claim uses own queue');
 p:=(c->'snapshot'->>'sealedJson')::jsonb;
 perform sales_test_assert(p->>'version'='2' and p->>'kind'='initial' and not p?'sourceMessageId' and p->'inReplyTo'='null' and p->'references'='[]','no fabricated reply envelope');
 p:=sales_initial_send_begin_dispatch(f->>'token',c->'ref');perform sales_test_assert(p?'dispatchBefore','dispatch permit');
 perform pg_temp.initial_refused(format('select sales_initial_send_begin_dispatch(%L,%L)',f->>'token',c->'ref'),'40001');
 perform sales_initial_send_complete(f->>'token',c->'ref'||jsonb_build_object('receipt',jsonb_build_object('status','delivery_unknown','mimeSha256',repeat('f',64))));
 perform sales_test_assert((select count(*)=0 from sales_send_jobs where project_id=(f->>'projectId')::uuid),'reply queue untouched');
 perform sales_test_assert((select count(*)=1 from sales_initial_send_jobs where project_id=(f->>'projectId')::uuid),'one initial lineage');
end$$;

do $$declare f jsonb;v jsonb;c jsonb;variant text;h sales_contact_history_revisions;hd jsonb;begin
 foreach variant in array array['no_approval','suppressed','excluded','paused','policy_disabled','policy_expired','policy_gap_denied','history_changed','stale','failed','missing_channel','new_incoming','contact_changed','offer_policy_changed'] loop
  f:=pg_temp.initial_fixture(variant);v:=pg_temp.initial_request(f);
  if variant='no_approval' then update approvals set status='pending' where id=(select approval_id from sales_draft_revisions where id=(f->>'revisionId')::uuid);end if;
  if variant in('suppressed','excluded') then update sales_contacts set data=jsonb_set(data,array[variant],'true') where id=(f->>'contactId')::uuid;end if;
  if variant='paused' then update projects set execution_paused=true where id=(f->>'projectId')::uuid;end if;
  if variant='policy_disabled' then update sales_initial_send_policies set enabled=false where id=(f->>'policyId')::uuid;end if;
  if variant='policy_expired' then update sales_initial_send_policies set expires_at=clock_timestamp()-interval '1 second' where id=(f->>'policyId')::uuid;end if;
  if variant='policy_gap_denied' then update sales_initial_send_policies set allow_history_gap=false where id=(f->>'policyId')::uuid;end if;
  if variant='offer_policy_changed' then update sales_initial_send_policies set version=2 where id=(f->>'policyId')::uuid;end if;
  if variant='contact_changed' then update sales_contacts set version=2 where id=(f->>'contactId')::uuid;end if;
  if variant='new_incoming' then insert into sales_inbox_messages(project_id,mailbox_id,owner_id,header,text_state,text_selected) values((f->>'projectId')::uuid,(f->>'mailboxId')::uuid,(f->'principal'->>'userId')::uuid,jsonb_build_object('from',f->'draft'->>'toEmail','messageId','<new@example.se>'),'not_selected',false);end if;
  if variant in('history_changed','stale','failed','missing_channel') then
   select * into h from sales_contact_history_revisions where project_id=(f->>'projectId')::uuid order by version desc limit 1;hd:=h.data;
   if variant='stale' then hd:=jsonb_set(hd,'{sources,0,through}',to_jsonb(to_char(clock_timestamp()-interval '901 seconds','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));end if;
   if variant='failed' then hd:=jsonb_set(hd,'{sources,0,state}','"failed"');end if;
   if variant='missing_channel' then hd:=jsonb_set(hd,'{sources}',(hd->'sources')-2);end if;
   perform sales_timing_save_history(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',h.id,'contactId',f->>'contactId','expectedContactVersion',1,'data',hd,'confirmed',true));
  end if;
  perform pg_temp.initial_refused(format('select sales_initial_send_confirm(%L,%L)',f->'principal',v));
  perform sales_test_assert((select count(*)=0 from sales_initial_send_jobs where project_id=(f->>'projectId')::uuid),'no queue on '||variant);
 end loop;
end$$;

do $$declare f jsonb:=pg_temp.initial_fixture('dispatch-fence');v jsonb:=pg_temp.initial_request(f);j jsonb;c jsonb;begin
 j:=sales_initial_send_confirm(f->'principal',v);c:=sales_initial_send_claim(f->>'token','{}');
 update sales_initial_send_policies set version=2 where id=(f->>'policyId')::uuid;
 perform pg_temp.initial_refused(format('select sales_initial_send_begin_dispatch(%L,%L)',f->>'token',c->'ref'));
 update sales_initial_send_policies set version=1 where id=(f->>'policyId')::uuid;
 insert into sales_inbox_messages(project_id,mailbox_id,owner_id,header,text_state,text_selected) values((f->>'projectId')::uuid,(f->>'mailboxId')::uuid,(f->'principal'->>'userId')::uuid,jsonb_build_object('from',f->'draft'->>'toEmail','messageId','<race@example.se>'),'not_selected',false);
 perform pg_temp.initial_refused(format('select sales_initial_send_begin_dispatch(%L,%L)',f->>'token',c->'ref'));
 perform sales_test_assert((select dispatch_before is null from sales_initial_send_jobs where id=(j->>'id')::uuid),'no reserved send after source changes');
end$$;

do $$declare f jsonb:=pg_temp.initial_fixture('ownership');v jsonb:=pg_temp.initial_request(f);begin
 perform pg_temp.initial_refused(format('select sales_initial_send_confirm(%L,%L)',jsonb_set(f->'principal','{userId}','"20000000-0000-4000-8000-000000000002"'),v),'P0002');
 perform sales_test_assert(not has_function_privilege('authenticated','sales_initial_send_confirm(jsonb,jsonb)','execute'),'no browser RPC authority');
 perform sales_test_assert(not has_table_privilege('anon','sales_initial_send_jobs','select'),'no anonymous private queue');
 perform sales_test_assert((select relrowsecurity from pg_class where oid='sales_initial_send_jobs'::regclass),'RLS');
end$$;

-- A new text/version cannot bypass a prior queued, accepted or uncertain send.
do $$declare f jsonb;v jsonb;j jsonb;c jsonb;next_id uuid;d sales_draft_revisions;outcome text;t jsonb;begin
 foreach outcome in array array['queued','smtp_accepted','delivery_unknown','cancelled','failed_before_send'] loop
  f:=pg_temp.initial_fixture('lineage-'||outcome);v:=pg_temp.initial_request(f);j:=sales_initial_send_confirm(f->'principal',v);
  t:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,clock_timestamp());
  perform sales_test_assert(t->'blockers' ? 'SEND_PENDING','central timing sees initial pending queue');
  if outcome='cancelled' then perform sales_initial_send_cancel(f->'principal',jsonb_build_object('projectId',f->>'projectId','sendJobId',j->>'id','expectedRevisionHash',f->>'revisionHash'));
  elsif outcome<>'queued' then
   c:=sales_initial_send_claim(f->>'token','{}');
   if outcome<>'failed_before_send' then perform sales_initial_send_begin_dispatch(f->>'token',c->'ref');end if;
   perform sales_initial_send_complete(f->>'token',c->'ref'||jsonb_build_object('receipt',jsonb_build_object('status',outcome,'mimeSha256',repeat('e',64))));
  end if;
  if outcome='delivery_unknown' then
   t:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,clock_timestamp());perform sales_test_assert(t->'blockers' ? 'SEND_UNCERTAIN','central timing preserves SMTP uncertainty');
  end if;
  next_id:=(sales_save_revision(f->'principal',jsonb_build_object('projectId',f->>'projectId','revisionId',f->>'revisionId','draft',f->'draft'||'{"subject":"Reviewed revised first message"}'))->>'revisionId')::uuid;
  select * into d from sales_draft_revisions where id=next_id;perform resolve_approval(d.approval_id,d.run_id,d.project_id,'approved',null);
  f:=f||jsonb_build_object('revisionId',d.id,'revisionHash',d.sha256);v:=pg_temp.initial_request(f);
  if outcome in('cancelled','failed_before_send') then perform sales_test_assert(sales_initial_send_confirm(f->'principal',v)->>'status'='queued','safe pre-send failure does not permanently exclude a lead');
  else perform pg_temp.initial_refused(format('select sales_initial_send_confirm(%L,%L)',f->'principal',v),'55000');end if;
  perform pg_temp.initial_refused(format('update sales_initial_send_jobs set entity_key=%L where id=%L','changed-entity',j->>'id'),'42501');
  -- Even a second address cannot acquire the same entity while its first lineage is active/uncertain.
  if outcome not in('cancelled','failed_before_send') then
   perform pg_temp.initial_refused(format('insert into sales_initial_send_jobs(project_id,owner_id,revision_id,revision_hash,recipient,entity_key,policy_snapshot,request_key,request,policy_id,policy_version,sealed_json,snapshot_sha256) select project_id,owner_id,%L,revision_hash,%L,entity_key,policy_snapshot,gen_random_uuid(),request,policy_id,policy_version,sealed_json,snapshot_sha256 from sales_initial_send_jobs where id=%L',next_id,'another-address@example.se',j->>'id'),'23505');
  end if;
 end loop;
end$$;

select 'PASS initial sending: gap decision, exact replay, immutable envelope, source/policy/owner fences and separate queue';
rollback;
