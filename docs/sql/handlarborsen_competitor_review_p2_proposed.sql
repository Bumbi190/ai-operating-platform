-- REVIEW ONLY, operator preflight. NOT a canonical migration. NOT APPLIED.
-- User decision history on already-persisted official Handlarbörsen candidate records.
-- Separate from immutable source evidence, six-source history and Atlas approvals.
CREATE TABLE public.handlarborsen_competitor_review_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL,
  host varchar(160) NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL UNIQUE,
  status varchar(16) NOT NULL CHECK (status IN ('interesting', 'reviewed', 'ignored', 'pending')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT hb_review_exact_project CHECK (
    project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
  ),
  CONSTRAINT hb_review_candidate_fk FOREIGN KEY (project_id,host)
    REFERENCES public.handlarborsen_competitor_candidates(project_id,host)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX hb_review_project_candidate_order
  ON public.handlarborsen_competitor_review_decisions(project_id,host,id DESC);

ALTER TABLE public.handlarborsen_competitor_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_competitor_review_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handlarborsen_competitor_review_decisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.handlarborsen_competitor_review_decisions TO service_role;
COMMENT ON TABLE public.handlarborsen_competitor_review_decisions IS
  'Immutable, manually created review decisions on verified Handlarborsen competitor candidates. Not Atlas approvals, scheduling, or notifications.';

-- An invoker function (not SECURITY DEFINER) serializes review decisions per
-- project+host and returns a deliberately tiny status. Service-role only.
-- The actor comes from server-side auth.getUser, never from client input.
CREATE FUNCTION public.handlarborsen_decide_candidate_review_v1(
  p_project_id uuid, p_host text, p_actor_id uuid, p_status text, p_request_id uuid
) RETURNS TABLE(outcome text, current_status text, decision_id bigint)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous_status text;
  previous_id bigint;
  request_actor uuid;
  request_status text;
  request_project uuid;
  request_host text;
  new_id bigint;
BEGIN
  IF p_project_id IS DISTINCT FROM '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
    OR p_actor_id IS NULL OR p_request_id IS NULL
    OR p_status IS NULL OR p_status NOT IN ('interesting', 'reviewed', 'ignored', 'pending')
    OR p_host IS NULL OR length(p_host) > 160
    OR p_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$'
    OR p_host LIKE 'www.%'
  THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::bigint;
    RETURN;
  END IF;

  -- Recheck active organization membership against the LIVE owner of the exact
  -- project inside the database transaction, not only in application code.
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.omnira_organization_memberships org_owner
      ON org_owner.user_id=p.owner_id AND org_owner.role='owner' AND org_owner.revoked_at IS NULL
    JOIN public.omnira_organization_memberships actor
      ON actor.user_id=p_actor_id AND actor.role IN ('owner','collaborator') AND actor.revoked_at IS NULL
    WHERE p.id=p_project_id AND p.slug='handlarborsen'
      AND (actor.role='collaborator' OR actor.user_id=p.owner_id)
  ) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::text, NULL::bigint;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.handlarborsen_competitor_candidates c
    WHERE c.project_id=p_project_id AND c.host=p_host
  ) THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::bigint;
    RETURN;
  END IF;

  -- Enforce one transaction-at-a-time for decisions on the same candidate.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':' || p_host, 17));

  SELECT d.actor_id, d.status, d.project_id, d.host, d.id
    INTO request_actor, request_status, request_project, request_host, previous_id
  FROM public.handlarborsen_competitor_review_decisions d
  WHERE d.request_id=p_request_id
  LIMIT 1;
  IF FOUND THEN
    IF request_actor=p_actor_id AND request_status=p_status
      AND request_project=p_project_id AND request_host=p_host
    THEN
      RETURN QUERY SELECT 'already_applied'::text, request_status, previous_id;
    ELSE
      RETURN QUERY SELECT 'conflict'::text, NULL::text, NULL::bigint;
    END IF;
    RETURN;
  END IF;

  SELECT d.status, d.id INTO previous_status, previous_id
  FROM public.handlarborsen_competitor_review_decisions d
  WHERE d.project_id=p_project_id AND d.host=p_host
  ORDER BY d.id DESC LIMIT 1;

  IF COALESCE(previous_status, 'pending') = p_status THEN
    RETURN QUERY SELECT 'unchanged'::text, COALESCE(previous_status, 'pending'), previous_id;
    RETURN;
  END IF;

  INSERT INTO public.handlarborsen_competitor_review_decisions(
    project_id,host,actor_id,request_id,status
  ) VALUES (p_project_id,p_host,p_actor_id,p_request_id,p_status)
  RETURNING id INTO new_id;

  RETURN QUERY SELECT 'saved'::text, p_status, new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.handlarborsen_decide_candidate_review_v1(uuid,text,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handlarborsen_decide_candidate_review_v1(uuid,text,uuid,text,uuid)
  TO service_role;
-- No UPDATE/DELETE grants, no direct client RPC or table access, no background jobs.
