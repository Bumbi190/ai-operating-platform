# OMNIRA H1.P4 — PR2: Status-reader-audit + Implementeringsplan

> Status: **PLAN — ingen kod ännu.** Bygger på `OMNIRA_H1_P4_PR2_DESIGN.md` (godkänd).
> Två delar: **A.** dedikerad audit av varje run-status-läsare innan `rejected` införs,
> **B.** sekvenserad implementeringsplan. Baseline: commit `68154cf`.
> Datum: 2026-06-14.

---

# DEL A — Audit av run-status-läsare

**Metod:** uttömmande grep över `apps/web` efter (1) DB-filter på `runs.status`
(`.eq/.in/.neq('status', …)`), (2) literaler `r.status === …`, (3) typdefinitioner,
(4) UI-label/-färgmappar. Filtrerade bort andra tabellers status (`media_scripts`,
`approvals`, `opportunities`, leads, tokens, heartbeat) som inte berörs.

## A.0 Huvudfynd — en latent bugg, inte bara utelämnanden

`RunStatus`-typen är redan **idag** ofullständig och två konsumenter kraschar / faller
tyst på statusar som schemat redan tillåter sedan P1 (`awaiting_approval`, `cancelled`).
PR2 gör inte bara `rejected` synlig — den gör att runs **faktiskt** når dessa states, så
buggen blir aktiv. Den måste fixas **före** gaten slås på.

```
lib/supabase/types.ts:18
  export type RunStatus = 'pending' | 'running' | 'done' | 'failed'   // ← saknar 3 states
```

```
components/platform/RunStatusBadge.tsx
  const statusConfig: Record<RunStatus, …> = { pending, running, done, failed }
  const config = statusConfig[status]          // ← undefined för awaiting_approval/rejected
  return <span className={cn(…, config.className)}>  // ← TypeError: undefined.className → KRASCH
```

`RunStatusBadge` renderas på **5 sidor**: `projects/[slug]/page.tsx`,
`projects/[slug]/runs/page.tsx`, `projects/[slug]/runs/[id]/page.tsx`,
`agent-activity/page.tsx`, `system/page.tsx`. En run i `awaiting_approval` skulle krascha
samtliga.

```
lib/os/data.ts:330  classifyRunStatus(s: RunStatus)
  switch (s) { case 'running'… 'pending'… 'done'… 'failed'… }   // ← ingen default → undefined
```

## A.1 Full klassificering

### KRITISKT — kraschar eller typtvingat (måste fixas)

| Fil | Rad | Vad | Åtgärd |
|---|---|---|---|
| `lib/supabase/types.ts` | 18 | `RunStatus`-typ (sanningskälla) | Vidga: lägg `'awaiting_approval' \| 'cancelled' \| 'rejected'`. Vidgningen tvingar fram kompileringsfel på alla `Record<RunStatus>`/`switch`-konsumenter → fångar resten åt oss. |
| `components/platform/RunStatusBadge.tsx` | 4–24 | `statusConfig: Record<RunStatus,…>` | Lägg poster för `awaiting_approval` (gul/amber "Väntar godkännande"), `rejected` (röd "Avvisad"), `cancelled` (grå "Avbruten"). **Plus** defensiv fallback `?? UNKNOWN` så framtida statusar aldrig kraschar. |
| `lib/os/data.ts` | 330 | `classifyRunStatus` switch utan default | Lägg `awaiting_approval → passive/"Väntar godkännande"`, `rejected → critical/"Avvisad"` (eller egen tier), `cancelled → archived`. Lägg `default` som fail-safe. |

### METRICS / COUNTS — tyst utelämnande (uppdatera för korrekthet)

