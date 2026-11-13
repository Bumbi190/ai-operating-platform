-- Temporary, identity-only Office visits. No agent execution or user login material.
CREATE SCHEMA IF NOT EXISTS office_private;
REVOKE ALL ON SCHEMA office_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA office_private TO service_role;

CREATE TABLE office_private.visits (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 auth_session_id uuid NOT NULL,
 secret_digest text NOT NULL CHECK (secret_digest ~ '^[0-9a-f]{64}$'),
 project_id uuid NOT NULL,
 agent_id uuid NOT NULL,
 avatar_id text NOT NULL CHECK (avatar_id='office-familje-pling'),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 lease_until timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX office_visit_owner ON office_private.visits(owner_id,created_at);
ALTER TABLE office_private.visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON office_private.visits FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE office_private.create_attempts (
 owner_id uuid NOT NULL, attempted_at timestamptz NOT NULL
);
CREATE INDEX office_visit_attempt_owner ON office_private.create_attempts(owner_id,attempted_at);
ALTER TABLE office_private.create_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON office_private.create_attempts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION office_private.create_visit(p_owner uuid,p_session uuid,p_visit uuid,p_digest text,p_project uuid,p_agent uuid,p_avatar text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t timestamptz; v_millis bigint; result jsonb;
BEGIN
 IF p_owner IS NULL OR p_session IS NULL THEN RETURN NULL; END IF;
 -- Serializes quota and replacement for this owner, including concurrent creates.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,742681));
 PERFORM s.id FROM auth.sessions s WHERE s.id=p_session AND s.user_id=p_owner FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 t := pg_catalog.clock_timestamp();
 DELETE FROM office_private.create_attempts WHERE owner_id=p_owner AND attempted_at <= t-interval '5 minutes';
 IF (SELECT count(*) FROM office_private.create_attempts WHERE owner_id=p_owner)>=5 THEN RETURN NULL; END IF;
 INSERT INTO office_private.create_attempts VALUES(p_owner,t);
 IF p_visit IS NULL OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$'
    OR p_avatar IS DISTINCT FROM 'office-familje-pling' THEN RETURN NULL; END IF;
 -- UUIDv7's bounded creation time prevents old claim reuse after metadata cleanup.
 IF substring(p_visit::text,15,1)<>'7' OR substring(p_visit::text,20,1) NOT IN ('8','9','a','b') THEN RETURN NULL; END IF;
 v_millis := ('x'||substring(replace(p_visit::text,'-',''),1,12))::bit(48)::bigint;
 IF abs(extract(epoch FROM t)*1000-v_millis)>30000 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM office_private.visits WHERE id=p_visit) THEN RETURN NULL; END IF;
 PERFORM p.id FROM public.projects p JOIN public.agents a ON a.project_id=p.id
 WHERE p.id=p_project AND p.owner_id=p_owner AND a.id=p_agent FOR SHARE OF p,a;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Retain recent claim tombstones; quota means cleanup cannot remove a still-claimable UUID.
 DELETE FROM office_private.visits WHERE id IN (
   SELECT id FROM office_private.visits WHERE owner_id=p_owner
    AND (revoked_at IS NOT NULL OR lease_until<=t OR expires_at<=t)
    AND created_at<t-interval '5 minutes' ORDER BY created_at LIMIT 100);
 IF (SELECT count(*) FROM office_private.visits WHERE owner_id=p_owner)>=100 THEN RETURN NULL; END IF;
 UPDATE office_private.visits SET revoked_at=t WHERE owner_id=p_owner AND avatar_id=p_avatar AND revoked_at IS NULL;
 INSERT INTO office_private.visits VALUES(p_visit,p_owner,p_session,p_digest,p_project,p_agent,p_avatar,t,t+interval '4 hours',t+interval '30 seconds',NULL);
 result:=pg_catalog.jsonb_build_object('visitId',p_visit,'avatarId',p_avatar,'projectId',p_project,'agentId',p_agent,
  'createdAt',t,'expiresAt',t+interval '4 hours','leaseUntil',t+interval '30 seconds');
 RETURN result;
END $$;

CREATE FUNCTION office_private.presence(p_visit uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v office_private.visits%ROWTYPE; t timestamptz; pn text; ps text; an text;
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
 UPDATE office_private.visits SET lease_until=least(v.expires_at,t+interval '30 seconds') WHERE id=v.id;
 RETURN pg_catalog.jsonb_build_object('visitId',v.id,'avatarId',v.avatar_id,'projectId',v.project_id,'agentId',v.agent_id,
  'createdAt',v.created_at,'expiresAt',v.expires_at,'leaseUntil',least(v.expires_at,t+interval '30 seconds'),
  'generatedAt',t,'projectName',left(pn,80),'projectSlug',left(ps,64),'agentName',left(an,80));
END $$;

CREATE FUNCTION office_private.revoke_visit(p_visit uuid,p_digest text,p_owner uuid,p_session uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_digest IS NOT NULL THEN
  IF p_owner IS NOT NULL OR p_session IS NOT NULL OR p_digest !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  UPDATE office_private.visits SET revoked_at=coalesce(revoked_at,pg_catalog.clock_timestamp()) WHERE id=p_visit AND secret_digest=p_digest;
 ELSE
  IF p_owner IS NULL OR p_session IS NULL THEN RETURN false; END IF;
  PERFORM s.id FROM auth.sessions s WHERE s.id=p_session AND s.user_id=p_owner FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE office_private.visits SET revoked_at=coalesce(revoked_at,pg_catalog.clock_timestamp()) WHERE id=p_visit AND owner_id=p_owner;
 END IF;
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION office_private.create_visit(uuid,uuid,uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION office_private.presence(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION office_private.revoke_visit(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION office_private.create_visit(uuid,uuid,uuid,text,uuid,uuid,text),office_private.presence(uuid,text),office_private.revoke_visit(uuid,text,uuid,uuid) TO service_role;

CREATE FUNCTION public.office_visit_create(p_owner uuid,p_session uuid,p_visit uuid,p_digest text,p_project uuid,p_agent uuid,p_avatar text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT office_private.create_visit(p_owner,p_session,p_visit,p_digest,p_project,p_agent,p_avatar); $$;
CREATE FUNCTION public.office_visit_presence(p_visit uuid,p_digest text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT office_private.presence(p_visit,p_digest); $$;
CREATE FUNCTION public.office_visit_revoke(p_visit uuid,p_digest text,p_owner uuid,p_session uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT office_private.revoke_visit(p_visit,p_digest,p_owner,p_session); $$;
REVOKE ALL ON FUNCTION public.office_visit_create(uuid,uuid,uuid,text,uuid,uuid,text), public.office_visit_presence(uuid,text), public.office_visit_revoke(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.office_visit_create(uuid,uuid,uuid,text,uuid,uuid,text), public.office_visit_presence(uuid,text), public.office_visit_revoke(uuid,text,uuid,uuid) TO service_role;
