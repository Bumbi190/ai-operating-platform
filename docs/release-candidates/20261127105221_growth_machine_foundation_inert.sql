-- RUN13 inert machine foundation candidate. REVIEW FILE ONLY, not a canonical migration.
-- Never execute on a real target without separate explicit release approval.
-- All five tables reject inserts; no reader RPC, login, seed, activation or runtime change.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='1500ms';
SET LOCAL createrole_self_grant='';
-- Expected migration owner from RUN11. No superuser fallback.
DO $owner$
BEGIN
 IF current_user<>'postgres' OR session_user<>current_user OR NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND NOT rolsuper AND rolcreaterole AND rolbypassrls
 ) THEN RAISE EXCEPTION 'Growth migration requires approved non-superuser owner'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('public.projects'),('public.social_account_bindings'),('public.platform_config'),('public.project_lifecycle')) x(rel)
 LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(x.rel)
 WHERE c.oid IS NULL OR c.relowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) OR c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'Growth owner or FORCE RLS drift'; END IF;
END $owner$;

DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES ('public.projects'),('public.social_account_bindings'),('public.platform_config'),('public.project_lifecycle')) AS x(rel)
 LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(x.rel)
 WHERE c.oid IS NULL OR c.relkind NOT IN('r','p') OR NOT c.relrowsecurity) THEN
  RAISE EXCEPTION 'Growth prerequisite tables/RLS missing';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN('ge_capture_exec','ge_authority_exec','ge_authority_anon'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN('ge_capture','ge_outbox','ge_delivery','ge_stage_api','ge_authority_private','ge_authority_api')) THEN
  RAISE EXCEPTION 'Growth namespace/role collision';
 END IF;
END $guard$;

ALTER TABLE public.projects ADD COLUMN growth_authority_generation bigint NOT NULL DEFAULT 1 CHECK(growth_authority_generation>0);
CREATE SCHEMA ge_authority_private;
REVOKE ALL ON SCHEMA ge_authority_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION ge_authority_private.advance_generation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.growth_authority_generation<>1 THEN RAISE EXCEPTION 'invalid initial generation' USING ERRCODE='42501'; END IF;
 ELSE
   IF NEW.growth_authority_generation IS DISTINCT FROM OLD.growth_authority_generation THEN RAISE EXCEPTION 'generation is system-maintained' USING ERRCODE='42501'; END IF;
   IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN NEW.growth_authority_generation:=OLD.growth_authority_generation+1; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ge_authority_private.advance_generation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER growth_owner_generation BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION ge_authority_private.advance_generation();
-- Independently assert the actual row transition after ALL BEFORE triggers.
-- AFTER return values cannot rewrite NEW; nested DML fires both guards again.
-- Ordinary, immediate, row-level, not a deferrable constraint or UPDATE OF.
CREATE FUNCTION ge_authority_private.assert_generation_transition() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE expected bigint;
BEGIN
 IF TG_OP='INSERT' THEN
   expected:=1;
 ELSIF TG_OP='UPDATE' THEN
   expected:=OLD.growth_authority_generation;
   IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
     expected:=expected+1;
   END IF;
 ELSE
   RAISE EXCEPTION 'unexpected generation trigger operation' USING ERRCODE='42501';
 END IF;
 IF NEW.growth_authority_generation IS DISTINCT FROM expected THEN
   RAISE EXCEPTION 'invalid final owner generation transition' USING ERRCODE='42501';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION ge_authority_private.assert_generation_transition() FROM PUBLIC,anon,authenticated,service_role,authenticator;
CREATE TRIGGER growth_owner_generation_assert AFTER INSERT OR UPDATE ON public.projects
 FOR EACH ROW EXECUTE FUNCTION ge_authority_private.assert_generation_transition();


CREATE ROLE ge_capture_exec NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
-- PostgreSQL 16+ non-superuser CREATEROLE grants immutable-by-creator admin-only
-- membership from bootstrap. Temporarily permit SET ROLE for ownership transfer.
GRANT ge_capture_exec TO postgres WITH SET TRUE, INHERIT FALSE, ADMIN FALSE GRANTED BY postgres;
CREATE SCHEMA ge_capture;
CREATE SCHEMA ge_outbox;
CREATE SCHEMA ge_delivery;
CREATE SCHEMA ge_stage_api;
REVOKE ALL ON SCHEMA ge_capture,ge_outbox,ge_delivery,ge_stage_api FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE ge_capture.machine_grants(
 login_oid oid PRIMARY KEY, login_name name NOT NULL UNIQUE, grant_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 purpose text NOT NULL CHECK(purpose IN('ingress','worker')),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 binding_id uuid NOT NULL REFERENCES public.social_account_bindings(binding_id) ON DELETE RESTRICT,
 authority_generation bigint NOT NULL CHECK(authority_generation>0),
 active boolean NOT NULL DEFAULT false);
CREATE FUNCTION ge_capture.immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'immutable staging row'; END $$;
CREATE FUNCTION ge_capture.machine_grant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'immutable machine grant'; END IF;
 IF (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active')
 OR NOT OLD.active OR NEW.active THEN RAISE EXCEPTION 'machine grant may only be revoked once'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ge_stage_grant_guard BEFORE UPDATE OR DELETE ON ge_capture.machine_grants FOR EACH ROW EXECUTE FUNCTION ge_capture.machine_grant_guard();
CREATE TRIGGER ge_stage_grant_no_truncate BEFORE TRUNCATE ON ge_capture.machine_grants FOR EACH STATEMENT EXECUTE FUNCTION ge_capture.immutable();
CREATE FUNCTION ge_capture.batch_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable batch'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','project_uuid','binding_uuid']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','project_uuid','binding_uuid']) OR OLD.state<>'open' OR NEW.state NOT IN('halted','sealed') THEN RAISE EXCEPTION 'immutable batch authority'; END IF;
 RETURN NEW;
