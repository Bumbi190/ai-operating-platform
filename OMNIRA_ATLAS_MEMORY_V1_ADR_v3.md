# ADR-ATLAS-001 v3 — Atlas Memory V1 (Minimum Lovable Memory System)

> Status: **ACCEPTED — M4 = MLMS, låst.** Supersederar v1 och v2. Implementation-ready. Ingen kod/migration skriven eller applicerad.
> **v3.1-amendment (2026-06-16):** åtkomstmodell LÅST till `public` SECURITY DEFINER-wrappers; `atlas` exponeras ALDRIG för PostgREST (verifierat mot prod). Se §4.
> Datum: 2026-06-16 · Scope: Atlas Intelligence Layer endast.
> Plattform (verifierat mot prod `iboepohjwrhtgshrqaol`): **PostgreSQL 17.6** (`UNIQUE NULLS NOT DISTINCT` ✓), `pgcrypto` ✓, `vector` saknas (M5+), `omnira_cron` finns (mönster för `atlas_cron`), `atlas`-schema skapas.

---

## 0. Vad ändrades mot v2 (efter Principal-Architect-review)

M4 reduceras till ett **Minimum Lovable Memory System**: två tabeller, ett emit-API, en konsolidering, en recall, en context-injektion, en health-vy. Allt som är scaffolding för senare lager flyttas ut. Två modelleringsfällor från v2 tas bort: **lagrad salience** och **materialiserad episodic**.

**Behålls i M4:** event-spine · scope-modellen · `recordMemoryEvent()` · consolidation · `recallMemories()` · context injection · `memory_health_v`.

**Flyttas till M5:** `entities`-tabell · source-trust-*system* (tabell + domängraf) · source lineage · world-scope knowledge/semantic · decision→outcome-intelligence.

**Flyttas till M6:** `memory_links` · graf-modell · Graphify.

**Flyttas till M7:** Vault · Obsidian-lager · backlinks.

**Borttaget ur M4 helt (additivt senare):** `entities`/`memory_links`/`sources`-tabeller, `source_ref`-FK, `valid_from`/`valid_to`/`derived_from`-kolumner, lagrad `salience`-kolumn, materialiserade episodiska `memories`-rader, access-as-event-reinforcement, percentil-kolumner i health-vyn.

---

## 1. Två låsta analysbeslut

### 1.1 Salience beräknas vid recall (lagras inte)
`salience` är tidsberoende (`recency_factor`) → en lagrad kolumn kräver nattlig full-table-recompute enbart för att tiden går. Recall-kandidatmängden är liten (ett projekt + world, `active`) → inline-beräkning är billig. **Beslut:** ingen `salience`-kolumn. `recallMemories` och arkiverings-svepet beräknar salience i query-uttrycket. Vinst: inget nattligt recompute-jobb, omedelbar vikt-tuning, ingen staleness.

### 1.2 Episodic lever enbart i `memory_events`
Episodiska minnen (`mem_key=source:source_id`) konsolideras aldrig → en materialiserad `memories`-rad vore en ren kopia. **Beslut:** `memories` innehåller endast **konsoliderande** klasser (procedural, decision). Episodic recallas direkt ur `memory_events`. Episodiska events får `consolidated_at` satt vid insert (de behöver ingen konsolidering) → konsolideringskön innehåller bara distillerbart. Recall gör UNION (memories + episodiska events), scoreade vid läsning.

---

## 2. M4-arkitektur (MLMS)

```
public.projects (befintlig, owner_id = auth.uid())
        │ FK project_id (scope='project')
        ▼
atlas.memory_events  ──(konsolidering: endast procedural/decision)──►  atlas.memories
   (immutabel spine,                                                   (distillerad tro,
    ALLA klasser;                                                       procedural + decision;
    episodic = sanningen)                                               ingen salience-kolumn)
        │                                                                     │
        └──────────────► recallMemories() (UNION, salience@read) ◄───────────┘
                                   │
                                   ▼
                      gatherAtlasContext → [ATLAS MEMORY]-block
```

Två tabeller. `scope ∈ {project, world, org}` finns på båda (forward-compat), men **endast `project` emitteras i M4** (world = M5, org = M5.2-broker). `event_type` lagras; `memory_class` härleds (se 3.1) för att undvika dubbel-taxonomi-drift.

---

