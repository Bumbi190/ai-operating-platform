-- Run as the operator in a disposable database after the pilot proposal.
-- All users, dealerships, uploads and changes are synthetic and rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('86a5cefe-0000-4000-8000-00000000000a'), ('86a5cefe-0000-4000-8000-00000000000b');
insert into dealer_pilot.sites(slug,brand,admin_enabled) values
 ('sql-a','SQL-bilhallen A', true), ('sql-b','SQL-bilhallen B', true), ('sql-c','Utan tillval', false);
insert into dealer_pilot.members(site_slug,user_id) values
 ('sql-a','86a5cefe-0000-4000-8000-00000000000a'),
 ('sql-b','86a5cefe-0000-4000-8000-00000000000b'),
 ('sql-c','86a5cefe-0000-4000-8000-00000000000a');

create function pg_temp.ensure(ok boolean, label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text, err text) returns void language plpgsql as $$
begin
 begin
   execute statement;
 exception when others then
   if sqlstate=err then return; end if;
   raise exception 'Expected %, got % (%)',err,sqlstate,sqlerrm;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.edit(action text, expected int, payload jsonb default null, revision int default null)
returns jsonb language sql as $$
 select public.dealer_pilot_edit('sql-a','1052bb7d-a495-4b41-94cb-2b131d4478f2',expected,action,payload,revision);
$$;
create function pg_temp.car(hash text) returns jsonb language sql as $$
 select jsonb_build_object('name','Skog 7','price',215000,'year',2024,'mileage',830,'fuel','El','sold',false,'photos',jsonb_build_array(hash));
$$;

create function pg_temp.page_body(title text) returns jsonb language sql as $$
  select jsonb_build_object('heading',title,'description',E'Besök oss.\nVälkommen!',
    'hours',E'Mån–fre 09–18\nLör 10–14','phone','+46 (8) 12-34.56',
    'email','salj+bil@demo.example','address',E'Bilvägen 4\nTeststad');
$$;
create function pg_temp.page_edit(op text, expected int, body jsonb default null, target int default null)
returns jsonb language sql as $$
  select public.dealer_pilot_page_edit('sql-a',expected,op,body,target);
$$;

set local role anon;
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'vehicles'='[]'::jsonb,'new catalog is empty');
select pg_temp.denied($q$select public.dealer_pilot_workspace('sql-a')$q$,'42501');
select pg_temp.denied($q$select * from dealer_pilot.vehicles$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_photo('sql-a',repeat('0',64),true)$q$,'42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"86a5cefe-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select pg_temp.denied($q$select public.dealer_pilot_workspace('sql-b')$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_workspace('sql-c')$q$,'42501');
select pg_temp.denied($q$update dealer_pilot.sites set admin_enabled=true where slug='sql-c'$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_put_photo('sql-a','abcd')$q$,'22023');
select public.dealer_pilot_put_photo('sql-a','UklGRh4AAABXRUJQVlA4TBEAAAAvAoAAAAfQ/wLXvf+BiOh/AAA=') as hash_a \gset
select public.dealer_pilot_put_photo('sql-a','UklGRh4AAABXRUJQVlA4TBEAAAAvAoAAAAfQ4K52pP+BiOh/AAA=') as hash_2 \gset
select pg_temp.ensure(:'hash_a'='683b0b22b4a80a754fd084b30729a8438c41d70fb1f23a481cc27038a997272b','known image SHA-256');
select pg_temp.ensure(public.dealer_pilot_put_photo('sql-a','UklGRh4AAABXRUJQVlA4TBEAAAAvAoAAAAfQ/wLXvf+BiOh/AAA=')=:'hash_a','duplicate image is idempotent');
select pg_temp.denied($q$select pg_temp.edit('save',0,pg_temp.car(repeat('e',64)))$q$,'22023');
select pg_temp.denied(format('select pg_temp.edit(''save'',0,%L::jsonb)',pg_temp.car(:'hash_a')-'sold'),'22023');
select pg_temp.denied(format('select pg_temp.edit(''save'',0,%L::jsonb)',pg_temp.car(:'hash_a')||'{"price":"77"}'),'22023');
select pg_temp.ensure((pg_temp.edit('save',0,pg_temp.car(:'hash_a'))->>'version')::int=1,'draft v1');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'vehicles'='[]'::jsonb,'draft stays private');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-a')#>>'{vehicles,0,draft,name}'='Skog 7','member can preview');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,false)',:'hash_a'),'P0002');
select pg_temp.ensure(public.dealer_pilot_photo('sql-a',:'hash_a',true) is not null,'private photo available to member');
select pg_temp.ensure((pg_temp.edit('publish',1)->>'version')::int=2,'publication v2');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')#>>'{vehicles,0,content,price}'='215000','published price');
select pg_temp.denied($q$select pg_temp.edit('publish',1)$q$,'40001');
select pg_temp.ensure((pg_temp.edit('save',2,pg_temp.car(:'hash_2')||'{"price":209000,"sold":true}')->>'version')::int=3,'new price draft');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')#>>'{vehicles,0,content,sold}'='false','public still original');
select pg_temp.ensure((pg_temp.edit('publish',3)->>'version')::int=4,'sold v4');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,false)',:'hash_a'),'P0002');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-a')#>>'{vehicles,0,history,0,revision}'='4','newest history first');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')#>>'{vehicles,0,content,sold}'='true','published sold state');
select pg_temp.ensure((pg_temp.edit('restore',4,null,2)->>'version')::int=5,'restore publication as new revision');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')#>>'{vehicles,0,content,price}'='215000','restored price');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-a')#>>'{vehicles,0,draft,sold}'='false','restored draft matches');
select pg_temp.ensure(public.dealer_pilot_photo('sql-a',:'hash_a',false) is not null,'restored public original');
select pg_temp.denied($q$select pg_temp.edit('restore',5,null,999)$q$,'22023');