END $$;
CREATE TABLE ge_capture.batches(
 id text PRIMARY KEY, project_id text NOT NULL, binding_id text NOT NULL, account_id text NOT NULL,
 start_ms bigint NOT NULL, end_ms bigint NOT NULL, cutoff_ms bigint NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','halted','sealed')),
 CHECK(start_ms>=0 AND start_ms<end_ms AND end_ms<=cutoff_ms AND cutoff_ms<=9007199254740991),
 owner_name name NOT NULL, authority_generation bigint NOT NULL CHECK(authority_generation>0),
 lifecycle_version bigint NOT NULL CHECK(lifecycle_version>=0),
 project_uuid uuid GENERATED ALWAYS AS (project_id::uuid) STORED REFERENCES public.projects(id) ON DELETE RESTRICT,
 binding_uuid uuid GENERATED ALWAYS AS (binding_id::uuid) STORED REFERENCES public.social_account_bindings(binding_id) ON DELETE RESTRICT,
 UNIQUE(id,project_id,binding_id,account_id));
CREATE TABLE ge_capture.publications(
 batch_id text NOT NULL, project_id text NOT NULL, binding_id text NOT NULL, account_id text NOT NULL,
 acquisition_id uuid NOT NULL, script_id uuid NOT NULL, media_id text NOT NULL CHECK(media_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 start_ms bigint NOT NULL, end_ms bigint NOT NULL, recorded_ms bigint NOT NULL,
 evidence text NOT NULL DEFAULT 'unverified_local_interval' CHECK(evidence='unverified_local_interval'),
 PRIMARY KEY(batch_id,acquisition_id), UNIQUE(batch_id,script_id), UNIQUE(batch_id,media_id),
 UNIQUE(batch_id,acquisition_id,project_id,binding_id,account_id,script_id,media_id),
 FOREIGN KEY(batch_id,project_id,binding_id,account_id) REFERENCES ge_capture.batches(id,project_id,binding_id,account_id),
 CHECK(start_ms>=0 AND end_ms>=start_ms AND end_ms-start_ms<=120000 AND recorded_ms>=end_ms));
CREATE TABLE ge_capture.measurements(
 batch_id text NOT NULL, project_id text NOT NULL, binding_id text NOT NULL, account_id text NOT NULL,
 acquisition_id uuid NOT NULL, publication_acquisition_id uuid NOT NULL, script_id uuid NOT NULL, media_id text NOT NULL,
 start_ms bigint NOT NULL, end_ms bigint NOT NULL, recorded_ms bigint NOT NULL,
 lower_age_ms bigint NOT NULL, upper_age_ms bigint NOT NULL,
 views bigint CHECK(views BETWEEN 0 AND 9007199254740991), reach bigint CHECK(reach BETWEEN 0 AND 9007199254740991),
 saves bigint CHECK(saves BETWEEN 0 AND 9007199254740991), shares bigint CHECK(shares BETWEEN 0 AND 9007199254740991),
 evidence text NOT NULL DEFAULT 'unverified_local_interval' CHECK(evidence='unverified_local_interval'),
 provider_freshness text NOT NULL DEFAULT 'unknown' CHECK(provider_freshness='unknown'),
 PRIMARY KEY(batch_id,acquisition_id),
 FOREIGN KEY(batch_id,publication_acquisition_id,project_id,binding_id,account_id,script_id,media_id)
 REFERENCES ge_capture.publications(batch_id,acquisition_id,project_id,binding_id,account_id,script_id,media_id),
 CHECK(acquisition_id<>publication_acquisition_id),
 CHECK(start_ms>=0 AND end_ms>=start_ms AND end_ms-start_ms<=60000 AND recorded_ms>=end_ms),
 CHECK(lower_age_ms>=172800000 AND upper_age_ms<=194400000 AND lower_age_ms<=upper_age_ms));

CREATE TRIGGER capture_batch_guard BEFORE UPDATE OR DELETE ON ge_capture.batches FOR EACH ROW EXECUTE FUNCTION ge_capture.batch_guard();
CREATE TRIGGER capture_batch_no_truncate BEFORE TRUNCATE ON ge_capture.batches FOR EACH STATEMENT EXECUTE FUNCTION ge_capture.immutable();
CREATE TRIGGER capture_publications_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ge_capture.publications FOR EACH STATEMENT EXECUTE FUNCTION ge_capture.immutable();
CREATE TRIGGER capture_measurements_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON ge_capture.measurements FOR EACH STATEMENT EXECUTE FUNCTION ge_capture.immutable();
CREATE TABLE ge_outbox.jobs(
 batch_id text NOT NULL REFERENCES ge_capture.batches(id),
 event_key text NOT NULL CHECK(event_key ~ '^[a-z0-9-]{1,64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done','stopped','exhausted')),
 attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_token uuid,
 lease_until timestamptz,
 lease_login_oid oid,
 lease_login_name name,
 lease_grant_id uuid REFERENCES ge_capture.machine_grants(grant_id) ON DELETE RESTRICT,
 reason text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(batch_id,event_key),
 CHECK((state='leased')=(lease_token IS NOT NULL AND lease_until IS NOT NULL AND lease_login_oid IS NOT NULL AND lease_login_name IS NOT NULL AND lease_grant_id IS NOT NULL)),
 CHECK((state='leased') OR (lease_token IS NULL AND lease_until IS NULL AND lease_login_oid IS NULL AND lease_login_name IS NULL AND lease_grant_id IS NULL))
);

CREATE FUNCTION ge_outbox.guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable outbox'; END IF;
 IF ROW(NEW.batch_id,NEW.event_key,NEW.payload,NEW.created_at) IS DISTINCT FROM ROW(OLD.batch_id,OLD.event_key,OLD.payload,OLD.created_at)
 OR OLD.state IN ('done','stopped','exhausted') OR NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'immutable outbox'; END IF;
 IF OLD.state='leased' AND NEW.state='leased' AND OLD.attempts=NEW.attempts AND ROW(NEW.lease_token,NEW.lease_until,NEW.lease_login_oid,NEW.lease_login_name,NEW.lease_grant_id) IS DISTINCT FROM ROW(OLD.lease_token,OLD.lease_until,OLD.lease_login_oid,OLD.lease_login_name,OLD.lease_grant_id) THEN RAISE EXCEPTION 'immutable lease identity'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ge_outbox_guard BEFORE UPDATE OR DELETE ON ge_outbox.jobs FOR EACH ROW EXECUTE FUNCTION ge_outbox.guard();
CREATE TRIGGER ge_outbox_no_truncate BEFORE TRUNCATE ON ge_outbox.jobs FOR EACH STATEMENT EXECUTE FUNCTION ge_capture.immutable();