## 3. DDL-spec (M4 — specification of record)

> Spec, ej applicerad migration. PG17, `atlas`-schema, PK `gen_random_uuid()`.

### 3.1 `atlas.memory_events` (append-only spine)
```
id            uuid PK DEFAULT gen_random_uuid()
scope         text NOT NULL CHECK in ('project','world','org')      -- M4 emitterar endast 'project'
event_type    text NOT NULL CHECK in
              ('observation','decision','outcome','feedback','fact_assertion','reflection','correction')
project_id    uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE
entity_kind   text NOT NULL DEFAULT ''
entity_id     text NOT NULL DEFAULT ''        -- opak slug i M4 (ingen entities-FK; entitetslager = M5)
subject       text NULL
content       text NOT NULL
structured    jsonb NOT NULL DEFAULT '{}'      -- bounded (se §6 konsolidering)
confidence    numeric(4,3) NOT NULL DEFAULT 0.5 CHECK 0..1
source        text NOT NULL                    -- trust via statisk map i konsolidering (sources-tabell = M5)
source_id     text NULL
dedupe_key    text NULL
occurred_at   timestamptz NOT NULL DEFAULT now()
ingested_at   timestamptz NOT NULL DEFAULT now()
consolidated_at timestamptz NULL               -- episodic: sätts = now() vid insert
-- memory_class HÄRLEDS ur event_type (ej lagrad): feedback/observation→procedural,
--   decision→decision, outcome/reflection/correction→episodic, fact_assertion→semantic(M5).
-- UNIQUE (source, source_id, event_type) WHERE source_id IS NOT NULL        (idempotent emit)
-- INDEX (consolidated_at) WHERE consolidated_at IS NULL                     (konsolideringskö)
-- INDEX (scope, project_id, occurred_at DESC)                              (episodic recall)
-- INDEX (entity_kind, entity_id); INDEX (dedupe_key)
-- CHECK ((scope='project') = (project_id IS NOT NULL))
```
Borttaget vs v2: `source_ref`-FK, `derived_from`. `memory_class` lagras inte (härleds).

### 3.2 `atlas.memories` (konsoliderad tro — endast procedural/decision i M4)
```
id            uuid PK DEFAULT gen_random_uuid()
scope         text NOT NULL CHECK in ('project','world','org')
memory_class  text NOT NULL CHECK in ('procedural','decision')   -- M4-snitt (semantic=M5; episodic materialiseras ALDRIG)
project_id    uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE
entity_kind   text NOT NULL DEFAULT ''
entity_id     text NOT NULL DEFAULT ''        -- opak slug (entities-FK = M5)
mem_key       text NOT NULL                    -- koncept/entitet (semantic/procedural) | beslutsnyckel (decision)
summary       text NOT NULL
value         jsonb NOT NULL DEFAULT '{}'      -- BOUNDED: senaste summary + räknare, ej ackumulerad blob
confidence    numeric(4,3) NOT NULL DEFAULT 0.3 CHECK 0..1
source_trust  numeric(4,3) NOT NULL DEFAULT 0.5 CHECK 0..1   -- från statisk trust-map (sources-tabell = M5)
evidence_count int NOT NULL DEFAULT 1
status        text NOT NULL DEFAULT 'active' CHECK in ('active','archived','superseded')
superseded_by uuid NULL REFERENCES atlas.memories(id)
pinned        boolean NOT NULL DEFAULT false
first_seen_at timestamptz NOT NULL DEFAULT now()
last_seen_at  timestamptz NOT NULL DEFAULT now()
last_accessed_at timestamptz NULL
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
-- INGEN salience-kolumn (beräknas vid recall, §1.1)
-- UNIQUE NULLS NOT DISTINCT (scope, memory_class, project_id, entity_kind, entity_id, mem_key)  ← upsert-mål
-- INDEX (scope, project_id, status)            (recall-förfilter; salience räknas inline)
-- INDEX (last_seen_at)                         (arkiverings-svep)
-- CHECK ((scope='project') = (project_id IS NOT NULL))
```
Borttaget vs v2: `salience`, `valid_from`/`valid_to`, entity-FK. `memory_class` begränsad till de två konsoliderande klasserna.

---

## 4. Åtkomstmodell & RLS (LÅST — wrapper-baserad)

