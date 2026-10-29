\set ON_ERROR_STOP on
-- Disposable PG only. Synthetic owner profile and described media seeded
-- through the REAL profile/content relations and content writer. For the
-- canonical social publication/schedule tables; no external API involved.
set role service_role;
insert into public.social_project_profiles(project_id)
values ('77cda551-57c9-4dc0-b019-1bb6438777f7');
insert into public.social_project_profile_revisions(
 id,project_id,sequence,sha256,profile,input_data,idempotency_key,
 created_by,conversation_id
) values(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '77cda551-57c9-4dc0-b019-1bb6438777f7',1,repeat('b',64),
 jsonb_build_object(
  'description','Familje-Stunden erbjuder sagor och aktiviteter med Nova och Pling.',
  'audience','Familjer med barn','tone','Varm och enkel',
  'websiteUrl','https://familje-stunden.se',
  'callToAction','Upptack aventyret',
  'factualBoundaries','Hitta inte pa aktiviteter',
  'preferredMediaIds',jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 ),'{}'::jsonb,'fixture_profile_1',
 '77777777-7777-4777-8777-777777777777',
 '55555555-5555-4555-8555-555555555555'
);
update public.social_project_profiles set
 current_revision_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7';

insert into public.social_monthly_release_rules(project_id,rule,updated_by)
values('77cda551-57c9-4dc0-b019-1bb6438777f7',
 '{"enabled":false}'::jsonb,'77777777-7777-4777-8777-777777777777');

select public.social_content_save(
 jsonb_build_object('userId','77777777-7777-4777-8777-777777777777',
   'allowedProjectIds',jsonb_build_array('77cda551-57c9-4dc0-b019-1bb6438777f7')),
 jsonb_build_object(
  'projectId','77cda551-57c9-4dc0-b019-1bb6438777f7',
  'conversationId','55555555-5555-4555-8555-555555555555',
  'postId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'expectedRevisionId',null,'planRevisionId','99999999-9999-4999-8999-999999999999',
  'idempotencyKey','native_schedule_described_owned_jpeg',
  'draft',jsonb_build_object('channel','facebook','format','image',
   'title','Beskriven bild','text','Nova visar en aktivitet.',
   'linkUrl',null,
   'mediaIds',jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
   'mediaBrief','Nova och Pling vid pysselbordet i en egen godkänd bild.',
   'scheduledAt',null)
 )
)->'project' as seeded_project;
reset role;