ALTER TABLE ge_capture.machine_grants ADD CONSTRAINT growth_release_inert CHECK(false);
ALTER TABLE ge_capture.batches ADD CONSTRAINT growth_release_inert CHECK(false);
ALTER TABLE ge_capture.publications ADD CONSTRAINT growth_release_inert CHECK(false);
ALTER TABLE ge_capture.measurements ADD CONSTRAINT growth_release_inert CHECK(false);
ALTER TABLE ge_outbox.jobs ADD CONSTRAINT growth_release_inert CHECK(false);

ALTER TABLE ge_capture.machine_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ge_capture.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ge_capture.publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ge_capture.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ge_outbox.jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ge_capture,ge_outbox FROM PUBLIC,anon,authenticated,service_role;
-- Internal no-login function owner has selected authority columns and lock
-- privilege on one column. WITH CHECK false prevents actual row updates.
GRANT USAGE ON SCHEMA ge_capture,ge_outbox,ge_delivery,ge_stage_api TO ge_capture_exec;
DO $usage$
BEGIN
 IF NOT pg_catalog.has_schema_privilege('ge_capture_exec','public','USAGE') THEN RAISE EXCEPTION 'existing public schema usage required'; END IF;
END $usage$;
GRANT SELECT(id,owner_id,slug,growth_authority_generation,execution_paused,atlas_mode), UPDATE(growth_authority_generation) ON public.projects TO ge_capture_exec;
GRANT SELECT(binding_id,project_id,platform,external_account_id,verification,blocked_at,superseded_at), UPDATE(verified_at) ON public.social_account_bindings TO ge_capture_exec;
-- Existing stop/lifecycle authority, selected columns and lock-only update privileges.
GRANT SELECT(id,automation_paused),UPDATE(automation_paused) ON public.platform_config TO ge_capture_exec;
GRANT SELECT(project_id,owner_id,state,version),UPDATE(version) ON public.project_lifecycle TO ge_capture_exec;
CREATE POLICY ge_stage_global_select ON public.platform_config FOR SELECT TO ge_capture_exec USING(id=1);
CREATE POLICY ge_stage_global_lock ON public.platform_config FOR UPDATE TO ge_capture_exec USING(id=1) WITH CHECK(false);
CREATE POLICY ge_stage_global_write_denied ON public.platform_config AS RESTRICTIVE FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_lifecycle_select ON public.project_lifecycle FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_lifecycle_lock ON public.project_lifecycle FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_lifecycle_write_denied ON public.project_lifecycle AS RESTRICTIVE FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_project_select ON public.projects FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_project_lock ON public.projects FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_project_write_denied ON public.projects AS RESTRICTIVE FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_binding_select ON public.social_account_bindings FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_binding_lock ON public.social_account_bindings FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_binding_write_denied ON public.social_account_bindings AS RESTRICTIVE FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
GRANT SELECT,UPDATE(active) ON ge_capture.machine_grants TO ge_capture_exec;
CREATE POLICY ge_stage_grant_select ON ge_capture.machine_grants FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_grant_lock ON ge_capture.machine_grants FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
CREATE POLICY ge_stage_grant_write_denied ON ge_capture.machine_grants AS RESTRICTIVE FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(false);
GRANT SELECT ON ge_capture.batches,ge_capture.publications,ge_capture.measurements,ge_outbox.jobs TO ge_capture_exec;
GRANT UPDATE(state) ON ge_capture.batches TO ge_capture_exec;
GRANT INSERT ON ge_capture.publications,ge_capture.measurements,ge_outbox.jobs TO ge_capture_exec;
GRANT UPDATE(state,attempts,lease_token,lease_until,lease_login_oid,lease_login_name,lease_grant_id,reason) ON ge_outbox.jobs TO ge_capture_exec;
CREATE POLICY ge_stage_batch_read ON ge_capture.batches FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_batch_update ON ge_capture.batches FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(state='halted');
CREATE POLICY ge_stage_pub_read ON ge_capture.publications FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_pub_insert ON ge_capture.publications FOR INSERT TO ge_capture_exec WITH CHECK(true);
CREATE POLICY ge_stage_measure_read ON ge_capture.measurements FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_measure_insert ON ge_capture.measurements FOR INSERT TO ge_capture_exec WITH CHECK(true);
CREATE POLICY ge_stage_job_read ON ge_outbox.jobs FOR SELECT TO ge_capture_exec USING(true);
CREATE POLICY ge_stage_job_insert ON ge_outbox.jobs FOR INSERT TO ge_capture_exec WITH CHECK(true);
CREATE POLICY ge_stage_job_update ON ge_outbox.jobs FOR UPDATE TO ge_capture_exec USING(true) WITH CHECK(true);
-- Lock principal -> platform stop -> project -> lifecycle -> binding -> batch -> job. FOR SHARE conflicts
-- with actual owner updates, binding block/rebind and principal revocation.
CREATE FUNCTION ge_capture.lock_batch(batch text,project text,binding text,account text,owner_name_arg name)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d ge_capture.batches%ROWTYPE;
BEGIN
 SELECT * INTO d FROM ge_capture.batches x WHERE x.id=batch AND (x.project_id,x.binding_id,x.account_id,x.owner_name)=(project,binding,account,owner_name_arg);
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.platform_config g WHERE g.id=1 AND g.automation_paused IS FALSE FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.projects p WHERE p.id=d.project_uuid AND p.owner_id::text=d.owner_name::text AND p.growth_authority_generation=d.authority_generation AND p.slug='ai-media-automation' AND p.execution_paused IS FALSE AND p.atlas_mode='active' FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.project_lifecycle l WHERE l.project_id=d.project_uuid AND l.owner_id::text=d.owner_name::text AND l.state='active' AND l.version=d.lifecycle_version FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.social_account_bindings x WHERE x.binding_id=d.binding_uuid AND x.project_id=d.project_uuid AND x.external_account_id=d.account_id AND x.platform='instagram' AND x.verification='provider_attested' AND x.blocked_at IS NULL AND x.superseded_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM ge_capture.batches x WHERE x.id=batch AND x.authority_generation=d.authority_generation FOR UPDATE;
 RETURN FOUND;
