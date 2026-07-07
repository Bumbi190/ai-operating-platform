# Familje-Stunden — Marketing Engine v1: Implementationsplan

**Status:** Granskningsklar byggplan. **Ingen kod. Ingen implementation.** Designfasen är klar.
**Grundad i:** Brand Rules · Character Bible v2 · Theme Bible v1 · Content Bible v1 · Marketing Bible v1 ·
Campaign Planner Design · Channel Drafter Design · Brand/Canon Guard Design — **plus befintlig infrastruktur**
(durable `runs`-engine, `/api/runs/drain` + reaper, projekt-medvetna `platform_tokens` (G1), `revenue_snapshots`,
Operations Center, Action Center/approvals).

⛔ Ingen ny funktionalitet uppfinns utöver de godkända designerna. ⛔ The Prompt/AI News berörs aldrig.
Allt scoped `project_id = projects.slug='familje-stunden'`. Märkning: [KANON]/[OSÄKER]/[LUCKA] bevaras genom hela kedjan.

**v1-omfattning (låst):** Kanaler = **Instagram + Facebook**. Automation = **utkast + operatörsgodkännande**.
**Ingen auto-publicering, ingen schemaläggning, ingen bildgenerering** i v1.

---

## 1. Arkitektur (helhet)

```
                 KB (content/familje-stunden/*: brand, characters, themes, content-bible, marketing-bible, index.json)
                 RevenueIntel (revenue_snapshots / Stripe)
                            │
            ┌───────────────┴───────────────┐
            ▼   durable runs-engine (delad, neutral infra)   ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  WF1 Campaign Planner   →  campaign_plans + campaign_briefs      │
   │  WF2 Channel Drafter    →  draft_posts (1 per brief)             │
   │  WF3 Brand/Canon Guard  →  guard_reports (1 per draft)           │
   └────────────────────────────────────────────────────────────────┘
                            │ guard_report → Action Center
                            ▼
   [Action Center vyer]  Pending Review · Approved · Rejected · Needs Input
                            │ operatörsbeslut (Approve / Reject / Return)
                            ▼
   [Operations Center: Familje-Marknad-panel]  KPI:er bredvid Stripe
            (Publisher = v2, byggs INTE i v1)
```

Allt körs genom befintliga `public.runs` (status `pending→running→done/failed`, `claim_runs` SKIP LOCKED,
`/api/runs/drain` per minut, reaper). Varje agent = en **workflow-typ** som producerar rader i sina domän-tabeller.
Domän-tabellerna lever vid sidan av `runs` (run:et orkestrerar; domäntabellen lagrar resultatet).

---

## 2. Datamodell

Alla tabeller: `id uuid pk default gen_random_uuid()`, `project_id uuid not null references projects(id)`,
`created_at/updated_at timestamptz`. RLS: service_role full; läsning scoped till projektet. Allt knyts till `run_id`
(`references runs(id)`) för spårbarhet.

### 2.1 `campaign_plans`
```
campaign_plans
  id              uuid pk
  project_id      uuid  -> projects(id)            -- alltid familje-stunden
  run_id          uuid  -> runs(id)                -- WF1-run som skapade planen
  plan_key        text  unique  -- t.ex. "fs-2026-09"
  target_month    date         -- första dagen i målmånaden (2026-09-01)
  theme_key       text         -- "skordemanaden"
  theme_name      text
  next_theme_key  text
  status          text  check in
                  ('draft','approved','archived','superseded')  default 'draft'
  campaign_angle  jsonb        -- {primary_angle, emotional_pillar, core_message, proof_points[], cta{}}
  revenue_strategy jsonb       -- {focus, beat_weighting{}, based_on}  (snapshot av Stripe vid genereringen)
  gaps            jsonb default '[]'   -- [{field, level:LUCKA/OSAKER, note}]
  human_input_needed jsonb default '[]'
  canon_level     jsonb        -- per-fält KANON/OSAKER/LUCKA
  generated_at    timestamptz
  approved_at     timestamptz
  approved_by     text
  created_at/updated_at
  unique(project_id, target_month) where status in ('draft','approved')  -- en aktiv plan per månad
```

