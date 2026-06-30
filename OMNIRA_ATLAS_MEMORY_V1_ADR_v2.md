# ADR-ATLAS-001 v2 — Atlas Memory V1 (Intelligence Layer foundation)

> Status: **ACCEPTED — §11 LÅST.** Implementation-ready specification. Supersederar ADR-ATLAS-001 v1. Ingen kod/migration skriven eller applicerad.
> Datum: 2026-06-16 · Scope: Atlas Intelligence Layer endast. (H1.P5, Render/Hermes, The Prompt, Media, Hero Image, Project-Isolation-PR pausade.)
> Plattform verifierad mot prod `iboepohjwrhtgshrqaol`: **PostgreSQL 17.6** (→ `UNIQUE NULLS NOT DISTINCT` tillgängligt), `pgcrypto` finns, `vector` finns INTE (krävs V1.1), `omnira_cron`-schema finns (mönster för `atlas_cron`), `atlas`-schema finns inte (skapas).

---

## 0. §11 — Låsta beslut (ändringar mot v1)

1. **Episodic memories = per händelse:** `mem_key = source || ':' || source_id`; ingen cross-event-konsolidering; `evidence_count` förblir 1.
2. **Semantic + Procedural = konsoliderade per entitet/koncept:** upsert ackumulerar `evidence_count`.
3. **NOT NULL-defaults för entity-fält** (`entity_kind=''`, `entity_id=''`) i stället för COALESCE-index. `project_id` förblir nullable → unik-nyckeln använder `NULLS NOT DISTINCT` (PG17 ✓).
4. **Org Broker helt deferad till V1.2:** scope-värdet `'org'` reserveras i CHECK (forward-compat) men **ingen** broker-cron, **ingen** org-memory-emit, **inga** org-rader skrivs i V1. RLS nekar ändå authenticated åtkomst till org.
5. **Eget `atlas`-schema från start:** tabeller utan `atlas_`-prefix → `atlas.memory_events`, `atlas.memories`, `atlas.entities`, `atlas.memory_links`, `atlas.sources`. Funktioner i `atlas`, cron i `atlas_cron` (speglar `omnira_cron`).
6. **Observability-vy `atlas.memory_health_v`** för minnestillväxt, recall och hälsa (§5).

**Schema-exponering (följd av beslut 5):** `atlas`-schemat måste exponeras för PostgREST (Supabase API → Exposed schemas: lägg till `atlas`) så app-klienten kan göra `supabase.schema('atlas').from('memory_events')`. Alternativ (om vi inte vill exponera schemat): tunna `public`-RP:er/vyer. **Beslut:** exponera `atlas` (enklast, RLS gäller ändå per rad).

---

## 1. Context

(Oförändrat från v1.) Atlas har Data men inget durabelt, rankat, provenance-bärande eget minne; befintliga ytor (`platform_memory`, `content_feedback`, `dream_issues`, `memories`, `atlas_actions`) är spridda och överlappande. Mål: **Memory → Knowledge → Reasoning → Learning**, där Atlas Memory blir *single source of truth* för Memory/Knowledge/Graph/Vault/Reasoning utan omarkitektur. Scope-axeln försonar "lenses över delad graf" (world) med "delar aldrig" (project).

---

## 2. Tabellberoendekarta

```
public.projects (befintlig)
   ▲ owner_id = auth.uid()  (RLS-grund)
   │ FK project_id
   ├──────────────┬───────────────┬────────────────┐
atlas.entities  atlas.memory_events  atlas.memories  (project-scope-rader)
   ▲                ▲   │                 ▲
   │ entity_id(FK)  │   │ FK source_ref   │ entity_id (FK→entities)
   │                │   ▼                 │ superseded_by (self-FK)
   │            atlas.sources             │
   │                ▲                     │
   │ created_from_event_id (FK→events)    │
   └──────────── atlas.memory_links ──────┘
                 (from/to = polymorf uuid+kind; ENDA hård FK = created_from_event_id→events)
```

**Hårda FK:** `entities.project_id→projects`, `memory_events.project_id→projects`, `memory_events.source_ref→sources.key`, `memories.project_id→projects`, `memories.entity_id→entities.id`, `memories.superseded_by→memories.id`, `memory_links.created_from_event_id→memory_events.id`.
**Mjuka (polymorfa) referenser:** `memory_links.from_id/to_id` (uuid + `*_kind`) — ingen hård FK by design (kan peka på entity/memory/event/source); integritet garanteras av konsolideringen. (Trigger-validering kan läggas senare; ej V1.)

