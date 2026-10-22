begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.projects(id,name,slug,owner_id)
values ('20000000-0000-4000-8000-000000000001','Higgsfield isolated test','higgsfield-isolated-test','10000000-0000-4000-8000-000000000001');

do $test$
declare r text; t text; op text; blocked boolean; f record;
begin
 foreach r in array array['anon','authenticated'] loop
  foreach t in array array['media_provider_connections','media_provider_oauth_states'] loop
   foreach op in array array['select * from public.%I','insert into public.%I default values','update public.%I set project_id=project_id','delete from public.%I'] loop
    blocked:=false;
    execute format('set local role %I',r);
    begin execute format(op,t); exception when insufficient_privilege then blocked:=true; end;
    reset role;
    if not blocked then raise exception 'Client role % could execute % on %',r,op,t; end if;
   end loop;
  end loop;
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'higgsfield_%' loop
   if has_function_privilege(r,f.oid,'execute') then raise exception 'Public RPC execution % %',r,f.proname; end if;
  end loop;
 end loop;
 if exists(select 1 from pg_class where relname in ('media_provider_connections','media_provider_oauth_states') and not relrowsecurity) then raise exception 'RLS missing'; end if;
 if exists(select 1 from pg_proc where proname like 'higgsfield_%' and prosecdef) then raise exception 'Privileged RPC forbidden'; end if;
end $test$;

do $test$
declare p uuid:='20000000-0000-4000-8000-000000000001'; a uuid:='10000000-0000-4000-8000-000000000001';
 b uuid:='10000000-0000-4000-8000-000000000002'; payload jsonb:='{"v":1,"iv":"fixture","tag":"fixture","ciphertext":"fixture"}';
 state jsonb; lease uuid; v bigint;
begin
 set local role service_role;
 if public.higgsfield_oauth_create(p,a,repeat('a',64),0,payload) is not true then raise exception 'Create'; end if;
 if public.higgsfield_oauth_consume(repeat('a',64),b) is not null then raise exception 'Actor mixup'; end if;
 state:=public.higgsfield_oauth_consume(repeat('a',64),a);
 if state is null then raise exception 'Consume valid'; end if;
 if public.higgsfield_oauth_consume(repeat('a',64),a) is not null then raise exception 'State replay'; end if;
 if public.higgsfield_connection_save(p,0,payload,'subject',true,null) is not true then raise exception 'Save'; end if;
 if public.higgsfield_connection_save(p,0,payload,'subject',true,null) is true then raise exception 'Stale save'; end if;
 lease:=public.higgsfield_refresh_acquire(p,1);
 if lease is null then raise exception 'Lease acquire'; end if;
 if public.higgsfield_refresh_acquire(p,1) is not null then raise exception 'Duplicate lease'; end if;
 if public.higgsfield_connection_save(p,1,payload,'subject',true,gen_random_uuid()) then raise exception 'Wrong lease'; end if;
 perform public.higgsfield_refresh_release(p,lease);
 if public.higgsfield_oauth_create(p,a,repeat('b',64),1,payload) is not true then raise exception 'Create pending'; end if;
 perform public.higgsfield_connection_disconnect(p);
 if public.higgsfield_oauth_consume(repeat('b',64),a) is not null then raise exception 'Disconnected callback revived'; end if;
 if public.higgsfield_connection_save(p,1,payload,'subject',true,null) is true then raise exception 'Late refresh revived'; end if;
 if (public.higgsfield_connection_read(p)->>'status') <> 'disconnected' then raise exception 'Not disconnected'; end if;
 v:=(public.higgsfield_connection_read(p)->>'connection_version')::bigint;
 if public.higgsfield_oauth_create(p,a,repeat('c',64),v,payload) is not true then raise exception 'New attempt'; end if;
 reset role;
 update public.media_provider_oauth_states set expires_at=clock_timestamp()-interval '1 second' where state_hash=repeat('c',64);
 set local role service_role;
 if public.higgsfield_oauth_consume(repeat('c',64),a) is not null then raise exception 'Expired state consumed'; end if;
 reset role;
end $test$;
rollback;
select 'Higgsfield SQL permission, replay, CAS, lease and disconnect tests passed' as result;
