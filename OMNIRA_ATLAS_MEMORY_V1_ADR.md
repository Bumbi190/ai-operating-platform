# ADR-ATLAS-001 — Atlas Memory V1 (Intelligence Layer foundation)

> Status: **ACCEPTED (spec lås)** — implementation-ready specification. Ingen kod/migration är skriven eller applicerad ännu.
> Datum: 2026-06-16 · Scope: Atlas Intelligence Layer endast. (H1.P5, Render/Hermes, The Prompt, Media, Hero Image, Project-Isolation-PR är pausade och berörs inte här.)
> Supabase prod: `iboepohjwrhtgshrqaol`. Migrations-katalog: `apps/web/supabase/migrations` (guard-skyddad). Extensions: `pgcrypto` (gen_random_uuid) finns; `vector` finns INTE (krävs först i V1.1).

---

## 1. Context

Atlas har idag **Data** (en live-snapshot i `gatherAtlasContext`) men inget durabelt, rankat, hämtbart eget minne. Befintliga minnesytor är spridda och delvis överlappande: `platform_memory` (confidence/evidence-fakta), `content_feedback` (approval-utfall), `dream_issues` + `memories(source=dream)` (nattliga findings), `memories(source=operator|incident-verification)` (beslut), `atlas_actions` (action-logg). Inget av detta är en gemensam, provenance-bärande, scope-isolerad minneskärna.

Målet (godkänt över tidigare turer): utveckla Atlas från **Data → Workflows → Execution** till **Memory → Knowledge → Reasoning → Learning**, där Atlas Memory blir *single source of truth* för Memory, Knowledge, Graph, Vault och framtida Reasoning — utan omarkitektur senare.

Två styrdokument tycktes konflikta: konceptarkitekturen v0.3 ("projekt är *lenses* över en delad graf, inte silos") och Grundhärdnings-invarianten ("projekt delar **aldrig** minne/embeddings"). ADR:n löser detta med en **scope-axel** (se §4 RLS / isolering).

---

## 2. Decision (låst arkitektur)

Event-sourcat minne: en **immutabel event-spine** (`atlas_memory_events`) är evidens/sanning; en **konsoliderad, versionerad state** (`atlas_memories`) är vad Atlas tror nu; **entiteter + länkar** (`atlas_entities`, `atlas_memory_links`) är kunskapsgrafens noder/edges; **källtrust** (`atlas_sources`, minimal i V1) bärs separat. Memory/Knowledge/Graph/Vault/Reasoning är projektioner eller lager **över samma fem tabeller**.

Låst med **en förenkling** (denna ADR): `atlas_sources` förblir minimal — en seedad uppslagstabell för domän-scopad trust, **inget källhanterings-subsystem** (ingen källgraf-UI, ingen automatisk liveness/cadence, ingen outcome-driven trust-loop) i V1. `derived_from`-lineage reserveras som nullable kolumn men byggs inte ut.

Tre **separata** numeriska fält bevaras överallt (anti-confidence-laundering): `confidence` (sant?), `source_trust` (auktoritet i domän?), `salience` (hämta?).

---

## 3. Exakta tabelldefinitioner (specification of record)

> DDL nedan är **specifikationen**. Migrationsfiler skrivs/appliceras i ett senare, separat steg. `scope` finns på alla tabeller. Alla tider `timestamptz`. PK default `gen_random_uuid()` (pgcrypto).

### 3.1 `atlas_memory_events` — append-only event-spine (immutabel)

