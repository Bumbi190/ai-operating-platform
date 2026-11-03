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



select set_config('request.jwt.claims','{"sub":"86a5cefe-0000-4000-8000-00000000000b","role":"authenticated"}',true);
select pg_temp.denied($q$select pg_temp.edit('restore',5,null,2)$q$,'42501');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,true)',:'hash_2'),'42501');
select pg_temp.denied(format('select public.dealer_pilot_edit(''sql-b'',gen_random_uuid(),0,''save'',%L::jsonb,null)',pg_temp.car(:'hash_a')),'22023');
select pg_temp.ensure(public.dealer_pilot_workspace('sql-b')->'vehicles'='[]'::jsonb,'second tenant independent');

select set_config('request.jwt.claims','{"sub":"86a5cefe-0000-4000-8000-00000000000a","role":"authenticated"}',true);
select pg_temp.ensure((pg_temp.edit('restore',5,null,0)->>'version')::int=6,'withdraw first publication');
select pg_temp.ensure(public.dealer_pilot_catalog('sql-a')->'vehicles'='[]'::jsonb,'withdraw hides listing');
select pg_temp.denied(format('select public.dealer_pilot_photo(''sql-a'',%L,false)',:'hash_a'),'P0002');
reset role;
update dealer_pilot.sites set admin_enabled=false where slug='sql-a';
set local role authenticated;
select pg_temp.denied($q$select pg_temp.edit('publish',6)$q$,'42501');
reset role;
update dealer_pilot.sites set admin_enabled=true where slug='sql-a';
delete from dealer_pilot.members where site_slug='sql-a';
set local role authenticated;
select pg_temp.denied($q$select public.dealer_pilot_workspace('sql-a')$q$,'42501');
reset role;
rollback;
\echo PASS: dealer pilot content, history, private photo access, stale versions, tenant isolation and entitlement.