**Skapandeordning (topologisk):** `sources` → `entities` → `memory_events` → `memories` → `memory_links` → RLS → funktioner → cron → `memory_health_v`.

---

## 3. Exakt migrationsordning

Filer i `apps/web/supabase/migrations/`, namn `<14-siffrigt ts>_<name>.sql`. Namnet → guard-tvingad ledger-post → **`apply_migration(name=…)` mot prod-ledgern FÖRE deploy**. Additivt only; bygg/verifiera på scoped Supabase-branch först.

| # | Migration (name) | Innehåll |
|---|---|---|
| 1 | `atlas_schema_init` | `create schema atlas; create schema atlas_cron;` + grants/exponering |
| 2 | `atlas_sources` | `atlas.sources` + seed (statisk trust) |
| 3 | `atlas_entities` | `atlas.entities` + index |
| 4 | `atlas_memory_events` | `atlas.memory_events` + index/constraints |
| 5 | `atlas_memories` | `atlas.memories` + unik-index (NULLS NOT DISTINCT) + index |
| 6 | `atlas_memory_links` | `atlas.memory_links` + index |
| 7 | `atlas_memory_rls` | enable RLS + policies (alla tabeller) |
| 8 | `atlas_consolidate_fn` | `atlas.consolidate_memory_events()` + `atlas.recompute_salience_and_decay()` |
| 9 | `atlas_memory_health_v` | `atlas.memory_health_v` (vy) |
| 10 | `atlas_memory_cron` | `atlas_cron`: `atlas_consolidate` (*/5), `atlas_salience_decay` (nattlig) |
| 11 | *(separat, efter dual-write verifierad)* `atlas_backfill_*` | idempotenta data-migrationer (§8) |
| 12 | *(V1.1)* `atlas_memory_embeddings` | `create extension vector` + `alter … add embedding vector(1536)` |

---

## 4. DDL-spec (samtliga tabeller, specification of record)

> Spec, inte applicerad migration. PG17. PK `gen_random_uuid()`. Alla tider `timestamptz`.

### 4.1 `atlas.sources` (minimal — förenkling låst)
```
key            text PRIMARY KEY            -- 'rss_anthropic','operator','dream','human','model:sonnet','backfill:platform_memory',…
label          text NOT NULL
source_type    text NOT NULL CHECK in ('rss','api','model','human','scrape','internal')
trust_by_domain jsonb NOT NULL DEFAULT '{}'  -- {"ai_models":0.9,"markets":0.3}
default_trust  numeric(4,3) NOT NULL DEFAULT 0.5 CHECK 0..1
created_at     timestamptz NOT NULL DEFAULT now()
```
Seed (V1): rader för operator(0.85), dream(0.6), human(0.95), backfill:*(0.5), model:*(0.6), + kända RSS. **Inget** liveness/cadence/källgraf/outcome-loop.

### 4.2 `atlas.entities` (minimal resolution)
```
id            uuid PK DEFAULT gen_random_uuid()
scope         text NOT NULL CHECK in ('project','world','org')
entity_kind   text NOT NULL
canonical_name text NOT NULL
slug          text NOT NULL
aliases       text[] NOT NULL DEFAULT '{}'
external_ids  jsonb  NOT NULL DEFAULT '{}'
project_id    uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE
status        text NOT NULL DEFAULT 'active' CHECK in ('active','merged','split')
merged_into   uuid NULL REFERENCES atlas.entities(id)
first_seen_at timestamptz NOT NULL DEFAULT now()
last_seen_at  timestamptz NOT NULL DEFAULT now()
-- UNIQUE NULLS NOT DISTINCT (scope, entity_kind, slug, project_id)
-- INDEX (scope, entity_kind);  GIN INDEX (aliases)
-- CHECK ((scope='project') = (project_id IS NOT NULL))
```

