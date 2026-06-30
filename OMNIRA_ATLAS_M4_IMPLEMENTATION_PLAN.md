# OMNIRA — Atlas Memory M4 (MLMS): Readiness Review + Implementationsplan

> Status: **READINESS REVIEW = GRÖN. Plan låst — ingen kod skrivs förrän godkänd.** H1.P5-disciplin (verifiera kod/schema/risk/migration/rollback före rekommendation; flaggor default OFF; scoped-branch först; ledger-först).
> Omfattning: ADR-ATLAS-001 v3 (MLMS) + Focus Derivation Spike + Context Pipeline. Endast Atlas Intelligence.
> Plattform (verifierat): Supabase `iboepohjwrhtgshrqaol`, PG **17.6**, `pgcrypto` ✓, `vector` saknas (ej M4), `omnira_cron` finns, `atlas`-schema saknas (skapas). Datum: 2026-06-16.

---

## 0. Verifierade preconditions (kod + DB, inte minne)

| Fakta | Verifierat värde | Påverkan på M4 |
|---|---|---|
| Atlas = Manager Agent | `lib/ai/manager.ts` `ManagerAgent`; `chat()` sätter `system: MANAGER_SYSTEM_PROMPT`, context i **user-meddelandet** | Injektion sker i user-rollen; constraints ska in i system-prompten |
| Två context-byggare | `manager.buildContext()` (live, chat) + `gatherAtlasContext()` (executive m.fl.) | Injicera MemoryPack i EN väg (manager-chat); refaktor icke-blockerande |
| Decisions injiceras ej i chat idag | `manager.buildContext` saknar decisions; `gatherAtlasContext.decisions` används annorstädes | "Decisions→constraints" är en NY integration, inte bara en flytt |
| Projekt-isolering | `projects.owner_id = auth.uid()`; `getAllowedProjectIds` speglar owner; `applyProjectScope` i alla läsningar | RLS-predikat grundat; `applyProjectScope` = primär grind |
| Service-role bypassar RLS | dev-readiness-audit | RLS = backstop; recall MÅSTE gå via `applyProjectScope` + isolations-test |
| Befintlig event→store-loop | `feedback-store.ts` (`content_feedback` + upsert `platform_memory`) | Mall för emit+consolidation; backfill-källa |
| Dream-ledger | `dream_issues` (stable `issue_id`, `occurrences`, lifecycle ur `manager_tasks`) | Dream-emit = episodic per natt (`issue_id:date`); ledger kvar i dual-write |
| View Awareness | `view-context.ts` `NormalizedView` (selection/visible = `domain:id:label`), flagga `ATLAS_VIEW_AWARENESS` (off) | Fokuskälla; refs = `(entity_kind, entity_id)` |
| Drain = durable executor | `runs/drain/route.ts` (H1.P5-fencing/idempotens) | Emit MÅSTE vara post-terminal, best-effort, icke-blockerande, idempotent på `run.id` |
| Migration guard | `<digits>_<name>.sql`, applicera via `apply_migration(name)` mot prod-ledger FÖRE deploy | Varje M4-migration ledger-först |
| Native branching INFRA-1 | foundational-tabeller (inkl. `public.projects`) ej replaybara på native branch | Scoped branch måste seedas med `public.projects` för FK |

**Slutsats:** inga hårda blockerare. Allt additivt, flagg-gatat, scoped-branch-verifierbart.

---

## 1. Kvarvarande blockerare
**Inga hårda blockerare.** Tre prerequisites att verifiera tidigt (ej blockerande):
- **Åtkomstmodell LÅST (wrapper-baserad, ADR v3 §4):** `atlas` exponeras ALDRIG för PostgREST; all app-åtkomst via `public` SECURITY DEFINER-wrappers (`claim_runs`-mönstret). Eliminerar exponerings-/branch≠prod-risken. Inga `supabase.schema('atlas')`-anrop.
- **Decisions-källa till constraints** — chat-vägen injicerar inte decisions idag; Commit 6 wire:ar in dem (från befintlig decisions-läsning) som hard constraints.
- **`public.projects` på scoped branch** — krävs för FK; seedas i branch-uppsättningen (H1.P5-mönster).

