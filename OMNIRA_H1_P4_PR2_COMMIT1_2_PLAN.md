# OMNIRA H1.P4 — PR2: Commit 1 + Commit 2 — Apply-ready plan

> Status: **PLAN — ingen kod committad ännu.** Detaljerad, apply-redo plan för de två
> prerequisite-commitsen. `H1_POLICY_GATE` införs **inte** här och förblir avstängd.
> Bygger på `OMNIRA_H1_P4_PR2_IMPLEMENTATION_PLAN.md` (godkänd) + status-audit (Del A).
> Datum: 2026-06-14.

## Scope & princip
- **Commit 1:** additiv migration som tillåter `rejected` på `runs.status`.
- **Commit 2:** typvidgning + total, **defensiv** statusmappning (UNKNOWN-fallback) på
  *varje* UI-renderings-/klassificeringssite — run-status **och** övriga statusmappar.
- **Inget beteende ändras.** Inga runs når `awaiting_approval`/`rejected` ännu (gaten är
  i commit 3, avstängd). Dessa två commits gör enbart systemet *säkert* att rendera/räkna
  hela statusmängden — den prerequisite du flaggade.

---

## COMMIT 1 — Migration: `rejected`-status (additiv, guard-skyddad)

**Ny fil:** `apps/web/supabase/migrations/20260617_h1p4_pr2_run_rejected_status.sql`

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- H1.P4 (PR2) — Lägg 'rejected' till runs.status (ADDITIV, beteendeneutral).
--
-- 'rejected' = en run som nådde awaiting_approval och vars approval AVVISADES av en
-- människa. Förstaklass terminalstatus — skild från 'failed' (tekniskt fel) och
-- 'cancelled' (kooperativ cancel, H1.P5). Ingen rad skrivs ännu: gaten (PR2 commit 3)
-- är flaggstyrd och avstängd. Detta är ren schema-vidgning så koden i commit 2 kan
-- referera statusen utan att brytas.
-- Back-compat: vidgar bara tillåten mängd; ingen befintlig rad bryter CHECKen.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE public.runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('pending','running','done','failed','awaiting_approval','cancelled','rejected'));

COMMENT ON COLUMN public.runs.status IS
  'pending|running|done|failed|awaiting_approval (gated, väntar beslut)|rejected (approval avvisad, terminal)|cancelled (P5)';
```

**Verifiering Commit 1**
1. `list_migrations` → migrationen listad som applied i target-projektet.
2. Migration Guard: deploy med migrationen **oapplicerad** ska RED:a (bevisar kontraktet),
   applicerad → GREEN. Samma RED→GREEN som verifierades för guarden.
3. Sanity: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='runs_status_check';`
   innehåller `rejected`.
4. Negativ: en befintlig `done`/`failed`-rad bryter inte CHECKen (inga rader avvisas vid `ALTER`).

---

## COMMIT 2 — Typvidgning + defensiv statusmappning (inget beteende)

### 2.1 Sanningskälla — `RunStatus`-typen
**Fil:** `lib/supabase/types.ts:18`

```ts
// FÖRE
export type RunStatus = 'pending' | 'running' | 'done' | 'failed'

// EFTER — komplett mot runs_status_check
export type RunStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'awaiting_approval'
  | 'cancelled'
  | 'rejected'
```

Effekt: alla typbundna konsumenter (`Record<RunStatus,…>`, exhaustiva `switch`) ger nu
**kompileringsfel** där en gren saknas → `next build` blir mekanisk garanti för fullständighet.

### 2.2 Defensiv mappnings-standard (det nya kravet)

Princip: **varje** site som mappar ett statusvärde → UI (label/färg/ikon/tier) eller
klassificering måste ha en `UNKNOWN`/`default`-fallback, så framtida statusar **degraderar
graciöst** istället för att krascha eller rendera `undefined`.

Två kanoniska mönster:

```ts
// Mönster A — objekt-/Record-uppslag: definiera UNKNOWN + använd ?? UNKNOWN
const UNKNOWN = { label: 'Okänd', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', dot: 'bg-zinc-500' }
const cfg = statusConfig[status] ?? UNKNOWN
```

```ts
// Mönster B — switch: alltid en default-gren
switch (s) {
  case 'running': return { tier: 'live', label: 'Executing' }
  // …
  default: return { tier: 'passive', label: 'Okänd' }   // graceful degrade
}
```

### 2.3 KRITISKA run-status-siter (kraschar idag — måste fixas)

**(a) `components/platform/RunStatusBadge.tsx`** — lägg de nya posterna + UNKNOWN-fallback:

```ts
const statusConfig: Record<RunStatus, { label: string; className: string; dot: string }> = {
  pending:           { label: 'Väntar',             className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', dot: 'bg-yellow-500' },
  running:           { label: 'Kör...',             className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',       dot: 'bg-blue-500 animate-pulse' },
  done:              { label: 'Klar',               className: 'bg-green-500/10 text-green-600 border-green-500/20',     dot: 'bg-green-500' },
  failed:            { label: 'Misslyckades',       className: 'bg-red-500/10 text-red-600 border-red-500/20',           dot: 'bg-red-500' },
  awaiting_approval: { label: 'Väntar godkännande', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',     dot: 'bg-amber-500' },
  rejected:          { label: 'Avvisad',            className: 'bg-rose-500/10 text-rose-600 border-rose-500/20',        dot: 'bg-rose-500' },
  cancelled:         { label: 'Avbruten',           className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',        dot: 'bg-zinc-500' },
}

const UNKNOWN_STATUS = { label: 'Okänd', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', dot: 'bg-zinc-500' }

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const config = statusConfig[status] ?? UNKNOWN_STATUS   // ← defensiv
  // … oförändrat
}
```
*(Den fullständiga `Record<RunStatus>` ger kompileringsfel om någon framtida status saknas;
`?? UNKNOWN_STATUS` skyddar mot statusvärden utanför typen, t.ex. rådata från DB.)*

**(b) `lib/os/data.ts` — `classifyRunStatus`** — lägg cases + default:

```ts
export function classifyRunStatus(s: RunStatus): { tier: 'live'|'passive'|'archived'|'critical'; label: string } {
  switch (s) {
    case 'running':           return { tier: 'live',     label: 'Executing' }
    case 'pending':           return { tier: 'passive',  label: 'Pending' }
    case 'awaiting_approval': return { tier: 'passive',  label: 'Väntar godkännande' }
    case 'done':              return { tier: 'archived', label: 'Complete' }
    case 'cancelled':         return { tier: 'archived', label: 'Avbruten' }
    case 'failed':            return { tier: 'critical', label: 'Failed' }
    case 'rejected':          return { tier: 'critical', label: 'Avvisad' }
    default:                  return { tier: 'passive',  label: 'Okänd' }   // ← graceful
  }
}
```

### 2.4 ÖVRIGA statusmappar — härda defensivt (kravets bredd)

Audit fann fler mappar som dereferensar utan skydd. Härda alla enligt mönster A. Flera är
inte run-status men omfattas av ditt krav "wherever status values are mapped":

