-- The Prompt FactCheck: PostgreSQL 17 end-to-end evidence-ledger checks.
-- Run ONLY in a separate disposable DB after bootstrap + proposed SQL.
-- Never run on production. No changes to any existing Omnira tables.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='media_factcheck_reports'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'missing_RLS_or_FORCE'; END IF;
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='media_factcheck_reports';
  IF n<>0 THEN RAISE EXCEPTION 'client_policy_present:%',n; END IF;
  IF has_table_privilege('anon','public.media_factcheck_reports','SELECT')
    OR has_table_privilege('authenticated','public.media_factcheck_reports','SELECT')
    OR has_table_privilege('anon','public.media_factcheck_reports','INSERT')
    OR has_table_privilege('authenticated','public.media_factcheck_reports','INSERT')
    OR has_table_privilege('service_role','public.media_factcheck_reports','UPDATE')
    OR has_table_privilege('service_role','public.media_factcheck_reports','DELETE')
    OR has_table_privilege('service_role','public.media_factcheck_reports','TRUNCATE')
    OR NOT has_table_privilege('service_role','public.media_factcheck_reports','SELECT')
    OR NOT has_table_privilege('service_role','public.media_factcheck_reports','INSERT')
  THEN RAISE EXCEPTION 'incorrect_ROLE_PRIVILEGES'; END IF;
  RAISE NOTICE 'PASS RLS_FORCE_PRIVATE_SERVICE_ONLY';
END $$;

-- service_role must really be able to INSERT after ownership checks.
SET ROLE service_role;
INSERT INTO public.media_factcheck_reports (
  project_id,script_id,run_id,claim_id,reviewer_run_id,
  script_version,revision_id,content_sha256,source_set_sha256,
  writer_model,reviewer_model,risk_tier,outcome,framing,
  framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  1,'v1',
  repeat('a',64),repeat('b',64),
  'claude-sonnet-4-6','gpt-5.4-mini','standard',
  'ready_for_editor','faithful_to_evidence',
  'Both source excerpts support this synthetic fixture.',
  ARRAY[]::text[],
  jsonb_build_object(
    'projectId','11111111-1111-4111-8111-111111111111',
    'scriptId','22222222-2222-4222-8222-222222222222',
    'revisionId','v1',
    'hook','Research team announced a safe new API.',
    'script','The technical documentation was published today.',
    'captions',jsonb_build_array('Research API','Official documentation'),
    'cta','Read the official guide.','riskTier','standard',
    'socialCaption','Safe research source'
  ),
  jsonb_build_array(
    jsonb_build_object('sourceId','a','publisherGroup','uk-government','kind','primary','url','https://www.gov.uk/government/news/demo','textSha256',repeat('c',64)),
    jsonb_build_object('sourceId','b','publisherGroup','reuters','kind','independent_reporting','url','https://www.reuters.com/world/demo','textSha256',repeat('d',64))
  ),
  jsonb_build_array(
    jsonb_build_object('unitId','hook:0','verdict','supported','evidence',
      jsonb_build_array(
        jsonb_build_object('sourceId','a','exactQuote','Research team announced a safe new API.'),
        jsonb_build_object('sourceId','b','exactQuote','Research team announced a safe new API.'))),
    jsonb_build_object('unitId','script:0','verdict','supported','evidence',
      jsonb_build_array(
        jsonb_build_object('sourceId','a','exactQuote','The technical documentation was published today.'),
        jsonb_build_object('sourceId','b','exactQuote','The technical documentation was published today.')))
  ),
  clock_timestamp()
);
RESET ROLE;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.media_factcheck_reports;
  IF n<>1 THEN RAISE EXCEPTION 'unexpected_initial_report_count:%',n; END IF;
  RAISE NOTICE 'PASS FIRST_AUTHORIZED_INSERT';
END $$;