**`atlas`-schemat exponeras ALDRIG för PostgREST.** Verifierat mot prod: projektet exponerar bara `public` (+ Supabase-default `graphql_public`); exponering är en plattforms-/dashboard-inställning (ej en migration), `pgrst.db_schemas` är osatt i DB:n, och inställningen propagerar inte mellan preview-branch och prod → branch≠prod-risk + tyst prod-fel. Därför följer Atlas det bevisade projekt-mönstret (`public.claim_runs`, `public.omnira_applied_migrations`): tabellerna bor i `atlas`, men ALL app-åtkomst går via **`public` SECURITY DEFINER-wrappers**.

- **Skriv (emit):** `public.atlas_record_event(...)` (SECURITY DEFINER, `execute` till `service_role`) → INSERT i `atlas.memory_events`. App: `supabase.rpc('atlas_record_event', …)`.
- **Läs (recall):** `public.atlas_recall(allowed_project_ids, …)` (SECURITY DEFINER, scope-grindar in-function) eller `public`-vyer. App: `.rpc()` / `.from(vy)`.
- **Konsolidering & cron:** `atlas.consolidate_memory_events()` + `atlas_cron`-jobb är **DB-interna** (pg_cron kallar direkt) → ingen PostgREST, ingen exponering.
- **Health:** `public.atlas_memory_health_v` (aggregat-vy) → API-läsbar utan att exponera `atlas`.
- Endast tre `public`-objekt rör API:t (emit-RPC, recall-RPC/vy, health-vy); tabeller/konsolidering/cron stannar helt i `atlas`.

**Isolering (LÅST):** den operativa grinden är **wrapper + `applyProjectScope`** — wrappern kör med definer-rätt och scope-grindar själv, exakt som `claim_runs`. **RLS = ren defense-in-depth/backstop:** `ENABLE ROW LEVEL SECURITY` + owner-scoped SELECT-policy ligger på båda tabeller från dag 1 (så de aldrig är öppna om schemat någonsin exponeras), men eftersom åtkomst går via service-role/definer-wrappers (som bypassar RLS) och `atlas` ej är exponerat, är RLS **inert idag**. **Krav i M4:** `atlas_recall` enforcar scope i query, med isolations-enhetstest i `isolation.test.ts`-stil (annat-projekt → 0 rader).

- RLS-policy (backstop): `SELECT USING ( scope='world' OR (scope='project' AND project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())) )`; inga skriv-policies (service-role/definer).

**Scope sätts inte fritt:** projekt-bundna emitters hård-kodar `scope='project'` (inte en parameter som kan feltaggas). World-emission är en separat, medveten väg (M5).

---

## 5. Migrationsordning (M4)

Filer i `apps/web/supabase/migrations/`, `<14-siffrigt ts>_<name>.sql`; namn → guard-tvingad ledger-post → `apply_migration(name=…)` mot prod-ledgern **före** deploy; scoped-branch-verifiering först; additivt only.

| # | Migration | Innehåll |
|---|---|---|
| 1 | `atlas_schema_init` | `create schema atlas; create schema atlas_cron;` + `grant usage`/tabellrättigheter till `service_role` (INGEN PostgREST-exponering — §4) |
| 2 | `atlas_memory_events` | tabell + index/constraints |
| 3 | `atlas_memories` | tabell + unik-index (NULLS NOT DISTINCT) + index |
| 4 | `atlas_memory_rls` | enable RLS + policies (båda tabeller) |
| 5 | `atlas_consolidate_fn` | `atlas.consolidate_memory_events()` + `atlas.archive_stale_memories()` |
| 6 | `atlas_memory_health_v` | observability-vy |
| 7 | `atlas_memory_cron` | `atlas_cron`: `atlas_consolidate` (*/5), `atlas_archive` (nattlig) |
| 8 | *(separat, efter dual-write verifierad)* `atlas_backfill_*` | idempotenta data-migrationer (§8) |

(Ingen `entities`/`sources`/`links`-migration i M4. Ingen `vector`-migration i M4.)

---

## 6. `recordMemoryEvent()` + consolidation