## 2. Migrationsrisker
- **`UNIQUE NULLS NOT DISTINCT` + `ON CONFLICT`-inferens** på (scope, class, project_id, entity_kind, entity_id, mem_key): verifiera att upsert matchar indexet (PG17 ✓) på branch innan emit byggs.
- **FK → `public.projects`** failar på en naken branch (INFRA-1) → seed projects i branch-setup.
- **pg_cron i `atlas_cron`** — spegla `omnira_cron`-grants; verifiera schemaläggning på branch.
- **Backfill-migrationer** — körs separat EFTER dual-write verifierad; idempotenta via `UNIQUE(source,source_id,event_type)`; testas mot prod-lik data.

## 3. Implementation-risker
- **Tyst emit-förlust:** `recordMemoryEvent` är icke-kastande → ett fel i `public.atlas_record_event`-wrappern sväljs och minne skrivs tyst inte. **Mitigering:** logga insert-fel + `memory_health_v.events_total`-larm (platt = trasigt) + branch-verifiering. (Wrappern kräver bara `public` exponerat → identiskt branch/prod, ingen exponerings-drift.)
- **Drain-emit på kritisk väg:** måste ligga **efter** terminal-write, fire-and-forget, aldrig blockera/kasta, idempotent på `run.id` (knyter till H1.P5-idempotens). 
- **Salience-DRY:** samma uttryck i recall OCH arkiveringssvep → en enda `atlas.salience()`-funktion, aldrig två kopior.
- **Class-härledning:** `memory_class` härleds ur `event_type` (en central mappning, ej emitter-satt) → testa mappningen; episodic får `consolidated_at` vid insert.
- **Isoleringsläcka i recall:** service-role bypassar RLS → recall via `applyProjectScope` + isolations-enhetstest (annat projekt → 0 rader), i `isolation.test.ts`-stil. **Viktigaste guardrailen.**
- **Echo-naiv confidence:** dokumenterad; får ej surface:as som auktoritet i M4.
- **Recall-kvalitet beror på View Awareness:** bra fokus kräver `ATLAS_VIEW_AWARENESS` på; utan den → ambient-läge (acceptabelt). Koordinera flaggorna.

## 4. Svårt att ändra senare (få rätt nu)
- **Unik-nyckelns form** på `atlas.memories` — byte efter data = smärtsam migration. **Lås.**
- **`mem_key`-konventioner** (episodic `source:source_id`; semantic/procedural per entitet/koncept) — bakat i data. **Lås.**
- **`event_type`-enum + class-mappning** — skrivs i varje event; håll minimal + central mappning (taxonomi-ossifiering).
- **`scope`-axeln** (project/world/org) — isoleringsaxeln, brutal att retrofitta. Redan låst, korrekt.
- (Ej svårt: prompt-assembly user/system-placering, source-as-text, ej-materialiserad episodic — alla additiva senare.)

## 5. Rekommenderad byggordning
Schema → emit-API + salience-fn → consolidation + cron → emitters (dual-write) → recall (shadow) + health → context-injektion (gated) → backfill. Allt bakom flaggor default OFF; shadow innan injektion; ledger-först; scoped-branch före prod. (Commit-indelning §6.)

---

## 6. M4 Implementationsplan — commit-indelning (H1.P5-disciplin)

**Flaggor (alla default OFF):** `ATLAS_MEMORY` (emit) · `ATLAS_MEMORY_RECALL` (beräkna/shadow) · `ATLAS_MEMORY_INJECT` (injicera i prompt). Befintlig `ATLAS_VIEW_AWARENESS` koordineras för fokus.

