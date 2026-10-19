-- Synthetic projects only; transaction rollback leaves no history/rules behind.
begin;
create function pg_temp.timing_data(cid uuid,at timestamptz,events jsonb default '[]',history text default 'owner_confirmed_none') returns jsonb language sql as $$
 select jsonb_build_object('schemaVersion',1,'contactVersions',jsonb_build_array(jsonb_build_object('id',cid,'version',1)),'history',history,'olderHistoryAttestation','Synthetic complete older-history attestation','sources',
 (select jsonb_agg(jsonb_build_object('sourceKey',c,'channel',c,'identityRef','synthetic','scopeRef','synthetic-window','since',to_char(at-interval '60 days','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'through',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observedAt',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'state','complete','reference','fixture')) from unnest(array['strato_sent','strato_inbox','resend']) c),
 'events',events,'correctionOf',null,'reviewNote','Synthetic reviewed history')
$$;
create function pg_temp.timing_event(at timestamptz,kind text default 'initial',outcome text default 'accepted') returns jsonb language sql as $$
 select jsonb_build_object('id',gen_random_uuid(),'sourceRefs',jsonb_build_array('strato_sent'),'providerRefs',jsonb_build_array(jsonb_build_object('sourceKey','strato_sent','id',gen_random_uuid())),'occurredAt',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'direction','outbound','outcome',outcome,'kind',kind,'invitationId',gen_random_uuid(),'inReplyToEventId',null,'reviewedDuplicateOf',null)
$$;
create function pg_temp.save_timing(f jsonb,d jsonb,previous uuid default null) returns jsonb language sql as $$
 select sales_timing_save_history(f->'principal',jsonb_build_object('projectId',f->>'projectId','contactId',f->>'contactId','expectedContactVersion',1,'idempotencyKey',gen_random_uuid(),'expectedPreviousId',previous,'data',d,'confirmed',true))
$$;
create function pg_temp.save_rules(f jsonb) returns jsonb language sql as $$
 select sales_timing_save_rules(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',null,'minWaitSeconds',1209600,'maxReminders',1,'maxSourceAgeSeconds',900,'confirmed',true))
$$;
create temp table timing_failures(label text,error text);
create function pg_temp.timing_case(label text,body text) returns void language plpgsql as $$begin execute body;raise notice 'PASS %',label;exception when others then insert into timing_failures values(label,sqlerrm);end$$;
select pg_temp.timing_case('missing rule/history and no send permission',$case$do $$declare f jsonb:=sales_regression_fixture('timing-empty');x jsonb;begin
 x:=sales_timing_read(f->'principal',jsonb_build_object('projectId',f->>'projectId'));
 perform sales_test_assert(x->'customerSendingEnabled'='false','no customer sending');
 perform sales_test_assert(x->'contacts'->0->'blockers' ? 'RULE_REVIEW_REQUIRED','missing rules block');
 perform sales_test_assert(x->'contacts'->0->>'initialPreparationAllowed'='false','missing data never allowed');
end$$;$case$);
select pg_temp.timing_case('reviewed initial history and immutable CAS',$case$do $$declare f jsonb:=sales_regression_fixture('timing-initial');r jsonb;d jsonb;h jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second');h:=pg_temp.save_timing(f,d);
 x:=sales_timing_read(f->'principal',jsonb_build_object('projectId',f->>'projectId'));
 perform sales_test_assert(x->'contacts'->0->>'initialPreparationAllowed'='true','complete known initial may prepare');
 perform sales_test_assert(x->'historyRevisions'->0->>'id'=h->>'id','canonical metadata available for owner correction');
 begin perform pg_temp.save_timing(f,d);raise exception 'TEST FAILED: stale CAS allowed';exception when unique_violation then null;end;
 begin update sales_contact_history_revisions set data=data where id=(h->>'id')::uuid;raise exception 'TEST FAILED: mutable history';exception when object_not_in_prerequisite_state then null;end;
 perform sales_test_assert((select count(*)=0 from sales_jobs where project_id=(f->>'projectId')::uuid),'save never queues');
end$$;$case$);
select pg_temp.timing_case('336 hours boundary and DST independent',$case$do $$declare f jsonb:=sales_regression_fixture('timing-boundary');at timestamptz:=clock_timestamp()-interval '1 second';e jsonb;d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);e:=pg_temp.timing_event(at-interval '336 hours'+interval '2 seconds');d:=pg_temp.timing_data((f->>'contactId')::uuid,at,jsonb_build_array(e),'contacted');perform pg_temp.save_timing(f,d);
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at);
 perform sales_test_assert(extract(epoch from ((x->>'intervalFloorAt')::timestamptz-(x->>'latestObservedOutboundAt')::timestamptz))=1209600,'exact336hours');
 perform sales_test_assert(x->'blockers' ? 'WAIT_INTERVAL','before floor blocked');
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at+interval '2 seconds');
 perform sales_test_assert(not(x->'blockers' ? 'WAIT_INTERVAL'),'at floor time blocker gone');
 perform sales_test_assert(extract(epoch from ((timestamptz '2026-03-20 12:00+01'+interval '336 hours')-timestamptz '2026-03-20 12:00+01'))=1209600,'spring hours');
 perform sales_test_assert(extract(epoch from ((timestamptz '2026-10-20 12:00+02'+interval '336 hours')-timestamptz '2026-10-20 12:00+02'))=1209600,'autumn hours');