**`recordMemoryEvent(input)` (emit-API, app-sida, service-role, icke-kastande side-channel):**
- INSERT i `atlas.memory_events` via `supabase.rpc('atlas_record_event', …)` (`public` SECURITY DEFINER-wrapper, §4 — INTE `supabase.schema('atlas')`).
- Idempotens: `ON CONFLICT (source, source_id, event_type) DO NOTHING RETURNING id` → `{deduped:true}` om 0 rader.
- **Scope hård-kodas av emittern** (project-bundna → `'project'`); `scope` är inte en fri parameter i M4.
- **Episodic** (event_type ∈ outcome/reflection/correction): sätt `consolidated_at = now()` direkt (ingen konsolidering).
- Fel sväljs + loggas; aldrig kast.

**`atlas.consolidate_memory_events(batch=500)` (cron `*/5`):** behandlar **endast** `consolidated_at IS NULL` (dvs procedural/decision; episodic är redan markerat). Per event: härled `memory_class` ur `event_type`; UPSERT `atlas.memories` på unik-nyckeln → ny: `confidence=clamp(0.3+δ,…)`, `evidence_count=1`, `source_trust` ← **statisk trust-map** (operator 0.85/dream 0.6/human 0.95/model 0.6/backfill 0.5); befintlig: `evidence_count+=1`, `last_seen_at=greatest`, `confidence=clamp(confidence+sign·δ)`. `δ=base_delta(event_type)·source_trust`. **`value` hålls bounded** (senaste summary + räknare, inte ackumulerad blob). Sätt `consolidated_at`.

> **Kalibrerings-brasklapp (Principal-review):** utan oberoende-lineage (M5) räknar `evidence_count`/confidence även icke-oberoende upprepningar (echo). V1-confidence är därför **okalibrerad/echo-naiv** och får inte behandlas som auktoritativ av framtida Reasoning förrän M5:s lineage finns. Surface:as alltid med provenance.

**`atlas.archive_stale_memories()` (cron nattlig):** ren svep-query, beräknar salience **inline**, flippar `status='archived'` där `active AND NOT pinned AND <salience-uttryck> < 0.08 AND last_seen_at < now()-30d`. Skriver ingen salience-kolumn.

**Salience-uttryck (samma i recall och svep):**
`0.35·confidence + 0.20·(1−exp(−evidence_count/3)) + 0.30·exp(−Δt_dagar/halflife(class)) + 0.15·type_weight`, `pinned ⇒ max(.,0.95)`. type_weight: decision 1.0/semantic 0.9/procedural 0.8/episodic 0.5. halflife dagar: episodic 14/procedural 90/semantic 180/decision 365.

---

## 7. `recallMemories()` + context injection

**`recallMemories(input)` (läs-API):** `{ allowedProjectIds?, focusEntities?, topics?, classes?, minConfidence?=0, minSalience?=0, tokenBudget?=1500, limit?=40 }`.
- **UNION av två källor**, båda scope-filtrerade (`world` deferad i M4 → i praktiken project-scope):
  1. `atlas.memories` (procedural/decision, `status='active'`).
  2. `atlas.memory_events` (episodic, `scope/project` matchar, `occurred_at > now()−90d`).
- Beräkna **salience inline** (uttryck §6) för båda; filter `confidence≥min`, `salience≥min`, valfritt `focusEntities/topics/classes`.
- Ordna `pinned DESC, salience DESC`; top-K tills `tokenBudget`/`limit`.
- **Output `MemoryPack`:** `{ items:[{ id, memory_class, summary, confidence, salience, source_trust, entity, provenance:{source, evidence_count, last_seen_at}, scope }], totalConsidered, truncated }`.
- **Invarianter:** aldrig annat projekts scope (query + `applyProjectScope`); provenance+confidence+source_trust alltid med; hård `tokenBudget`.

**Context injection:** `gatherAtlasContext` får fält `memory: MemoryPack`; injiceras som distinkt `[ATLAS MEMORY]`-block (skilt från live-datasnapshot), grupperat per klass, `confidence%`+källa per rad, salience-ordnat, pinned alltid med, budgeterat.

> **Öppen risk (review):** "focus-derivation" (vilken entitet/topic context handlar om) är odesignad och avgör recall-nyttan. M4 startar med enkel härledning (aktivt projekt + ev. aktiv vy-entitet); en kort spike rekommenderas innan recall slås på i Atlas-prompten.

---

## 8. `memory_health_v` + dual-write