| Fil | Rad | Vad | Åtgärd |
|---|---|---|---|
| `lib/os/data.ts` | 114–117 | Dashboard-räknare: `done`/`failed`/`running` | Lägg räknare för `awaiting_approval` (KPI "väntar godkännande") och `rejected`. Annars summerar inte totalerna. |
| `lib/ai/manager.ts` | 158–164 | Manager-briefing: done/failed/running + `recentFailed` | Lägg `awaitingApproval`-räknare i briefingen. Räkna **inte** `rejected` som `failed` (affärsbeslut, ej tekniskt fel) — separat rad. |
| `lib/os/business.ts` | 240, 296 | Business-snapshot: running/failed | Lägg `awaiting_approval` om det ytan. Lågt men noteras. |
| `lib/ai/dream.ts` | 167–181 | Reflektions-metrics: `done`/`failed` | Lågt: `rejected`/`awaiting` exkluderas från success/fail. Acceptabelt; dokumentera. |
| `lib/atlas/context.ts` | 183 | Atlas-kontext: failed-runs (24h) | Överväg `awaiting_approval`-synlighet för Atlas. Inget krasch-risk. |
| `lib/atlas/operations.ts` | 131 | Atlas ops: running-runs | Ingen ändring krävs (selektivt på running). |

### FILTRERING — query-param

| Fil | Rad | Vad | Åtgärd |
|---|---|---|---|
| `app/api/runs/route.ts` (GET) + `runs/page.tsx`-filter | — | Statusfilter på runs-listan | Lägg `awaiting_approval` + `rejected` som filterval (redan i spec §6.3). Exponera `policy_class`. |
| `lib/os/agents-activity.ts` | 53, 58 | `eq('running')` / `neq('running')` | `neq('running')` lägger nu `awaiting_approval`/`rejected` i "ej aktiv"-hinken — verifiera att det är önskat (sannolikt OK). |

### NOTISER / AKTIVITETSFLÖDE

| Fil | Rad | Vad | Åtgärd |
|---|---|---|---|
| `app/(platform)/layout.tsx` | 66–90 | Aktivitetsflöde: bygger events för run `failed`/`running`/`done` | `awaiting_approval` & `rejected` ger **inget** event idag. Lägg: `awaiting_approval` → åtgärdbart "väntar godkännande"-event, `rejected` → beslut-event. **OBS dubbelsignal:** approvals-pending-loopen (rad 104+) genererar redan ett event för pending approval — koordinera så samma run inte dubbelvisas (visa antingen run-eventet eller approval-eventet, inte båda). |

### SÄKER — ingen ändring

Övriga `status`-läsare träffar andra tabeller och påverkas inte: `media_scripts`
(scripts/news/media/system-sidor, media-cron), `approvals` (ApprovalCard, redan komplett),
`opportunities`, leads (`revenue/page.tsx`), tokens/heartbeat (`atlas/operations`),
planning-items, `manager_tasks`, samt React/HTTP-`status` (`Promise.allSettled`,
`res.status`). Verifierat via grep-genomgång.

## A.2 Konsistensgaranti

Eftersom `RunStatus` är typad sanningskälla och två nyckelkonsumenter (`RunStatusBadge`
via `Record<RunStatus>` och `classifyRunStatus` via exhaustiv `switch`) är typbundna, ger
**vidgningen av typen kompileringsfel** exakt där en status saknas. `tsc`/`next build`
blir därmed en mekanisk garanti för att UI-mappningarna är kompletta — inte bara en manuell
checklista. Metrics/notiser är inte typtvingade och täcks därför explicit av commit 5 + tester.

---

# DEL B — Implementeringsplan

Sex commits i strikt ordning. Princip: **gör statusar säkra att rendera och räkna FÖRE
beteendet som producerar dem**, och håll beteendet bakom flagga för instant rollback.

## Ordningsrationale
1. Schema först (additivt, guard-skyddat) → koden kan referera `rejected` utan att brytas.
2. Typ + läsare (ren, beteendeneutral) → UI/metrics tål `awaiting_approval`/`rejected`
   *innan* någon run når dit. Tar bort den latenta kraschen oavsett gate.
3. Först därefter gate-beteendet (flaggstyrt) → producerar de nya states.

## Commit 1 — Migration: `rejected`-status (additiv, guard-skyddad)
- **Fil:** `apps/web/supabase/migrations/20260617_h1p4_pr2_run_rejected_status.sql`
- Vidga `runs_status_check` med `'rejected'` (enligt design §3).
- Additivt, bryter ingen befintlig rad. Migration Guard (live) blockerar deploy tills
  applicerad.
- **Verifiering:** `list_migrations` visar applied; preview RED→GREEN (steg 1–2 i testplan).