### 2.2 `campaign_briefs`
```
campaign_briefs
  id              uuid pk
  project_id      uuid
  plan_id         uuid  -> campaign_plans(id) on delete cascade
  brief_key       text  -- "brief-03" (unikt inom planen)
  post_key        text  -- "fs-2026-09-03"
  channel         text  check in ('instagram','facebook')
  format          text  check in ('reel','carousel','story','single_post','fb_post','fb_event')
  beat            text  check in ('teaser','launch','mid','bridge')
  scheduled_week  text          -- "2026-W35" (planeringshint, ej publiceringstid)
  scheduled_date  date          -- valfri exakt dag (lansering)
  objective       text          -- awareness/awareness+trial/engagement/retention
  brief_payload   jsonb         -- hela content_brief enligt Channel Drafter input-schema
  canon_level     jsonb
  status          text  check in ('planned','drafting','drafted','needs_input')  default 'planned'
  created_at/updated_at
  unique(plan_id, brief_key)
```

### 2.3 `draft_posts`
```
draft_posts
  id              uuid pk
  project_id      uuid
  run_id          uuid  -> runs(id)                -- WF2-run
  brief_id        uuid  -> campaign_briefs(id) on delete cascade
  draft_key       text  -- "draft-fs-2026-09-03"
  channel         text
  format          text
  beat            text
  draft_payload   jsonb   -- hela draft_post.json (caption, reel_spec/carousel_slides/fb_post, hashtags, cta, asset_plan, character_usage, must_not_applied)
  self_check      jsonb   -- Drafterns interna checklista
  gaps            jsonb default '[]'
  needs_input     jsonb default '[]'
  canon_level     jsonb
  status          text  check in
                  ('drafted','needs_input','guard_passed','guard_failed','approved','rejected','returned')
                  default 'drafted'
  version         int default 1   -- ökas vid retur+omskrivning
  created_at/updated_at
  unique(brief_id, version)
```

### 2.4 `guard_reports`
```
guard_reports
  id              uuid pk
  project_id      uuid
  run_id          uuid  -> runs(id)                -- WF3-run
  draft_id        uuid  -> draft_posts(id) on delete cascade
  report_key      text  -- "guard-fs-2026-09-03"
  verdict         text  check in ('approved','warning','rejected')
  score           int   check (score between 0 and 100)
  score_breakdown jsonb
  violations      jsonb default '[]'   -- [{id, severity, category, field, explanation, kb_ref, recommended_action}]
  warnings        jsonb default '[]'
  gap_flags       jsonb default '[]'   -- [{field, level, blocking}]
  checks          jsonb                -- {schema_complete, brand_ok, character_ok, theme_ok, marketing_ok, asset_ok, no_the_prompt, no_invented_facts}
  recommendation  text
  evaluated_at    timestamptz
  created_at/updated_at
  unique(draft_id)   -- senaste rapporten per draft-version (gammal arkiveras)
```

### 2.5 `marketing_approvals` (eller återanvänd befintlig `approvals` med typ-fält)
```
marketing_approvals
  id              uuid pk
  project_id      uuid
  draft_id        uuid  -> draft_posts(id)
  guard_report_id uuid  -> guard_reports(id)
  state           text  check in ('pending','approved','rejected','returned','needs_input')  default 'pending'
  operator        text
  action          text  check in ('approve','approve_with_fix','reject','return_to_drafter')
  fix_patch       jsonb        -- t.ex. {landing_url: "..."} ifyllt av operatör vid approve_with_fix
  decided_at      timestamptz
  note            text
  created_at/updated_at
```
> Om befintlig `approvals`-tabell redan finns: lägg till `kind='marketing_draft'` + `draft_id`/`guard_report_id`
> istället för ny tabell (mindre scope). Designbeslut i Fas 1.