end$$;$case$);
select pg_temp.timing_case('source through freshness not save time',$case$do $$declare f jsonb:=sales_regression_fixture('timing-stale');at timestamptz:=clock_timestamp()-interval '1 second';d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,at);perform pg_temp.save_timing(f,d);
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at+interval '900 seconds');
 perform sales_test_assert(not(x->'blockers' ? 'SOURCE_STALE'),'900seconds inclusive');
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at+interval '901 seconds');
 perform sales_test_assert(x->'blockers' ? 'SOURCE_STALE','901 stale');
end$$;$case$);
select pg_temp.timing_case('old reminder invitation rename and uncertainty',$case$do $$declare f jsonb:=sales_regression_fixture('timing-reminder');at timestamptz:=clock_timestamp()-interval '1 second';d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,at,jsonb_build_array(pg_temp.timing_event(at-interval '30 days'),pg_temp.timing_event(at-interval '15 days','reminder')),'contacted');perform pg_temp.save_timing(f,d);
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at);
 perform sales_test_assert(x->>'reminderCount'='1' and x->'blockers' ? 'REMINDER_LIMIT','historic reminder not reset by invitation ID');
end$$;$case$);
select pg_temp.timing_case('source gaps unknown history and failed/uncertain sends',$case$do $$declare f jsonb;at timestamptz:=clock_timestamp()-interval '1 second';d jsonb;x jsonb;v text;begin
 foreach v in array array['delivery_unknown','failed_before_send'] loop
 f:=sales_regression_fixture('timing-'||v);perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,at,jsonb_build_array(pg_temp.timing_event(at-interval '1 day','initial',v)),'contacted');perform pg_temp.save_timing(f,d);x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at);
 if v='delivery_unknown' then perform sales_test_assert(x->'blockers' ? 'SEND_UNCERTAIN' and x->'intervalFloorAt'='null','uncertainty blocks no assumed failure');
 else perform sales_test_assert(x->'latestObservedOutboundAt'='null','known pre-send failure not sent');end if;
 end loop;
end$$;$case$);
select pg_temp.timing_case('strict SQL rejects secret fields and imprecise times',$case$do $$declare f jsonb:=sales_regression_fixture('timing-validation');d jsonb;begin
 d:=pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second');
 begin perform pg_temp.save_timing(f,d||'{"password":"secret"}');raise exception 'TEST FAILED: secret accepted';exception when invalid_parameter_value then null;end;
 d:=jsonb_set(d,'{sources,0,through}','"2026-10-19"');
 begin perform pg_temp.save_timing(f,d);raise exception 'TEST FAILED: date only accepted';exception when invalid_parameter_value then null;end;
end$$;$case$);

