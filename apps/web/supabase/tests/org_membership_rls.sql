\set ON_ERROR_STOP on
insert into auth.users(id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.omnira_organization_memberships(user_id,role) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','collaborator');
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$ begin
if (select count(*) from public.omnira_organization_memberships) <> 1 then raise exception 'collaborator read isolation failed'; end if;
if (select role from public.omnira_organization_memberships) <> 'collaborator' then raise exception 'wrong visible role'; end if;
begin
 update public.omnira_organization_memberships set role='owner' where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 raise exception 'unexpected role update';
exception when insufficient_privilege then null; end;
begin
 insert into public.omnira_organization_memberships(user_id,role) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','owner');
 raise exception 'unexpected insert';
exception when insufficient_privilege then null; end;
begin
 delete from public.omnira_organization_memberships where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 raise exception 'unexpected delete';
exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
do $$ begin if (select count(*) from public.omnira_organization_memberships) <> 0 then raise exception 'outsider saw membership'; end if; end $$;
reset role;
update public.omnira_organization_memberships set revoked_at=now() where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$ begin if (select role from public.omnira_organization_memberships) <> 'collaborator' then raise exception 'revoked self audit missing'; end if; end $$;
select 'ORG_MEMBERSHIP_RLS_PASS' as result;