### 4.3 `atlas.memory_events` (append-only, immutabel)
```
id            uuid PK DEFAULT gen_random_uuid()
scope         text NOT NULL CHECK in ('project','world','org')
event_type    text NOT NULL CHECK in ('observation','decision','outcome','feedback','fact_assertion','reflection','access','correction')
memory_class  text NOT NULL CHECK in ('episodic','semantic','procedural','decision')
project_id    uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE
entity_kind   text NOT NULL DEFAULT ''
entity_id     text NOT NULL DEFAULT ''
subject       text NULL
content       text NOT NULL
structured    jsonb NOT NULL DEFAULT '{}'
confidence    numeric(4,3) NOT NULL DEFAULT 0.5 CHECK 0..1
source        text NOT NULL
source_id     text NULL
source_ref    text NULL REFERENCES atlas.sources(key)
derived_from  uuid NULL REFERENCES atlas.memory_events(id)   -- lineage-reserv (byggs ej i V1)
dedupe_key    text NULL
occurred_at   timestamptz NOT NULL DEFAULT now()             -- valid-time
ingested_at   timestamptz NOT NULL DEFAULT now()             -- system-time
consolidated_at timestamptz NULL
-- UNIQUE (source, source_id, event_type) WHERE source_id IS NOT NULL   (idempotent emit)
-- INDEX (consolidated_at) WHERE consolidated_at IS NULL                (konsolideringskö)
-- INDEX (scope, memory_class, occurred_at DESC); INDEX (entity_kind, entity_id); INDEX (dedupe_key)
-- CHECK ((scope='project') = (project_id IS NOT NULL))
```

### 4.4 `atlas.memories` (konsoliderad, versionerad state — läsytan)
```
id            uuid PK DEFAULT gen_random_uuid()
scope         text NOT NULL CHECK in ('project','world','org')
memory_class  text NOT NULL CHECK in ('episodic','semantic','procedural','decision')
project_id    uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE
entity_kind   text NOT NULL DEFAULT ''
entity_id     text NOT NULL DEFAULT ''          -- (soft ref till entities.slug/id; FK valfri i V1)
mem_key       text NOT NULL                      -- episodic: source:source_id · semantic/procedural: koncept/entitet
summary       text NOT NULL
value         jsonb NOT NULL DEFAULT '{}'
confidence    numeric(4,3) NOT NULL DEFAULT 0.3 CHECK 0..1
source_trust  numeric(4,3) NOT NULL DEFAULT 0.5 CHECK 0..1
evidence_count int NOT NULL DEFAULT 1
salience      numeric(6,4) NOT NULL DEFAULT 0
status        text NOT NULL DEFAULT 'active' CHECK in ('active','archived','superseded')
superseded_by uuid NULL REFERENCES atlas.memories(id)
pinned        boolean NOT NULL DEFAULT false
valid_from    timestamptz NULL
valid_to      timestamptz NULL
first_seen_at timestamptz NOT NULL DEFAULT now()
last_seen_at  timestamptz NOT NULL DEFAULT now()
last_accessed_at timestamptz NULL
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
-- (V1.1) embedding vector(1536) NULL
-- UNIQUE NULLS NOT DISTINCT (scope, memory_class, project_id, entity_kind, entity_id, mem_key)   ← upsert-mål
-- INDEX (scope, status, salience DESC) WHERE status='active'
-- INDEX (project_id, memory_class); INDEX (last_seen_at)
-- CHECK ((scope='project') = (project_id IS NOT NULL))
```
> `entity_kind/entity_id` NOT NULL DEFAULT '' (beslut 3) + `project_id` nullable hanterat via `NULLS NOT DISTINCT` (beslut 3, PG17) ⇒ deterministisk upsert även för world-scope (project_id NULL).

### 4.5 `atlas.memory_links` (typade, temporala edges — stub i V1)
```
id            uuid PK DEFAULT gen_random_uuid()
scope         text NOT NULL CHECK in ('project','world','org')
from_kind     text NOT NULL CHECK in ('entity','memory','event','source')
from_id       uuid NOT NULL
to_kind       text NOT NULL CHECK in ('entity','memory','event','source')
to_id         uuid NOT NULL
relation      text NOT NULL          -- about/supports/contradicts/derived_from/competes_with/acquired/depends_on/regulates/employs
weight        numeric(5,4) NOT NULL DEFAULT 1.0
confidence    numeric(4,3) NOT NULL DEFAULT 0.5
valid_from    timestamptz NULL
valid_to      timestamptz NULL
created_from_event_id uuid NULL REFERENCES atlas.memory_events(id)
status        text NOT NULL DEFAULT 'active' CHECK in ('active','superseded')
created_at    timestamptz NOT NULL DEFAULT now()
-- UNIQUE (from_kind, from_id, relation, to_kind, to_id) WHERE status='active'
-- INDEX (to_kind, to_id)   (backlinks)
```
V1: populeras **endast** med provenance-edges (memory→event, memory→entity) ur konsolideringen. Entity↔entity = M5.

