-- Test-only explicit review helper. Never loaded by an application migration.
create function sales_fixture_review_timing(pid uuid) returns void language plpgsql as $$
declare p jsonb; c record; d jsonb; oldid uuid; at timestamptz:=clock_timestamp()-interval '1 second';begin
 select jsonb_build_object('userId',owner_id,'allowedProjectIds',jsonb_build_array(id)) into p from projects where id=pid;
 if not exists(select from sales_contact_timing_rules where project_id=pid) then
 perform sales_timing_save_rules(p,jsonb_build_object('projectId',pid,'idempotencyKey',gen_random_uuid(),'expectedPreviousId',null,'minWaitSeconds',1209600,'maxReminders',1,'maxSourceAgeSeconds',900,'confirmed',true));end if;
 for c in select distinct on (lower(btrim(data->>'email'))) * from sales_contacts where project_id=pid order by lower(btrim(data->>'email')),id loop
 select id into oldid from sales_contact_history_revisions where project_id=pid and recipient=lower(btrim(c.data->>'email')) order by version desc limit 1;
 d:=jsonb_build_object('schemaVersion',1,'contactVersions',(select jsonb_agg(jsonb_build_object('id',id,'version',version)) from sales_contacts where project_id=pid and lower(btrim(data->>'email'))=lower(btrim(c.data->>'email'))),'history','owner_confirmed_none','olderHistoryAttestation','Synthetic verified older history','events','[]'::jsonb,'correctionOf',oldid,'reviewNote','Explicit synthetic review','sources',(select jsonb_agg(jsonb_build_object('sourceKey',ch,'channel',ch,'identityRef','fixture','scopeRef','fixture','since',to_char(at-interval '60 days','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'through',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'observedAt',to_char(at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'state','complete','reference','fixture')) from unnest(array['strato_sent','strato_inbox','resend']) ch));
 perform sales_timing_save_history(p,jsonb_build_object('projectId',pid,'idempotencyKey',gen_random_uuid(),'expectedPreviousId',oldid,'contactId',c.id,'expectedContactVersion',c.version,'data',d,'confirmed',true));
 end loop;
end$$;