| Kolumn | Typ | Constraints | Syfte |
|---|---|---|---|
| id | uuid | PK default gen_random_uuid() | |
| scope | text | NOT NULL, CHECK in ('project','world','org') | isoleringsaxel |
| event_type | text | NOT NULL, CHECK in ('observation','decision','outcome','feedback','fact_assertion','reflection','access','correction') | vad slags händelse |
| memory_class | text | NOT NULL, CHECK in ('episodic','semantic','procedural','decision') | vilken store-klass den folder till |
| project_id | uuid | NULL, FK projects(id) ON DELETE CASCADE | satt när scope='project' |
| entity_kind | text | NULL | t.ex. business/competitor/model/run/lead/topic |
| entity_id | text | NULL | stabil entitets-slug/-id |
| subject | text | NULL | kort etikett |
| content | text | NOT NULL | NL-påståendet |
| structured | jsonb | NOT NULL DEFAULT '{}' | maskinfält |
| confidence | numeric(4,3) | NOT NULL DEFAULT 0.5, CHECK 0..1 | källans påstådda |
| source | text | NOT NULL | approval/drain/cost/dream/operator/atlas/human/lead/backfill:* |
| source_id | text | NULL | originrad (provenance + idempotens) |
| source_ref | text | NULL, FK atlas_sources(key) | domän-trust-uppslag (minimal) |
| derived_from | uuid | NULL, FK atlas_memory_events(id) | lineage-reserv (byggs ej i V1) |
| dedupe_key | text | NULL | konsolideringsnyckel |
| occurred_at | timestamptz | NOT NULL DEFAULT now() | valid-time |
| ingested_at | timestamptz | NOT NULL DEFAULT now() | system-time |
| consolidated_at | timestamptz | NULL | NULL = i konsolideringskö |

Index/constraints:
- `UNIQUE (source, source_id, event_type) WHERE source_id IS NOT NULL` — idempotent emit (skyddar mot dubbel-events vid retries/fencing/backfill-omkörning).
- `INDEX (consolidated_at) WHERE consolidated_at IS NULL` — konsolideringskö.
- `INDEX (scope, memory_class, occurred_at DESC)`, `INDEX (entity_kind, entity_id)`, `INDEX (dedupe_key)`.
- `CHECK (scope='project') = (project_id IS NOT NULL)` — project-scope kräver project_id; world/org kräver NULL.

### 3.2 `atlas_memories` — konsoliderad, versionerad state (läsytan)

| Kolumn | Typ | Constraints | Syfte |
|---|---|---|---|
| id | uuid | PK default gen_random_uuid() | |
| scope | text | NOT NULL, CHECK in ('project','world','org') | |
| memory_class | text | NOT NULL, CHECK in ('episodic','semantic','procedural','decision') | |
| project_id | uuid | NULL, FK projects(id) ON DELETE CASCADE | |
| entity_kind | text | NULL | |
| entity_id | text | NULL, FK atlas_entities(id) via app (se §3.3) | minnet handlar om denna entitet |
| mem_key | text | NOT NULL | stabil identitet inom (scope,class,entity) — upsert-målet |
| summary | text | NOT NULL | bästa nuvarande NL-utsaga |
| value | jsonb | NOT NULL DEFAULT '{}' | |
| confidence | numeric(4,3) | NOT NULL DEFAULT 0.3, CHECK 0..1 | sanning |
| source_trust | numeric(4,3) | NOT NULL DEFAULT 0.5, CHECK 0..1 | auktoritet (separat) |
| evidence_count | int | NOT NULL DEFAULT 1 | oberoende bekräftelser |
| salience | numeric(6,4) | NOT NULL DEFAULT 0 | cachad rankning |
| status | text | NOT NULL DEFAULT 'active', CHECK in ('active','archived','superseded') | |
| superseded_by | uuid | NULL, FK atlas_memories(id) | versionering |
| pinned | boolean | NOT NULL DEFAULT false | mänsklig override |
| valid_from | timestamptz | NULL | validity window (bitemporal-reserv) |
| valid_to | timestamptz | NULL | |
| first_seen_at | timestamptz | NOT NULL DEFAULT now() | |
| last_seen_at | timestamptz | NOT NULL DEFAULT now() | reinforcement-stämpel |
| last_accessed_at | timestamptz | NULL | recall-reinforcement |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() | |
| *(V1.1)* embedding | vector(1536) | NULL | efter `create extension vector` |

Index/constraints:
- `UNIQUE (scope, memory_class, COALESCE(project_id,'…'), COALESCE(entity_kind,''), COALESCE(entity_id,''), mem_key)` — upsert-målet. (Implementeras som unik index över ett normaliserat uttryck eller NOT NULL-defaultade hjälpkolumner; löses i migrationssteget.)
- `INDEX (scope, status, salience DESC)`, partiellt `WHERE status='active'`.
- `INDEX (project_id, memory_class)`, `INDEX (last_seen_at)`.
- `CHECK ((scope='project') = (project_id IS NOT NULL))`.