---

## 5. `atlas.memory_health_v` — observability-vy

Syfte: mäta minnestillväxt, konsolideringshälsa, recall-tryck och förfall — **utan** att exponera innehåll (aggregat only; säker att läsa brett).

Kolumner (aggregerat per `scope` × `memory_class`, plus globala rader):
```
scope, memory_class,
events_total            -- count(memory_events)
events_unconsolidated   -- count where consolidated_at is null  (konsolideringsskuld; bör ≈0)
oldest_unconsolidated   -- min(occurred_at) where consolidated_at is null  (latens-larm)
memories_active         -- count(memories) status='active'
memories_archived       -- count status='archived'
memories_superseded     -- count status='superseded'
avg_confidence          -- avg(confidence) active
avg_salience            -- avg(salience) active
pinned_count            -- count pinned
evidence_p50, evidence_p90 -- percentiler evidence_count (konsolideringsdjup)
stale_active            -- active AND last_seen_at < now()-30d AND salience<0.08  (decay-kandidater)
accessed_7d             -- count(last_accessed_at > now()-7d)  (recall-tryck / write-only-graveyard-larm)
last_event_at, last_consolidated_at
```
Implementeras som `view` (eller `materialized view` med nattlig refresh om kostnaden växer). Larm-trösklar (drift, inte i schema): `events_unconsolidated` växande, `oldest_unconsolidated` > 30 min, `accessed_7d` ≈ 0 trots `memories_active` växande (= write-only graveyard, §riskwatch #7).

---

## 6. `recordMemoryEvent()` — design (emit-API, app-sida)

Den **enda** skrivvägen in i minnet. Side-channel: får **aldrig** kasta upp i värdoperationen (mönster som `reportBug`).

**Signatur (kontrakt, ej kod):** `recordMemoryEvent(input): Promise<{ id: string | null; deduped: boolean }>`.

**Input:** `{ scope:'project'|'world', projectId?:string, eventType, memoryClass, entityKind?, entityId?, subject?, content, structured?, confidence?=0.5, source, sourceId?, sourceRef?, dedupeKey?, occurredAt? }`. (`scope='org'` ej tillåtet i V1 — broker deferad.)

**Beteende:**
- INSERT i `atlas.memory_events` via `supabase.schema('atlas')` med **service-role**.
- Idempotens: `ON CONFLICT (source, source_id, event_type) DO NOTHING RETURNING id` → `deduped=true` om 0 rader. (Skyddar mot retries/fencing/backfill-omkörning.)
- Validering: `scope='project' ⇒ projectId krävs`. Defaulta `entityKind/entityId` till `''`.
- Fel sväljs + loggas (returnerar `{id:null}`), aldrig kast.
- **Ingen** konsolidering inline — det sker DB-sidigt (§7).

**Anropas från (V1.0-emitters, se dual-write §8):** approval-PATCH (feedback), drain terminal (run-outcome), Dream-cron (reflection).

---

## 7. Consolidation — design (DB-sida, plpgsql + pg_cron)

**`atlas.consolidate_memory_events(batch int default 500)`** (cron `atlas_consolidate`, `*/5`):
1. Lås & välj `memory_events WHERE consolidated_at IS NULL ORDER BY occurred_at LIMIT batch FOR UPDATE SKIP LOCKED`.
2. Per event, bestäm `mem_key`: episodic → `source||':'||source_id`; semantic/procedural/decision → `dedupe_key` (annars entity-härlett).
3. UPSERT `atlas.memories` på unik-nyckeln:
   - ny: `confidence=clamp(0.3 + delta,0.05,0.99)`, `evidence_count=1`, `source_trust` ← `atlas.sources` (domän eller default).
   - befintlig: `evidence_count+=1`, `last_seen_at=greatest(...)`, `confidence=clamp(confidence + sign·delta,0.05,0.99)`, `value=value||event.structured`.
   - `delta = base_delta(event_type) · source_trust`; `sign=-1` för `correction`, annars `+1`. `base_delta`: feedback/observation 0.05, fact_assertion 0.08, decision/outcome 0.10.
4. Räkna om `salience` (formel §ranking). Skriv provenance-edge memory→event (+ memory→entity om entity finns) i `atlas.memory_links`.
5. `consolidated_at=now()`.

**`atlas.recompute_salience_and_decay()`** (cron `atlas_salience_decay`, nattlig):
- `salience = clamp01(0.35·confidence + 0.20·(1−exp(−evidence_count/3)) + 0.30·exp(−Δt_dagar/halflife(class)) + 0.15·type_weight) + outcome_bonus`; `pinned ⇒ max(.,0.95)`.
- `type_weight`: decision 1.0/semantic 0.9/procedural 0.8/episodic 0.5. `outcome_bonus`=+0.15 (beslut m. länkat utfall).
- `halflife` dagar: episodic 14/procedural 90/semantic 180/decision 365.
- Arkivering: `status='archived' WHERE active AND NOT pinned AND salience<0.08 AND last_seen_at<now()-30d`.

Rent DB, ingen LLM, deterministiskt.

---

## 8. `recallMemories()` — design (läs-API, app-sida)

Läs-only i V1.0. **Input:** `{ allowedProjectIds?:string[], focusEntities?:{kind,id}[], topics?:string[], classes?:MemoryClass[], minConfidence?=0, minSalience?=0, tokenBudget?=1500, limit?=40, asBroker?=false }`.

**Beteende (strukturerat, inga embeddings):**
1. Scope: `scope='world' OR (scope='project' AND project_id = ANY(allowedProjectIds))`; `scope='org'` endast om `asBroker` (oanvänt i V1 — broker deferad). `status='active'`.
2. Filter: `focusEntities`/`topics`/`classes`, `confidence≥min`, `salience≥min`.
3. Ordning: `pinned DESC, salience DESC`; top-K tills `tokenBudget`/`limit`.

**Output `MemoryPack`:** `{ items:[{ id, memory_class, summary, confidence, salience, source_trust, entity:{kind,id}, provenance:{source, evidence_count, last_seen_at}, scope }], totalConsidered, truncated }`.

**Invarianter:** returnerar aldrig annat projekts scope; provenance+confidence+source_trust alltid med (anti-laundering); hård `tokenBudget` (Cost-Governance). **Sidoeffekt (Phase 3, default av):** batchad `access`-emit → reinforcar `last_accessed_at`/salience. **V1.1:** semantiskt re-rank (pgvector).

**Context-injektion:** `gatherAtlasContext` får fält `memory: MemoryPack`; injiceras som distinkt `[ATLAS MEMORY]`-block (skilt från live-datasnapshot), grupperat per klass, `confidence%`+källa per rad, salience-ordnat, pinned alltid med, budgeterat.

---

## 9. Dual-write-plan från befintliga Atlas-system

Princip: under V1 skriver befintliga system **kvar oförändrat** OCH emitterar parallellt ett memory-event (`recordMemoryEvent`). Legacy-läsningar byts till `recallMemories` först efter backfill+verifiering. Inget legacy raderas i V1.0.

| System (kodväg) | Behåller (legacy) | Emitterar (nytt) |
|---|---|---|
| Approval-PATCH (`approvals/[id]/route.ts` → `saveFeedback`) | `content_feedback` + `platform_memory` | `event_type='feedback'`, class=procedural, scope=project |
| Drain terminal (`runs/drain/route.ts`) | run-status (done/failed) | `event_type='outcome'`, class=episodic, `source_id=run.id` |
| Dream-cron (`lib/ai/dream.ts` / atlas dream) | `dream_issues` + `memories(dream_*)` | `event_type='reflection'`, class=episodic, `mem_key`↔`issue_id` |
| Operatörsbeslut (`memories(source=operator)`) | `memories` | `event_type='decision'`, class=decision *(V1.1-emitter)* |

Faser:
- **Phase 1 (M4):** dual-write 3 emitters (approval, drain, dream) + konsolidering + recall + context + health-vy.
- **Phase 4 (M4):** idempotenta backfills (§v1-spec): `platform_memory`→memories, `content_feedback`→events, `dream_issues`→memories, `memories(operator/incident)`→events. Cacher exkluderas.
- **Post-V1:** byt legacy-läsningar (content-prompt-injektion m.m.) till `recallMemories`; pensionera dubbelskrivning.

---

## 10. Riskanalys & rollback

| # | Risk | S | K | Mitigering |
|---|---|---|---|---|
| R1 | Schema-exponering (`atlas` ej i PostgREST) → app-skriv/läs failar | Med | Med | Migration 1 exponerar `atlas`; verifiera `supabase.schema('atlas')` på branch före emit. Fallback: `public`-RPC/vy. |
| R2 | RLS-predikat förutsätter `projects.owner_id` (ingen membership-modell) | Låg | Med | Grundat i verifierad modell; om membership införs senare → uppdatera policy (en migration). App-lager (`applyProjectScope`) enforcar oavsett. |
| R3 | Isoleringsbrott (project-minne läcker) | Låg | **Hög** | scope-axel + RLS deny-by-default + `applyProjectScope`; embeddings (V1.1) separeras per scope; org noll-emit i V1. |
| R4 | Konsolideringsskuld (events staplas okonsoliderade) | Med | Med | `memory_health_v.events_unconsolidated/oldest_unconsolidated`-larm; batch + `SKIP LOCKED`; cron */5. |
| R5 | Confidence-laundering | Med | Med | confidence/source_trust/salience separata fält; provenance i recall + injektion. |
| R6 | Minnesförgiftning (osäkra källor → falska fakta) | Med | Med | `source_trust`-viktad delta; confidence-golv; människa pin/korrigera/glöm; `correction`-events sänker, raderar ej. |
| R7 | Write-only graveyard (minne ingen läser) | Med | Med | `recallMemories` förstklassigt + `accessed_7d`-mätare; access-reinforcement (Phase 3). |
| R8 | Event-bloat (append-only växer) | Med | Låg | Retention/rollup-jobb (post-V1); health-vy spårar `events_total`. |
| R9 | Entitetsresolution-skuld | Med | Med | V1 minimal (alias+slug+merge-pekare); ingen auto-merge; entity-edges deferade till M5. |
| R10 | Migration-ordning/guard | Låg | Med | Ledger-först via `apply_migration`; scoped-branch-verifiering; additivt. |

**Rollback (lager):**
- **Emit:** sluta anropa `recordMemoryEvent` (dual-write ⇒ legacy orört, noll dataförlust).
- **Cron:** unschedule `atlas_consolidate`/`atlas_salience_decay` (events bevaras, ingen store-mutation).
- **Schema:** tabeller additiva i eget `atlas`-schema → `drop schema atlas cascade` påverkar **inget** i `public`/legacy.
- **Backfill:** idempotent + re-körbar; revert = droppa atlas-rader, legacy intakt.
- **V1.1 (pgvector):** embedding-kolumn additiv → droppbar; `vector`-extension kvarlämnbar oskadlig.

---

## 11. Rekommenderad implementationsordning M4 → M7

| Milstolpe | Innehåll | Bygger på | Status-grind |
|---|---|---|---|
| **M4 — Memory (V1.0)** | atlas-schema + 5 tabeller + RLS + `recordMemoryEvent` (3 emitters, dual-write) + konsolidering + `recallMemories` + context-injektion + `memory_health_v` + backfills | Detta ADR | **Nästa att bygga** |
| **M4.5 — Semantic recall (V1.1)** | `create extension vector` + embedding-kolumn + hybrid re-rank i `recallMemories`; beslut→utfall-länk; resterande emitters (cost, operator, lead) | M4 | Efter M4 grön |
| **M5 — Knowledge (V1.2)** | Entitetsresolution mognar (alias/merge); entity↔entity-edges i `memory_links`; org-broker (cross-business summeringar, org-scope-emit); intelligence-object-scaffold (versionerat, validity windows) | M4.5 | Gatad bakom isolerings-/cost-verifiering |
| **M6 — Graphify** | Materialiserad graf-projektion (noder=entities, edges=links), scope-filtrerad read-view; temporal "graf per T" | M5 | Ren projektion, ingen graf-DB |
| **M7 — Vault** | Obsidian-lik UI-projektion (entitetssidor, backlinks, linked context, graf-nav); vault-edit → `correction`-events | M6 | Band 5 UX |

**Kritiskt:** M4 är hela det fristående minneslagret. M5–M7 är additiva projektioner/lager över **samma fem tabeller** — ingen omarkitektur. Reasoning (hypotes-/intelligence-loopen) byggs ovanpå M5:s state, version-pinnad, gatad bakom Cost Governance (Band 2).

---

## 12. Open items (innan M4-migration skrivs)

Inga blockerande beslut kvar — §11 är låst. Återstår endast mekaniskt i migrationssteget: exakt `base_delta`/halflife-konstanter (satta ovan, tunbara), seed-innehåll för `atlas.sources`, och PostgREST-exponeringsstegets exakta form (dashboard vs migration-`grant`). Dessa avgörs när migrationen skrivs — denna ADR är implementation-ready.
