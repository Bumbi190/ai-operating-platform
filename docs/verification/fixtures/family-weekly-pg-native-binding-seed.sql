\set ON_ERROR_STOP on
-- Disposable PG only: synthetic provider identities, no credentials/tokens.
-- Account schema+guards come verbatim from the canonical 20260914 migration.
set role service_role;
insert into public.social_account_bindings(
 binding_id,project_id,platform,external_account_id,account_label,
 credential_source,verification,verified_at,bound_by
) values
('11111111-1111-4111-8111-111111111111',
 '77cda551-57c9-4dc0-b019-1bb6438777f7','facebook',
 'fixture-fb','Fixture Facebook','project_store','provider_attested',
 clock_timestamp(),'user:77777777-7777-4777-8777-777777777777'),
('22222222-2222-4222-8222-222222222222',
 '77cda551-57c9-4dc0-b019-1bb6438777f7','instagram',
 'fixture-ig','Fixture Instagram','project_store','provider_attested',
 clock_timestamp(),'user:77777777-7777-4777-8777-777777777777');
do $$
begin
 if (select count(*) from public.social_account_bindings
     where project_id='77cda551-57c9-4dc0-b019-1bb6438777f7'
       and superseded_at is null and blocked_at is null
       and verification='provider_attested')<>2 then
   raise exception 'NATIVE_BINDING_SEED_NOT_PROVIDER_ATTESTED';
 end if;
end $$;
reset role;
select 'FAMILY_WEEKLY_CANONICAL_BINDING_SEEDED_PASS' as result;