### 2.6 Asset-register (ingen ny tabell i v1)
Assets ligger redan i `content/familje-stunden/characters/index.json` + Storage-bucket `familje-stunden`.
Guard/Drafter läser detta register direkt; **ingen ny tabell** byggs i v1. (Eventuell `assets`-tabell = v2.)

---

## 3. Workflow Design (status & events)

### 3.1 Kedjan
```
WF1 Planner  ── campaign_plans.status: draft ──▶ [operatör godkänner plan] ──▶ approved
                       │ (approved-event)
                       ▼
WF2 Drafter  (en run per brief)  ── draft_posts.status: drafted | needs_input
                       │ (drafted-event)
                       ▼
WF3 Guard    (en run per draft)  ── guard_reports.verdict: approved | warning | rejected
                       │
        ┌──────────────┼───────────────────────────┐
   verdict=approved/warning            verdict=rejected
        ▼                                     ▼
  marketing_approvals.state=pending     draft_posts.status=guard_failed
   → Action Center (Pending Review)       → Action Center (Rejected / auto-return*)
        │
   operatör: approve / approve_with_fix / reject / return_to_drafter
```
`*` Auto-return vs. manuell return = öppen designfråga (Guard-design §13.3); v1-default: **manuell** (operatör trycker Return).

### 3.2 Statusöversikt
| Entitet | Statusar | Sätts av |
|---------|----------|----------|
| `runs` | pending → running → done / failed | durable engine |
| `campaign_plans` | draft → approved → (superseded/archived) | WF1 + operatör |
| `campaign_briefs` | planned → drafting → drafted / needs_input | WF1 (planned) / WF2 |
| `draft_posts` | drafted → guard_passed/guard_failed → approved/rejected/returned | WF2 / WF3 / operatör |
| `guard_reports` | (verdict) approved/warning/rejected | WF3 |
| `marketing_approvals` | pending → approved/rejected/returned/needs_input | operatör |

### 3.3 Events som triggar nästa steg
- **Plan approved** (operatör) → enqueue **WF2** för varje brief i planen (en run per brief).
- **Draft drafted** (WF2 done) → enqueue **WF3** för den draften.
- **Guard done** (WF3) → skapa `marketing_approvals(state=pending)` om verdict≠rejected; annars markera `guard_failed`.
- **Operatör Return to Drafter** → enqueue ny **WF2**-run för briefen med `version+1` + violations som input.
- **Operatör Approve** → draft_posts.status=approved (slut för v1; Publisher v2 plockar upp senare).

Alla "enqueue" = `insert into runs(...) status='pending'`; `/api/runs/drain` (pg_cron, varje minut) claim:ar och kör.
**Inga fire-and-forget** — allt går via durable runs (samma princip som resten av Omnira).

---

## 4. API Design

Alla under `apps/web/app/api/...`, service-role-skyddade, scoped till `familje-stunden`. Mönster: enqueue:ar ett `run`
och returnerar `run_id` (asynkront via drain), eller läser domäntabellerna.

### 4.1 Planner
```
POST /api/marketing/plans/generate
  body: { target_month: "2026-09", planning_mode?, lead_offset? }
  → skapar WF1-run (pending); returnerar { run_id, plan_key }
GET  /api/marketing/plans                 -> lista planer (filter: status, month)
GET  /api/marketing/plans/[plan_id]       -> plan + briefs + gaps
POST /api/marketing/plans/[plan_id]/approve   -> status=approved; enqueue WF2 per brief
POST /api/marketing/plans/[plan_id]/archive
```

### 4.2 Drafter
```
POST /api/marketing/drafts/generate
  body: { brief_id }            -> skapar WF2-run för en brief
GET  /api/marketing/drafts                -> lista (filter: status, channel, plan_id)
GET  /api/marketing/drafts/[draft_id]     -> draft_payload + self_check + gaps
POST /api/marketing/drafts/[draft_id]/return
  body: { violations[], note }  -> version+1, enqueue WF2 igen
```

### 4.3 Guard
```
POST /api/marketing/guard/validate
  body: { draft_id }            -> skapar WF3-run
GET  /api/marketing/guard/[report_id]     -> guard_report.json
GET  /api/marketing/guard/by-draft/[draft_id]
```