END $$;
CREATE FUNCTION ge_outbox.scope_ok(b text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d ge_capture.batches%ROWTYPE;
BEGIN
 SELECT * INTO d FROM ge_capture.batches WHERE id=b;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN ge_capture.lock_batch(b,d.project_id,d.binding_id,d.account_id,d.owner_name);
END $$;
CREATE FUNCTION ge_capture.machine_scope(b text,k text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d ge_capture.batches%ROWTYPE;
BEGIN
 SELECT * INTO d FROM ge_capture.batches WHERE id=b;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM ge_capture.machine_grants m WHERE m.login_name=session_user AND m.login_oid=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user) AND m.purpose=k AND m.active AND m.project_id=d.project_uuid AND m.binding_id=d.binding_uuid AND m.authority_generation=d.authority_generation FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN ge_outbox.scope_ok(b);
END $$;
-- Caller must be the actual scoped login; the outer API has locked its grant.
CREATE FUNCTION ge_capture.worker_grant(b text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE g uuid;
BEGIN
 SELECT m.grant_id INTO g FROM ge_capture.machine_grants m
 JOIN ge_capture.batches d ON d.project_uuid=m.project_id AND d.binding_uuid=m.binding_id AND d.authority_generation=m.authority_generation
 WHERE d.id=b AND m.login_name=session_user AND m.login_oid=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user)
 AND m.purpose='worker' AND m.active FOR SHARE OF m;
 RETURN g;
END $$;
CREATE FUNCTION ge_capture.record_publication(batch text,project text,binding text,account text,owner_name_arg name,
 aid uuid,sid uuid,mid text,lo bigint,hi bigint)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b ge_capture.batches%ROWTYPE; old ge_capture.publications%ROWTYPE; recorded bigint;
BEGIN
 IF NOT ge_capture.lock_batch(batch,project,binding,account,owner_name_arg) THEN RETURN 'denied_scope'; END IF;
 SELECT * INTO b FROM ge_capture.batches WHERE id=batch;
 IF b.state<>'open' THEN RETURN b.state; END IF;
 IF aid IS NULL OR sid IS NULL OR mid IS NULL OR mid !~ '^[A-Za-z0-9_-]{1,128}$' OR lo IS NULL OR hi IS NULL
 OR lo<b.start_ms OR hi>=b.end_ms OR hi<lo OR hi-lo>120000 THEN RETURN 'invalid_interval'; END IF;
 recorded:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 IF hi>recorded THEN RETURN 'invalid_interval'; END IF;
 SELECT * INTO old FROM ge_capture.publications WHERE batch_id=batch AND acquisition_id=aid;
 IF FOUND THEN
  IF ROW(old.script_id,old.media_id,old.start_ms,old.end_ms) IS NOT DISTINCT FROM ROW(sid,mid,lo,hi) THEN RETURN 'replay'; END IF;
  UPDATE ge_capture.batches SET state='halted' WHERE id=batch; RETURN 'conflict';
 END IF;
 IF recorded>b.cutoff_ms THEN RETURN 'after_cutoff'; END IF;
 IF EXISTS(SELECT 1 FROM ge_capture.publications WHERE batch_id=batch AND (script_id=sid OR media_id=mid)) THEN
  UPDATE ge_capture.batches SET state='halted' WHERE id=batch; RETURN 'conflict'; END IF;
 IF (SELECT count(*) FROM ge_capture.publications WHERE batch_id=batch)>=200 THEN
  UPDATE ge_capture.batches SET state='halted' WHERE id=batch; RETURN 'capacity'; END IF;
 INSERT INTO ge_capture.publications(batch_id,project_id,binding_id,account_id,acquisition_id,script_id,media_id,start_ms,end_ms,recorded_ms)
 VALUES(batch,project,binding,account,aid,sid,mid,lo,hi,recorded);
 RETURN 'retained_unverified';
END $$;
CREATE FUNCTION ge_capture.record_measurement(batch text,project text,binding text,account text,owner_name_arg name,
 aid uuid,pid uuid,sid uuid,mid text,lo bigint,hi bigint,v bigint,r bigint,sa bigint,sh bigint)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b ge_capture.batches%ROWTYPE; p ge_capture.publications%ROWTYPE; old ge_capture.measurements%ROWTYPE; recorded bigint; lower_age bigint; upper_age bigint;
BEGIN
 IF NOT ge_capture.lock_batch(batch,project,binding,account,owner_name_arg) THEN RETURN 'denied_scope'; END IF;
 SELECT * INTO b FROM ge_capture.batches WHERE id=batch;
 IF b.state<>'open' THEN RETURN b.state; END IF;
 SELECT * INTO p FROM ge_capture.publications x WHERE (x.batch_id,x.acquisition_id,x.script_id,x.media_id)=(batch,pid,sid,mid);
 IF NOT FOUND THEN RETURN 'publication_missing'; END IF;
 IF aid IS NULL OR aid=pid OR lo IS NULL OR hi IS NULL OR lo<p.end_ms OR hi<lo OR hi-lo>60000 THEN RETURN 'invalid_interval'; END IF;
 recorded:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 IF hi>recorded THEN RETURN 'invalid_interval'; END IF;
 lower_age:=lo-p.end_ms; upper_age:=hi-p.start_ms;
 IF lower_age<172800000 OR upper_age>194400000 THEN RETURN 'outside_window'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[v,r,sa,sh]) n WHERE n<0 OR n>9007199254740991) THEN RETURN 'invalid_metrics'; END IF;
 SELECT * INTO old FROM ge_capture.measurements WHERE batch_id=batch AND acquisition_id=aid;
 IF FOUND THEN
  IF ROW(old.publication_acquisition_id,old.script_id,old.media_id,old.start_ms,old.end_ms,old.views,old.reach,old.saves,old.shares)
  IS NOT DISTINCT FROM ROW(pid,sid,mid,lo,hi,v,r,sa,sh) THEN RETURN 'replay'; END IF;
  UPDATE ge_capture.batches SET state='halted' WHERE id=batch; RETURN 'conflict';
 END IF;
 IF recorded>b.cutoff_ms THEN RETURN 'after_cutoff'; END IF;
 IF (SELECT count(*) FROM ge_capture.measurements WHERE batch_id=batch)>=800 THEN
  UPDATE ge_capture.batches SET state='halted' WHERE id=batch; RETURN 'capacity'; END IF;
 INSERT INTO ge_capture.measurements(batch_id,project_id,binding_id,account_id,acquisition_id,publication_acquisition_id,script_id,media_id,
 start_ms,end_ms,recorded_ms,lower_age_ms,upper_age_ms,views,reach,saves,shares)
 VALUES(batch,project,binding,account,aid,pid,sid,mid,lo,hi,recorded,lower_age,upper_age,v,r,sa,sh);
 RETURN 'retained_unverified';