### 3.3 `atlas_entities` — kanoniska noder (minimal i V1)

| Kolumn | Typ | Constraints |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| scope | text | NOT NULL, CHECK in ('project','world','org') |
| entity_kind | text | NOT NULL |
| canonical_name | text | NOT NULL |
| slug | text | NOT NULL |
| aliases | text[] | NOT NULL DEFAULT '{}' |
| external_ids | jsonb | NOT NULL DEFAULT '{}' |
| project_id | uuid | NULL, FK projects(id) |
| status | text | NOT NULL DEFAULT 'active', CHECK in ('active','merged','split') |
| merged_into | uuid | NULL, FK atlas_entities(id) |
| first_seen_at / last_seen_at | timestamptz | NOT NULL DEFAULT now() |

- `UNIQUE (scope, entity_kind, slug)`. `INDEX (scope, entity_kind)`, GIN `INDEX (aliases)`.
- V1: resolution är minimal (canonical_name + aliases + slug; merge = pekare). Ingen embedding-resolution.

### 3.4 `atlas_memory_links` — typade, temporala edges (stub i V1)

| Kolumn | Typ | Constraints |
|---|---|---|
| id | uuid | PK default gen_random_uuid() |
| scope | text | NOT NULL, CHECK in ('project','world','org') |
| from_kind | text | NOT NULL, CHECK in ('entity','memory','event','source') |
| from_id | uuid | NOT NULL |
| to_kind | text | NOT NULL, CHECK in ('entity','memory','event','source') |
| to_id | uuid | NOT NULL |
| relation | text | NOT NULL (about/supports/contradicts/derived_from/competes_with/acquired/depends_on/regulates/employs) |
| weight | numeric(5,4) | NOT NULL DEFAULT 1.0 |
| confidence | numeric(4,3) | NOT NULL DEFAULT 0.5 |
| valid_from / valid_to | timestamptz | NULL (temporala edges) |
| created_from_event_id | uuid | NULL, FK atlas_memory_events(id) |
| status | text | NOT NULL DEFAULT 'active', CHECK in ('active','superseded') |
| created_at | timestamptz | NOT NULL DEFAULT now() |

- `UNIQUE (from_kind, from_id, relation, to_kind, to_id) WHERE status='active'`. `INDEX (to_kind, to_id)` (backlinks).
- V1: populeras **endast** med provenance-edges (memory→event, memory→entity) ur konsolideringen. Entity↔entity-edges = V1.2.

### 3.5 `atlas_sources` — minimal trust-uppslag (FÖRENKLAD i V1)

| Kolumn | Typ | Constraints |
|---|---|---|
| key | text | PK (t.ex. 'rss_anthropic','operator','dream','human','model:sonnet') |
| label | text | NOT NULL |
| source_type | text | NOT NULL, CHECK in ('rss','api','model','human','scrape','internal') |
| trust_by_domain | jsonb | NOT NULL DEFAULT '{}' (t.ex. {"ai_models":0.9,"markets":0.3}) |
| default_trust | numeric(4,3) | NOT NULL DEFAULT 0.5 |
| created_at | timestamptz | NOT NULL DEFAULT now() |

- V1 = **seedad statisk tabell**. Inget liveness/cadence/källgraf/outcome-trust-loop. `atlas_memory_events.source_ref` → denna; konsolideringen läser `trust_by_domain`/`default_trust` in i `atlas_memories.source_trust`.

---

## 4. RLS-strategi

**Princip:** RLS påslaget **med explicita policies från dag 1** — upprepa INTE dev-readiness-fyndet (11 tenant-tabeller med RLS på men noll policy = noll DB-isolering). App-lagret (`applyProjectScope` + `assertProjectAllowed`) förblir den primära enforcaren idag (system skriver via service-role som bypassar RLS); RLS är **defense-in-depth** + deny-by-default.

