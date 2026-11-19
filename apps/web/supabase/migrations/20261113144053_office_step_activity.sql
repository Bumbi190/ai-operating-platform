-- Explicit read-only step metadata. Existing visits and create callers stay identity-only.
ALTER TABLE office_private.visits ADD COLUMN read_scope text NOT NULL DEFAULT 'identity_v1'
 CHECK (read_scope IN ('identity_v1','step_activity_v1'));

CREATE FUNCTION office_private.create_activity_visit(p_owner uuid,p_session uuid,p_visit uuid,p_digest text,p_project uuid,p_agent uuid,p_avatar text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=office_private.create_visit(p_owner,p_session,p_visit,p_digest,p_project,p_agent,p_avatar);
 IF result IS NULL THEN RETURN NULL; END IF;
 UPDATE office_private.visits SET read_scope='step_activity_v1' WHERE id=p_visit;
 RETURN result||pg_catalog.jsonb_build_object('readScope','step_activity_v1','nativeActivityProtocol',1);
END $$;
REVOKE ALL ON FUNCTION office_private.create_activity_visit(uuid,uuid,uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION office_private.create_activity_visit(uuid,uuid,uuid,text,uuid,uuid,text) TO service_role;
CREATE FUNCTION public.office_visit_activity_create(p_owner uuid,p_session uuid,p_visit uuid,p_digest text,p_project uuid,p_agent uuid,p_avatar text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT office_private.create_activity_visit(p_owner,p_session,p_visit,p_digest,p_project,p_agent,p_avatar); $$;
REVOKE ALL ON FUNCTION public.office_visit_activity_create(uuid,uuid,uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.office_visit_activity_create(uuid,uuid,uuid,text,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION office_private.presence(p_visit uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v office_private.visits%ROWTYPE; t timestamptz; pn text; ps text; an text;
 result jsonb; candidates jsonb; candidate jsonb; safe_steps jsonb; step jsonb; run_facts jsonb:='[]'::jsonb; log_facts jsonb:='[]'::jsonb; complete boolean:=true;
BEGIN
 IF p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO v FROM office_private.visits WHERE id=p_visit AND secret_digest=p_digest FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT p.name,p.slug,a.name INTO pn,ps,an FROM auth.sessions s
 JOIN public.projects p ON p.id=v.project_id AND p.owner_id=v.owner_id
 JOIN public.agents a ON a.id=v.agent_id AND a.project_id=p.id
 WHERE s.id=v.auth_session_id AND s.user_id=v.owner_id FOR SHARE OF s,p,a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 t:=pg_catalog.clock_timestamp();
 IF v.revoked_at IS NOT NULL OR v.lease_until<=t OR v.expires_at<=t THEN RETURN NULL; END IF;
 IF v.read_scope NOT IN ('identity_v1','step_activity_v1') THEN RETURN NULL; END IF;
 UPDATE office_private.visits SET lease_until=least(v.expires_at,t+interval '30 seconds') WHERE id=v.id;
 result:=pg_catalog.jsonb_build_object('visitId',v.id,'avatarId',v.avatar_id,'projectId',v.project_id,'agentId',v.agent_id,
  'createdAt',v.created_at,'expiresAt',v.expires_at,'leaseUntil',least(v.expires_at,t+interval '30 seconds'),
  'generatedAt',t,'projectName',left(pn,80),'projectSlug',left(ps,64),'agentName',left(an,80));
 IF v.read_scope='identity_v1' THEN RETURN result; END IF;
 -- Never select input/context/content/error/model/prompt columns. Snapshot is projected
 -- down to order+agent_id inside SQL before it crosses the internal RPC boundary.
 BEGIN
  -- The materialized candidate boundary precedes ALL snapshot/member inspection.
  WITH bounded AS MATERIALIZED (
   SELECT id,project_id,status,claim_id,claimed_at,lease_until,finished_at,cancel_requested,
    reconciliation_required,steps_snapshot FROM public.runs
   WHERE project_id=v.project_id AND status='running' ORDER BY created_at DESC,id LIMIT 12
  )
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'id',r.id,'project_id',r.project_id,'status',r.status,'claim_id',r.claim_id,
   'claimed_at',r.claimed_at,'lease_until',r.lease_until,'finished_at',r.finished_at,
   'cancel_requested',r.cancel_requested,'reconciliation_required',r.reconciliation_required,
   'steps_snapshot',CASE WHEN pg_catalog.jsonb_typeof(r.steps_snapshot)='array' THEN
    CASE WHEN pg_catalog.jsonb_array_length(r.steps_snapshot) BETWEEN 1 AND 100
     THEN r.steps_snapshot ELSE NULL END ELSE NULL END)), '[]'::jsonb)
  INTO candidates FROM bounded r;
  IF pg_catalog.jsonb_array_length(candidates)>=12 THEN complete:=false;
  ELSE
   FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(candidates) LOOP
    IF candidate->'steps_snapshot'='null'::jsonb THEN complete:=false; EXIT; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(candidate->'steps_snapshot') s
      WHERE pg_catalog.jsonb_typeof(s->'agent_id')='string' AND s->>'agent_id'=v.agent_id::text) THEN CONTINUE; END IF;
    safe_steps:='[]'::jsonb;
    FOR step IN SELECT value FROM pg_catalog.jsonb_array_elements(candidate->'steps_snapshot') LOOP
     IF pg_catalog.jsonb_typeof(step) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(step->'order') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(step->'agent_id') IS DISTINCT FROM 'string' THEN complete:=false; EXIT; END IF;
     IF step->>'order' !~ '^(0|[1-9][0-9]?)$'
       OR step->>'agent_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN complete:=false; EXIT; END IF;
     safe_steps:=safe_steps||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
       'order',(step->>'order')::integer,'agent_id',(step->>'agent_id')::uuid));
    END LOOP;
    EXIT WHEN NOT complete;
    run_facts:=run_facts||pg_catalog.jsonb_build_array((candidate-'steps_snapshot')||pg_catalog.jsonb_build_object('steps_snapshot',safe_steps));
   END LOOP;
  END IF;
  IF pg_catalog.jsonb_array_length(run_facts)>=12 THEN complete:=false;
  ELSIF pg_catalog.jsonb_array_length(run_facts)>0 THEN
   SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',l.id,'run_id',l.run_id,
     'step_order',l.step_order,'role',l.role,'created_at',l.created_at)), '[]'::jsonb)
   INTO log_facts FROM (
     SELECT id,run_id,step_order,role,created_at FROM public.run_logs
     WHERE run_id IN (SELECT (r->>'id')::uuid FROM pg_catalog.jsonb_array_elements(run_facts) r)
       AND role IN ('user','assistant') ORDER BY created_at DESC,id LIMIT 120
   ) l;
   IF pg_catalog.jsonb_array_length(log_facts)>=120 THEN complete:=false; END IF;
  END IF;
 EXCEPTION WHEN data_exception OR undefined_column OR undefined_table THEN
  -- Activity metadata may be unavailable while the identity remains valid.
  complete:=false;
 END;
 IF NOT complete THEN run_facts:='[]'::jsonb; log_facts:='[]'::jsonb; END IF;
 RETURN result||pg_catalog.jsonb_build_object('readScope','step_activity_v1','nativeActivityProtocol',1,
  'activityFacts',pg_catalog.jsonb_build_object('complete',complete,'runs',run_facts,'logs',log_facts));
END $$;
REVOKE ALL ON FUNCTION office_private.presence(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION office_private.presence(uuid,text) TO service_role;