### Commit 1 — Schema-fundament
- Migrationer: `atlas_schema_init` (schema `atlas` + `atlas_cron` + `grant usage`/tabellrättigheter till `service_role`; **INGEN PostgREST-exponering** — ADR v3 §4), `atlas_memory_events`, `atlas_memories` (unik-index `NULLS NOT DISTINCT`, partiella index, RLS enable + policies som **backstop** per §4).
- Ingen app-kod. Wrappers (`public.atlas_record_event`/`atlas_recall`/health-vy) = Commit 2+.
- **Verifiering (scoped branch m. `public.projects` seedad):** tabeller + RLS-policies finns; `ON CONFLICT` matchar unik-indexet; `service_role` kan insert/select medan `anon`/`authenticated` saknar direkt grant; FK mot projects håller. tsc orört (ingen kod). *(Ingen `schema('atlas')`-nåbarhetscheck — `atlas` exponeras ej.)*
- **Rollback:** `drop schema atlas cascade; drop schema atlas_cron cascade;` (påverkar inget i `public`).

### Commit 2 — Emit-API + salience-funktion
- Kod: `recordMemoryEvent()` (service-role, anropar `public.atlas_record_event(...)` SECURITY DEFINER-wrapper via `.rpc()`, icke-kastande; idempotent `ON CONFLICT (source,source_id,event_type) DO NOTHING` inuti wrappern); migration för wrappern; central `eventTypeToClass()`-mappning; SQL `atlas.salience(confidence, evidence_count, last_seen_at, class)` (en källa för recall + svep).
- Ingen emitter wire:ad än. Flagga `ATLAS_MEMORY` (OFF).
- **Verifiering:** vitest (idempotens, non-throw, class-mappning); manuell insert→rad på branch; `atlas.salience` ger väntade värden.
- **Rollback:** död kod bakom OFF-flagga; inga emitter-anrop.

### Commit 3 — Consolidation + arkivering + cron
- Migrationer: `atlas_consolidate_fn` (`atlas.consolidate_memory_events(batch)` — endast `consolidated_at IS NULL`; upsert m. evidence/confidence-delta·source_trust(statisk map); bounded `value`; `atlas.archive_stale_memories()` — inline-salience-svep), `atlas_memory_cron` (`atlas_consolidate` */5, `atlas_archive` nattlig).
- **Verifiering (branch, SQL-matris à la H1.P5):** seed events → consolidate → memories upsertade (evidence_count++/confidence/last_seen); episodic kringgår kön (consolidated_at@insert); archival flippar stale; idempotent re-run.
- **Rollback:** unschedule cron (events bevaras); `create or replace`-revert av funktioner.

### Commit 4 — Emitters (dual-write)
- Kod (bakom `ATLAS_MEMORY`): wire `recordMemoryEvent` i (a) `approvals/[id]/route.ts` PATCH bredvid `saveFeedback` (`feedback`→procedural, `source_id`=approval-id); (b) `runs/drain/route.ts` **efter** terminal-write, fire-and-forget (`outcome`→episodic, `source_id`=run.id, idempotent); (c) Dream-cron per finding (`reflection`→episodic, `source_id`=`issue_id:date`). Legacy-skrivningar orörda (dual-write).
- **Verifiering:** flagga ON (branch) → varje väg emitterar exakt ett event; OFF → noll emit; tsc/vitest; **bekräfta drain/approval-flöden oförändrade** (emit bryter aldrig värdoperationen — kritisk säkerhetscheck).
- **Rollback:** `ATLAS_MEMORY=0` → noll emit, legacy orört.

### Commit 5 — recallMemories (shadow) + health-vy
- Kod: `recallMemories()` (strukturerad; scope via `applyProjectScope`; UNION memories[procedural/decision, active] + events[episodic <90d]; salience@read via `atlas.salience`; fokus-boost ur `NormalizedView`; budget 1 200 tok; diversitetstak) + **isolations-enhetstest** (annat projekt → 0 rader). Migration: `atlas_memory_health_v`.
- **Shadow:** beräkna + logga MemoryPack, injicera INTE. Flagga `ATLAS_MEMORY_RECALL` (OFF).
- **Verifiering:** isolations-test grönt; recall ger väntat rankat pack på branch-seed; health-vy aggregerar; fokus-boost ändrar ordning korrekt.
- **Rollback:** `ATLAS_MEMORY_RECALL=0` → ingen recall körs.