Projekt-åtkomst är grundad i den befintliga modellen: `projects.owner_id = auth.uid()` (single-owner; ingen membership-tabell; `getAllowedProjectIds` speglar `owner_id = userId`).

Policies per tabell (gäller `atlas_memory_events`, `atlas_memories`, `atlas_entities`, `atlas_memory_links`):
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
- **SELECT (authenticated):** `USING ( scope = 'world' OR (scope = 'project' AND project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())) )`. → world läsbart av alla inloggade; project endast för ägaren; **org aldrig** via authenticated.
- **INSERT/UPDATE/DELETE (authenticated):** ingen policy → nekas. Alla skrivningar sker via **service-role** (systememitter/konsolidering/broker), som bypassar RLS.
- **org-scope:** ingen authenticated-policy matchar (scope='org' faller utanför SELECT-USING) → endast service-role/broker.
- `atlas_sources`: läsbar för authenticated (ingen hemlig data), skrivning service-role.

Embeddings (V1.1): separata per scope; **aldrig ett delat vektorindex över project-scope** (skulle bryta isoleringsinvarianten även om RLS finns på radnivå).

---

## 5. Migrationssekvens

Filer i `apps/web/supabase/migrations/`, namn `<14-siffrigt ts>_<name>.sql`. Varje namn blir **guard-tvingad** ledger-post → **applicera mot prod-ledgern via `apply_migration(name='<name>')` FÖRE deploy** (fail-closed migration-guard). Additivt only; inga destruktiva ändringar på legacy i V1.0. Bygg/verifiera på scoped Supabase-branch först (H1.P5 Tier-1-mönstret; INFRA-1 gör att native branching inte reproducerar fullt schema → applicera DDL på scoped branch).

Ordning:
1. `atlas_entities` (refereras av memories).
2. `atlas_sources` (minimal) + seed.
3. `atlas_memory_events`.
4. `atlas_memories`.
5. `atlas_memory_links`.
6. `atlas_memory_rls` — enable RLS + policies på 1,3,4,5 (+ sources).
7. `atlas_consolidate_fn` — `atlas.consolidate_memory_events()` + `atlas.recompute_salience_and_decay()` (plpgsql).
8. `atlas_memory_cron` — pg_cron: `atlas_consolidate` (*/5), `atlas_salience_decay` (nattlig).
9. *(separat, efter dual-write verifierad)* idempotenta backfill-data-migrationer (§6).
10. *(V1.1)* `create extension if not exists vector` + `alter table atlas_memories add column embedding vector(1536)`.

Rollback: tabeller additiva → droppbara. Dual-write gör legacy orört → revert = sluta emittera + droppa tabeller. Ingen dataförlust i legacy.

---

## 6. Backfill-strategi

Alla backfills är **separata, idempotenta, re-körbara** data-migrationer som körs EFTER att dual-write-vägen verifierats live. Idempotens via `UNIQUE(source, source_id, event_type)` på events. Inget legacy raderas i V1.0.

- **`platform_memory` → `atlas_memories` (+ event):** map `category`→`memory_class` (rejection_triggers/avoided_phrases/hook_patterns/content_patterns → `procedural`; brand_voice → `semantic`); `scope='project'`, `entity_kind='business'`, `entity_id=project_id`, `mem_key = category||':'||key`, `summary = value.note`, bär över `confidence/evidence_count/last_seen_at`. Skriv även ett `event_type='fact_assertion'`-event (`source='backfill:platform_memory'`, `source_id=row.id`) för provenance.
- **`content_feedback` → `atlas_memory_events`:** ett event per rad (`event_type='feedback'`, `memory_class='procedural'`, `scope='project'`, `content` = rejection_reason/revision_notes, `structured = {decision, quality_patterns, eval_score_at_decision}`, `source='backfill:content_feedback'`, `source_id=row.id`, `occurred_at=created_at`). Konsolideringen härleder minnen (speglar `updateMemoryFromFeedback`).
- **`dream_issues` → `atlas_memories` (+ event):** `memory_class='episodic'`, `entity_kind='issue'`, `mem_key=issue_id`, `evidence_count=occurrences`, bär `first/last_seen_at`, `structured={severity, latest_action, manager_task_id}`. Lifecycle förblir DERIVERAD ur `manager_tasks` (duplicera inte — länka via `structured.manager_task_id`). `dream_issues` behålls som lifecycle-vy. Event refererar `latest_memory_key`.
- **`memories` → selektivt:** `source IN ('operator','incident-verification')` → `memory_class='decision'`-events (`mem_key` från `key`). `source='dream'` täcks redan av dream_issues → hoppa eller mappa till episodiska events. **Cacher (Hermes-konkurrenter m.m.) backfillas INTE** (operativ cache, inte minne).