**`atlas.memory_health_v`** (aggregat-only, säker att läsa brett), per `scope × memory_class` + globalt:
`events_total · events_unconsolidated · oldest_unconsolidated · memories_active · memories_archived · memories_superseded · avg_confidence · pinned_count · stale_active · accessed_7d · last_event_at · last_consolidated_at`.
Larm (drift): `events_unconsolidated` växande / `oldest_unconsolidated` > 30 min (konsolideringsskuld); `accessed_7d ≈ 0` trots växande `memories_active` (write-only-graveyard). (Inga percentil-kolumner i M4.)

**Dual-write (M4):** befintliga system skriver kvar oförändrat OCH emitterar:

| System | Behåller | Emitterar (M4) |
|---|---|---|
| Approval-PATCH (`saveFeedback`) | `content_feedback` + `platform_memory` | `feedback` → procedural |
| Drain terminal | run-status | `outcome` → **episodic (endast events)** |
| Dream-cron | `dream_issues` + `memories(dream_*)` | `reflection` → **episodic (endast events)** |

Backfill (separat, idempotent, efter verifiering): `platform_memory`→memories(procedural), `content_feedback`→events, `dream_issues`→episodiska events, `memories(operator)`→decision-events. Cacher exkluderas. Inget legacy raderas i M4.

---

## 9. Risk & rollback (M4)

| # | Risk | Mitigering |
|---|---|---|
| R1 | RLS bypassas av service-role → ingen DB-backstop | `applyProjectScope` är primär, **testad** grind (isolation-test); RLS backstop; recall scope-filtrerad i query |
| R2 | Scope feltaggad → läcka | scope hård-kodas av emitter; world/org-emit finns inte i M4 |
| R3 | Echo-inflaterad confidence | V1 okalibrerad/echo-naiv (dokumenterat); lineage = M5; surface med provenance |
| R4 | Konsolideringsskuld | health-vy-larm; batch + SKIP LOCKED; episodic kringgår kön helt |
| R5 | Event-bloat | episodic ej dubbellagrad (halverad volym); retention/rollup post-V1; health spårar |
| R6 | `value`-blob-tillväxt | bounded value (senaste summary + räknare) |
| R7 | Recall-nytta beror på focus-derivation | spike före prompt-aktivering; tom recall degraderar säkert (inget injiceras) |
| R8 | ~~Schema-exponering~~ → **ELIMINERAD** | `atlas` exponeras ej; åtkomst via `public` SECURITY DEFINER-wrappers (claim_runs-mönstret) → ingen branch≠prod-exponeringsrisk (§4) |

**Rollback (lager):** sluta emittera (dual-write ⇒ legacy orört) → unschedule cron (events bevaras) → `drop schema atlas cascade` (påverkar inget i `public`). Backfill idempotent/re-körbar. Noll dataförlust i legacy.

---

## 10. Roadmap M4 → M7

| Milstolpe | Innehåll | Status |
|---|---|---|
| **M4 — Memory (MLMS)** | 2 tabeller (events+memories[procedural/decision]) · scope (project-emit) · `recordMemoryEvent` (3 emitters, dual-write) · consolidation · `recallMemories` (UNION, salience@read) · context injection · `memory_health_v` · backfills | **Nästa att bygga** |
| **M5 — Knowledge** | `entities`-tabell + resolution · **source-trust-system** (sources-tabell + domängraf + lineage) · **world-scope semantic** · fact_assertion-materialisering · decision→outcome-intelligence · pgvector + hybrid recall · org-broker | Efter M4 grön |
| **M6 — Graph** | `memory_links` (typade entity↔entity-edges) · graf-modell · **Graphify** (materialiserad projektion) | Efter M5 |
| **M7 — Vault** | **Obsidian-lager** · entitetssidor · **backlinks** · linked context · vault-edit→correction-events | Efter M6 |

**Invariant:** M5–M7 är additiva lager/projektioner över samma event-spine + samma scope-modell. De enda dyra-att-retrofitta sakerna — eventspine och scope-axeln — finns från M4. Allt annat är additiva migrationer.

---

## 11. Öppna items före M4-migration
Inga blockerande beslut. Åtkomstmodellen är LÅST (§4: wrapper-baserad, ingen exponering). Mekaniskt kvar: exakta `base_delta`/halflife-konstanter (satta, tunbara), statisk trust-map-innehåll, och en kort focus-derivation-spike för recall. Denna ADR är implementation-ready för M4.