### Commit 6 — Context-injektion (gated, default OFF)
- Kod: integrera MemoryPack i manager-chat-kontexten (user-roll, position ④, efter `[CURRENT VIEW]`); promota decisions till **system-`[CONSTRAINTS]`** + "data ej instruktioner" + "live data > minne"-precedens; **exkludera decisions ur MemoryPack**. Bakom `ATLAS_MEMORY_INJECT` (OFF). Ship OFF; slå på först efter grön shadow-eval.
- **Verifiering:** prompt-assembly snapshot-test (blockordning; hård/mjuk-separation; decisions i constraints EJ i pack; budget hålls); manuell eval på shadow-loggar.
- **Rollback:** `ATLAS_MEMORY_INJECT=0` → ingen prompt-påverkan.

### Commit 7 — Backfill (separat, efter dual-write verifierad)
- Migrationer (idempotenta data-migrationer): `platform_memory`→memories(procedural), `content_feedback`→events, `dream_issues`→episodiska events, `memories(operator/incident)`→decision-events. Cacher exkluderas. Inget legacy raderas.
- **Verifiering:** idempotent re-run = 0 nya rader; antal reconcilar; health-vy; recall surfar backfillad historik.
- **Rollback:** droppa atlas-rader (legacy intakt); re-körbar.

### Aktiverings-steg (operativt, efter merge — H1.P5-mönster "flagga OFF vid merge, flippa efter verifiering")
1. `ATLAS_MEMORY=1` → dual-write live; övervaka `memory_health_v` (konsolideringsskuld, emit-volym).
2. `ATLAS_MEMORY_RECALL=1` + `ATLAS_VIEW_AWARENESS=1` → shadow-recall loggas; **eval relevans några dagar**.
3. Backfill (Commit 7) när dual-write stabil.
4. **Endast om shadow-eval grön:** `ATLAS_MEMORY_INJECT=1` → MemoryPack i Atlas context.

---

## 7. Rollback-plan (lager)
| Lager | Åtgärd |
|---|---|
| Injektion | `ATLAS_MEMORY_INJECT=0` — prompt återgår exakt |
| Recall | `ATLAS_MEMORY_RECALL=0` — ingen recall |
| Emit | `ATLAS_MEMORY=0` — dual-write upphör, legacy orört |
| Cron | unschedule `atlas_consolidate`/`atlas_archive` — events bevaras |
| Schema | `drop schema atlas cascade` — noll påverkan på `public`/legacy |
| Backfill | idempotent/re-körbar; droppa atlas-rader |

## 8. Definition of Done (M4)
`tsc` + `vitest` gröna (inkl. isolations-test för recall, idempotens för emit, class-mappning, prompt-assembly snapshot); alla migrationer i prod-ledger via `apply_migration`; SQL-matris för consolidation/archival grön på branch; dual-write verifierad (emit bryter aldrig drain/approval); `memory_health_v` rapporterar; alla tre flaggor OFF vid merge; injektion aktiveras först efter grön shadow-eval.

## 9. Codex-review checkpoints
- **C1 (Commit 1):** unik-nyckel + `ON CONFLICT`-inferens korrekt; RLS-policies finns (backstop, ej RLS-utan-policy); `atlas` EJ exponerat (wrapper-modell §4); `service_role`-grants korrekta; FK håller.
- **C2 (Commit 2):** emit idempotent + icke-kastande; en `atlas.salience`; central class-mappning.
- **C3 (Commit 3):** episodic kringgår kön; bounded `value`; archival icke-destruktiv; idempotent.
- **C4 (Commit 4):** drain-emit post-terminal/non-blocking/idempotent; dual-write; värdoperationer oförändrade.
- **C5 (Commit 5):** recall via `applyProjectScope` + isolations-test; budget/diversitetstak; shadow (ingen injektion).
- **C6 (Commit 6):** decisions i constraints EJ i pack; "data ej instruktioner"; live>minne-precedens; default OFF.
- **C7 (Commit 7):** idempotent; cacher exkluderade; legacy orört.
```