| Fil | Site | Nuläge | Åtgärd |
|---|---|---|---|
| `app/(platform)/approvals/ApprovalCard.tsx` | `STATUS_META[approval.status]` | Saknar `returned`/`needs_input` (tillåtna i `approvals`-CHECK) → `undefined`. **Latent bugg idag.** | Lägg poster för `returned`/`needs_input` + `?? UNKNOWN`. |
| `components/platform/os/WorkflowFlow.tsx` | `STATUS_STYLES[node.status]` (rad ~41) | Huvuduppslaget oskyddat (edge-beräkningen har `?? 'queued'`). | `?? STATUS_STYLES.queued`. |
| `app/(platform)/projects/[slug]/scripts/page.tsx` | `STATUS_LABELS[script.status]` | Oskyddat uppslag. | Lägg UNKNOWN + `?? UNKNOWN`. |
| `app/(platform)/projects/[slug]/news/page.tsx` | `STATUS_LABELS[item.status]` | Oskyddat uppslag. | Lägg UNKNOWN + `?? UNKNOWN`. |
| `components/platform/os/PublishPipeline.tsx` | `STATUS_META[item.status]` | Oskyddat uppslag. | `?? UNKNOWN`. |
| `components/platform/os/AgentCard.tsx` | `STATUS_TONE[agent.status]` | Typad `Record<AgentSnapshot['status']>`; säker vid typkorrekt data men ingen runtime-fallback. | `?? UNKNOWN_TONE` (försvar mot rådata). |
| `components/platform/os/BusinessCard.tsx` | `STATUS_META[business.status]` | Som ovan. | `?? UNKNOWN_META`. |

> `revenue/page.tsx` (`LEAD_STATUS_*`) och `manager/MissionControlClient.tsx` använder redan
> `?? f`/filtrering utan direkt-dereferens och kraschar inte — men normaliseras till samma
> mönster för konsekvens om de rörs.

### 2.5 Övriga kompileringsfel som vidgningen avslöjar
Kör `next build` efter 2.1; åtgärda varje `Record<RunStatus>`/exhaustiv-switch-fel som dyker
upp (förväntat: 2.3a + 2.3b; ev. fler om någon ny exhaustiv konsument tillkommit). Detta är
den typtvingade konsistensgarantin från audit A.2.

### 2.6 Vad som INTE rörs i Commit 2
- Ingen `H1_POLICY_GATE`, ingen drain-ändring, ingen approval-PATCH-ändring (commit 3–4).
- Inga metrics/counts/notiser (commit 5).
- Legacy `executeWorkflow`-vägen orörd.
- `database.types.ts` — `status` är redan `string`, ingen ändring krävs.

---

## Tester (Commit 2)
- **Snapshot/render-test `RunStatusBadge`:** rendera **varje** `RunStatus` inkl. de tre nya,
  plus ett påhittat statusvärde (`'totally_new' as any`) → ska rendera "Okänd", **inte** krascha.
- **`classifyRunStatus`:** enhetstest över alla cases + okänt värde → default `passive/"Okänd"`.
- **Defensiv-fallback-test per härdad mapp:** uppslag med okänt värde returnerar UNKNOWN, ej `undefined`.
- **Bygg:** `next build` grön = typtvingad fullständighet uppnådd.

## Verifiering / Definition of Done (Commit 1 + 2)
1. Migration applied + Migration Guard RED→GREEN bevisad (Commit 1).
2. `next build` grön; inga `Record<RunStatus>`/switch-fel kvar.
3. `pnpm test` grön inkl. nya badge/klassificerings-/fallback-tester.
4. Manuell preview: en run vars status sätts manuellt till `awaiting_approval`/`rejected`
   (t.ex. via SQL i preview-DB) renderas korrekt på alla 5 badge-sidor — **ingen krasch**.
5. `H1_POLICY_GATE` finns inte i dessa commits → per definition avstängd.
6. Diff-granskning: noll beteendeändring (enbart typ, mappning, fallback).

---

## Nästa steg
Dessa två commits är prerequisiten du krävde: efter att de mergats (gate fortfarande av) är
systemet säkert att rendera/klassa hela statusmängden, och `awaiting_approval`/`rejected`
kan inte krascha UI. Därefter går vi vidare till **Commit 3** (policy-gate, flaggstyrd, av i
prod) enligt huvudplanen.

**Vill du att jag nu skriver den faktiska koden för Commit 1 + Commit 2 (migration + typ +
defensiva mappningar + tester), eller justera något i planen först?**
