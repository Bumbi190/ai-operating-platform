begin;
create function pg_temp.mailbox_expect_error(statement text, expected text) returns void language plpgsql as $$
begin begin execute statement;exception when others then if sqlstate=expected then return;end if;raise;end;raise exception 'TEST FAILED: expected %',expected;end $$;
do $$declare n text;begin select nspname into n from pg_namespace where oid=(select pronamespace from pg_proc where proname='mailbox_expect_error');execute format('grant usage on schema %I to service_role',n);end $$;
set local role service_role;
do $$
declare
 p jsonb:='{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}';
 v jsonb:='{"projectId":"10000000-0000-4000-8000-000000000001","workerId":"60000000-0000-4000-8000-000000000077"}';
 key jsonb:=current_setting('sales.mailbox_public_key')::jsonb;altkey jsonb:=current_setting('sales.mailbox_public_key_alt')::jsonb;other jsonb;other_context jsonb;
 c jsonb;context jsonb;claim jsonb;receipt jsonb;replayed jsonb;env jsonb:=jsonb_build_object('format','sales-strato-envelope-v1','wrappedKey',replace(encode(decode(repeat('01',384),'hex'),'base64'),E'\n',''),'iv','AQEBAQEBAQEBAQEB','ciphertext','AQEBAQEBAQEBAQEBAQEBAQE');
begin
 perform public.sales_enroll_worker(p,v||jsonb_build_object('tokenHash',repeat('7',64)));
 perform public.sales_host_authorize(p,v);perform public.sales_host_adopt(repeat('7',64),jsonb_build_object('managerTokenHash',repeat('8',64)));
 -- RED target: mailbox RPCs must exist.
 c:=public.sales_mailbox_publish_key(repeat('8',64),key||'{"generation":1}');
 context:=public.sales_mailbox_begin_setup(p,v||'{"email":"info@example.se"}')->'context';
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_publish_key(%L,%L)',repeat('8',64),altkey||'{"generation":1}'),'23505');
 if context->>'kid'<>key->>'kid' then raise exception 'TEST FAILED: wrong host key';end if;
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_begin_setup(%L,%L)',p,v||'{"email":"other@example.se"}'),'23505');
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_publish_key(%L,%L)',repeat('8',64),key||jsonb_build_object('generation',1,'kid',repeat('0',64))),'22023');
 perform public.sales_mailbox_submit_sealed(p,jsonb_build_object('projectId',v->>'projectId','setupId',context->>'setupId','envelope',env));
 perform public.sales_mailbox_submit_sealed(p,jsonb_build_object('projectId',v->>'projectId','setupId',context->>'setupId','envelope',env));
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_submit_sealed(%L,%L)',p,jsonb_build_object('projectId',v->>'projectId','setupId',context->>'setupId','envelope',env||'{"ciphertext":"AgICAgICAgICAgICAgICAgI"}')),'23505');
 claim:=public.sales_mailbox_claim_setup(repeat('8',64),'{}');
 if claim->'context'<>context or claim->'envelope'<>env then raise exception 'TEST FAILED: wrong claim context';end if;
 if public.sales_mailbox_claim_setup(repeat('8',64),'{}')->'setup' is distinct from 'null'::jsonb then raise exception 'TEST FAILED: double claim';end if;
 receipt:=jsonb_build_object('smtpAuthenticatedAt',clock_timestamp(),'imapAuthenticatedAt',clock_timestamp(),'localStored',true,'reasonCode',null);
 c:=jsonb_build_object('setupId',context->>'setupId','claimId',claim->>'claimId','hostGeneration',1,'mailboxGeneration',claim->'mailboxGeneration','receipt',receipt);
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_commit_probe(%L,%L)',repeat('8',64),c||'{"hostGeneration":2}'),'40001');
 replayed:=public.sales_mailbox_commit_probe(repeat('8',64),c);
 if replayed->>'current'<>'true' or replayed->'status'->>'status'<>'authenticated' then raise exception 'TEST FAILED: missing stored auth receipt';end if;
 if public.sales_mailbox_commit_probe(repeat('8',64),c)<>replayed then raise exception 'TEST FAILED: changed receipt';end if;
 if exists(select from public.sales_mailbox_setups where id=(context->>'setupId')::uuid and sealed is not null) then raise exception 'TEST FAILED: ciphertext retained';end if;
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_commit_probe(%L,%L)',repeat('8',64),c||jsonb_build_object('receipt',receipt||'{"localStored":false}')),'23505');
 -- Accepted receipts survive routine worker-token rotation for the same manager/head.
 perform public.sales_host_rotate(repeat('8',64),jsonb_build_object('rotationId','90000000-0000-4000-8000-000000000078','newTokenHash',repeat('5',64),'expectedGeneration',1));
 if public.sales_mailbox_commit_probe(repeat('8',64),c)<>replayed then raise exception 'TEST FAILED: accepted receipt lost after routine rotation';end if;
 perform public.sales_mailbox_publish_key(repeat('8',64),key||'{"generation":2}');
 perform public.sales_mailbox_begin_setup(p,v||'{"email":"other@example.se"}');
 if public.sales_mailbox_commit_probe(repeat('8',64),c)->>'current'<>'false' then raise exception 'TEST FAILED: stale local activation accepted';end if;
 other:=v||'{"workerId":"60000000-0000-4000-8000-000000000076"}';
 perform public.sales_enroll_worker(p,other||jsonb_build_object('tokenHash',repeat('9',64)));perform public.sales_host_authorize(p,other);perform public.sales_host_adopt(repeat('9',64),jsonb_build_object('managerTokenHash',repeat('6',64)));
 perform public.sales_mailbox_publish_key(repeat('6',64),altkey||'{"generation":1}');other_context:=public.sales_mailbox_begin_setup(p,other||'{"email":"untouched@example.se"}')->'context';
 perform public.sales_mailbox_submit_sealed(p,jsonb_build_object('projectId',v->>'projectId','setupId',other_context->>'setupId','envelope',env));
 update public.sales_mailbox_setups set expires_at=clock_timestamp()-interval '1 second' where worker_id=(v->>'workerId')::uuid and state='created';
 perform public.sales_mailbox_expire_setups();
 if exists(select from public.sales_mailbox_setups where worker_id=(v->>'workerId')::uuid and state in('created','waiting_for_host','probing')) then raise exception 'TEST FAILED: cleanup';end if;
 if not exists(select from public.sales_mailbox_setups where id=(other_context->>'setupId')::uuid and state='waiting_for_host' and sealed is not null) then raise exception 'TEST FAILED: cleanup changed an unexpired setup';end if;
 perform public.sales_revoke_worker(p,v);
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_claim_setup(%L,%L)',repeat('8',64),'{}'),'P0002');
 perform pg_temp.mailbox_expect_error(format('select public.sales_mailbox_commit_probe(%L,%L)',repeat('8',64),c),'P0002');
 if has_table_privilege('authenticated','public.sales_mailbox_setups','SELECT') or has_table_privilege('anon','public.sales_mailbox_connections','SELECT') or has_table_privilege('authenticated','public.sales_mailbox_connections','INSERT,UPDATE,DELETE') then raise exception 'TEST FAILED: mailbox ACL';end if;
end $$;
select 'PASS: encrypted mailbox nonce/claim/receipt/replay/expiry/revoke/ACL';
rollback;