CREATE FUNCTION pg_temp.clone_report(
  p_version int DEFAULT NULL,
  p_revision text DEFAULT NULL,
  p_claim uuid DEFAULT NULL,
  p_project uuid DEFAULT NULL,
  p_sources jsonb DEFAULT NULL,
  p_reasons text[] DEFAULT NULL,
  p_reviewer_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.media_factcheck_reports (
    project_id,script_id,run_id,claim_id,reviewer_run_id,
    script_version,revision_id,content_sha256,source_set_sha256,
    writer_model,reviewer_model,risk_tier,outcome,framing,
    framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at
  )
  SELECT coalesce(p_project,r.project_id),r.script_id,r.run_id,
    coalesce(p_claim,r.claim_id),coalesce(p_reviewer_id,gen_random_uuid()),
    coalesce(p_version,r.script_version),coalesce(p_revision,r.revision_id),
    r.content_sha256,r.source_set_sha256,
    r.writer_model,r.reviewer_model,r.risk_tier,r.outcome,r.framing,
    r.framing_reason,coalesce(p_reasons,r.reasons),
    jsonb_set(r.manuscript_snapshot,'{revisionId}',
      to_jsonb(coalesce(p_revision,r.revision_id))),
    coalesce(p_sources,r.source_receipts),r.findings,clock_timestamp()
  FROM public.media_factcheck_reports r
  LIMIT 1;
END $$;

CREATE FUNCTION pg_temp.expect_rejection(
  p_label text,p_state text,
  p_version int DEFAULT NULL,
  p_revision text DEFAULT NULL,
  p_claim uuid DEFAULT NULL,
  p_project uuid DEFAULT NULL,
  p_sources jsonb DEFAULT NULL,
  p_reasons text[] DEFAULT NULL,
  p_reviewer_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    PERFORM pg_temp.clone_report(
      p_version,p_revision,p_claim,p_project,p_sources,p_reasons,p_reviewer_id);
    RAISE EXCEPTION 'UNEXPECTED_ACCEPTANCE:%',p_label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF actual_state<>p_state THEN
      RAISE EXCEPTION '%: EXPECTED SQLSTATE % GOT %',p_label,p_state,actual_state;
    END IF;
    RAISE NOTICE 'PASS % (SQLSTATE %)',p_label,actual_state;
  END;
END $$;

INSERT INTO public.projects(id,owner_id) VALUES (
  '99999999-9999-4999-8999-999999999999',
  '66666666-6666-4666-8666-666666666666');
SELECT pg_temp.expect_rejection('SCRIPT_VERSION_CHANGE','23514',2);
SELECT pg_temp.expect_rejection('REVISION_ID_CHANGE','23514',NULL,'v2');
SELECT pg_temp.expect_rejection(
  'WRONG_CLAIM','23514',NULL,NULL,'77777777-7777-4777-8777-777777777777');
SELECT pg_temp.expect_rejection(
  'WRONG_PROJECT','23514',NULL,NULL,NULL,'99999999-9999-4999-8999-999999999999');
SELECT pg_temp.expect_rejection(
  'SOURCE_EVIDENCE_ABSENT','23514',NULL,NULL,NULL,NULL,'[]'::jsonb);
SELECT pg_temp.expect_rejection(
  'READY_WITH_REASONS','23514',NULL,NULL,NULL,NULL,NULL,ARRAY['not_verified']);
SELECT pg_temp.expect_rejection(
  'DUPLICATE_REVIEW_RUN','23505',NULL,NULL,NULL,NULL,NULL,NULL,
  '55555555-5555-4555-8555-555555555555');

DO $$
BEGIN
  UPDATE public.runs SET lease_until=clock_timestamp()-interval '5 minutes'
  WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.expect_rejection('LEASE_EXPIRED','23514');
  UPDATE public.runs SET lease_until=clock_timestamp()+interval '1 hour'
  WHERE id='33333333-3333-4333-8333-333333333333';

  UPDATE public.runs SET status='done'
  WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.expect_rejection('RUN_NOT_RUNNING','23514');
  UPDATE public.runs SET status='running'
  WHERE id='33333333-3333-4333-8333-333333333333';

  UPDATE public.runs SET cancel_requested=true
  WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.expect_rejection('RUN_CANCELLED','23514');
  UPDATE public.runs SET cancel_requested=false
  WHERE id='33333333-3333-4333-8333-333333333333';

  UPDATE public.media_scripts SET hook='Manipulated headline'
  WHERE id='22222222-2222-4222-8222-222222222222';
  PERFORM pg_temp.expect_rejection('SCRIPT_CHANGED','23514');
  UPDATE public.media_scripts SET hook='Research team announced a safe new API.'
  WHERE id='22222222-2222-4222-8222-222222222222';
END $$;

-- The report is structurally append-only even for a superuser with full DML.
CREATE FUNCTION pg_temp.expect_immutable(
  p_label text,p_stmt text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    EXECUTE p_stmt;
    RAISE EXCEPTION 'UNEXPECTED_MUTATION:%',p_label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF actual_state<>'42501' THEN
      RAISE EXCEPTION '%: EXPECTED 42501 GOT %',p_label,actual_state;
    END IF;
    RAISE NOTICE 'PASS %',p_label;
  END;
END $$;
SELECT pg_temp.expect_immutable(
 'UPDATE_DENIED',
 'UPDATE public.media_factcheck_reports SET framing=''unverified''');
SELECT pg_temp.expect_immutable(
 'DELETE_DENIED',
 'DELETE FROM public.media_factcheck_reports');
SELECT pg_temp.expect_immutable(
 'TRUNCATE_DENIED',
 'TRUNCATE public.media_factcheck_reports CASCADE');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.media_factcheck_reports;
  IF n<>1 THEN RAISE EXCEPTION 'INCONSISTENT_FINAL_REPORT_COUNT:%',n; END IF;
  RAISE NOTICE 'PASS APPEND_ONLY_FINAL_COUNT=1';
END $$;

-- The human owner decision is a DIFFERENT, immutable receipt, tied to a
-- fact-check report. It never grants publication; final social approval is
-- separate (social_content_decisions).
DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
    WHERE s.nspname='public' AND c.relname='media_factcheck_editorial_decisions'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'EDITORIAL_RLS_OR_FORCE_MISSING'; END IF;
  SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename='media_factcheck_editorial_decisions';
  IF n<>0
     OR has_table_privilege('anon','public.media_factcheck_editorial_decisions','SELECT')
     OR has_table_privilege('authenticated','public.media_factcheck_editorial_decisions','SELECT')
     OR has_table_privilege('anon','public.media_factcheck_editorial_decisions','INSERT')
     OR has_table_privilege('authenticated','public.media_factcheck_editorial_decisions','INSERT')
     OR has_table_privilege('service_role','public.media_factcheck_editorial_decisions','UPDATE')
     OR has_table_privilege('service_role','public.media_factcheck_editorial_decisions','DELETE')
     OR has_table_privilege('service_role','public.media_factcheck_editorial_decisions','TRUNCATE')
     OR NOT has_table_privilege('service_role','public.media_factcheck_editorial_decisions','SELECT')
     OR NOT has_table_privilege('service_role','public.media_factcheck_editorial_decisions','INSERT')
  THEN RAISE EXCEPTION 'EDITORIAL_PRIVILEGE_ESCALATION'; END IF;
  RAISE NOTICE 'PASS EDITORIAL_RLS_PRIVATE';
END $$;

SET ROLE service_role;
INSERT INTO public.media_factcheck_editorial_decisions (
  project_id,report_id,script_id,script_version,revision_id,
  content_sha256,source_set_sha256,decision,notes,decided_by
)
SELECT project_id,id,script_id,script_version,revision_id,
  content_sha256,source_set_sha256,
  'approve','I checked the cited original evidence and approved this script for media preparation.',
  '66666666-6666-4666-8666-666666666666'
FROM public.media_factcheck_reports
WHERE reviewer_run_id='55555555-5555-4555-8555-555555555555';
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.media_factcheck_editorial_decisions)<>1
 THEN RAISE EXCEPTION 'OWNER_EDITORIAL_INSERT_FAILED';END IF;
 RAISE NOTICE 'PASS OWNER_EDITORIAL_INSERT';
END $$;

-- A second, otherwise identical report lets negative tests check the human
-- decision guard before a unique(report_id) constraint would reject it.
SELECT pg_temp.clone_report();

CREATE FUNCTION pg_temp.try_editorial(
  p_report uuid,
  p_actor uuid DEFAULT '66666666-6666-4666-8666-666666666666',
  p_ack bool DEFAULT false,
  p_notes text DEFAULT 'I reviewed every source and approved the exact manuscript content.',
  p_content_sha text DEFAULT NULL,
  p_project uuid DEFAULT NULL,
  p_decision text DEFAULT 'approve'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.media_factcheck_editorial_decisions (
    project_id,report_id,script_id,script_version,revision_id,
    content_sha256,source_set_sha256,decision,notes,decided_by,
    sensitive_risk_acknowledged
  )
  SELECT coalesce(p_project,r.project_id),r.id,r.script_id,r.script_version,
    r.revision_id,coalesce(p_content_sha,r.content_sha256),
    r.source_set_sha256,p_decision,p_notes,p_actor,p_ack
  FROM public.media_factcheck_reports r
  WHERE r.id=p_report;
  IF NOT FOUND THEN RAISE EXCEPTION 'EDITORIAL_UNKNOWN_REPORT' USING errcode='23514';END IF;
END $$;

CREATE FUNCTION pg_temp.expect_editorial_rejection(
  p_label text,p_report uuid,p_state text DEFAULT '23514',
  p_actor uuid DEFAULT '66666666-6666-4666-8666-666666666666',
  p_ack bool DEFAULT false,
  p_notes text DEFAULT 'I reviewed every source and approved the exact manuscript content.',
  p_sha text DEFAULT NULL,
  p_project uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    PERFORM pg_temp.try_editorial(p_report,p_actor,p_ack,p_notes,p_sha,p_project);
    RAISE EXCEPTION 'UNEXPECTED_EDITORIAL_APPROVAL:%',p_label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF actual_state<>p_state THEN
      RAISE EXCEPTION '% EXPECTED % GOT %',p_label,p_state,actual_state;
    END IF;
    RAISE NOTICE 'PASS % (SQLSTATE %)',p_label,actual_state;
  END;
END $$;

INSERT INTO auth.users(id)
VALUES ('77777777-7777-4777-8777-777777777777');

-- The unapproved ordinary report has the newest recorded_at of the two
-- ready_for_editor reports.
DO $$
DECLARE next_report uuid;
BEGIN
  SELECT id INTO next_report FROM public.media_factcheck_reports r
  WHERE r.outcome='ready_for_editor'
  AND NOT EXISTS (
    SELECT 1 FROM public.media_factcheck_editorial_decisions d
      WHERE d.report_id=r.id)
  ORDER BY r.recorded_at DESC LIMIT 1;
  IF next_report IS NULL THEN RAISE EXCEPTION 'MISSING_SECOND_REPORT';END IF;
  PERFORM pg_temp.expect_editorial_rejection(
    'NON_OWNER_APPROVAL',next_report,'23514',
    '77777777-7777-4777-8777-777777777777');
  PERFORM pg_temp.expect_editorial_rejection(
    'TAMPERED_CONTENT_SHA',next_report,'23514',
    '66666666-6666-4666-8666-666666666666',false,
    'Verified full source material for the exact story.',repeat('f',64));
  PERFORM pg_temp.expect_editorial_rejection(
    'SHORT_NOTES',next_report,'23514',
    '66666666-6666-4666-8666-666666666666',false,'OK');
  PERFORM pg_temp.expect_editorial_rejection(
    'WRONG_PROJECT',next_report,'23514',
    '66666666-6666-4666-8666-666666666666',false,
    'Reviewed the exact video script and both sources.',
    NULL,'99999999-9999-4999-8999-999999999999');

  UPDATE public.media_scripts SET version=2
    WHERE id='22222222-2222-4222-8222-222222222222';
  PERFORM pg_temp.expect_editorial_rejection('NEW_SCRIPT_VERSION',next_report);
  UPDATE public.media_scripts SET version=1
    WHERE id='22222222-2222-4222-8222-222222222222';
END $$;

-- A dishonest provider might attach citations from ONE publisher to every
-- claim while counting two different URLs elsewhere. Editorial approval MUST
-- refuse this, even if the report outcome was falsely marked ready_for_editor.
INSERT INTO public.media_factcheck_reports (
 project_id,script_id,run_id,claim_id,reviewer_run_id,
 script_version,revision_id,content_sha256,source_set_sha256,
 writer_model,reviewer_model,risk_tier,outcome,framing,
 framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at
)
SELECT project_id,script_id,run_id,claim_id,gen_random_uuid(),
 script_version,revision_id,content_sha256,source_set_sha256,
 writer_model,reviewer_model,risk_tier,'ready_for_editor','faithful_to_evidence',
 framing_reason,array[]::text[],manuscript_snapshot,source_receipts,
 jsonb_build_array(
   jsonb_build_object('unitId','hook:0','verdict','supported','evidence',
      jsonb_build_array(jsonb_build_object('sourceId','a','exactQuote',
        'Research team announced a safe new API.'))),
   jsonb_build_object('unitId','script:0','verdict','supported','evidence',
      jsonb_build_array(jsonb_build_object('sourceId','a','exactQuote',
        'The technical documentation was published today.')))
 ),clock_timestamp()
FROM public.media_factcheck_reports
WHERE reviewer_run_id='55555555-5555-4555-8555-555555555555';

DO $$
DECLARE bad_report uuid;
BEGIN
  SELECT id INTO bad_report FROM public.media_factcheck_reports
  WHERE outcome='ready_for_editor'
    AND jsonb_array_length(findings->0->'evidence')=1
  ORDER BY recorded_at DESC LIMIT 1;
  IF bad_report IS NULL THEN RAISE EXCEPTION 'MISSING_MALICIOUS_REPORT';END IF;
  PERFORM pg_temp.expect_editorial_rejection(
    'SAME_PUBLISHER_CITATION_FALSE_POSITIVE',bad_report);
END $$;

-- A genuinely unsupported review may be rejected, but never approved.
INSERT INTO public.media_factcheck_reports (
 project_id,script_id,run_id,claim_id,reviewer_run_id,
 script_version,revision_id,content_sha256,source_set_sha256,
 writer_model,reviewer_model,risk_tier,outcome,framing,
 framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at
)
SELECT project_id,script_id,run_id,claim_id,gen_random_uuid(),
 script_version,revision_id,content_sha256,source_set_sha256,
 writer_model,reviewer_model,risk_tier,'requires_review','unverified',
 'An important material assertion was not verified.',
 ARRAY['claim_unverified']::text[],manuscript_snapshot,source_receipts,findings,
 clock_timestamp()
FROM public.media_factcheck_reports
WHERE reviewer_run_id='55555555-5555-4555-8555-555555555555';

DO $$
DECLARE pending uuid;
BEGIN
 SELECT id INTO pending FROM public.media_factcheck_reports
 WHERE reasons=array['claim_unverified']::text[]
 ORDER BY recorded_at DESC LIMIT 1;
 PERFORM pg_temp.expect_editorial_rejection('UNVERIFIED_NEWS_APPROVAL',pending);
 PERFORM pg_temp.try_editorial(pending,
   '66666666-6666-4666-8666-666666666666',
   false,'The source is contradictory and this item must not be published.',
   NULL,NULL,'reject');
 RAISE NOTICE 'PASS UNVERIFIED_NEWS_REJECTION';
END $$;

-- A high-impact HOLD may progress to a human decision only with exact
-- safe evidence and an explicit written sensitivity acknowledgement.
INSERT INTO public.media_factcheck_reports (
 project_id,script_id,run_id,claim_id,reviewer_run_id,
 script_version,revision_id,content_sha256,source_set_sha256,
 writer_model,reviewer_model,risk_tier,outcome,framing,
 framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at
)
SELECT project_id,script_id,run_id,claim_id,gen_random_uuid(),
 script_version,revision_id,content_sha256,source_set_sha256,
 writer_model,reviewer_model,'sensitive','requires_review','faithful_to_evidence',
 'Human review required for a high-impact claim.',
 ARRAY['sensitive_or_unclassified']::text[],
 jsonb_set(manuscript_snapshot,'{riskTier}','"sensitive"'::jsonb),
 source_receipts,findings,clock_timestamp()
FROM public.media_factcheck_reports
WHERE reviewer_run_id='55555555-5555-4555-8555-555555555555';

DO $$
DECLARE pending uuid;
BEGIN
 SELECT id INTO pending FROM public.media_factcheck_reports
 WHERE reasons=array['sensitive_or_unclassified']::text[]
 ORDER BY recorded_at DESC LIMIT 1;
 PERFORM pg_temp.expect_editorial_rejection('SENSITIVE_WITHOUT_ACK',pending);
 PERFORM pg_temp.try_editorial(pending,
   '66666666-6666-4666-8666-666666666666',true,
   'I checked every source and explicitly acknowledge the sensitive risk before allowing a preparation-only draft.');
 RAISE NOTICE 'PASS SENSITIVE_EXPLICIT_OWNER_ACK';
END $$;

SELECT pg_temp.expect_immutable(
 'EDITORIAL_UPDATE_DENIED',
 'UPDATE public.media_factcheck_editorial_decisions SET decision=''reject''');
SELECT pg_temp.expect_immutable(
 'EDITORIAL_DELETE_DENIED',
 'DELETE FROM public.media_factcheck_editorial_decisions');
SELECT pg_temp.expect_immutable(
 'EDITORIAL_TRUNCATE_DENIED',
 'TRUNCATE public.media_factcheck_editorial_decisions');

DO $$
BEGIN
 IF (SELECT count(*) FROM public.media_factcheck_editorial_decisions)<>3
 THEN RAISE EXCEPTION 'WRONG_FINAL_EDITORIAL_COUNT';END IF;
 RAISE NOTICE 'PASS IMMUTABLE_OWNER_DECISIONS=3';
END $$;

-- Nova's agent-shadow evidence is NOT the project owner's approval. It
-- cannot be used to authorize rendering, spending, scheduling or publishing.
DO $$
DECLARE count_policies integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='media_factcheck_atlas_decisions'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'ATLAS_RLS_NOT_FORCED';END IF;
  SELECT count(*) INTO count_policies FROM pg_policies
  WHERE schemaname='public' AND tablename='media_factcheck_atlas_decisions';
  IF count_policies<>0 OR
    has_table_privilege('anon','public.media_factcheck_atlas_decisions','SELECT') OR
    has_table_privilege('authenticated','public.media_factcheck_atlas_decisions','INSERT') OR
    has_table_privilege('service_role','public.media_factcheck_atlas_decisions','UPDATE') OR
    has_table_privilege('service_role','public.media_factcheck_atlas_decisions','DELETE') OR
    has_table_privilege('service_role','public.media_factcheck_atlas_decisions','TRUNCATE') OR
    NOT has_table_privilege('service_role','public.media_factcheck_atlas_decisions','SELECT') OR
    NOT has_table_privilege('service_role','public.media_factcheck_atlas_decisions','INSERT')
  THEN RAISE EXCEPTION 'ATLAS_DB_GRANTS_UNSAFE';END IF;
  RAISE NOTICE 'PASS ATLAS_PRIVATE_APPEND_ONLY_GRANTS';
END $$;

-- A low-impact report with Atlas core as actor and an EXISTING delegated
-- project role in the run snapshot can generate ONE shadow candidate.
-- No agent named Nova is registered or required.
SET ROLE service_role;
INSERT INTO public.media_factcheck_atlas_decisions (
  project_id,agent_id,workflow_id,agent_step_order,
  agent_step_log_id,agent_step_output_sha256,run_id,claim_id,report_id,script_id,
  script_version,revision_id,content_sha256,source_set_sha256,
  reviewer_run_id,policy_version,decision,reason
)
SELECT
  r.project_id,'atlas.core','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  w.workflow_id,l.step_order,l.id,
  encode(sha256(convert_to(l.content,'UTF8')),'hex'),
  r.run_id,r.claim_id,r.id,r.script_id,r.script_version,r.revision_id,
  r.content_sha256,r.source_set_sha256,r.reviewer_run_id,
  'atlas.shadow.v1','editorial_candidate','ordinary_story_independently_supported'
FROM public.media_factcheck_reports r
JOIN public.runs w ON w.id=r.run_id
JOIN public.run_logs l ON l.run_id=r.run_id
WHERE r.reviewer_run_id='55555555-5555-4555-8555-555555555555'
  AND l.role='assistant' AND l.step_order=1;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.media_factcheck_atlas_decisions)<>1
  THEN RAISE EXCEPTION 'ATLAS_SHADOW_WRITE_MISSING';END IF;
  RAISE NOTICE 'PASS ATLAS_CORE_WITH_EXISTING_DELEGATED_ROLE';
END $$;

-- Test helper deliberately refers only to the report already used for shadow
-- evidence. It never signs or fabricates an actual human or provider action.
CREATE FUNCTION pg_temp.try_atlas(
  p_report uuid,
  p_agent uuid DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  p_claim uuid DEFAULT NULL,
  p_version integer DEFAULT NULL,
  p_source_sha text DEFAULT NULL,
  p_project uuid DEFAULT NULL,
  p_workflow uuid DEFAULT NULL,
  p_step_order integer DEFAULT NULL,
  p_step_log uuid DEFAULT NULL,
  p_output_sha text DEFAULT NULL,
  p_actor_key text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.media_factcheck_atlas_decisions (
    project_id,actor_key,workflow_agent_id,workflow_id,agent_step_order,
    agent_step_log_id,agent_step_output_sha256,run_id,claim_id,report_id,script_id,
    script_version,revision_id,content_sha256,source_set_sha256,
    reviewer_run_id,policy_version,decision,reason
  )
  SELECT coalesce(p_project,r.project_id),coalesce(p_actor_key,'atlas.core'),p_agent,
    coalesce(p_workflow,w.workflow_id),
    coalesce(p_step_order,l.step_order),coalesce(p_step_log,l.id),
    coalesce(p_output_sha,encode(sha256(convert_to(l.content,'UTF8')),'hex')),
    r.run_id,coalesce(p_claim,r.claim_id),r.id,r.script_id,
    coalesce(p_version,r.script_version),r.revision_id,
    r.content_sha256,coalesce(p_source_sha,r.source_set_sha256),
    r.reviewer_run_id,'atlas.shadow.v1','editorial_candidate',
    'ordinary_story_independently_supported'
  FROM public.media_factcheck_reports r
  JOIN public.runs w ON w.id=r.run_id
  JOIN public.run_logs l ON l.run_id=r.run_id
  WHERE r.id=p_report AND l.role='assistant' AND l.step_order=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATLAS_REPORT_NOT_FOUND' USING errcode='23514';END IF;
END $$;

CREATE FUNCTION pg_temp.expect_atlas_rejection(
  p_label text,p_report uuid,p_state text DEFAULT '23514',
  p_agent uuid DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  p_claim uuid DEFAULT NULL,
  p_version integer DEFAULT NULL,
  p_source_sha text DEFAULT NULL,
  p_project uuid DEFAULT NULL,
  p_workflow uuid DEFAULT NULL,
  p_step_order integer DEFAULT NULL,
  p_step_log uuid DEFAULT NULL,
  p_output_sha text DEFAULT NULL,
  p_actor_key text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    PERFORM pg_temp.try_atlas(p_report,p_agent,p_claim,p_version,p_source_sha,
      p_project,p_workflow,p_step_order,p_step_log,p_output_sha,p_actor_key);
    RAISE EXCEPTION 'ATLAS_SHADOW_UNEXPECTED_ACCEPTANCE:%',p_label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE;
    IF actual_state<>p_state
    THEN RAISE EXCEPTION 'ATLAS_%: EXPECTED %, GOT %',p_label,p_state,actual_state;END IF;
    RAISE NOTICE 'PASS ATLAS_% (SQLSTATE %)',p_label,actual_state;
  END;
END $$;

DO $$
DECLARE original uuid;
  eligible_copy uuid;
  declined uuid;
  sensitive uuid;
BEGIN
  SELECT id INTO original FROM public.media_factcheck_reports
  WHERE reviewer_run_id='55555555-5555-4555-8555-555555555555';
  SELECT id INTO eligible_copy FROM public.media_factcheck_reports
  WHERE outcome='ready_for_editor' AND id<>original
    AND jsonb_array_length(findings->0->'evidence')>=2
    AND exists (SELECT 1 FROM jsonb_array_elements(source_receipts) s
      WHERE s->>'kind'='primary')
  ORDER BY recorded_at DESC LIMIT 1;
  IF eligible_copy IS NULL THEN RAISE EXCEPTION 'ATLAS_VALID_SECOND_REPORT_MISSING';END IF;
  SELECT id INTO declined FROM public.media_factcheck_reports
  WHERE reasons=array['claim_unverified']::text[]
  ORDER BY recorded_at DESC LIMIT 1;
  SELECT id INTO sensitive FROM public.media_factcheck_reports
  WHERE reasons=array['sensitive_or_unclassified']::text[]
  ORDER BY recorded_at DESC LIMIT 1;
  PERFORM pg_temp.expect_atlas_rejection('REPLAY',original,'23505');
  PERFORM pg_temp.expect_atlas_rejection('UNASSIGNED_DELEGATED_ROLE',eligible_copy,'23514',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  PERFORM pg_temp.expect_atlas_rejection('REJECTED_FACTS',declined);
  PERFORM pg_temp.expect_atlas_rejection('SENSITIVE_REQUIRES_OWNER',sensitive);
  PERFORM pg_temp.expect_atlas_rejection('FORGED_SOURCE_SHA',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,repeat('f',64));
  PERFORM pg_temp.expect_atlas_rejection('WRONG_RUN_CLAIM',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '88888888-8888-4888-8888-888888888888');
  PERFORM pg_temp.expect_atlas_rejection('REVISION_CHANGED',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,2);
  PERFORM pg_temp.expect_atlas_rejection('FOREIGN_PROJECT',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,NULL,
    '99999999-9999-4999-8999-999999999999');
  PERFORM pg_temp.expect_atlas_rejection('WRONG_WORKFLOW',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,NULL,NULL,
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  PERFORM pg_temp.expect_atlas_rejection('WRONG_STEP_ORDER',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,NULL,NULL,NULL,2);
  PERFORM pg_temp.expect_atlas_rejection('FORGED_LOG_OUTPUT_SHA',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    repeat('f',64));
  PERFORM pg_temp.expect_atlas_rejection('WRONG_ATLAS_ACTOR_KEY',eligible_copy,'23514',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,'nova.agent');
END $$;

-- The frozen workflow step and post-claim assistant log must remain exact.
-- A report being "ready" never substitutes for actual durable assignment.
DO $$
DECLARE eligible uuid;
BEGIN
  SELECT r.id INTO eligible FROM public.media_factcheck_reports r
  WHERE r.outcome='ready_for_editor'
    AND r.id NOT IN (SELECT report_id FROM public.media_factcheck_atlas_decisions)
    AND jsonb_array_length(r.findings->0->'evidence')>=2
    AND exists (
      SELECT 1 FROM jsonb_array_elements(r.source_receipts) s
      WHERE s->>'kind'='primary'
    )
  ORDER BY r.recorded_at DESC LIMIT 1;
  IF eligible IS NULL THEN RAISE EXCEPTION 'ATLAS_VALID_ASSIGNMENT_TEST_MISSING';END IF;

  UPDATE public.runs SET steps_snapshot='[]'::jsonb
  WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.expect_atlas_rejection('EMPTY_FROZEN_WORKFLOW',eligible);
  UPDATE public.runs
    SET steps_snapshot='[{"order":1,"name":"Atlas FactCheck","agent_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]'::jsonb
  WHERE id='33333333-3333-4333-8333-333333333333';

  UPDATE public.run_logs SET role='user'
  WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  PERFORM pg_temp.expect_atlas_rejection('NOT_ASSISTANT_OUTPUT',eligible);
  UPDATE public.run_logs SET role='assistant'
  WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  UPDATE public.runs SET claimed_at=clock_timestamp()+interval '5 minutes'
  WHERE id='33333333-3333-4333-8333-333333333333';
  PERFORM pg_temp.expect_atlas_rejection('CLAIM_STARTED_AFTER_OUTPUT',eligible);
  UPDATE public.runs SET claimed_at=clock_timestamp()-interval '2 minutes'
  WHERE id='33333333-3333-4333-8333-333333333333';

  -- Atlas is the central executive. This project's registered roles are
  -- News Hunter and Script Writer, and NO Nova workforce agent is needed.
  IF EXISTS (SELECT 1 FROM public.agents
    WHERE lower(btrim(name))='nova') THEN
    RAISE EXCEPTION 'FORBIDDEN_SEPARATE_NOVA_WORKFORCE_AGENT';
  END IF;
  RAISE NOTICE 'PASS ATLAS_NO_SEPARATE_NOVA_AGENT_REQUIRED';
END $$;

-- An otherwise "ready" report with no true primary evidence cannot receive
-- an Atlas (Nova voice alias) candidate, even with structurally valid citations.
INSERT INTO public.media_factcheck_reports (
  project_id,script_id,run_id,claim_id,reviewer_run_id,
  script_version,revision_id,content_sha256,source_set_sha256,
  writer_model,reviewer_model,risk_tier,outcome,framing,
  framing_reason,reasons,manuscript_snapshot,source_receipts,findings,reviewed_at
)
SELECT project_id,script_id,run_id,claim_id,gen_random_uuid(),
  script_version,revision_id,content_sha256,source_set_sha256,
  writer_model,reviewer_model,risk_tier,outcome,framing,
  framing_reason,reasons,manuscript_snapshot,
  (select jsonb_agg(jsonb_set(value,'{kind}','"independent_reporting"'::jsonb))
   from jsonb_array_elements(source_receipts) value),
  findings,clock_timestamp()
FROM public.media_factcheck_reports
WHERE reviewer_run_id='55555555-5555-4555-8555-555555555555';

DO $$
DECLARE copied uuid;
BEGIN
  SELECT id INTO copied FROM public.media_factcheck_reports
  WHERE outcome='ready_for_editor'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(source_receipts) s
      WHERE s->>'kind'='primary')
    ORDER BY recorded_at DESC LIMIT 1;
  IF copied IS NULL THEN RAISE EXCEPTION 'MISSING_NO_PRIMARY_FIXTURE';END IF;
  PERFORM pg_temp.expect_atlas_rejection('NO_PRIMARY_EVIDENCE',copied);
END $$;

UPDATE public.runs SET lease_until=clock_timestamp()-interval '5 minutes'
WHERE id='33333333-3333-4333-8333-333333333333';
DO $$
DECLARE stale_report uuid;
BEGIN
  SELECT id INTO stale_report FROM public.media_factcheck_reports
  WHERE outcome='ready_for_editor'
    AND id NOT IN (SELECT report_id FROM public.media_factcheck_atlas_decisions)
    AND jsonb_array_length(findings->0->'evidence')>=2
    AND exists (SELECT 1 FROM jsonb_array_elements(source_receipts) s
      WHERE s->>'kind'='primary') LIMIT 1;
  PERFORM pg_temp.expect_atlas_rejection('EXPIRED_WORKER_CLAIM',stale_report);
END $$;
UPDATE public.runs SET lease_until=clock_timestamp()+interval '1 hour'
WHERE id='33333333-3333-4333-8333-333333333333';

SELECT pg_temp.expect_immutable('ATLAS_UPDATE_DENIED',
  'UPDATE public.media_factcheck_atlas_decisions SET decision=''editorial_candidate''');
SELECT pg_temp.expect_immutable('ATLAS_DELETE_DENIED',
  'DELETE FROM public.media_factcheck_atlas_decisions');
SELECT pg_temp.expect_immutable('ATLAS_TRUNCATE_DENIED',
  'TRUNCATE public.media_factcheck_atlas_decisions');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.media_factcheck_atlas_decisions)<>1
  THEN RAISE EXCEPTION 'ATLAS_SHADOW_RECEIPTS_MUTATED';END IF;
  RAISE NOTICE 'PASS ATLAS_IMMUTABLE_SHADOW_RECEIPT=1';
END $$;

ROLLBACK;
\echo 'FACTCHECK_PG_ISOLATION_ALL_ASSERTIONS_PASSED'
