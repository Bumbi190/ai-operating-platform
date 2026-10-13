\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
insert into public.project_viewer_memberships(project_id,user_id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $$ begin if (select count(*) from public.project_viewer_memberships) <> 1 then raise exception 'owner read'; end if; end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$ begin
 if (select count(*) from public.project_viewer_memberships) <> 1 then raise exception 'viewer read'; end if;
 begin
  insert into public.project_viewer_memberships(project_id,user_id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  raise exception 'viewer unexpectedly inserted';
 exception when insufficient_privilege then null; end;
 begin
  update public.project_viewer_memberships set role='viewer' where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  raise exception 'viewer unexpectedly updated';
 exception when insufficient_privilege then null; end;
end $$;
delete from public.project_viewer_memberships where project_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
do $$ begin if (select count(*) from public.project_viewer_memberships) <> 0 then raise exception 'outsider read'; end if; end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
do $$ begin if (select count(*) from public.project_viewer_memberships) <> 1 then raise exception 'unauthorized mutation'; end if; end $$;
delete from public.project_viewer_memberships where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$ begin if (select count(*) from public.project_viewer_memberships) <> 0 then raise exception 'revoked viewer read'; end if; end $$;
select 'viewer_rls_acceptance_pass' as result;
