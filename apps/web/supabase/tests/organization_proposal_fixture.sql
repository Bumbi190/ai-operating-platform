\set ON_ERROR_STOP on
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.projects(id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.omnira_collaborator_proposals(project_id, author_id, title, detail) values (
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'Review workflow',
 'Propose review of an inactive workflow change'
);
update public.omnira_collaborator_proposals
 set status='approved', decided_at=now(), decision_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 where project_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
do $$ begin
 if (select count(*) from public.omnira_collaborator_proposal_events) <> 2 then
   raise exception 'audit does not contain submit + approve';
 end if;
 if (select string_agg(event,',' order by created_at, event) from public.omnira_collaborator_proposal_events) <> 'submitted,approved' then
   raise exception 'audit event names wrong';
 end if;
end $$;
set role authenticated;
do $$ begin
 begin
   perform count(*) from public.omnira_collaborator_proposals;
   raise exception 'authenticated user improperly read proposals';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'PROPOSAL_MIGRATION_PASS' as result;
