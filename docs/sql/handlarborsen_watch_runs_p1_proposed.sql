-- PROPOSED ONLY: separate operator approval required. No schedule, dispatch or spend authority.
BEGIN;
CREATE TABLE public.handlarborsen_watch_runs (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT
   CHECK(project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid),
 kind text NOT NULL DEFAULT 'known_sources_weekly' CHECK(kind='known_sources_weekly'),
 period_start date NOT NULL CHECK(period_start BETWEEN DATE '2000-01-03' AND DATE '2099-12-28' AND EXTRACT(isodow FROM period_start)=1),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','uncertain')),
 revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 claim_token uuid,
 claimed_at timestamptz,
 lease_until timestamptz,
 finished_at timestamptz,
 outcome_code text,
 http_request_count integer CHECK(http_request_count BETWEEN 0 AND 10),
 evidence_digest text CHECK(evidence_digest IS NULL OR evidence_digest ~ '^[a-f0-9]{64}$'),
 completion_digest text CHECK(completion_digest IS NULL OR completion_digest ~ '^[a-f0-9]{64}$'),
 UNIQUE(project_id,kind,period_start),
 UNIQUE(id,project_id),
 CHECK(updated_at>=created_at),
 CHECK(claimed_at IS NULL OR claimed_at>=created_at),
 CHECK(lease_until IS NULL OR (claimed_at IS NOT NULL AND lease_until>claimed_at AND lease_until<=claimed_at+interval '180 seconds')),
 CHECK(finished_at IS NULL OR (claimed_at IS NOT NULL AND finished_at>=claimed_at)),
 CHECK(
  (status='queued' AND revision=0 AND claim_token IS NULL AND claimed_at IS NULL AND lease_until IS NULL AND finished_at IS NULL AND outcome_code IS NULL AND http_request_count IS NULL AND evidence_digest IS NULL AND completion_digest IS NULL)
  OR
  (status='running' AND revision=1 AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NULL AND outcome_code IS NULL AND http_request_count IS NULL AND evidence_digest IS NULL AND completion_digest IS NULL)
  OR
  (status IN ('succeeded','failed') AND revision=2 AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NOT NULL AND outcome_code IS NOT NULL AND http_request_count IS NOT NULL AND completion_digest IS NOT NULL AND
   ((status='succeeded' AND outcome_code='verified' AND evidence_digest IS NOT NULL) OR
    (status='failed' AND outcome_code='source_unavailable') OR
    (status='failed' AND outcome_code IN ('gate_refused','cancelled') AND http_request_count=0 AND evidence_digest IS NULL)))
  OR
  (status='uncertain' AND revision=2 AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND lease_until IS NOT NULL AND finished_at IS NOT NULL AND outcome_code IS NOT NULL AND outcome_code='lease_expired' AND http_request_count IS NULL AND evidence_digest IS NULL AND completion_digest IS NULL)
 )
);
CREATE UNIQUE INDEX handlarborsen_watch_one_active ON public.handlarborsen_watch_runs(project_id) WHERE status IN ('running','uncertain');
CREATE TABLE public.handlarborsen_watch_run_events (
 run_id uuid NOT NULL,
 project_id uuid NOT NULL CHECK(project_id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid),
 revision integer NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','uncertain')),
 observed_at timestamptz NOT NULL,
 outcome_code text,
 http_request_count integer CHECK(http_request_count BETWEEN 0 AND 10),
 evidence_digest text CHECK(evidence_digest IS NULL OR evidence_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(run_id,revision),
 FOREIGN KEY(run_id,project_id) REFERENCES public.handlarborsen_watch_runs(id,project_id) ON DELETE RESTRICT,
 CHECK(revision=CASE state WHEN 'queued' THEN 0 WHEN 'running' THEN 1 ELSE 2 END)
);
ALTER TABLE public.handlarborsen_watch_runs OWNER TO postgres;
ALTER TABLE public.handlarborsen_watch_run_events OWNER TO postgres;
ALTER TABLE public.handlarborsen_watch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_watch_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_watch_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_watch_run_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.handlarborsen_watch_runs,public.handlarborsen_watch_run_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.handlarborsen_watch_runs,public.handlarborsen_watch_run_events TO service_role;

CREATE FUNCTION public.handlarborsen_watch_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'WATCH_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'queued' OR NEW.revision<>0 THEN RAISE EXCEPTION 'WATCH_MUST_QUEUE' USING ERRCODE='42501'; END IF;
  NEW.created_at:=pg_catalog.clock_timestamp();NEW.updated_at:=NEW.created_at;
  RETURN NEW;
 END IF;
 IF (NEW.id,NEW.project_id,NEW.kind,NEW.period_start,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.project_id,OLD.kind,OLD.period_start,OLD.created_at)
 OR NEW.revision<>OLD.revision+1
 OR NOT ((OLD.status='queued' AND NEW.status='running') OR (OLD.status='running' AND NEW.status IN ('succeeded','failed','uncertain'))) THEN
  RAISE EXCEPTION 'WATCH_TRANSITION_REFUSED' USING ERRCODE='42501';
 END IF;
 IF OLD.status='running' AND (NEW.claim_token,NEW.claimed_at,NEW.lease_until) IS DISTINCT FROM (OLD.claim_token,OLD.claimed_at,OLD.lease_until) THEN
  RAISE EXCEPTION 'WATCH_CLAIM_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 NEW.updated_at:=pg_catalog.clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER handlarborsen_watch_guard BEFORE INSERT OR UPDATE OR DELETE ON public.handlarborsen_watch_runs FOR EACH ROW EXECUTE FUNCTION public.handlarborsen_watch_guard_v1();
CREATE TRIGGER handlarborsen_watch_no_truncate BEFORE TRUNCATE ON public.handlarborsen_watch_runs FOR EACH STATEMENT EXECUTE FUNCTION public.handlarborsen_watch_guard_v1();

CREATE FUNCTION public.handlarborsen_watch_audit_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO public.handlarborsen_watch_run_events(run_id,project_id,revision,state,observed_at,outcome_code,http_request_count,evidence_digest)
 VALUES(NEW.id,NEW.project_id,NEW.revision,NEW.status,NEW.updated_at,NEW.outcome_code,NEW.http_request_count,NEW.evidence_digest);
 RETURN NEW;
END $$;
CREATE TRIGGER handlarborsen_watch_audit AFTER INSERT OR UPDATE ON public.handlarborsen_watch_runs FOR EACH ROW EXECUTE FUNCTION public.handlarborsen_watch_audit_v1();

CREATE FUNCTION public.handlarborsen_watch_event_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'WATCH_AUDIT_IMMUTABLE' USING ERRCODE='42501';END $$;
CREATE TRIGGER handlarborsen_watch_event_immutable BEFORE UPDATE OR DELETE ON public.handlarborsen_watch_run_events FOR EACH ROW EXECUTE FUNCTION public.handlarborsen_watch_event_immutable_v1();
CREATE TRIGGER handlarborsen_watch_event_no_truncate BEFORE TRUNCATE ON public.handlarborsen_watch_run_events FOR EACH STATEMENT EXECUTE FUNCTION public.handlarborsen_watch_event_immutable_v1();

CREATE FUNCTION public.handlarborsen_watch_receipt_v1(p public.handlarborsen_watch_runs) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',p.id,'project_id',p.project_id,'kind',p.kind,'period_start',p.period_start,'status',p.status,'revision',p.revision,'http_request_count',p.http_request_count);
$$;
CREATE FUNCTION public.handlarborsen_watch_project_v1(p_project_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_project_id IS DISTINCT FROM '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid THEN RAISE EXCEPTION 'WATCH_PROJECT_FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.projects WHERE id=p_project_id AND slug='handlarborsen' AND owner_id IS NOT NULL FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WATCH_PROJECT_UNAVAILABLE' USING ERRCODE='42501';END IF;
END $$;
-- Only called inside the project mutex by a mutation RPC. No API-role EXECUTE.
CREATE FUNCTION public.handlarborsen_watch_expire_locked_v1(p_project_id uuid,p_now timestamptz) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.handlarborsen_watch_runs SET status='uncertain',revision=revision+1,finished_at=p_now,outcome_code='lease_expired'
 WHERE project_id=p_project_id AND status='running' AND lease_until<=p_now;
END $$;

-- Narrow DEFINER writers are necessary: service_role has no direct table mutation privilege.
CREATE FUNCTION public.handlarborsen_watch_enqueue_v1(p_project_id uuid,p_period_start date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.handlarborsen_watch_runs; inserted boolean;
BEGIN
 PERFORM public.handlarborsen_watch_project_v1(p_project_id);
 IF p_period_start IS NULL OR p_period_start NOT BETWEEN DATE '2000-01-03' AND DATE '2099-12-28' OR EXTRACT(isodow FROM p_period_start)<>1 THEN RAISE EXCEPTION 'WATCH_PERIOD_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('handlarborsen-watch:'||p_project_id::text,0));
 INSERT INTO public.handlarborsen_watch_runs(project_id,period_start) VALUES(p_project_id,p_period_start)
 ON CONFLICT(project_id,kind,period_start) DO NOTHING RETURNING * INTO v;
 inserted:=FOUND;
 IF NOT inserted THEN SELECT * INTO STRICT v FROM public.handlarborsen_watch_runs WHERE project_id=p_project_id AND kind='known_sources_weekly' AND period_start=p_period_start;END IF;
 RETURN pg_catalog.jsonb_build_object('outcome',CASE WHEN inserted THEN 'queued' ELSE 'existing' END,'run',public.handlarborsen_watch_receipt_v1(v));
END $$;
CREATE FUNCTION public.handlarborsen_watch_claim_v1(p_project_id uuid,p_run_id uuid,p_claim_token uuid,p_lease_seconds integer DEFAULT 180) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.handlarborsen_watch_runs; t timestamptz; w date; answer text;
BEGIN
 PERFORM public.handlarborsen_watch_project_v1(p_project_id);
 IF p_run_id IS NULL OR p_claim_token IS NULL OR p_claim_token::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'WATCH_CLAIM_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('handlarborsen-watch:'||p_project_id::text,0));
 -- Lock target and active slot before observing time/week; a row wait must consume no lease.
 PERFORM r.id FROM public.handlarborsen_watch_runs r WHERE r.project_id=p_project_id AND (r.id=p_run_id OR r.status IN ('running','uncertain')) ORDER BY r.id FOR UPDATE;
 t:=pg_catalog.clock_timestamp();w:=pg_catalog.date_trunc('week',t AT TIME ZONE 'Europe/Stockholm')::date;
 PERFORM public.handlarborsen_watch_expire_locked_v1(p_project_id,t);
 SELECT * INTO v FROM public.handlarborsen_watch_runs WHERE project_id=p_project_id AND id=p_run_id FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('outcome','not_found','run',NULL);END IF;
 IF EXISTS(SELECT 1 FROM public.handlarborsen_watch_runs WHERE project_id=p_project_id AND status='uncertain') THEN answer:='blocked_review';
 ELSIF v.status='running' THEN answer:='already_running';
 ELSIF v.status<>'queued' THEN answer:='conflict';
 ELSIF EXISTS(SELECT 1 FROM public.handlarborsen_watch_runs WHERE project_id=p_project_id AND status='running') THEN answer:='busy';
 ELSIF v.period_start<>w THEN answer:='not_current_period';
 ELSE
  UPDATE public.handlarborsen_watch_runs SET status='running',revision=revision+1,claim_token=p_claim_token,claimed_at=t,lease_until=t+pg_catalog.make_interval(secs=>p_lease_seconds)
  WHERE id=v.id AND revision=0 AND status='queued' RETURNING * INTO STRICT v;
  answer:='claimed';
 END IF;
 RETURN pg_catalog.jsonb_build_object('outcome',answer,'run',public.handlarborsen_watch_receipt_v1(v));
END $$;
CREATE FUNCTION public.handlarborsen_watch_finish_v1(p_project_id uuid,p_run_id uuid,p_claim_token uuid,p_expected_revision integer,p_state text,p_outcome text,p_http_count integer,p_evidence_digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.handlarborsen_watch_runs; t timestamptz; request_digest text; answer text;
BEGIN
 PERFORM public.handlarborsen_watch_project_v1(p_project_id);
 IF p_run_id IS NULL OR p_claim_token IS NULL OR p_expected_revision IS DISTINCT FROM 1
 OR p_state IS NULL OR p_state NOT IN ('succeeded','failed') OR p_outcome IS NULL
 OR p_http_count IS NULL OR p_http_count NOT BETWEEN 0 AND 10
 OR (p_evidence_digest IS NOT NULL AND p_evidence_digest !~ '^[a-f0-9]{64}$')
 OR (p_state='succeeded' AND (p_outcome<>'verified' OR p_evidence_digest IS NULL))
 OR (p_state='failed' AND p_outcome NOT IN ('source_unavailable','gate_refused','cancelled'))
 OR (p_outcome IN ('gate_refused','cancelled') AND (p_http_count<>0 OR p_evidence_digest IS NOT NULL)) THEN RAISE EXCEPTION 'WATCH_FINISH_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('handlarborsen-watch:'||p_project_id::text,0));
 SELECT * INTO v FROM public.handlarborsen_watch_runs WHERE project_id=p_project_id AND id=p_run_id FOR UPDATE;
 t:=pg_catalog.clock_timestamp();
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('outcome','not_found','run',NULL);END IF;
 request_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(p_run_id,p_claim_token,p_expected_revision,p_state,p_outcome,p_http_count,p_evidence_digest)::text,'UTF8')),'hex');
 IF v.claim_token IS DISTINCT FROM p_claim_token THEN answer:='stale_claim';
 ELSIF v.status IN ('succeeded','failed') THEN answer:=CASE WHEN v.completion_digest=request_digest THEN 'already_finished' ELSE 'conflict' END;
 ELSIF v.status='uncertain' THEN answer:='uncertain';
 ELSIF v.status<>'running' OR v.revision<>p_expected_revision THEN answer:='stale_claim';
 ELSIF v.lease_until<=t THEN
  UPDATE public.handlarborsen_watch_runs SET status='uncertain',revision=revision+1,finished_at=t,outcome_code='lease_expired' WHERE id=v.id RETURNING * INTO STRICT v;
  answer:='uncertain';
 ELSE
  UPDATE public.handlarborsen_watch_runs SET status=p_state,revision=revision+1,finished_at=t,outcome_code=p_outcome,http_request_count=p_http_count,evidence_digest=p_evidence_digest,completion_digest=request_digest
  WHERE id=v.id AND status='running' AND revision=p_expected_revision AND claim_token=p_claim_token RETURNING * INTO STRICT v;
  answer:='finished';
 END IF;
 RETURN pg_catalog.jsonb_build_object('outcome',answer,'run',public.handlarborsen_watch_receipt_v1(v));
END $$;

ALTER FUNCTION public.handlarborsen_watch_guard_v1() OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_audit_v1() OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_event_immutable_v1() OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_receipt_v1(public.handlarborsen_watch_runs) OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_project_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_expire_locked_v1(uuid,timestamptz) OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_enqueue_v1(uuid,date) OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_claim_v1(uuid,uuid,uuid,integer) OWNER TO postgres;
ALTER FUNCTION public.handlarborsen_watch_finish_v1(uuid,uuid,uuid,integer,text,text,integer,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handlarborsen_watch_guard_v1(),public.handlarborsen_watch_audit_v1(),public.handlarborsen_watch_event_immutable_v1(),public.handlarborsen_watch_receipt_v1(public.handlarborsen_watch_runs),public.handlarborsen_watch_project_v1(uuid),public.handlarborsen_watch_expire_locked_v1(uuid,timestamptz),public.handlarborsen_watch_enqueue_v1(uuid,date),public.handlarborsen_watch_claim_v1(uuid,uuid,uuid,integer),public.handlarborsen_watch_finish_v1(uuid,uuid,uuid,integer,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.handlarborsen_watch_enqueue_v1(uuid,date),public.handlarborsen_watch_claim_v1(uuid,uuid,uuid,integer),public.handlarborsen_watch_finish_v1(uuid,uuid,uuid,integer,text,text,integer,text) TO service_role;
COMMIT;