### 4.4 Action Center (approvals)
```
GET  /api/marketing/approvals             -> köer (pending/needs_input/approved/rejected)
POST /api/marketing/approvals/[id]/approve
POST /api/marketing/approvals/[id]/approve-with-fix   body: { fix_patch }
POST /api/marketing/approvals/[id]/reject             body: { note }
POST /api/marketing/approvals/[id]/return             body: { note } -> triggar drafts/return
```

### 4.5 Operations / KPI
```
GET  /api/marketing/metrics               -> KPI-aggregat (se §6)  (läser plans/drafts/guard/approvals + revenue_snapshots)
```

### 4.6 Engine (befintligt, återanvänds — byggs INTE nytt)
`/api/runs/drain` (pg_cron), reaper, `claim_runs`. WF1/WF2/WF3 registreras som workflow-typer i drain-dispatchern.

---

## 5. Durable Workflows (steg, retries, timeouts)

Alla körs via `runs` med `max_attempts=3` (befintlig default), lease 280s, reaper varje minut. maxDuration ≤ 60s
(Hobby/Vercel-tak) → varje workflow är **ett snabbt LLM+IO-steg**, inte långkörande.

### WF1 — Campaign Planner
| Steg | Gör | Retry | Timeout |
|------|-----|------|---------|
| 1 Load | Läs KB (brand/theme/character/content/marketing-bible) + `revenue_snapshots` | idempotent läs | ~5s |
| 2 Resolve+Generate | LLM: tema→vinkel→Stripe-strategi→kalender→briefs→Gap Guard | 3 försök (durable) | ~40s |
| 3 Persist | Skriv `campaign_plans(status=draft)` + `campaign_briefs(status=planned)` | upsert på plan_key (idempotent) | ~5s |
- **Idempotens:** upsert på `(project_id, target_month)`; om plan finns i `draft` → uppdatera, inte duplicera.

### WF2 — Channel Drafter (en run per brief)
| Steg | Gör | Retry | Timeout |
|------|-----|------|---------|
| 1 Load | Läs brief + plan-kontext + KB + asset-index | läs | ~5s |
| 2 Draft | LLM: caption (hook/story/value/cta) + asset-bind + hashtags + self-check | 3 försök | ~40s |
| 3 Persist | Skriv `draft_posts(status=drafted|needs_input)`, brief.status=drafted | upsert (brief_id, version) | ~5s |
- **Idempotens:** `unique(brief_id, version)`; retur skapar version+1.

### WF3 — Brand/Canon Guard (en run per draft)
| Steg | Gör | Retry | Timeout |
|------|-----|------|---------|
| 1 Load | Läs draft + plan-kontext + KB + asset-index | läs | ~5s |
| 2 Validate | Kör 6 validatorer → violations + score + verdict | 3 försök | ~30s |
| 3 Persist+Route | Skriv `guard_reports`; om verdict≠rejected → skapa `marketing_approvals(pending)`; annars draft.status=guard_failed | upsert (draft_id) | ~5s |
- **Idempotens:** `unique(draft_id)` (senaste rapport); om-validering ersätter.

**Felhantering (alla WF):** vid 3 misslyckade försök → run.status=failed + reaper-larm i Operations Center
(samma heartbeat/larm-mönster som media-pipelinen). Inga halvskrivna rader (persist-steget är sista, atomiskt).

---

## 6. UI-design

### 6.1 Action Center — vyer
Fyra köer (flikar), drivna av `marketing_approvals` + `guard_reports` + `draft_posts`:

| Vy | Innehåll | Källa |
|----|----------|-------|
| **Pending Review** | Utkast med guard verdict approved/warning, väntar beslut | approvals.state=pending |
| **Needs Input** | Utkast/planer med blockerande LUCKA (t.ex. landningssida) | draft/plan needs_input + gap_flags.blocking |
| **Approved** | Godkända utkast (redo för Publisher v2) | draft.status=approved |
| **Rejected** | Avvisade/returnerade med skäl | draft.status in (rejected, returned) |