-- No photo or partial vehicle change survives a failed multipart save.
\set third 'UklGRh4AAABXRUJQVlA4TBEAAAAvAoAAAAfQ3aq2u/+BiOh/AAA='
\set third_hash '88b89b4d7fbe60fec7a9ec26c67ec6266743ef54d18e2bd0ddf527a881fb3d3f'
select pg_temp.denied(format($q$select public.dealer_pilot_save('sql-a','1052bb7d-a495-4b41-94cb-2b131d4478f2',4,%L::jsonb,array[%L])$q$,
                      pg_temp.car(:'third_hash'),:'third'),'40001');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,true)',:'third_hash'),'P0002');
select pg_temp.denied(format($q$select public.dealer_pilot_save('sql-a','1052bb7d-a495-4b41-94cb-2b131d4478f2',5,%L::jsonb,array[%L])$q$,
                      pg_temp.car(:'hash_a'),:'third'),'22023');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,true)',:'third_hash'),'P0002');
savepoint valid_batch;
select pg_temp.ensure(public.dealer_pilot_save('sql-a','1052bb7d-a495-4b41-94cb-2b131d4478f2',
                     5,pg_temp.car(:'third_hash'),array[:'third'])->>'version'='6','atomic multipart save');
select pg_temp.ensure(public.dealer_pilot_photo('sql-a',:'third_hash',true)=:'third','exact uploaded bytes');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,false)',:'third_hash'),'P0002');
rollback to valid_batch;

-- Retention limits total historical bodies without ever preventing the next
-- edit, rollback or withdrawal. An expired revision cannot be restored by ID.
savepoint check_history_window;
do $$begin
  for expected in 5..35 loop perform pg_temp.edit('publish',expected); end loop;
end$$;
select pg_temp.ensure(jsonb_array_length(public.dealer_pilot_workspace('sql-a')#>'{vehicles,0,history}')=30,'bounded history');
select pg_temp.denied($q$select pg_temp.edit('restore',36,null,2)$q$,'22023');
select pg_temp.ensure(pg_temp.edit('restore',36,null,35)->>'version'='37','recent history remains usable');
rollback to check_history_window;


-- Page information is optional. A site created before this feature needs no backfill.
select pg_temp.ensure(public.dealer_pilot_page_workspace('sql-a')=jsonb_build_object(
  'slug','sql-a','brand','SQL-bilhallen A','version',0,'draft',null,'published',null,
  'publishedRevision',null,'history',jsonb_build_array()),'optional page workspace on an existing site');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-a')->'siteContent'='null'::jsonb,'empty site content in vehicle workspace');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-b')->'siteContent'='null'::jsonb,'second site has no page');