---

## 7. Consolidation-job design

**Emit (app-sida, service-role):** `recordMemoryEvent()` gör en ren INSERT i `atlas_memory_events` (idempotent på source/source_id/type). Ingen konsolidering inline.

**Consolidate (DB-sida, plpgsql, pg_cron `*/5`):** `atlas.consolidate_memory_events(batch int default 500)`:
1. Välj events `WHERE consolidated_at IS NULL ORDER BY occurred_at LIMIT batch`.
2. Per event: UPSERT `atlas_memories` på unik-nyckeln (scope,class,entity,mem_key):
   - ny rad → `confidence = clamp(0.3 + delta, 0.05, 0.99)`, `evidence_count=1`, `source_trust` ← uppslag i `atlas_sources`;
   - befintlig → `evidence_count += 1`, `last_seen_at = greatest(last_seen_at, occurred_at)`, `confidence = clamp(confidence + sign·delta, 0.05, 0.99)`, `value = value || event.structured`.
   - `delta = base_delta(event_type) · source_trust`; `sign` = −1 för `correction`/kontradiktion, annars +1. `base_delta`: feedback/observation 0.05, fact_assertion 0.08, decision 0.10, outcome 0.10 (speglar feedback-store).
3. Räkna om `salience` (§ formel nedan). Skriv provenance-edge (memory→event) i `atlas_memory_links`.
4. Sätt `event.consolidated_at = now()` (idempotent guard).

**Salience + decay (DB-sida, plpgsql, pg_cron nattlig):** `atlas.recompute_salience_and_decay()`:
- `salience = clamp01( 0.35·confidence + 0.20·(1−exp(−evidence_count/3)) + 0.30·exp(−Δt_dagar/halflife(class)) + 0.15·type_weight ) + outcome_bonus`; `pinned ⇒ max(salience,0.95)`.
- `type_weight`: decision 1.0 · semantic 0.9 · procedural 0.8 · episodic 0.5. `outcome_bonus`=+0.15 om beslutsminne har länkat realiserat utfall.
- `halflife(class)` dagar: episodic 14 · procedural 90 · semantic 180 · decision 365.
- **Decay/arkivering:** `UPDATE … SET status='archived' WHERE status='active' AND NOT pinned AND salience < 0.08 AND last_seen_at < now()−interval '30 days'`. Mjukt, reversibelt; events bevaras.
- **Event-retention:** episodiska events `consolidated_at IS NOT NULL AND occurred_at < now()−180d` kan rullas upp/prunas i ett separat senare jobb (ej V1.0).

Rent DB-baserat (ingen LLM, ingen Vercel-roundtrip) → billigt och deterministiskt.

---

## 8. `recallMemories()`-kontrakt

Spec (inte kod). App-sida, läs-only i V1.0.

**Input:** `{ allowedProjectIds: string[] | undefined, focusEntities?: {kind,id}[], topics?: string[], classes?: MemoryClass[], minConfidence?=0.0, minSalience?=0.0, tokenBudget?=1500, limit?=40, asBroker?=false }`.

**Beteende (V1.0 — strukturerad, inga embeddings):**
1. Scope-filter: `scope='world' OR (scope='project' AND project_id = ANY(allowedProjectIds))`; `scope='org'` endast om `asBroker=true`. `status='active'`.
2. Valfritt filter på `focusEntities` (entity_kind+entity_id) / `topics` (matchning mot entity_id/summary) / `classes`.
3. `confidence ≥ minConfidence`, `salience ≥ minSalience`.
4. Ordna: `pinned DESC, salience DESC`. Ta top-K tills `tokenBudget`/`limit` nås.

