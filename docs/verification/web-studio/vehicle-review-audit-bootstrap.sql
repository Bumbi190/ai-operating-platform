-- Fixture-only role; all lives inside isolated no-network Postgres.
create role service_role nologin bypassrls;
grant usage on schema public,auth to service_role;
