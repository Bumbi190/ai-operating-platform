-- Operator-approved 2026-10-17; canonical inbox schema.
-- Handlarbörsen project-scoped, per-recipient, in-app candidate notification.
-- A notification is persisted evidence in Omnira's inbox, NOT email/push delivery.
-- Trigger fires only on a genuinely NEW immutable verified candidate insertion.
-- Existing candidates are not backfilled, and duplicate insert attempts do nothing.

CREATE TABLE public.handlarborsen_candidate_inbox (
  project_id uuid NOT NULL,
  candidate_host varchar(160) NOT NULL,
  recipient_id uuid NOT NULL REFERENCES auth.users(id),
  evidence_digest char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  CONSTRAINT hb_inbox_pk PRIMARY KEY (project_id,candidate_host,recipient_id),
  CONSTRAINT hb_inbox_exact_project CHECK (
    project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
  ),
  CONSTRAINT hb_inbox_candidate_fk FOREIGN KEY (project_id,candidate_host)
    REFERENCES public.handlarborsen_competitor_candidates(project_id,host)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT hb_inbox_evidence_digest CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT hb_inbox_read_time CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX hb_inbox_recipient_unread
  ON public.handlarborsen_candidate_inbox(recipient_id,project_id,created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.handlarborsen_candidate_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handlarborsen_candidate_inbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.handlarborsen_candidate_inbox
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE(read_at) ON TABLE public.handlarborsen_candidate_inbox
  TO service_role;

COMMENT ON TABLE public.handlarborsen_candidate_inbox IS
  'One durable, recipient-specific in-app notice for each newly verified Handlarbörsen competitor. No automatic web discovery, external send or executing decisions.';

-- Only a newly inserted, independently reviewed official candidate can emit.
-- This trigger executes as the caller (service_role). No user-side INSERT/RPC.
CREATE FUNCTION public.handlarborsen_emit_candidate_inbox_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
    OR NEW.provenance IS DISTINCT FROM 'independently_checked_official_website'
    OR NEW.evidence_digest IS DISTINCT FROM encode(sha256(convert_to(
      NEW.name || E'\n' || NEW.official_url || E'\n' || NEW.observed_on::text
      || E'\n' || NEW.relevance, 'UTF8')), 'hex')
  THEN
    RAISE EXCEPTION 'invalid_handlarborsen_candidate_evidence';
  END IF;

  -- The single active organizational Owner must own THIS exact project.
  -- Only eligible recipients at insert time receive this inbox entry.
  INSERT INTO public.handlarborsen_candidate_inbox(
    project_id,candidate_host,recipient_id,evidence_digest
  )
  SELECT NEW.project_id,NEW.host,member.user_id,NEW.evidence_digest
  FROM public.projects project
  JOIN public.omnira_organization_memberships organization_owner
    ON organization_owner.user_id=project.owner_id
   AND organization_owner.role='owner' AND organization_owner.revoked_at IS NULL
  JOIN public.omnira_organization_memberships member
    ON member.revoked_at IS NULL
   AND (member.role='collaborator'
     OR (member.role='owner' AND member.user_id=project.owner_id))
  WHERE project.id=NEW.project_id AND project.slug='handlarborsen'
  ON CONFLICT (project_id,candidate_host,recipient_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handlarborsen_emit_candidate_inbox_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handlarborsen_emit_candidate_inbox_v1()
  TO service_role;

CREATE TRIGGER hb_candidate_inbox_after_verified_insert
AFTER INSERT ON public.handlarborsen_competitor_candidates
FOR EACH ROW EXECUTE FUNCTION public.handlarborsen_emit_candidate_inbox_v1();

-- Acknowledge or mark unread. Actor is determined by server-side auth.getUser,
-- never browser identity. DB rechecks the LIVE project/organization relationship.
-- Separate row read lock makes repeated clicks idempotent.
CREATE FUNCTION public.handlarborsen_set_candidate_inbox_read_v1(
  p_project_id uuid, p_host text, p_recipient_id uuid, p_read boolean
) RETURNS TABLE(outcome text, current_read_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_read timestamptz;
  result_read timestamptz;
BEGIN
  IF p_project_id IS DISTINCT FROM '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid
    OR p_recipient_id IS NULL OR p_read IS NULL OR p_host IS NULL
    OR length(p_host)>160
    OR p_host !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$'
    OR p_host LIKE 'www.%'
  THEN
    RETURN QUERY SELECT 'invalid'::text,NULL::timestamptz;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects project
    JOIN public.omnira_organization_memberships owner
      ON owner.user_id=project.owner_id AND owner.role='owner'
     AND owner.revoked_at IS NULL
    JOIN public.omnira_organization_memberships member
      ON member.user_id=p_recipient_id AND member.revoked_at IS NULL
     AND (member.role='collaborator'
       OR (member.role='owner' AND member.user_id=project.owner_id))
    WHERE project.id=p_project_id AND project.slug='handlarborsen'
  ) THEN
    RETURN QUERY SELECT 'forbidden'::text,NULL::timestamptz;
    RETURN;
  END IF;

  SELECT notice.read_at INTO current_read
  FROM public.handlarborsen_candidate_inbox notice
  WHERE notice.project_id=p_project_id AND notice.candidate_host=p_host
    AND notice.recipient_id=p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text,NULL::timestamptz;
    RETURN;
  END IF;
  IF (p_read AND current_read IS NOT NULL) OR (NOT p_read AND current_read IS NULL) THEN
    RETURN QUERY SELECT 'unchanged'::text,current_read;
    RETURN;
  END IF;

  UPDATE public.handlarborsen_candidate_inbox notice
  SET read_at=CASE WHEN p_read THEN GREATEST(clock_timestamp(),notice.created_at) ELSE NULL END
  WHERE notice.project_id=p_project_id AND notice.candidate_host=p_host
    AND notice.recipient_id=p_recipient_id
  RETURNING notice.read_at INTO result_read;
  RETURN QUERY SELECT 'updated'::text,result_read;
END;
$$;
REVOKE ALL ON FUNCTION public.handlarborsen_set_candidate_inbox_read_v1(uuid,text,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handlarborsen_set_candidate_inbox_read_v1(uuid,text,uuid,boolean)
  TO service_role;

-- No scheduled jobs, no notification provider, no external emails or push.