select pg_temp.timing_case('SQL strict scalar 0',$case$do $$declare f jsonb:=sales_regression_fixture('timing-scalar-0');d jsonb;at timestamptz:=clock_timestamp()-interval '1 second';begin
d:=pg_temp.timing_data((f->>'contactId')::uuid,at);
begin perform pg_temp.save_timing(f,jsonb_set(d,'{sources,0,channel}','null'));raise exception 'TEST FAILED: null channel accepted';exception when invalid_parameter_value then null;end;
end$$;$case$);
select pg_temp.timing_case('SQL strict scalar 1',$case$do $$declare f jsonb:=sales_regression_fixture('timing-scalar-1');d jsonb;at timestamptz:=clock_timestamp()-interval '1 second';begin
d:=pg_temp.timing_data((f->>'contactId')::uuid,at,jsonb_build_array(pg_temp.timing_event(at-interval '20 days')),'contacted');
begin perform pg_temp.save_timing(f,jsonb_set(d,'{events,0,kind}','null'));raise exception 'TEST FAILED: null kind accepted';exception when invalid_parameter_value then null;end;
end$$;$case$);
select pg_temp.timing_case('SQL strict scalar 2',$case$do $$declare f jsonb:=sales_regression_fixture('timing-scalar-2');d jsonb;at timestamptz:=clock_timestamp()-interval '1 second';begin
d:=pg_temp.timing_data((f->>'contactId')::uuid,at,jsonb_build_array(pg_temp.timing_event(at-interval '20 days')),'contacted');
begin perform pg_temp.save_timing(f,jsonb_set(d,'{events,0,occurredAt}','"2026-10-08T24:00:00Z"'));raise exception 'TEST FAILED: 24hour normalized';exception when invalid_parameter_value then null;end;
end$$;$case$);
select pg_temp.timing_case('foreign owner and default execute denied',$case$do $$declare f jsonb:=sales_regression_fixture('timing-owner');begin
 begin perform sales_timing_read(jsonb_build_object('userId','20000000-0000-4000-8000-000000000002','allowedProjectIds',jsonb_build_array(f->>'projectId')),jsonb_build_object('projectId',f->>'projectId'));raise exception 'TEST FAILED: foreign owner';exception when no_data_found then null;end;
 perform sales_test_assert(not has_table_privilege('authenticated','public.sales_contact_history_revisions','INSERT'),'no direct history writes');
 perform sales_test_assert(not has_function_privilege('anon','public.sales_timing_read(jsonb,jsonb)','EXECUTE'),'no anon execution');
 perform sales_test_assert(not has_function_privilege('authenticated','public.sales_timing_save_rules(jsonb,jsonb)','EXECUTE'),'no client rule mutation');
end$$;$case$);
select pg_temp.timing_case('source gap unknown and suppression dominate',$case$do $$declare f jsonb:=sales_regression_fixture('timing-held');d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second','[]','unknown');
 d:=jsonb_set(d,'{sources,0,state}','"gap"');perform pg_temp.save_timing(f,d);
 update sales_contacts set data=jsonb_set(data,'{suppressed}','true') where id=(f->>'contactId')::uuid;
 x:=sales_timing_read(f->'principal',jsonb_build_object('projectId',f->>'projectId'))->'contacts'->0;
 perform sales_test_assert(x->'blockers' ?& array['SOURCE_GAP','HISTORY_REVIEW_REQUIRED','CONTACT_SUPPRESSED'],'all blockers retained');
 perform sales_test_assert(x->>'initialPreparationAllowed'='false' and x->'reminderCount'='null','unknown not zero');
end$$;$case$);