## Commit 2 — Typ + status-läsare (ren konsistens-commit, inget beteende)
- `lib/supabase/types.ts`: vidga `RunStatus` med `awaiting_approval | cancelled | rejected`.
- `components/platform/RunStatusBadge.tsx`: lägg 3 poster + defensiv `?? UNKNOWN`-fallback.
- `lib/os/data.ts`: `classifyRunStatus` — nya cases + `default`.
- Fixa alla övriga kompileringsfel som vidgningen avslöjar.
- **Ingen beteendeändring.** Enbart gör rendering/klassning totalt över statusmängden.
- **Verifiering:** `next build` grön (typtvingad fullständighet); snapshot/render-test av
  `RunStatusBadge` för varje status inkl. de nya.

## Commit 3 — Policy-gate i drain-vägen (flaggstyrd)
- **Ny:** `lib/ai/policy-gate.ts` — `decideGate(policyClass): 'done' | 'awaiting_approval'`
  (Default Deny på NULL/okänt). Ren funktion, ingen I/O.
- `app/api/runs/drain/route.ts`: ersätt ovillkorligt `status:'done'` med flaggstyrt
  gate-beslut (`H1_POLICY_GATE`); skapa idempotent `approvals`-rad + notis vid
  `awaiting_approval`; flippa run-status sist. Flagga av ⇒ exakt dagens beteende.
- **Beroende:** dokumentera att `H1_POLICY_GATE=1` förutsätter `H1_UNIFIED_EXECUTOR=1`
  (gaten behöver `outputContent`); annars fail-safe `awaiting_approval`.
- **Verifiering:** enhetstester §9.1 (decideGate-matris + drain on/off).

## Commit 4 — Run-transition i approval-PATCH
- `app/api/approvals/[id]/route.ts`: efter approval-statussättning, villkorad run-update —
  `approved` → run `done` (`.eq('status','awaiting_approval')`), `rejected` → run `rejected`
  + `error='approval_rejected: …'`. Idempotent/racefri. Befintlig ownership-gate,
  `saveFeedback` (Band 3-minne) och publish-on-approve-hook **orörda**.
- **Verifiering:** PATCH approved/rejected-tester + idempotens (§9.1).

## Commit 5 — Observability: metrics, counts, notiser
- `lib/os/data.ts` dashboard-counts: lägg `awaiting_approval` + `rejected`.
- `lib/ai/manager.ts`: lägg `awaitingApproval` i briefing; håll `rejected` skilt från `failed`.
- `app/(platform)/layout.tsx`: events för `awaiting_approval` (åtgärdbart) + `rejected`;
  koordinera mot approvals-pending-loopen så ingen dubbelsignal.
- `app/api/runs/route.ts` + runs-listfilter: `awaiting_approval`/`rejected`-filter,
  exponera `policy_class`.
- **Verifiering:** count-tester; manuell genomgång av aktivitetsflödet i preview.

## Commit 6 — Tester + preview-verifiering (RED→GREEN)
- Hela testplan §9 grön (`pnpm test`).
- Preview: de 7 integrationsfallen (§9.3) avbockade.
- Diff-genomgång som bekräftar legacy `executeWorkflow`-vägen byte-för-byte oförändrad.

## Flagg-utrullning (efter merge)
1. Merge med `H1_POLICY_GATE` **av** i prod → noll beteendeändring (commit 2 redan skyddar UI).
2. Aktivera i preview, kör 7 fallen.
3. Aktivera i prod, övervaka `awaiting_approval`-count (R1-flod).
4. Rollback = `H1_POLICY_GATE=0` (sekunder, ingen deploy).

## Spårning mot risker (design §10)
- **R2 (oläst status)** — neutraliseras av Del A + commit 2 (typtvingat) + commit 5.
- **R3 (migration-ordning)** — Migration Guard + commit 1 först.
- **R1 (approval-flod)** — flagg-utrullning + count-övervakning (commit 5).

## Definition of Done
`next build` + `pnpm test` gröna; migration applied; 7 preview-fall avbockade;
status-audit (Del A) helt åtgärdad; legacy-vägen oförändrad; `H1_POLICY_GATE` av i prod
vid merge. **Ingen kod skrivs förrän denna plan är godkänd.**