END $$;

CREATE FUNCTION ge_outbox.enqueue_internal(b text,k text,p jsonb) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE old ge_outbox.jobs%ROWTYPE; batch ge_capture.batches%ROWTYPE;
BEGIN
 IF NOT ge_outbox.scope_ok(b) THEN RETURN 'denied_scope'; END IF;
 SELECT * INTO batch FROM ge_capture.batches WHERE id=b;
 IF batch.state<>'open' THEN RETURN 'batch_closed'; END IF;
 IF k IS NULL OR k !~ '^[a-z0-9-]{1,64}$' OR p IS NULL OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>65536
 OR p#>>'{target,batchId}' IS DISTINCT FROM b
 OR p#>>'{target,projectId}' IS DISTINCT FROM batch.project_id
 OR p#>>'{target,bindingId}' IS DISTINCT FROM batch.binding_id
 OR p#>>'{target,accountId}' IS DISTINCT FROM batch.account_id
 OR p#>>'{target,owner}' IS DISTINCT FROM batch.owner_name::text THEN RETURN 'invalid_payload'; END IF;
 SELECT * INTO old FROM ge_outbox.jobs WHERE batch_id=b AND event_key=k FOR UPDATE;
 IF FOUND THEN
  IF old.payload=p THEN RETURN 'replay'; END IF;
  IF old.state IN ('pending','leased') THEN UPDATE ge_outbox.jobs SET state='stopped',lease_token=NULL,lease_until=NULL,lease_login_oid=NULL,lease_login_name=NULL,lease_grant_id=NULL,reason='enqueue_conflict' WHERE batch_id=b AND event_key=k; END IF;
  RETURN 'conflict';
 END IF;
 IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>batch.cutoff_ms THEN RETURN 'after_cutoff'; END IF;
 IF (SELECT count(*) FROM ge_outbox.jobs WHERE batch_id=b)>=16 THEN RETURN 'capacity'; END IF;
 INSERT INTO ge_outbox.jobs(batch_id,event_key,payload) VALUES(b,k,p);
 RETURN 'queued';
END $$;