**Granskningskort (per utkast)** — komponenter:
- Header: tema + kanal/format + **score-badge** (grön ≥90 / gul 70–89 / röd <70) + verdict.
- Preview: `caption_rendered`, slides/scener, asset-thumbnails (eller LUCKA-platshållare), CTA, hashtags.
- **Blocking issue** överst (om finns).
- Violations-lista (severity-färgad) + KB-ref; Warnings + Gap-flaggor.
- Checks-rad: brand/character/theme/marketing/asset ✓/✗ + "Ingen The Prompt ✓".
- Åtgärder: **Approve** (döljs vid CRITICAL) · **Approve with fix** (visar fält att fylla, t.ex. landningssida) · **Reject** · **Return to Drafter**.

**Användarflöde:** operatör öppnar Pending Review → läser kort → fyller ev. fix → trycker beslut → kortet flyttas till
rätt vy; Return enqueue:ar ny WF2. Allt loggas i beslutsminnet.

### 6.2 Operations Center — Familje-Marknad-panel
Ny panel **bredvid** befintlig Familje-Stripe-panel (samma sida), läser `/api/marketing/metrics`. Ingen ny sida.

### 6.3 Planner-vy (lättviktig)
En enkel vy `/atlas/marketing` (eller flik i Operations) för att: se månadsplaner, trigga `plans/generate`,
godkänna plan, se briefs. Minimal i v1 — huvud-UI är Action Center.

---

## 7. Operations Center — KPI:er

`/api/marketing/metrics` aggregerar (allt scoped familje-stunden):

| KPI | Källa | Beskrivning |
|-----|-------|-------------|
| **Aktiva prenumeranter, MRR, trial, churn** | `revenue_snapshots` (Stripe) | Affärens norra stjärna (redan byggt). |
| **Trial→betald-konvertering** | revenue_snapshots (om tillgängligt) / LUCKA-flagga | Funnel-slutmål. |
| **Antal kampanjer (planer)** | `campaign_plans` count by status | draft/approved/månad. |
| **Antal briefs / utkast** | `campaign_briefs`, `draft_posts` count | produktionsvolym. |
| **Godkännandefrekvens** | `marketing_approvals` approved / total | andel utkast som godkänns. |
| **Guard-snittpoäng** | avg(`guard_reports.score`) | innehållskvalitet över tid. |
| **Vanligaste violations** | top `guard_reports.violations[].id` | var Drafter brister. |
| **Pending review / Needs input** | köstorlekar | operatörens arbetsbörda. |

Koppling mål: 200 prenumeranter/år (Marketing Bible) visas som progress mot Stripe-aktiva. Allt visas i
Familje-Marknad-panelen i Operations Center, bredvid Stripe-siffrorna.

---

## 8. Byggordning (fyra faser — bygg utan scope creep)

### Fas 1 — Datamodell + engine-wiring (fundament)
1. Migration: `campaign_plans`, `campaign_briefs`, `draft_posts`, `guard_reports`, `marketing_approvals`
   (eller `approvals.kind`) + index + RLS.
2. Registrera WF1/WF2/WF3 som workflow-typer i `/api/runs/drain`-dispatchern (ingen ny engine).
3. Bekräfta `project_id` för familje-stunden + läsväg till KB-filer.
> **DoD Fas 1:** tabeller migrerade; en manuellt insatt `runs`-rad av varje WF-typ plockas av drain (no-op-steg).

### Fas 2 — Campaign Planner (WF1) end-to-end
1. WF1 steg 1–3 (load KB+Stripe → generera → persist).
2. Endpoints: `plans/generate`, `plans`, `plans/[id]`, `plans/[id]/approve`.
3. Minimal Planner-vy: lista + generera + godkänn plan.
> **DoD Fas 2:** `POST plans/generate` för 2026-09 ger en `campaign_plans(draft)` + briefs som matchar Skördemånaden-exemplet; gaps korrekt flaggade.