select pg_temp.timing_case('shared normalized recipient keeps separate branches',$case$do $$declare f jsonb:=sales_regression_fixture('timing-shared');other uuid:=gen_random_uuid();d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);
 insert into sales_contacts select other,project_id,1,data||jsonb_build_object('id',other,'branchName','Other','email','  '||upper(data->>'email')||'  ','suppressed',true),now() from sales_contacts where id=(f->>'contactId')::uuid;
 d:=pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second');d:=jsonb_set(d,'{contactVersions}',d->'contactVersions'||jsonb_build_array(jsonb_build_object('id',other,'version',1)));perform pg_temp.save_timing(f,d);
 x:=sales_timing_read(f->'principal',jsonb_build_object('projectId',f->>'projectId'));
 perform sales_test_assert(jsonb_array_length(x->'contacts')=2,'two branches retained');
 perform sales_test_assert(x->'contacts'->0->>'recipient'=x->'contacts'->1->>'recipient','same normalized recipient');
 perform sales_test_assert(x->'contacts'->0->'blockers' ? 'CONTACT_SUPPRESSED' and x->'contacts'->1->'blockers' ? 'CONTACT_SUPPRESSED','same address hold wins');
end$$;$case$);
select pg_temp.timing_case('rule and history replay preserve exact identity',$case$do $$declare f jsonb:=sales_regression_fixture('timing-replay');saved jsonb;req jsonb;h jsonb;begin
 saved:=pg_temp.save_rules(f);select request into req from sales_contact_timing_rules where id=(saved->>'id')::uuid;
 perform sales_test_assert(sales_timing_save_rules(f->'principal',req)=saved,'same rule replay');
 begin perform sales_timing_save_rules(f->'principal',req||'{"minWaitSeconds":1209601}');raise exception 'TEST FAILED: changed rule replay';exception when unique_violation then null;end;
 h:=pg_temp.save_timing(f,pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second'));select request into req from sales_contact_history_revisions where id=(h->>'id')::uuid;
 perform sales_test_assert(sales_timing_save_history(f->'principal',req)=h,'same history replay');
end$$;$case$);
select pg_temp.timing_case('zero reminders still allows a reviewed first invitation',$case$do $$declare f jsonb:=sales_regression_fixture('timing-zero');req jsonb;x jsonb;begin
 req:=jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',null,'minWaitSeconds',1209600,'maxReminders',0,'maxSourceAgeSeconds',900,'confirmed',true);
 perform sales_timing_save_rules(f->'principal',req);perform pg_temp.save_timing(f,pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second'));
 x:=sales_timing_read(f->'principal',jsonb_build_object('projectId',f->>'projectId'))->'contacts'->0;
 perform sales_test_assert(x->>'initialPreparationAllowed'='true','no reminder permission required for first invitation');
end$$;$case$);


select pg_temp.timing_case('initial job requires timing even for confirmed contact',$case$do $$declare f jsonb:=sales_regression_fixture('timing-missing-job');begin
 begin perform sales_prepare_job(f->'principal',f->'input');raise exception 'TEST FAILED: missing timing allowed preparation';exception when object_not_in_prerequisite_state then null;end;
end$$;$case$);
select pg_temp.timing_case('new history fences claim and model attempt',$case$do $$declare f jsonb;d jsonb;h jsonb;j jsonb;r jsonb;stage text;begin
 foreach stage in array array['claim','attempt'] loop
 f:=sales_regression_fixture('timing-fence-'||stage);perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second');h:=pg_temp.save_timing(f,d);j:=sales_prepare_job(f->'principal',f->'input');
 if stage='attempt' then r:=sales_claim_job(f->>'token','{}')->'ref';end if;
 perform pg_temp.save_timing(f,d,(h->>'id')::uuid);
 begin
  if stage='claim' then perform sales_claim_job(f->>'token','{}');else perform sales_reserve_attempt(f->>'token',r||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));end if;
  raise exception 'TEST FAILED: stale timing permit';
 exception when serialization_failure then null;end;
 perform sales_test_assert((select count(*)=0 from sales_model_attempts where project_id=(f->>'projectId')::uuid),'no model attempt for stale timing');
 end loop;
end$$;$case$);
select pg_temp.timing_case('workspace carries authoritative timing',$case$do $$declare f jsonb:=sales_regression_fixture('timing-workspace');w jsonb;begin
 w:=sales_read_workspace(f->'principal',jsonb_build_object('projectId',f->>'projectId'));
 perform sales_test_assert(w->'timing'->'customerSendingEnabled'='false','workspace has timing');
 perform sales_test_assert(w->'timing'->'contacts'->0->>'initialPreparationAllowed'='false','workspace no missing-data fallback');
end$$;$case$);

select pg_temp.timing_case('new same-address branch invalidates complete binding',$case$do $$declare f jsonb:=sales_regression_fixture('timing-new-branch');d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);d:=pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second');perform pg_temp.save_timing(f,d);
 insert into sales_contacts select gen_random_uuid(),project_id,1,data||jsonb_build_object('id',gen_random_uuid(),'history','unknown'),now() from sales_contacts where id=(f->>'contactId')::uuid;
 x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,clock_timestamp());
 perform sales_test_assert(x->'blockers' ? 'SOURCE_CHANGED','every same-address row must be bound');