select pg_temp.denied($q$select public.dealer_pilot_page_workspace('sql-b')$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_page_workspace('sql-c')$q$,'42501');
select pg_temp.denied($q$select * from dealer_pilot.pages$q$,'42501');
select pg_temp.denied($q$update dealer_pilot.page_publications set content='{}'$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_page_edit('sql-b',0,'save',pg_temp.page_body('x'),null)$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_page_edit('sql-c',0,'save',pg_temp.page_body('x'),null)$q$,'42501');
select pg_temp.denied($q$select pg_temp.page_edit('publish',0)$q$,'40001');
select pg_temp.denied($q$select pg_temp.page_edit('save',0)$q$,'22023');
select pg_temp.denied($q$select pg_temp.page_edit('save',0,pg_temp.page_body('x')-'hours')$q$,'22023');
select pg_temp.denied($q$select pg_temp.page_edit('save',0,'[]'::jsonb)$q$,'22023');
select pg_temp.denied($q$select pg_temp.page_edit('save',0,pg_temp.page_body('x')||'{"website":"https://untrusted.invalid"}')$q$,'22023');
do $$
declare bad jsonb;
begin
  for bad in select * from (values
    (jsonb_build_object('heading','')), (jsonb_build_object('heading',' padded ')),
    (jsonb_build_object('heading',repeat('Å',81))), (jsonb_build_object('heading',E'a\nb')),
    (jsonb_build_object('description',repeat('å',1001))), (jsonb_build_object('description',E'x\ry')),
    (jsonb_build_object('hours',repeat('ö',401))), (jsonb_build_object('hours',E'x\ty')),
    (jsonb_build_object('phone',repeat('1',41))), (jsonb_build_object('phone','+12-+345')),
    (jsonb_build_object('phone','12')), (jsonb_build_object('phone',repeat('1',21))), (jsonb_build_object('phone','+46#123')),
    (jsonb_build_object('email','a@localhost')), (jsonb_build_object('email',E'a@x.se\nbcc:x@x.se')),
    (jsonb_build_object('email','a%0a@x.se')), (jsonb_build_object('email','a@b.se?bcc=x')),
    (jsonb_build_object('email',repeat('a',250)||'@x.se')), (jsonb_build_object('email','a@'||repeat('b',64)||'.se')),
    (jsonb_build_object('address',repeat('å',181))), (jsonb_build_object('address','x'||chr(127))),
    (jsonb_build_object('address','x'||chr(133))), ('{"hours":false}'::jsonb), ('{"phone":null}'::jsonb)
  ) as invalid(patch) loop
    perform pg_temp.denied(format('select pg_temp.page_edit(''save'',0,%L::jsonb)',pg_temp.page_body('x')||bad),'22023');
  end loop;
end $$;
select pg_temp.ensure(pg_temp.page_edit('save',0,pg_temp.page_body('Privat utkast'))='{"version":1}'::jsonb,'page save');
select pg_temp.ensure(public.dealer_pilot_page_workspace('sql-a')->'draft'=pg_temp.page_body('Privat utkast'),'editor can preview saved page');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-a')->'siteContent'='null'::jsonb,'vehicle preview never includes page draft');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'siteContent'='null'::jsonb,'unpublished page private');
select pg_temp.ensure(pg_temp.page_edit('publish',1)='{"version":2}'::jsonb,'first public page');
select pg_temp.ensure(pg_temp.page_edit('save',2,pg_temp.page_body('Nästa utkast')||'{"description":"","hours":"","phone":"","email":"","address":""}')='{"version":3}'::jsonb,'all non-heading fields optional');
select pg_temp.denied($q$select pg_temp.page_edit('save',2,pg_temp.page_body('Gammal flik'))$q$,'40001');
select pg_temp.denied($q$select pg_temp.page_edit('publish',3,pg_temp.page_body('Injected'))$q$,'22023');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-a')->'siteContent'=pg_temp.page_body('Privat utkast'),'vehicle preview uses current publication');
select pg_temp.ensure(public.dealer_pilot_page_workspace('sql-a')->'published'=pg_temp.page_body('Privat utkast'),'private page workspace has separate published body');
reset role;
set local role anon;
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'siteContent'=pg_temp.page_body('Privat utkast'),'anonymous sees only current publication');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')-array['slug','brand','siteContent','vehicles']='{}'::jsonb,'no draft or history in public response');
select pg_temp.denied($q$select public.dealer_pilot_page_workspace('sql-a')$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_page_edit('sql-a',3,'publish',null,null)$q$,'42501');
select pg_temp.denied($q$select * from dealer_pilot.pages$q$,'42501');
select pg_temp.denied($q$select * from dealer_pilot.page_publications$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.ensure(pg_temp.page_edit('publish',3)->>'version'='4','publish another version');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')#>>'{siteContent,heading}'='Nästa utkast','second public version');
select pg_temp.ensure(pg_temp.page_edit('restore',4,null,2)->>'version'='5','restore previous page as fresh revision');
select pg_temp.ensure(public.dealer_pilot_page_workspace('sql-a')#>>'{publishedRevision}'='5' and
  public.dealer_pilot_page_workspace('sql-a')->'draft'=pg_temp.page_body('Privat utkast'),'restored page version and draft');
select pg_temp.ensure(pg_temp.page_edit('restore',5,null,0)->>'version'='6','withdraw page');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'siteContent'='null'::jsonb and
  public.dealer_pilot_workspace('sql-a')->'siteContent'='null'::jsonb,'withdrawn page hidden in both catalogs');