### Fas 3 — Channel Drafter (WF2) + Guard (WF3)
1. WF2 (brief→draft) + `drafts/*`-endpoints; plan-approve enqueue:ar WF2 per brief.
2. WF3 (draft→guard_report) + `guard/*`-endpoints; draft-drafted enqueue:ar WF3.
3. Scoring + Violation Library + LUCKA-regler enligt Guard-design.
> **DoD Fas 3:** godkänd plan producerar utkast för alla briefs; varje utkast får en `guard_report` med score/verdict; Skördemånaden-karusellen ger ~80/warning (saknad landningssida) som i Guard-exemplet.

### Fas 4 — Action Center + Operations KPI
1. Action Center: fyra vyer + granskningskort + 4 åtgärder (approve/approve-with-fix/reject/return) + beslutslogg.
2. Return → WF2 version+1.
3. `marketing/metrics` + Familje-Marknad-panel i Operations Center.
> **DoD Fas 4:** operatör kan ta ett utkast hela vägen pending→approved (eller return→nytt utkast); KPI:er syns bredvid Stripe.

**Scope-creep-spärr:** Publisher, schemaläggning, bildgenerering, Pinterest, e-post, A/B, auto-postning = **v2/v3, byggs inte**.

---

## 9. Definition of Done — Marketing Engine v1

v1 är klar när **alla** mätbara kriterier nedan uppfylls:

**Funktionellt:**
1. `POST /api/marketing/plans/generate` för en månad skapar en `campaign_plans(draft)` + `campaign_briefs` enligt Planner-schemat, med korrekta gaps.
2. Plan-approve enqueue:ar WF2 och producerar ett `draft_posts(drafted)` per brief (IG Reel, IG Karusell, FB-inlägg stöds).
3. Varje draft får exakt ett `guard_reports` med verdict (approved/warning/rejected) + score 0–100 + violations enligt Violation Library.
4. Action Center visar de fyra vyerna; operatör kan **Approve / Approve with fix / Reject / Return to Drafter**; Return ger ett nytt draft (version+1).
5. Operations Center visar Familje-Marknad-KPI:er bredvid Stripe.

**Kvalitet/kanon:**
6. Inget utkast eller plan refererar The Prompt/AI News (Guard `no_the_prompt`=true för alla godkända).
7. Inga uppfunna fakta: alla LUCKor (landningssida, palett, osäkra teman) är **flaggade**, aldrig gissade; Guard fäller `GAP-INVENTED` om gissning förekommer.
8. CRITICAL-violations blockerar Approve (knappen döljs).

**Drift/robusthet:**
9. Alla tre workflows körs via durable `runs` (pending→running→done/failed), 3 retries, reaper; inga fire-and-forget.
10. Misslyckade runs syns som larm i Operations Center (befintligt heartbeat-mönster).

**Acceptanstest (ett spår):**
11. **Skördemånaden e2e:** generera plan → godkänn → utkasten matchar Channel Drafter-exemplen → Guard ger karusellen ~80/warning (saknad landningssida) → operatör Approve-with-fix (fyller URL) → status=approved. Hela kedjan spårbar via `run_id`.

> Isoleringskrav (genomgående DoD): noll delad KB/tokens/innehåll med The Prompt; egna familje-IG/FB-tokens i G1 (registreras, men används först i v2-Publisher).

---

## 10. Öppna beslut inför bygget (från designerna, ej uppfunna här)
1. Egen `marketing_approvals`-tabell **eller** utöka befintlig `approvals` med `kind`? (Rek: utöka — mindre scope.)
2. Auto-return vid `rejected` eller alltid manuell? (Rek: manuell i v1.)
3. Re-score efter Approve-with-fix (kör Guard igen) eller lita på operatör? (Rek: snabb re-validering av bara det fixade fältet.)
4. Trösklar 90/70 vs. strängare 95/80 för betalande varumärke?
5. En parametriserad Drafter-workflow (kanal som input) vs. två — Rek: **en** (matchar Channel Drafter-design §15.4).

> Inget av detta hittas på i planen — medvetna besluts­punkter för dig innan Fas 1.
