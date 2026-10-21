-- Atlas P1 immutable internal analysis only. No runtime or collection writes.
-- Dependencies: marketplace snapshots (P1B), guarded snapshot store (P1E).
-- Source encoding is versioned, hex UTF-8 tuple JSON; never jsonb::text hashing.
DO $prereq$ BEGIN
 IF to_regprocedure('extensions.digest(bytea,text)') IS NULL OR
    to_regprocedure('public.handlarborsen_store_marketplace_snapshot(date,timestamptz,jsonb,jsonb)') IS NULL THEN
 RAISE EXCEPTION 'atlas_analysis_prerequisite_missing'; END IF;
END $prereq$;
CREATE FUNCTION public.atlas_analysis_time(v timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT pg_catalog.to_char(v AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;
CREATE FUNCTION public.atlas_analysis_fresh(observed timestamptz, evaluated timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $fresh$ SELECT observed<=evaluated AND evaluated<=observed+interval '26 hours' $fresh$;
CREATE FUNCTION public.atlas_analysis_hex(v text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT pg_catalog.encode(pg_catalog.convert_to(v,'UTF8'),'hex') $$;
CREATE FUNCTION public.atlas_analysis_shape(v jsonb, shape jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE k text; x jsonb; t text;
BEGIN
 IF shape ? '$nullable' THEN RETURN v='null'::jsonb OR public.atlas_analysis_shape(v,shape->'$nullable'); END IF;
 IF jsonb_typeof(shape)='string' THEN
 t=shape#>>'{}';
 IF t LIKE 'nullable-%' THEN RETURN v='null'::jsonb OR jsonb_typeof(v)=substring(t FROM 10); END IF;
 RETURN jsonb_typeof(v)=t;
 ELSIF jsonb_typeof(shape)='array' THEN
 IF jsonb_typeof(v)<>'array' THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP
 IF NOT public.atlas_analysis_shape(x,shape->0) THEN RETURN false; END IF;
 END LOOP; RETURN true;
 ELSIF jsonb_typeof(shape)='object' THEN
 IF jsonb_typeof(v)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>(SELECT count(*) FROM jsonb_object_keys(shape)) THEN RETURN false; END IF;
 FOR k IN SELECT jsonb_object_keys(shape) LOOP
 IF NOT v ? k OR NOT public.atlas_analysis_shape(v->k,shape->k) THEN RETURN false; END IF;
 END LOOP; RETURN true;
 END IF;
 RETURN false;
END $fn$;
CREATE FUNCTION public.atlas_analysis_insight_valid(v jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT public.atlas_analysis_shape(v,$shape${"id":"string","rule":"string","ruleVersion":"string","priority":"string","title":"string","observation":"string","evidence":[{"metricKey":"string","value":"nullable-number","availability":"string","reason":"nullable-string","observedAt":"string","capturedAt":"string","snapshotDate":"string","source":"string","projectId":"string","schemaVersion":"number","snapshotRef":"string","collectorId":"string","collectorVersion":"null","completeness":"string","semanticKind":"string","window":{"start":"string","end":"string","timezone":"string","complete":"nullable-boolean"},"quality":{"reportState":"string","completeness":"string","availableCount":"nullable-number","totalCount":"number","freshness":"string","ageHours":"nullable-number","collection":{"$nullable":{"lastSuccess":{"$nullable":{"ranAt":"string","snapshotDate":"string","ageHours":"number"}},"lastAttempt":{"$nullable":{"ranAt":"string","status":"string"}},"today":"string","todayDate":"string","latestAttemptFailed":"boolean"}},"skippedInvalid":"number","reasons":["string"],"blockedRules":[{"rule":"string","reason":"string"}]}}],"quality":{"reportState":"string","completeness":"string","availableCount":"nullable-number","totalCount":"number","freshness":"string","ageHours":"nullable-number","collection":{"$nullable":{"lastSuccess":{"$nullable":{"ranAt":"string","snapshotDate":"string","ageHours":"number"}},"lastAttempt":{"$nullable":{"ranAt":"string","status":"string"}},"today":"string","todayDate":"string","latestAttemptFailed":"boolean"}},"skippedInvalid":"number","reasons":["string"],"blockedRules":[{"rule":"string","reason":"string"}]},"kind":"string","blockedReason":"null","reviewReason":"string","nextCheck":"string"}$shape$::jsonb) $$;
CREATE FUNCTION public.atlas_analysis_source_rows(p_project_id uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SET search_path='' AS $fn$
 WITH snapshots AS MATERIALIZED (
 SELECT s.id,s.project_id,s.snapshot_date,s.observed_at,s.captured_at,s.schema_version,s.window_hours,s.completeness,s.unavailable,s.companies_registered_total,s.companies_verified_total,s.vehicles_published_active,s.vehicles_reserved,s.vehicles_published_last_24h,s.bids_total,s.bids_last_24h,s.interests_last_24h,s.offers_last_24h,s.deals_completed_total,s.deals_completed_last_24h
 FROM public.handlarborsen_marketplace_snapshots s WHERE s.project_id=p_project_id
 ORDER BY s.snapshot_date DESC,s.id DESC LIMIT 30 FOR SHARE
 ), audit AS MATERIALIZED (
 SELECT id,project_id,collector_id,status,ran_at,snapshot_date,metadata->>'storage_outcome' AS storage_outcome
 FROM public.collector_runs WHERE project_id=p_project_id AND collector_id='handlarborsen.marketplace'
 ORDER BY ran_at DESC,id DESC LIMIT 30
 )
 SELECT jsonb_build_object('schemaVersion',1,'reportContractVersion','handlarborsen-marketplace-report-1','projectId',p_project_id::text,'slug','handlarborsen','auditReadable',true,
 'semantics',$sem$[{"key":"companies_registered_total","label":"Registrerade företag","group":"Företag","kind":"total","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"companies_verified_total","label":"Verifierade företag","group":"Företag","kind":"total","populationCaveat":"population_unverified","coverage":null,"collectorVersion":null},{"key":"vehicles_published_active","label":"Publicerade fordon","group":"Fordon","kind":"current","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"vehicles_reserved","label":"Reserverade fordon","group":"Fordon","kind":"current","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"vehicles_published_last_24h","label":"Nya fordon senaste 24 h","group":"Fordon","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"bids_total","label":"Bud totalt","group":"Bud och intresse","kind":"total","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"bids_last_24h","label":"Bud senaste 24 h","group":"Bud och intresse","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"interests_last_24h","label":"Intresseanmälningar senaste 24 h","group":"Bud och intresse","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"offers_last_24h","label":"Erbjudanden senaste 24 h","group":"Bud och intresse","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"deals_completed_total","label":"Slutförda affärer totalt","group":"Affärer","kind":"total","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"deals_completed_last_24h","label":"Slutförda affärer senaste 24 h","group":"Affärer","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null}]$sem$::jsonb,
 'snapshots',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id::text,
'project_id',s.project_id::text,
'snapshot_date',s.snapshot_date::text,
'observed_at',public.atlas_analysis_time(s.observed_at),
'captured_at',public.atlas_analysis_time(s.captured_at),
'schema_version',s.schema_version,
'window_hours',s.window_hours,
'completeness',s.completeness,
'unavailable',s.unavailable,
'companies_registered_total',s.companies_registered_total::text,
'companies_verified_total',s.companies_verified_total::text,
'vehicles_published_active',s.vehicles_published_active::text,
'vehicles_reserved',s.vehicles_reserved::text,
'vehicles_published_last_24h',s.vehicles_published_last_24h::text,
'bids_total',s.bids_total::text,
'bids_last_24h',s.bids_last_24h::text,
'interests_last_24h',s.interests_last_24h::text,
'offers_last_24h',s.offers_last_24h::text,
'deals_completed_total',s.deals_completed_total::text,
'deals_completed_last_24h',s.deals_completed_last_24h::text) ORDER BY s.snapshot_date DESC,s.id DESC) FROM snapshots s),'[]'::jsonb),
 'runs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id::text,'project_id',project_id::text,'collector_id',collector_id,'status',status,'ran_at',public.atlas_analysis_time(ran_at),'snapshot_date',snapshot_date::text,'storage_outcome',storage_outcome) ORDER BY ran_at DESC,id DESC) FROM audit),'[]'::jsonb))
$fn$;
CREATE FUNCTION public.atlas_analysis_encode(v jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $fn$
 SELECT replace(json_build_array(1,public.atlas_analysis_hex(v->>'reportContractVersion'),public.atlas_analysis_hex(v->>'projectId'),public.atlas_analysis_hex(v->>'slug'),(v->>'auditReadable')::boolean,
 (SELECT coalesce(json_agg(json_build_array(public.atlas_analysis_hex(r->>'key'),public.atlas_analysis_hex(r->>'label'),public.atlas_analysis_hex(r->>'group'),public.atlas_analysis_hex(r->>'kind'),public.atlas_analysis_hex(r->>'populationCaveat'),public.atlas_analysis_hex(r->>'coverage'),public.atlas_analysis_hex(r->>'collectorVersion')) ORDER BY n),'[]'::json) FROM jsonb_array_elements(v->'semantics') WITH ORDINALITY AS a(r,n)),
 (SELECT coalesce(json_agg(json_build_array(public.atlas_analysis_hex(r->>'id'),public.atlas_analysis_hex(r->>'project_id'),public.atlas_analysis_hex(r->>'snapshot_date'),public.atlas_analysis_hex(r->>'observed_at'),public.atlas_analysis_hex(r->>'captured_at'),(r->>'schema_version')::integer,(r->>'window_hours')::integer,public.atlas_analysis_hex(r->>'completeness'),public.atlas_analysis_hex(r->>'companies_registered_total'),public.atlas_analysis_hex(r->'unavailable'->>'companies_registered_total'),public.atlas_analysis_hex(r->>'companies_verified_total'),public.atlas_analysis_hex(r->'unavailable'->>'companies_verified_total'),public.atlas_analysis_hex(r->>'vehicles_published_active'),public.atlas_analysis_hex(r->'unavailable'->>'vehicles_published_active'),public.atlas_analysis_hex(r->>'vehicles_reserved'),public.atlas_analysis_hex(r->'unavailable'->>'vehicles_reserved'),public.atlas_analysis_hex(r->>'vehicles_published_last_24h'),public.atlas_analysis_hex(r->'unavailable'->>'vehicles_published_last_24h'),public.atlas_analysis_hex(r->>'bids_total'),public.atlas_analysis_hex(r->'unavailable'->>'bids_total'),public.atlas_analysis_hex(r->>'bids_last_24h'),public.atlas_analysis_hex(r->'unavailable'->>'bids_last_24h'),public.atlas_analysis_hex(r->>'interests_last_24h'),public.atlas_analysis_hex(r->'unavailable'->>'interests_last_24h'),public.atlas_analysis_hex(r->>'offers_last_24h'),public.atlas_analysis_hex(r->'unavailable'->>'offers_last_24h'),public.atlas_analysis_hex(r->>'deals_completed_total'),public.atlas_analysis_hex(r->'unavailable'->>'deals_completed_total'),public.atlas_analysis_hex(r->>'deals_completed_last_24h'),public.atlas_analysis_hex(r->'unavailable'->>'deals_completed_last_24h')) ORDER BY r->>'snapshot_date' DESC,r->>'id' DESC),'[]'::json) FROM jsonb_array_elements(v->'snapshots') AS a(r)),
 (SELECT coalesce(json_agg(json_build_array(public.atlas_analysis_hex(r->>'id'),public.atlas_analysis_hex(r->>'project_id'),public.atlas_analysis_hex(r->>'collector_id'),public.atlas_analysis_hex(r->>'status'),public.atlas_analysis_hex(r->>'ran_at'),public.atlas_analysis_hex(r->>'snapshot_date'),public.atlas_analysis_hex(r->>'storage_outcome')) ORDER BY r->>'ran_at' DESC,r->>'id' DESC),'[]'::json) FROM jsonb_array_elements(v->'runs') AS a(r)))::text,' ','')
$fn$;
CREATE FUNCTION public.atlas_analysis_source_encoding(p_project_id uuid) RETURNS text
LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT public.atlas_analysis_encode(public.atlas_analysis_source_rows(p_project_id)) $$;
CREATE FUNCTION public.atlas_analysis_source_valid(v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE r jsonb; k text; n integer; reason text;
BEGIN
 IF NOT public.atlas_analysis_shape(v,$source${"schemaVersion":"number","reportContractVersion":"string","projectId":"string","slug":"string","auditReadable":"boolean","semantics":[{"key":"string","label":"string","group":"string","kind":"string","populationCaveat":"nullable-string","coverage":"null","collectorVersion":"null"}],"snapshots":[{"id":"string","project_id":"string","snapshot_date":"string","observed_at":"string","captured_at":"string","schema_version":"number","window_hours":"number","completeness":"string","unavailable":"object","companies_registered_total":"nullable-string","companies_verified_total":"nullable-string","vehicles_published_active":"nullable-string","vehicles_reserved":"nullable-string","vehicles_published_last_24h":"nullable-string","bids_total":"nullable-string","bids_last_24h":"nullable-string","interests_last_24h":"nullable-string","offers_last_24h":"nullable-string","deals_completed_total":"nullable-string","deals_completed_last_24h":"nullable-string"}],"runs":[{"id":"string","project_id":"string","collector_id":"string","status":"string","ran_at":"string","snapshot_date":"nullable-string","storage_outcome":"nullable-string"}]}$source$::jsonb) OR v->'semantics'<>$sem$[{"key":"companies_registered_total","label":"Registrerade företag","group":"Företag","kind":"total","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"companies_verified_total","label":"Verifierade företag","group":"Företag","kind":"total","populationCaveat":"population_unverified","coverage":null,"collectorVersion":null},{"key":"vehicles_published_active","label":"Publicerade fordon","group":"Fordon","kind":"current","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"vehicles_reserved","label":"Reserverade fordon","group":"Fordon","kind":"current","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"vehicles_published_last_24h","label":"Nya fordon senaste 24 h","group":"Fordon","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"bids_total","label":"Bud totalt","group":"Bud och intresse","kind":"total","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"bids_last_24h","label":"Bud senaste 24 h","group":"Bud och intresse","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"interests_last_24h","label":"Intresseanmälningar senaste 24 h","group":"Bud och intresse","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"offers_last_24h","label":"Erbjudanden senaste 24 h","group":"Bud och intresse","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"deals_completed_total","label":"Slutförda affärer totalt","group":"Affärer","kind":"total","populationCaveat":null,"coverage":null,"collectorVersion":null},{"key":"deals_completed_last_24h","label":"Slutförda affärer senaste 24 h","group":"Affärer","kind":"window24h","populationCaveat":null,"coverage":null,"collectorVersion":null}]$sem$::jsonb OR jsonb_array_length(v->'snapshots')>30 OR jsonb_array_length(v->'runs')>30 THEN RETURN false; END IF;
 IF v->>'schemaVersion'<>'1' OR v->>'projectId'<>'8f673c09-1c8f-4d78-876e-4c14bf1c89b3' OR v->>'slug'<>'handlarborsen' OR v->>'reportContractVersion'<>'handlarborsen-marketplace-report-1' OR jsonb_typeof(v->'snapshots')<>'array' OR jsonb_typeof(v->'runs')<>'array' THEN RETURN false; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(v->'snapshots') LOOP
 IF r->>'schema_version'<>'1' OR r->>'window_hours'<>'24' OR r->>'project_id'<>v->>'projectId' OR left(r->>'observed_at',10)<>r->>'snapshot_date' OR jsonb_typeof(r->'unavailable')<>'object' THEN RETURN false; END IF;
 n=0;
 FOREACH k IN ARRAY ARRAY['companies_registered_total','companies_verified_total','vehicles_published_active','vehicles_reserved','vehicles_published_last_24h','bids_total','bids_last_24h','interests_last_24h','offers_last_24h','deals_completed_total','deals_completed_last_24h'] LOOP
 IF r->k='null'::jsonb THEN
 n=n+1; reason=r->'unavailable'->>k;
 IF reason IS NULL OR reason NOT IN ('query_failed','invalid_count') THEN RETURN false; END IF;
 ELSE
 IF jsonb_typeof(r->k)<>'string' OR (r->>k)!~'^(0|[1-9][0-9]*)$' OR (r->>k)::numeric>9007199254740991 THEN RETURN false; END IF;
 IF r->'unavailable' ? k THEN RETURN false; END IF;
 END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(r->'unavailable'))<>n OR r->>'completeness'<>(CASE WHEN n=0 THEN 'complete' WHEN n=11 THEN 'unavailable' ELSE 'partial' END) THEN RETURN false; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(v->'runs') LOOP
 IF r->>'status' NOT IN ('ok','skipped','error') OR r->>'project_id'<>v->>'projectId' OR r->>'collector_id'<>'handlarborsen.marketplace' THEN RETURN false; END IF;
 END LOOP; RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;
CREATE TABLE public.atlas_analysis_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 schema_version smallint NOT NULL CHECK(schema_version=1),
 workflow_key text NOT NULL CHECK(workflow_key='handlarborsen.manual-insight-review'),
 rule_id text NOT NULL CHECK(rule_id IN ('company-status','bid-window')),
 rule_version text NOT NULL CHECK(length(rule_version) BETWEEN 1 AND 80),
 original_insight_id text NOT NULL,
 evidence_hash text NOT NULL CHECK(evidence_hash ~ '^[0-9a-f]{64}$'),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 source_envelope jsonb NOT NULL CHECK(public.atlas_analysis_source_valid(source_envelope)),
 insight jsonb NOT NULL CHECK(public.atlas_analysis_insight_valid(insight) AND insight->>'kind'='proposal' AND insight->>'rule'=rule_id AND insight->>'ruleVersion'=rule_version AND insight->>'id'=original_insight_id),
 manual_steps jsonb NOT NULL CHECK(public.atlas_analysis_shape(manual_steps,'["string"]'::jsonb) AND jsonb_array_length(manual_steps)=3 AND manual_steps->>0='Granska den citerade rapporten' AND manual_steps->>1=insight->>'nextCheck' AND manual_steps->>2='Dokumentera resultatet utanför detta analysutkast'),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evaluated_at timestamptz NOT NULL,
 fresh_until timestamptz NOT NULL,
 UNIQUE(project_id,id),
 UNIQUE(project_id,workflow_key,rule_id,rule_version,evidence_hash)
);
CREATE TABLE public.atlas_analysis_draft_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 draft_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('created','superseded')),
 superseded_by uuid,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(project_id,draft_id) REFERENCES public.atlas_analysis_drafts(project_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,superseded_by) REFERENCES public.atlas_analysis_drafts(project_id,id) ON DELETE RESTRICT,
 CHECK((kind='created' AND superseded_by IS NULL) OR (kind='superseded' AND superseded_by IS NOT NULL AND superseded_by<>draft_id))
);
CREATE UNIQUE INDEX atlas_analysis_created_once ON public.atlas_analysis_draft_events(draft_id) WHERE kind='created';
CREATE UNIQUE INDEX atlas_analysis_superseded_once ON public.atlas_analysis_draft_events(draft_id) WHERE kind='superseded';
CREATE INDEX atlas_analysis_history ON public.atlas_analysis_drafts(project_id,created_at DESC,id DESC);
CREATE FUNCTION public.atlas_analysis_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'atlas_analysis_immutable'; END $$;
CREATE TRIGGER atlas_analysis_draft_immutable BEFORE UPDATE OR DELETE ON public.atlas_analysis_drafts FOR EACH ROW EXECUTE FUNCTION public.atlas_analysis_immutable();
CREATE TRIGGER atlas_analysis_event_immutable BEFORE UPDATE OR DELETE ON public.atlas_analysis_draft_events FOR EACH ROW EXECUTE FUNCTION public.atlas_analysis_immutable();
CREATE TRIGGER atlas_analysis_draft_no_truncate BEFORE TRUNCATE ON public.atlas_analysis_drafts FOR EACH STATEMENT EXECUTE FUNCTION public.atlas_analysis_immutable();
CREATE TRIGGER atlas_analysis_event_no_truncate BEFORE TRUNCATE ON public.atlas_analysis_draft_events FOR EACH STATEMENT EXECUTE FUNCTION public.atlas_analysis_immutable();
ALTER TABLE public.atlas_analysis_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_analysis_draft_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_analysis_drafts,public.atlas_analysis_draft_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.atlas_analysis_draft_events_seq_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.atlas_analysis_drafts,public.atlas_analysis_draft_events TO service_role;
CREATE FUNCTION public.atlas_save_analysis_draft(p_actor_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE p public.projects%ROWTYPE; source jsonb; latest jsonb; audit jsonb; h text; v_now timestamptz; observed timestamptz; fresh timestamptz; existing public.atlas_analysis_drafts%ROWTYPE; previous uuid; new_id uuid;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id='8f673c09-1c8f-4d78-876e-4c14bf1c89b3' FOR UPDATE;
 IF NOT FOUND OR p.owner_id IS DISTINCT FROM p_actor_id OR p.slug<>'handlarborsen' THEN RETURN jsonb_build_object('status','not_found'); END IF;
 IF p.atlas_mode NOT IN ('observer','active') OR p.atlas_mode IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF p_payload IS NULL OR NOT public.atlas_analysis_shape(p_payload,$payload${"schemaVersion":"number","workflowKey":"string","projectId":"string","ruleId":"string","ruleVersion":"string","originalInsightId":"string","evidenceHash":"string","contentHash":"string","sourceEnvelope":"object","insight":{"id":"string","rule":"string","ruleVersion":"string","priority":"string","title":"string","observation":"string","evidence":[{"metricKey":"string","value":"nullable-number","availability":"string","reason":"nullable-string","observedAt":"string","capturedAt":"string","snapshotDate":"string","source":"string","projectId":"string","schemaVersion":"number","snapshotRef":"string","collectorId":"string","collectorVersion":"null","completeness":"string","semanticKind":"string","window":{"start":"string","end":"string","timezone":"string","complete":"nullable-boolean"},"quality":{"reportState":"string","completeness":"string","availableCount":"nullable-number","totalCount":"number","freshness":"string","ageHours":"nullable-number","collection":{"$nullable":{"lastSuccess":{"$nullable":{"ranAt":"string","snapshotDate":"string","ageHours":"number"}},"lastAttempt":{"$nullable":{"ranAt":"string","status":"string"}},"today":"string","todayDate":"string","latestAttemptFailed":"boolean"}},"skippedInvalid":"number","reasons":["string"],"blockedRules":[{"rule":"string","reason":"string"}]}}],"quality":{"reportState":"string","completeness":"string","availableCount":"nullable-number","totalCount":"number","freshness":"string","ageHours":"nullable-number","collection":{"$nullable":{"lastSuccess":{"$nullable":{"ranAt":"string","snapshotDate":"string","ageHours":"number"}},"lastAttempt":{"$nullable":{"ranAt":"string","status":"string"}},"today":"string","todayDate":"string","latestAttemptFailed":"boolean"}},"skippedInvalid":"number","reasons":["string"],"blockedRules":[{"rule":"string","reason":"string"}]},"kind":"string","blockedReason":"null","reviewReason":"string","nextCheck":"string"},"manualSteps":["string"],"evaluatedAt":"string","freshUntil":"string"}$payload$::jsonb) THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF p_payload->>'schemaVersion'<>'1' OR p_payload->>'workflowKey'<>'handlarborsen.manual-insight-review' OR p_payload->>'projectId'<>p.id::text OR p_payload->>'ruleId' NOT IN ('company-status','bid-window') OR p_payload->>'ruleVersion'<>'handlarborsen-insights-1.0.0' OR p_payload->>'contentHash'!~'^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('status','conflict'); END IF;
 source=public.atlas_analysis_source_rows(p.id); -- ONE statement snapshot, selected snapshots FOR SHARE.
 IF NOT public.atlas_analysis_source_valid(source) OR source IS DISTINCT FROM p_payload->'sourceEnvelope' THEN RETURN jsonb_build_object('status','conflict'); END IF;
 h=encode(extensions.digest(convert_to(public.atlas_analysis_encode(source),'UTF8'),'sha256'),'hex');
 IF h IS DISTINCT FROM p_payload->>'evidenceHash' THEN RETURN jsonb_build_object('status','conflict'); END IF;
 v_now=clock_timestamp(); latest=source->'snapshots'->0; audit=source->'runs'->0;
 IF latest IS NULL OR audit IS NULL OR (audit->>'snapshot_date' IS NULL OR NOT coalesce(audit->>'status'='ok' OR (audit->>'status'='skipped' AND audit->>'storage_outcome' IN ('rejected','unchanged')),false)) OR latest->>'completeness'='unavailable' THEN RETURN jsonb_build_object('status','conflict'); END IF;
 observed=(latest->>'observed_at')::timestamptz; fresh=observed+interval '26 hours';
 IF NOT public.atlas_analysis_fresh(observed,v_now) OR fresh IS DISTINCT FROM (p_payload->>'freshUntil')::timestamptz THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF p_payload->>'ruleId'='company-status' THEN
 IF latest->>'companies_registered_total' IS NULL OR latest->>'companies_verified_total' IS NULL OR (latest->>'companies_registered_total')::bigint<=(latest->>'companies_verified_total')::bigint THEN RETURN jsonb_build_object('status','conflict'); END IF;
 ELSE
 IF latest->>'bids_total' IS NULL OR latest->>'bids_last_24h' IS NULL OR (latest->>'bids_last_24h')::bigint<>0 THEN RETURN jsonb_build_object('status','conflict'); END IF;
 END IF;
 SELECT * INTO existing FROM public.atlas_analysis_drafts WHERE project_id=p.id AND workflow_key=p_payload->>'workflowKey' AND rule_id=p_payload->>'ruleId' AND rule_version=p_payload->>'ruleVersion' AND evidence_hash=h;
 IF FOUND THEN
 IF existing.content_hash<>p_payload->>'contentHash' THEN RETURN jsonb_build_object('status','conflict'); END IF;
 RETURN jsonb_build_object('status','ok','id',existing.id,'created',false);
 END IF;
 SELECT d.id INTO previous FROM public.atlas_analysis_drafts d JOIN public.atlas_analysis_draft_events e ON e.draft_id=d.id AND e.project_id=d.project_id AND e.kind='created'
 WHERE d.project_id=p.id AND d.workflow_key=p_payload->>'workflowKey' AND d.rule_id=p_payload->>'ruleId' AND NOT EXISTS(SELECT FROM public.atlas_analysis_draft_events s WHERE s.draft_id=d.id AND s.kind='superseded')
 ORDER BY e.seq DESC LIMIT 1;
 INSERT INTO public.atlas_analysis_drafts(project_id,schema_version,workflow_key,rule_id,rule_version,original_insight_id,evidence_hash,content_hash,source_envelope,insight,manual_steps,created_by,evaluated_at,fresh_until)
 VALUES(p.id,1,p_payload->>'workflowKey',p_payload->>'ruleId',p_payload->>'ruleVersion',p_payload->>'originalInsightId',h,p_payload->>'contentHash',source,p_payload->'insight',p_payload->'manualSteps',p_actor_id,(p_payload->>'evaluatedAt')::timestamptz,fresh) RETURNING id INTO new_id;
 INSERT INTO public.atlas_analysis_draft_events(project_id,draft_id,kind,actor_id) VALUES(p.id,new_id,'created',p_actor_id);
 IF previous IS NOT NULL THEN INSERT INTO public.atlas_analysis_draft_events(project_id,draft_id,kind,superseded_by,actor_id) VALUES(p.id,previous,'superseded',new_id,p_actor_id); END IF;
 RETURN jsonb_build_object('status','ok','id',new_id,'created',true);
END $fn$;
REVOKE ALL ON FUNCTION public.atlas_analysis_time(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_hex(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_shape(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_insight_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_source_rows(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_encode(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_source_encoding(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_source_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_analysis_immutable() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.atlas_save_analysis_draft(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_save_analysis_draft(uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.atlas_analysis_fresh(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