select pg_temp.ensure(public.dealer_pilot_page_workspace('sql-a')->'publishedRevision'='null'::jsonb and
  public.dealer_pilot_page_workspace('sql-a')->'draft'=pg_temp.page_body('Privat utkast') and
  public.dealer_pilot_page_workspace('sql-a')#>'{history,0,available}'='false'::jsonb,'withdraw preserves draft and records history');
select pg_temp.denied($q$select pg_temp.page_edit('restore',6,null,999)$q$,'22023');
do $$begin
  for expected in 6..36 loop perform pg_temp.page_edit('publish',expected); end loop;
end$$;
select pg_temp.ensure(jsonb_array_length(public.dealer_pilot_page_workspace('sql-a')->'history')=30 and
  public.dealer_pilot_page_workspace('sql-a')#>>'{history,0,revision}'='37','page history bounded newest first');
select pg_temp.denied($q$select pg_temp.page_edit('restore',37,null,2)$q$,'22023');
select pg_temp.ensure(pg_temp.page_edit('restore',37,null,36)->>'version'='38','recent page revision still restorable');

select set_config('request.jwt.claims','{"sub":"86a5cefe-0000-4000-8000-00000000000b","role":"authenticated"}',true);
select pg_temp.denied($q$select pg_temp.edit('restore',5,null,2)$q$,'42501');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,true)',:'hash_2'),'42501');
select pg_temp.denied(format('select public.dealer_pilot_edit(''sql-b'',gen_random_uuid(),0,''save'',%L::jsonb,null)',pg_temp.car(:'hash_a')),'22023');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-b')->'vehicles'='[]'::jsonb,'second tenant independent');
select pg_temp.denied($q$select public.dealer_pilot_page_workspace('sql-a')$q$,'42501');
select pg_temp.denied($q$select pg_temp.page_edit('restore',38,null,36)$q$,'42501');
select pg_temp.ensure(public.dealer_pilot_page_workspace('sql-b')->'draft'='null'::jsonb,'independent site has no draft');
select pg_temp.ensure(public.dealer_pilot_page_edit('sql-b',0,'save',pg_temp.page_body('Handlare B'),null)->>'version'='1' and
  public.dealer_pilot_catalog('sql-b')->'siteContent'='null'::jsonb,'second tenant starts with an independent private draft');
select pg_temp.ensure(public.dealer_pilot_page_edit('sql-b',1,'publish',null,null)->>'version'='2','second tenant can publish own page');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-b')->'siteContent'=pg_temp.page_body('Handlare B') and
  public.dealer_pilot_catalog('sql-a')->'siteContent'=pg_temp.page_body('Privat utkast'),'dealerships serve their own revisions');

select set_config('request.jwt.claims','{"sub":"86a5cefe-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select pg_temp.ensure((pg_temp.edit('restore',5,null,0)->>'version')::int=6,'withdraw first publication');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'vehicles'='[]'::jsonb,'withdraw hides listing');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,false)',:'hash_a'),'P0002');
reset role;
update dealer_pilot.sites set admin_enabled=false where slug='sql-a';
set local role authenticated;
select pg_temp.denied($q$select pg_temp.edit('publish',6)$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_page_workspace('sql-a')$q$,'42501');
select pg_temp.denied($q$select pg_temp.page_edit('publish',38)$q$,'42501');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'siteContent'=pg_temp.page_body('Privat utkast'),'disabled admin retains last public page');
reset role;
update dealer_pilot.sites set admin_enabled=true where slug='sql-a';
delete from dealer_pilot.members where site_slug='sql-a';
set local role authenticated;
select pg_temp.denied($q$select public.dealer_pilot_workspace('sql-a')$q$,'42501');
select pg_temp.denied($q$select public.dealer_pilot_page_workspace('sql-a')$q$,'42501');
select pg_temp.denied($q$select pg_temp.page_edit('publish',38)$q$,'42501');
reset role;
rollback;
\echo PASS: dealer pilot content, optional site page, history, private photo access, stale versions, tenant isolation and entitlement.