CREATE FUNCTION ge_outbox.exact_keys(v jsonb, ks text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(v)='object' AND v ?& ks AND v-ks='{}'::jsonb,false)
$$;
CREATE FUNCTION ge_outbox.is_safe_int(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(v)='number' THEN
  (v::text)::numeric BETWEEN 0 AND 9007199254740991 AND trunc((v::text)::numeric)=(v::text)::numeric
 ELSE false END
$$;
CREATE FUNCTION ge_outbox.is_uuid(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND (v#>>'{}') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 AND (v#>>'{}')<>'00000000-0000-0000-0000-000000000000',false)
$$;

-- Defense in depth for already minimized adapter envelopes. Reject unknown fields
-- before persistence, and recheck linkage and ages; never trust labels as provenance.
CREATE FUNCTION ge_outbox.valid_envelope(b text,p jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE batch ge_capture.batches%ROWTYPE; t jsonb; s jsonb; c jsonb; pub jsonb; k text;
 ids text[]:=ARRAY[]::text[]; scripts text[]:=ARRAY[]::text[]; media text[]:=ARRAY[]::text[];
 pubmap jsonb:='{}'::jsonb; aid text; sid text; mid text; lo bigint; hi bigint;
BEGIN
 SELECT * INTO batch FROM ge_capture.batches WHERE id=b;
 IF NOT FOUND OR p IS NULL OR octet_length(p::text)>65536 OR NOT ge_outbox.exact_keys(p,ARRAY['target','snapshot']) THEN RETURN false; END IF;
 t:=p->'target';s:=p->'snapshot';
 IF NOT ge_outbox.exact_keys(t,ARRAY['projectId','bindingId','accountId','platform','batchId','owner','startMs','endMs'])
 OR t->'projectId' IS DISTINCT FROM to_jsonb(batch.project_id)
 OR t->'bindingId' IS DISTINCT FROM to_jsonb(batch.binding_id)
 OR t->'accountId' IS DISTINCT FROM to_jsonb(batch.account_id)
 OR t->'platform' IS DISTINCT FROM '"instagram"'::jsonb OR t->'batchId' IS DISTINCT FROM to_jsonb(b)
 OR t->'owner' IS DISTINCT FROM to_jsonb(batch.owner_name::text)
 OR t->'startMs' IS DISTINCT FROM to_jsonb(batch.start_ms) OR t->'endMs' IS DISTINCT FROM to_jsonb(batch.end_ms) THEN RETURN false; END IF;
 IF NOT ge_outbox.exact_keys(s,ARRAY['mode','halted','publications','measurements','authorizesPilot'])
 OR s->'mode' IS DISTINCT FROM '"local_unverified_only"'::jsonb OR s->'halted' IS DISTINCT FROM 'false'::jsonb
 OR s->'authorizesPilot' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(s->'publications') IS DISTINCT FROM 'array'
 OR jsonb_typeof(s->'measurements') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(s->'publications') NOT BETWEEN 1 AND 200 OR jsonb_array_length(s->'measurements')>800 THEN RETURN false; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(s->'publications') LOOP
  IF NOT ge_outbox.exact_keys(c,ARRAY['projectId','bindingId','accountId','platform','kind','evidence','scriptId','mediaId','acquisitionId','startMs','endMs'])
  OR c->'kind' IS DISTINCT FROM '"publication_interval_candidate"'::jsonb
  OR c->'evidence' IS DISTINCT FROM '"unverified_local_interval"'::jsonb
  OR NOT ge_outbox.is_uuid(c->'acquisitionId') OR NOT ge_outbox.is_uuid(c->'scriptId')
  OR jsonb_typeof(c->'mediaId') IS DISTINCT FROM 'string' OR (c->>'mediaId') !~ '^[A-Za-z0-9_-]{1,128}$'
  OR NOT ge_outbox.is_safe_int(c->'startMs') OR NOT ge_outbox.is_safe_int(c->'endMs') THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['projectId','bindingId','accountId','platform'] LOOP
   IF c->k IS DISTINCT FROM t->k THEN RETURN false; END IF;
  END LOOP;
  aid:=c->>'acquisitionId';sid:=c->>'scriptId';mid:=c->>'mediaId';lo:=(c->>'startMs')::numeric::bigint;hi:=(c->>'endMs')::numeric::bigint;
  IF aid=ANY(ids) OR sid=ANY(scripts) OR mid=ANY(media) OR lo<batch.start_ms OR hi>=batch.end_ms OR hi<lo OR hi-lo>120000 THEN RETURN false; END IF;
  ids:=array_append(ids,aid);scripts:=array_append(scripts,sid);media:=array_append(media,mid);
  pubmap:=pubmap||jsonb_build_object(aid,c);
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(s->'measurements') LOOP
  IF NOT ge_outbox.exact_keys(c,ARRAY['projectId','bindingId','accountId','platform','kind','evidence','scriptId','mediaId','acquisitionId','publicationAcquisitionId','requestStartMs','responseEndMs','lowerAgeMs','upperAgeMs','views','reach','saves','shares','providerFreshness','requiresTrustedSource'])
  OR c->'kind' IS DISTINCT FROM '"measurement_interval_candidate"'::jsonb OR c->'evidence' IS DISTINCT FROM '"unverified_local_interval"'::jsonb
  OR c->'providerFreshness' IS DISTINCT FROM '"unknown"'::jsonb OR c->'requiresTrustedSource' IS DISTINCT FROM 'true'::jsonb
  OR NOT ge_outbox.is_uuid(c->'acquisitionId') OR NOT ge_outbox.is_uuid(c->'publicationAcquisitionId')
  OR NOT ge_outbox.is_safe_int(c->'requestStartMs') OR NOT ge_outbox.is_safe_int(c->'responseEndMs')
  OR NOT ge_outbox.is_safe_int(c->'lowerAgeMs') OR NOT ge_outbox.is_safe_int(c->'upperAgeMs') THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['projectId','bindingId','accountId','platform'] LOOP
   IF c->k IS DISTINCT FROM t->k THEN RETURN false; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['views','reach','saves','shares'] LOOP
   IF c->k IS DISTINCT FROM 'null'::jsonb AND NOT ge_outbox.is_safe_int(c->k) THEN RETURN false; END IF;
  END LOOP;
  aid:=c->>'acquisitionId';pub:=pubmap->(c->>'publicationAcquisitionId');
  IF aid=ANY(ids) OR pub IS NULL OR c->'scriptId' IS DISTINCT FROM pub->'scriptId' OR c->'mediaId' IS DISTINCT FROM pub->'mediaId' THEN RETURN false; END IF;
  lo:=(c->>'requestStartMs')::numeric::bigint;hi:=(c->>'responseEndMs')::numeric::bigint;
  IF hi<lo OR hi-lo>60000 OR lo-(pub->>'endMs')::numeric::bigint<172800000 OR hi-(pub->>'startMs')::numeric::bigint>194400000
  OR c->'lowerAgeMs' IS DISTINCT FROM to_jsonb(lo-(pub->>'endMs')::numeric::bigint)
  OR c->'upperAgeMs' IS DISTINCT FROM to_jsonb(hi-(pub->>'startMs')::numeric::bigint) THEN RETURN false; END IF;
  ids:=array_append(ids,aid);
 END LOOP;
 RETURN true;
EXCEPTION WHEN data_exception THEN RETURN false;
END $$;


CREATE FUNCTION ge_delivery.claim(b text,k text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j ge_outbox.jobs%ROWTYPE; batch ge_capture.batches%ROWTYPE; allowed boolean; now_at timestamptz; token uuid; claimant uuid; claimant_oid oid;
BEGIN
 IF b IS NULL OR b !~ '^[A-Za-z0-9_-]{1,128}$' OR k IS NULL OR k !~ '^[a-z0-9-]{1,64}$' THEN RETURN jsonb_build_object('status','denied_scope'); END IF;
 claimant:=ge_capture.worker_grant(b);
 IF claimant IS NULL THEN RETURN jsonb_build_object('status','denied_scope'); END IF;
 claimant_oid:=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user);
 allowed:=ge_outbox.scope_ok(b);
 SELECT * INTO j FROM ge_outbox.jobs WHERE batch_id=b AND event_key=k FOR UPDATE;
 IF NOT allowed THEN
  IF FOUND AND j.state IN('pending','leased') THEN UPDATE ge_outbox.jobs SET state='stopped',reason='denied_scope',lease_token=NULL,lease_until=NULL,lease_login_oid=NULL,lease_login_name=NULL,lease_grant_id=NULL WHERE batch_id=b AND event_key=k; END IF;
  RETURN jsonb_build_object('status','denied_scope');
 END IF;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
 IF j.state IN('done','stopped','exhausted') THEN RETURN jsonb_build_object('status',j.state); END IF;
 now_at:=clock_timestamp();
 SELECT * INTO batch FROM ge_capture.batches WHERE id=b;
 IF batch.state<>'open' OR floor(extract(epoch FROM now_at)*1000)::bigint>batch.cutoff_ms THEN
  UPDATE ge_outbox.jobs SET state='stopped',reason='batch_or_cutoff',lease_token=NULL,lease_until=NULL,lease_login_oid=NULL,lease_login_name=NULL,lease_grant_id=NULL WHERE batch_id=b AND event_key=k;
  RETURN jsonb_build_object('status','stopped','reason','batch_or_cutoff');
 END IF;
 IF j.state='leased' AND j.lease_until>now_at THEN RETURN jsonb_build_object('status','busy'); END IF;
 IF j.attempts>=3 THEN
  UPDATE ge_outbox.jobs SET state='exhausted',reason='attempt_limit_uncertain',lease_token=NULL,lease_until=NULL,lease_login_oid=NULL,lease_login_name=NULL,lease_grant_id=NULL WHERE batch_id=b AND event_key=k;
  RETURN jsonb_build_object('status','exhausted');
 END IF;
 token:=gen_random_uuid();
 UPDATE ge_outbox.jobs SET state='leased',attempts=attempts+1,lease_token=token,lease_until=now_at+interval '8 seconds',lease_login_oid=claimant_oid,lease_login_name=session_user,lease_grant_id=claimant,reason=NULL WHERE batch_id=b AND event_key=k;
 RETURN jsonb_build_object('status','claimed','token',token,'attempt',j.attempts+1);
END $$;

-- One transaction: lock project/binding/batch/job, check lease after locks,
-- read stored envelope, write only its candidates, mark done with them.
-- Nested exception block rolls back this delivery's writes on a refusal/expiry.
-- Earlier committed rows never undone. Commit instant itself is not fenced.
-- RUN29b correction: all delivery-side state changes are fenced, including refusal.
-- Same transaction and ordered locks. Last check is before return, not commit time.
CREATE FUNCTION ge_delivery.deliver(b text,k text,token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j ge_outbox.jobs%ROWTYPE; batch ge_capture.batches%ROWTYPE; allowed boolean;
 claimant uuid; claimant_oid oid; c jsonb; r text; failure text; kept int:=0; replayed int:=0; answer jsonb;
BEGIN
 IF b IS NULL OR b !~ '^[A-Za-z0-9_-]{1,128}$' OR k IS NULL OR k !~ '^[a-z0-9-]{1,64}$' OR token IS NULL THEN RETURN jsonb_build_object('status','denied_scope'); END IF;
 claimant:=ge_capture.worker_grant(b);
 IF claimant IS NULL THEN RETURN jsonb_build_object('status','denied_scope'); END IF;
 claimant_oid:=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=session_user);
 allowed:=ge_outbox.scope_ok(b);
 SELECT * INTO j FROM ge_outbox.jobs WHERE batch_id=b AND event_key=k FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',CASE WHEN allowed THEN 'missing' ELSE 'denied_scope' END); END IF;
 IF j.state IN('done','stopped','exhausted') THEN RETURN jsonb_build_object('status',CASE WHEN allowed THEN j.state ELSE 'denied_scope' END); END IF;
 IF j.state<>'leased' OR j.lease_token IS DISTINCT FROM token OR j.lease_login_oid IS DISTINCT FROM claimant_oid OR j.lease_login_name IS DISTINCT FROM session_user OR j.lease_grant_id IS DISTINCT FROM claimant OR j.lease_until<=clock_timestamp() THEN
  RETURN jsonb_build_object('status',CASE WHEN allowed THEN 'stale_claim' ELSE 'denied_scope' END);
 END IF;
 -- All state mutations including refusals are inside this outer rollback fence.
 BEGIN
  IF NOT allowed THEN
   failure:='denied_scope';
  ELSE
   SELECT * INTO batch FROM ge_capture.batches WHERE id=b;
   IF batch.state<>'open' OR floor(extract(epoch FROM clock_timestamp())*1000)::bigint>batch.cutoff_ms THEN
    failure:='batch_or_cutoff';
   ELSIF NOT ge_outbox.valid_envelope(b,j.payload) THEN
    failure:='invalid_payload';
   ELSE
    -- A known destination refusal rolls back the newly inserted prefix only.
    -- Unknown replies/errors propagate out and roll back the entire statement.
    BEGIN
     FOR c IN SELECT value FROM jsonb_array_elements((j.payload#>'{snapshot,publications}')||(j.payload#>'{snapshot,measurements}')) LOOP
      IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P2901',MESSAGE='delivery lease expired'; END IF;
      IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>batch.cutoff_ms THEN failure:='batch_or_cutoff';RAISE EXCEPTION USING ERRCODE='P2902',MESSAGE='delivery refused'; END IF;
      IF c->>'kind'='publication_interval_candidate' THEN
       r:=ge_capture.record_publication(b,batch.project_id,batch.binding_id,batch.account_id,batch.owner_name,(c->>'acquisitionId')::uuid,(c->>'scriptId')::uuid,c->>'mediaId',(c->>'startMs')::numeric::bigint,(c->>'endMs')::numeric::bigint);
      ELSE
       r:=ge_capture.record_measurement(b,batch.project_id,batch.binding_id,batch.account_id,batch.owner_name,(c->>'acquisitionId')::uuid,(c->>'publicationAcquisitionId')::uuid,(c->>'scriptId')::uuid,c->>'mediaId',
        (c->>'requestStartMs')::numeric::bigint,(c->>'responseEndMs')::numeric::bigint,(c->>'views')::numeric::bigint,(c->>'reach')::numeric::bigint,(c->>'saves')::numeric::bigint,(c->>'shares')::numeric::bigint);
      END IF;
      IF r='retained_unverified' THEN kept:=kept+1;
      ELSIF r='replay' THEN replayed:=replayed+1;
      ELSIF r IN('denied_scope','invalid_interval','publication_missing','outside_window','invalid_metrics','conflict','capacity','after_cutoff','halted','sealed') THEN
       failure:=r;RAISE EXCEPTION USING ERRCODE='P2902',MESSAGE='delivery refused';
      ELSE RAISE EXCEPTION USING ERRCODE='P2903',MESSAGE='unexpected capture reply'; END IF;
     END LOOP;
     IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P2901',MESSAGE='delivery lease expired'; END IF;
     IF floor(extract(epoch FROM clock_timestamp())*1000)::bigint>batch.cutoff_ms THEN failure:='batch_or_cutoff';RAISE EXCEPTION USING ERRCODE='P2902',MESSAGE='delivery refused'; END IF;
    EXCEPTION WHEN SQLSTATE 'P2902' THEN
     IF failure IS NULL THEN RAISE; END IF;
    END;
   END IF;
  END IF;
  -- Includes validation refusal, cutoff refusal and delayed capture refusal.
  IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P2901',MESSAGE='delivery lease expired'; END IF;
  IF failure IS NULL THEN
   UPDATE ge_outbox.jobs SET state='done',reason='complete_unverified',lease_token=NULL,lease_until=NULL,lease_login_oid=NULL,lease_login_name=NULL,lease_grant_id=NULL WHERE batch_id=b AND event_key=k;
   answer:=jsonb_build_object('status','done','retained',kept,'replayed',replayed,'authorizesPilot',false);
  ELSE
   IF failure IN('conflict','capacity') THEN
    UPDATE ge_capture.batches SET state='halted' WHERE id=b AND state='open';
   END IF;
   IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P2901',MESSAGE='delivery lease expired'; END IF;
   UPDATE ge_outbox.jobs SET state='stopped',reason=failure,lease_token=NULL,lease_until=NULL,lease_login_oid=NULL,lease_login_name=NULL,lease_grant_id=NULL WHERE batch_id=b AND event_key=k;
   IF failure='denied_scope' THEN answer:=jsonb_build_object('status','denied_scope');
   ELSIF failure='batch_or_cutoff' THEN answer:=jsonb_build_object('status','stopped','reason',failure);
   ELSE answer:=jsonb_build_object('status','stopped','reason',failure,'retained',0,'authorizesPilot',false); END IF;
  END IF;
  -- If mutation itself crossed expiry, roll back both job/batch and evidence.
  IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P2901',MESSAGE='delivery lease expired'; END IF;
 EXCEPTION WHEN SQLSTATE 'P2901' THEN
  RETURN jsonb_build_object('status',CASE WHEN allowed THEN 'stale_claim' ELSE 'denied_scope' END);
 END;
 RETURN answer;
END $$;


-- Security boundary: only these functions callable by machine logins.
CREATE FUNCTION ge_stage_api.enqueue(b text,k text,p jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT ge_capture.machine_scope(b,'ingress') THEN RETURN 'denied_scope'; END IF;
 IF NOT ge_outbox.valid_envelope(b,p) THEN RETURN 'invalid_payload'; END IF;
 RETURN ge_outbox.enqueue_internal(b,k,p);
END $$;
CREATE FUNCTION ge_stage_api.claim(b text,k text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT ge_capture.machine_scope(b,'worker') THEN RETURN jsonb_build_object('status','denied_scope'); END IF;
 RETURN ge_delivery.claim(b,k);
END $$;
CREATE FUNCTION ge_stage_api.deliver(b text,k text,t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT ge_capture.machine_scope(b,'worker') THEN RETURN jsonb_build_object('status','denied_scope'); END IF;
 RETURN ge_delivery.deliver(b,k,t);
END $$;

-- Revoke while the migration role still owns each function.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ge_capture,ge_outbox,ge_delivery,ge_stage_api FROM PUBLIC,anon,authenticated,service_role,authenticator;
GRANT CREATE ON SCHEMA ge_delivery,ge_stage_api TO ge_capture_exec;
ALTER FUNCTION ge_delivery.claim(text,text) OWNER TO ge_capture_exec;
ALTER FUNCTION ge_delivery.deliver(text,text,uuid) OWNER TO ge_capture_exec;
ALTER FUNCTION ge_stage_api.enqueue(text,text,jsonb) OWNER TO ge_capture_exec;
ALTER FUNCTION ge_stage_api.claim(text,text) OWNER TO ge_capture_exec;
ALTER FUNCTION ge_stage_api.deliver(text,text,uuid) OWNER TO ge_capture_exec;
REVOKE CREATE ON SCHEMA ge_delivery,ge_stage_api FROM ge_capture_exec;
-- Remove only the temporary self-grant. The bootstrap admin-only grant stays.
REVOKE ge_capture_exec FROM postgres GRANTED BY postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ge_capture,ge_outbox TO ge_capture_exec;


-- Reject unexpected direct ACL entries (including target-specific default ACLs).
-- Owner privileges are implicit; only reviewed internal NOLOGIN role is allowed.
DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='ge_capture_exec' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolinherit))
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member JOIN pg_catalog.pg_roles g ON g.oid=m.grantor WHERE r.rolname='ge_capture_exec' AND u.rolname='postgres' AND g.rolsuper AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)<>1
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.member OR r.oid=m.roleid WHERE r.rolname='ge_capture_exec' AND NOT (m.roleid=r.oid AND m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres') AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND m.grantor IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolsuper))) THEN
  RAISE EXCEPTION 'Growth internal role is not isolated';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
 WHERE n.nspname IN('ge_authority_private','ge_capture','ge_outbox','ge_delivery','ge_stage_api')
 AND x.grantee<>n.nspowner AND x.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='ge_capture_exec')) THEN RAISE EXCEPTION 'unexpected Growth schema ACL'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
 WHERE n.nspname IN('ge_capture','ge_outbox','ge_delivery','ge_stage_api','ge_authority_private') AND c.relkind IN('r','p','v','m')
 AND x.grantee<>c.relowner AND x.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='ge_capture_exec')) THEN RAISE EXCEPTION 'unexpected Growth relation ACL'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
 WHERE n.nspname IN('ge_capture','ge_outbox','ge_delivery','ge_stage_api','ge_authority_private')
 AND x.grantee<>p.proowner AND x.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='ge_capture_exec') AND x.grantee<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) THEN RAISE EXCEPTION 'unexpected Growth function ACL'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role'),('authenticator')) r(role_name)
 CROSS JOIN (VALUES ('ge_authority_private'),('ge_capture'),('ge_outbox'),('ge_delivery'),('ge_stage_api')) n(schema_name)
 WHERE pg_catalog.has_schema_privilege(r.role_name,n.schema_name,'USAGE') OR pg_catalog.has_schema_privilege(r.role_name,n.schema_name,'CREATE')) THEN
  RAISE EXCEPTION 'unexpected effective client schema privilege';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role'),('authenticator')) r(role_name)
 CROSS JOIN (VALUES ('ge_stage_api.enqueue(text,text,jsonb)'),('ge_stage_api.claim(text,text)'),('ge_stage_api.deliver(text,text,uuid)')) f(sig)
 WHERE pg_catalog.has_function_privilege(r.role_name,f.sig,'EXECUTE')) THEN
  RAISE EXCEPTION 'unexpected effective client RPC privilege';
 END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
 WHERE n.nspname IN('ge_capture','ge_outbox') AND c.conname='growth_release_inert' AND c.contype='c' AND c.convalidated AND pg_catalog.pg_get_constraintdef(c.oid)='CHECK (false)')<>5
 THEN RAISE EXCEPTION 'Growth inert barriers missing'; END IF;
 IF EXISTS(SELECT 1 FROM ge_capture.machine_grants) OR EXISTS(SELECT 1 FROM ge_capture.batches) THEN
  RAISE EXCEPTION 'Growth must be empty and inactive';
 END IF;
END $check$;

COMMIT;