**Output `MemoryPack`:** `{ items: [{ id, memory_class, summary, confidence, salience, source_trust, entity:{kind,id}, provenance:{source, evidence_count, last_seen_at}, scope }], totalConsidered, truncated:boolean }`.

**Invarianter:** returnerar **aldrig** annat projekts scope; org endast som broker. Provenance + confidence + source_trust alltid med (anti-laundering). Hård `tokenBudget` (Cost-Governance-anslutet).

**Sidoeffekt (Phase 3, default av i V1.0):** emit `event_type='access'` för returnerade items → reinforcar `last_accessed_at`/salience. Batchad för att undvika write-amplification.

**V1.1:** lägg till semantiskt re-rank-steg (pgvector) efter strukturell förfiltrering.

---

## 9. Atlas context-injektion

`gatherAtlasContext` utökas med fältet `memory: MemoryPack`, fyllt av `recallMemories()` med anroparens `allowedProjectIds` + aktuellt fokus (aktivt projekt/aktiv research-topic härlett ur vy/konversation).

**Injektionsformat:** ett distinkt `[ATLAS MEMORY]`-block i Atlas context-/system-prompt, **separat** från live-datasnapshotten (businesses/cost/revenue/...), så "vad som är sant nu (Data)" och "vad Atlas minns/tror (Memory)" är visuellt åtskilda. Grupperat per klass (Beslut · Fakta · Mönster · Senaste), varje rad annoterad med `confidence%` + källmarkör, salience-ordnad, pinned alltid med. Hård token-budget (~1500). Format speglar dagens `getContextSummary` men generaliserat och provenance-bärande.

**Governance:** minnespacket är budgeterat och salience-rankat — aldrig obegränsat (knyter till Cost Governance / Band 2). Confidence och källa bärs in i prompten så Atlas kan väga och citera, inte tvätta.

---

## 10. Consequences

**Positivt:** en gemensam minneskärna ersätter fyra överlappande ytor; provenance + scope + versionering by construction; Knowledge/Graph/Vault/Reasoning blir additiva projektioner (ingen omarkitektur); isolering grundad i befintlig `owner_id`-modell + RLS från dag 1; konsolidering är ren DB-aritmetik (billig).

**Kostnad/risk:** event-bloat (mitigeras: retention-jobb senare); entitetsresolution är load-bearing (V1 minimal, medvetet); dual-write-fönster tills backfill verifierats; pgvector måste aktiveras i V1.1; RLS-predikatet förutsätter `projects.owner_id`-modellen (om en membership-modell införs senare måste policyn uppdateras).

**Avgränsat (byggs INTE i V1):** hypotes-/intelligence-lager (Reasoning), Graphify-projektion, Vault-UI, källhanterings-subsystem, embedding-resolution, entity↔entity-edges, outcome-driven trust-decay, full bitemporalitet (kolumner finns, logik deferras).

---

## 11. Open decisions (innan migration skrivs)

1. **mem_key för episodiska 1:1-events** — `source:source_id` (ett minne per händelse) vs aggregera per entitet/dag. *Förslag:* per-händelse för episodic, per-entity för semantic/procedural.
2. **Unik-nyckel med NULL-entiteter** — COALESCE-uttryck vs NOT NULL-defaultade hjälpkolumner för upsert-target. *Förslag:* NOT NULL-defaults (`entity_kind=''`, `entity_id=''`) för deterministisk unik index.
3. **Broker-trigger** — separat cron som läser summary-vy nu, eller deferra hela org-scope till V1.2. *Förslag:* deferra org-emit till V1.2; reservera scope-värdet nu.
4. **`atlas`-schema vs `public`** — lägga funktioner/cron i ett eget `atlas`/`atlas_cron`-schema (som `omnira_cron`) för städning. *Förslag:* eget schema, speglar `omnira_cron`.

> Inget skrivs som migration/kod förrän §11 är avgjort och denna ADR är bekräftad.