end$$;$case$);

select pg_temp.timing_case('ambiguous cross-channel duplicate stays unknown',$case$do $$declare f jsonb:=sales_regression_fixture('timing-duplicate');at timestamptz:=clock_timestamp()-interval '1 second';e jsonb;n jsonb;d jsonb;x jsonb;begin
 perform pg_temp.save_rules(f);e:=pg_temp.timing_event(at-interval '20 days');n:=e||jsonb_build_object('id',gen_random_uuid(),'sourceRefs',jsonb_build_array('resend'),'providerRefs',jsonb_build_array(jsonb_build_object('sourceKey','resend','id',gen_random_uuid())));
 d:=pg_temp.timing_data((f->>'contactId')::uuid,at,jsonb_build_array(e,n),'contacted');perform pg_temp.save_timing(f,d);x:=sales_timing_evaluate((f->>'projectId')::uuid,(f->>'contactId')::uuid,at);
 perform sales_test_assert(x->'blockers' ? 'DUPLICATE_UNRESOLVED' and x->'intervalFloorAt'='null','cross-channel ambiguity cannot produce floor');
end$$;$case$);
select pg_temp.timing_case('rule revision fences result and address edit fences attempt',$case$do $$declare f jsonb;j jsonb;ref jsonb;rule jsonb;stage text;d jsonb;begin
 foreach stage in array array['result','address'] loop
 f:=sales_regression_fixture('timing-late-'||stage);rule:=pg_temp.save_rules(f);perform pg_temp.save_timing(f,pg_temp.timing_data((f->>'contactId')::uuid,clock_timestamp()-interval '1 second'));j:=sales_prepare_job(f->'principal',f->'input');
 perform sales_test_assert(sales_prepare_job(f->'principal',f->'input')=j,'same initial job on replay');ref:=sales_claim_job(f->>'token','{}')->'ref';
 if stage='result' then
 perform sales_commit_research(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','evidence',null,'question',null));
 perform sales_reserve_attempt(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));
 perform sales_timing_save_rules(f->'principal',jsonb_build_object('projectId',f->>'projectId','idempotencyKey',gen_random_uuid(),'expectedPreviousId',rule->>'id','minWaitSeconds',1209601,'maxReminders',1,'maxSourceAgeSeconds',900,'confirmed',true));
 begin perform sales_commit_drafts(f->>'token',ref||jsonb_build_object('drafts',jsonb_build_array(f->'draft')));raise exception 'TEST FAILED: stale completion';exception when serialization_failure then null;end;
 else
 select data into d from sales_contacts where id=(f->>'contactId')::uuid;perform sales_save_contact(f->'principal',(d-'version')||jsonb_build_object('expectedVersion',1,'email','changed@example.se'));
 begin perform sales_reserve_attempt(f->>'token',ref||jsonb_build_object('contactId',f->>'contactId','attemptId',gen_random_uuid()));raise exception 'TEST FAILED: changed address attempt';exception when serialization_failure then null;end;
 end if;
 perform sales_test_assert(not exists(select from sales_draft_revisions where project_id=(f->>'projectId')::uuid),'stale result never saved');
 end loop;
end$$;$case$);

do $$declare failures text;begin select string_agg(label||': '||error,E'\n') into failures from timing_failures;if failures is not null then raise exception E'Timing FAILED:\n%',failures;end if;end$$;
select 'PASS contact timing contracts';
rollback;
