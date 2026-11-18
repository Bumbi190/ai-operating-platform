-- Dormant, separately consented workflow-reservation read scope.
-- No existing grant is upgraded. HTTP feature gate stays OFF by default.
ALTER TABLE office_private.visits DROP CONSTRAINT visits_read_scope_check;
ALTER TABLE office_private.visits ADD CONSTRAINT visits_read_scope_check
 CHECK (read_scope IN ('identity_v1','step_activity_v1','workflow_state_v1'));
ALTER TABLE office_private.visits ADD COLUMN workflow_revision bigint NOT NULL DEFAULT 0
 CHECK (workflow_revision BETWEEN 0 AND 9007199254740991);

CREATE FUNCTION office_private.create_workflow_visit(p_owner uuid,p_session uuid,p_visit uuid,p_digest text,p_project uuid,p_agent uuid,p_avatar text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 -- Reuse existing owner/session/project/agent checks, UUIDv7 freshness, quota,
 -- tombstones and the one established Familje avatar. No new avatar mapping.
 result:=office_private.create_visit(p_owner,p_session,p_visit,p_digest,p_project,p_agent,p_avatar);
 IF result IS NULL THEN RETURN NULL; END IF;
 UPDATE office_private.visits SET read_scope='workflow_state_v1',workflow_revision=0 WHERE id=p_visit;
 RETURN result||pg_catalog.jsonb_build_object('readScope','workflow_state_v1','nativeWorkflowProtocol',1);
END $$;
REVOKE ALL ON FUNCTION office_private.create_workflow_visit(uuid,uuid,uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION office_private.create_workflow_visit(uuid,uuid,uuid,text,uuid,uuid,text) TO service_role;
CREATE FUNCTION public.office_visit_workflow_create(p_owner uuid,p_session uuid,p_visit uuid,p_digest text,p_project uuid,p_agent uuid,p_avatar text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT office_private.create_workflow_visit(p_owner,p_session,p_visit,p_digest,p_project,p_agent,p_avatar); $$;
REVOKE ALL ON FUNCTION public.office_visit_workflow_create(uuid,uuid,uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.office_visit_workflow_create(uuid,uuid,uuid,text,uuid,uuid,text) TO service_role;

CREATE FUNCTION office_private.workflow_presence(p_visit uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v office_private.visits%ROWTYPE; t timestamptz;
 candidates jsonb; candidate jsonb; step jsonb; safe_steps jsonb; orders integer[];
 facts jsonb:='[]'::jsonb; complete boolean:=true; selected boolean;
BEGIN
 IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM office_private.visits WHERE id=p_visit AND secret_digest=p_digest FOR UPDATE;
 IF NOT FOUND OR v.read_scope<>'workflow_state_v1' OR v.workflow_revision>=9007199254740991 THEN RETURN NULL; END IF;
 PERFORM s.id FROM auth.sessions s
 JOIN public.projects p ON p.id=v.project_id AND p.owner_id=v.owner_id
 JOIN public.agents a ON a.id=v.agent_id AND a.project_id=p.id
 WHERE s.id=v.auth_session_id AND s.user_id=v.owner_id FOR SHARE OF s,p,a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 t:=pg_catalog.clock_timestamp();
 IF v.revoked_at IS NOT NULL OR v.lease_until<=t OR v.expires_at<=t THEN RETURN NULL; END IF;
 -- Workflow tables are only read. The existing visit lease and scoped revision
 -- are renewed atomically under the same row lock, not workflow execution.
 UPDATE office_private.visits SET lease_until=least(v.expires_at,t+interval '30 seconds'),
  workflow_revision=workflow_revision+1 WHERE id=v.id;
 BEGIN
  -- Bound project candidates before unpacking snapshots. Include unknown status
  -- and anomalous terminal rows: neither may disappear into a false idle result.
  WITH bounded AS MATERIALIZED (
   SELECT id,project_id,status,claim_id,claimed_at,lease_until,finished_at,
    cancel_requested,reconciliation_required,steps_snapshot FROM public.runs
   WHERE project_id=v.project_id AND (
    status IS NULL OR status NOT IN ('done','failed','cancelled','rejected')
    OR finished_at IS NULL OR finished_at>t OR reconciliation_required IS DISTINCT FROM false)
   -- Old failed workflow rows predate durable claims/snapshots. They have no
   -- reservation to renew. Exclude only this exact inert shape, read-only;
   -- do not fabricate finished_at or rewrite execution history.
   -- Every term must be two-valued: a NULL status must remain a candidate.
   AND NOT (
    status IS NOT DISTINCT FROM 'failed' AND finished_at IS NULL
    AND claim_id IS NULL AND claimed_at IS NULL AND lease_until IS NULL
    AND steps_snapshot IS NULL AND workflow_instance_id IS NULL AND kind IS NULL
    AND workflow_id IS NOT NULL AND cancel_requested IS FALSE
    AND reconciliation_required IS FALSE)
   ORDER BY created_at DESC,id LIMIT 12
  )
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',r.id,'project_id',r.project_id,'status',r.status,'claim_id',r.claim_id,
   'claimed_at',r.claimed_at,'lease_until',r.lease_until,'finished_at',r.finished_at,
   'cancel_requested',r.cancel_requested,'reconciliation_required',r.reconciliation_required,
   'steps_snapshot',CASE WHEN pg_catalog.jsonb_typeof(r.steps_snapshot)='array' THEN
     CASE WHEN pg_catalog.jsonb_array_length(r.steps_snapshot) BETWEEN 1 AND 100 THEN r.steps_snapshot ELSE NULL END
     ELSE NULL END)), '[]'::jsonb) INTO candidates FROM bounded r;
  IF pg_catalog.jsonb_array_length(candidates)>=12 THEN complete:=false;
  ELSE
   FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(candidates) LOOP
    IF candidate->'steps_snapshot'='null'::jsonb THEN complete:=false; EXIT; END IF;
    -- Validate ALL bounded candidate snapshots before skipping an unrelated run.
    -- A malformed legacy row could otherwise hide the selected agent.
    safe_steps:='[]'::jsonb;orders:=ARRAY[]::integer[];selected:=false;
    FOR step IN SELECT value FROM pg_catalog.jsonb_array_elements(candidate->'steps_snapshot') LOOP
     IF pg_catalog.jsonb_typeof(step) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(step->'order') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(step->'agent_id') IS DISTINCT FROM 'string' THEN complete:=false; EXIT; END IF;
     IF step->>'order' !~ '^(0|[1-9][0-9]?)$'
       OR step->>'agent_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN complete:=false; EXIT; END IF;
     IF (step->>'order')::integer=ANY(orders) THEN complete:=false; EXIT; END IF;
     orders:=pg_catalog.array_append(orders,(step->>'order')::integer);
     selected:=selected OR step->>'agent_id'=v.agent_id::text;
     safe_steps:=safe_steps||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'order',(step->>'order')::integer,'agent_id',(step->>'agent_id')::uuid));
    END LOOP;
    EXIT WHEN NOT complete;
    IF NOT selected THEN CONTINUE; END IF;
    -- Only projected technical metadata for the exact selected agent crosses RPC.
    facts:=facts||pg_catalog.jsonb_build_array((candidate-'steps_snapshot')||pg_catalog.jsonb_build_object('steps_snapshot',safe_steps));
   END LOOP;
  END IF;
 EXCEPTION WHEN data_exception OR undefined_column OR undefined_table THEN
  complete:=false;
 END;
 IF NOT complete THEN facts:='[]'::jsonb; END IF;
 RETURN pg_catalog.jsonb_build_object('visitId',v.id,'avatarId',v.avatar_id,'projectId',v.project_id,'agentId',v.agent_id,
  'createdAt',v.created_at,'expiresAt',v.expires_at,'leaseUntil',least(v.expires_at,t+interval '30 seconds'),
  'generatedAt',t,'readScope','workflow_state_v1','nativeWorkflowProtocol',1,'workflowRevision',v.workflow_revision+1,
  'workflowFacts',pg_catalog.jsonb_build_object('complete',complete,'runs',facts));
END $$;
REVOKE ALL ON FUNCTION office_private.workflow_presence(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION office_private.workflow_presence(uuid,text) TO service_role;
CREATE FUNCTION public.office_visit_workflow_presence(p_visit uuid,p_digest text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT office_private.workflow_presence(p_visit,p_digest); $$;
REVOKE ALL ON FUNCTION public.office_visit_workflow_presence(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.office_visit_workflow_presence(uuid,text) TO service_role;
