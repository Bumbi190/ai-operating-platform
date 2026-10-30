-- Runs only in the owned isolated fixture, inside a rolled-back transaction.
begin;
do $$ begin
 if public.social_repeat_normalize('  HEJ, världen! ') <> public.social_repeat_normalize('hej världen') then raise exception 'normalization'; end if;
 if public.social_repeat_similarity('En sagostund med Nova och Pling under stjärnorna','En sagostund med Nova och Pling under stjärnorna ikväll') < 0.8 then raise exception 'near-copy'; end if;
 if public.social_repeat_similarity('Vi bygger en rymdraket av kartong','Baka tillsammans och räkna färgglada muffins') <> 0 then raise exception 'different message'; end if;
 if has_function_privilege('authenticated','public.social_content_repeat_check(jsonb,jsonb)','EXECUTE') then raise exception 'client RPC access'; end if;
 if has_function_privilege('service_role','public.social_repeat_publication_guard()','EXECUTE') then raise exception 'trigger exposed'; end if;
end $$;
insert into public.projects(id,slug,owner_id) values('10000000-0000-4000-8000-000000000001','familje-stunden','90000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','unrelated','90000000-0000-4000-8000-000000000001');
insert into public.social_content_revisions(id,post_id,project_id,draft,media) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"channel":"facebook","text":"En sagostund med Nova och Pling under stjärnorna"}','[]'),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{"channel":"facebook","text":"EN sagostund, med Nova och Pling under stjärnorna!"}','[]'),
 ('20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','{"channel":"facebook","text":"En sagostund med Nova och Pling under stjärnorna ikväll"}','[]'),
 ('20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','{"channel":"instagram","text":"En sagostund med Nova och Pling under stjärnorna"}','[]'),
 ('20000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','{"channel":"facebook","text":"Baka tillsammans och räkna färgglada muffins"}','[]');
insert into public.social_publications(id,project_id,post_id,revision_id,channel,account_id,state,requested_at)
 values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','facebook','123','requested','2026-10-01T20:00:00Z');
update public.social_publications set state='published',updated_at=requested_at;
do $$ declare x record;n integer; begin
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000002','2026-11-01T20:00:00Z');
 if x.reason is distinct from 'duplicate_content' then raise exception 'old copy allowed';end if;
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000003','2026-10-15T20:00:00Z');
 if x.reason is distinct from 'similar_recent_content' then raise exception 'inclusive fourteen day boundary';end if;
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000003','2026-10-15T20:00:00.001Z');
 if n<>0 then raise exception 'outside window';end if;
 update public.social_publications set updated_at='2026-10-20T20:00:00Z';
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000003','2026-10-25T20:00:00Z');
 if x.reason is distinct from 'similar_recent_content' then raise exception 'late confirmation ignored';end if;
 update public.social_publications set updated_at=requested_at;
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','instagram','20000000-0000-4000-8000-000000000004','2026-10-01T20:00:00Z');
 if n<>0 then raise exception 'cross channel blocked';end if;
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','999','facebook','20000000-0000-4000-8000-000000000002','2026-10-01T20:00:00Z');
 if n<>0 then raise exception 'cross account blocked';end if;
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000002','123','facebook','20000000-0000-4000-8000-000000000002','2026-10-01T20:00:00Z');
 if n<>0 then raise exception 'other project affected';end if;
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000001','2026-10-01T20:00:00Z','40000000-0000-4000-8000-000000000001');
 if n<>0 then raise exception 'own receipt recovery blocked';end if;
 begin
  insert into public.social_publications(id,project_id,post_id,revision_id,channel,account_id,state)
   values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','facebook','123','requested');
  raise exception 'new ID duplicate was accepted';
 exception when check_violation then null;end;
 update public.social_publications set state='uncertain';
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000002','2026-11-01T20:00:00Z');
 if x.reason is distinct from 'duplicate_content' then raise exception 'uncertain receipt ignored';end if;
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000003','2026-12-01T20:00:00Z');
 if x.reason is distinct from 'similar_recent_content' then raise exception 'old uncertain attempt escaped';end if;
 update public.social_publications set state='failed';
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000002','2026-11-01T20:00:00Z');
 if n<>0 then raise exception 'failed nonapplied attempt blocked';end if;
 insert into public.social_schedule_jobs(id,project_id,post_id,revision_id,channel,item,state,scheduled_at)
 values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','facebook','{"accountId":"123"}','queued','2026-10-10T20:00:00Z');
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000003','2026-10-01T20:00:00Z');
 if x.reason is distinct from 'similar_recent_content' or x.post_id<>'30000000-0000-4000-8000-000000000001' then raise exception 'queued copy ignored';end if;
 select count(*) into n from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000005','2026-10-01T20:00:00Z');
 if n<>0 then raise exception 'different content blocked';end if;
 update public.social_content_revisions set draft=jsonb_set(draft,'{text}','"Boka nu"') where id='20000000-0000-4000-8000-000000000005';
 select * into x from public.social_repeat_conflict('10000000-0000-4000-8000-000000000001','123','facebook','20000000-0000-4000-8000-000000000005','2026-10-01T20:00:00Z');
 if x.reason is distinct from 'short_content_review' then raise exception 'short text passed';end if;
end $$;
rollback;
