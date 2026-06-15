# OMNIRA H1.P4 — PR2: Commit 3 + Commit 4 — Apply-ready plan (KOD-VERIFIERAD)

> Status: **PLAN — ingen kod skrivs förrän denna är godkänd.**
> Bygger på `OMNIRA_H1_P4_PR2_DESIGN.md` + `..._IMPLEMENTATION_PLAN.md` (godkända).
> Commit 1 (rejected-migration) + Commit 2 (typvidgning + defensiva mappningar) är **live på main** (PR #34, merge `706c51d`).
> Baseline för denna plan: `706c51d` (production READY, guard grön).
> Datum: 2026-06-14. Scope: **endast** Commit 3 (policy-gate i drain) + Commit 4 (approval→run-transition).

---

## 0. Vad denna plan tillför utöver designdokumenten

Designdokumenten skrevs mot baseline `68154cf` och innehöll två antaganden som nu är **verifierade mot faktisk kod/DB** — det ena höll, det andra kräver en konkret kodändring som pseudokoden inte fångade:

| # | Antagande i designen | Verifierat utfall | Konsekvens för planen |
|---|---|---|---|
| V1 | Drainen har `run.policy_class` i handen vid gate-beslutet | **HÅLLER.** `claim_runs` är `RETURNS SETOF runs ... returning r.*` → varje claimad rad innehåller **alla** runs-kolumner inkl. `policy_class` (PR1). | Gaten kan läsa `run.policy_class` direkt i drain-loopen. Ingen RPC-ändring krävs. |
| V2 | `executeRunSteps` "returnerar redan outputContent/lastOutputKey" | **HÅLLER delvis.** Funktionen returnerar `{ outputContent, lastOutputKey, context }` (rad 320) — **men drainen kastar returvärdet idag** (`await executeRunSteps(...)` utan tilldelning). | Commit 3 **måste fånga returen** i agent-steg-grenen. Detta är en konkret diff utöver designens pseudokod. |
| V3 | Approval-PATCH har `run_id` tillgängligt för run-transition | **HÅLLER.** `existing`-selecten innehåller redan `run_id` (`select('id, project_id, output_key, content, run_id, kind')`). | Commit 4 kan flippa run-status utan extra query. |

Tre nya förtydliganden som designen inte adresserade explicit och som blir **öppna beslut** (se §9):

- **Content-källa per körväg.** Endast unified-executor-grenen ger `outputContent`. Legacy `runSteps` och marketing-handlers gör det inte. Gaten behöver en definierad content-källa i de fallen.
- **Marketing-runs i gaten.** `isMarketingRun`-grenen träffar samma ovillkorliga `done`. Gaten läser `run.policy_class` även för dem — deras klassning måste bekräftas annars slår Default Deny in brett.
- **Den ovillkorliga `done`-skrivningen ligger på EN delad plats** (efter `if/else` marketing-vs-agent-steg). Det är den enda kroken — gör insättningen där, inte i varje gren.

---

## 1. Verifierat nuläge (kod/DB, 706c51d)

| Komponent | Nuläge | Källa (verifierad) |
|---|---|---|
| `runs.status` CHECK | `('pending','running','done','failed','awaiting_approval','cancelled','rejected')` | live `pg_constraint` (rejected applicerad i ledgern `20260614032512`) |
| `RunStatus`-typ | komplett 7-värdesunion; `RunStatusBadge`/`classifyRunStatus` totala + defensiv fallback | Commit 2 (live), `run-status.test.ts` grön |
| `claim_runs` | `RETURNS SETOF runs`, claimar endast `status='pending' AND attempts<max_attempts`, sätter `running` + lease (SKIP LOCKED), `returning r.*` | live `pg_get_functiondef` |
| Drain: ovillkorligt slut | efter körning: **alltid** `update {status:'done', finished_at, claimed_at:null, lease_until:null}` på ETT ställe | `app/api/runs/drain/route.ts` |
| Executor-retur | `executeRunSteps → { outputContent, lastOutputKey, context }` (slängs av drainen idag) | `lib/ai/workflow-executor.ts:320` |
| Flaggor | `H1_UNIFIED_EXECUTOR` styr unified vs legacy körväg | `drain/route.ts` |
| Approval-PATCH | validerar `action∈{approved,rejected,revised}`; ownership-gate; uppdaterar approval; `saveFeedback` (Band 3, non-blocking); publish-on-approve (artikel, non-blocking). **Rör ej run-status.** | `app/api/approvals/[id]/route.ts` |
| `approvals.status` CHECK | rymmer redan `approved`/`rejected` — **ingen migration behövs för Commit 4** | designdok §1 + route |

**Slutsats:** Inga nya schema- eller RPC-ändringar krävs för Commit 3/4. Migrationen (Commit 1) är redan live. Commit 3+4 är **ren, flaggstyrd beteendekod i två filer + en ny ren funktion.**

---

## 2. Commit 3 — Policy-gate i drain-vägen (flaggstyrd)

### 2.1 Ny fil: `lib/ai/policy-gate.ts` (ren funktion, ingen I/O)
```
export type GateOutcome = 'done' | 'awaiting_approval'

/** Default Deny: NULL/okänt => kräver godkännande (fail-safe). */
export function decideGate(policyClass: string | null | undefined): GateOutcome {
  return policyClass === 'non_destructive' ? 'done' : 'awaiting_approval'
}
```
Beslutet fattas mot PR1:s **immutabla per-run-snapshot** (`runs.policy_class`) — en mid-run-omklassning av workflowen kan inte ändra en pågående runs gate.

### 2.2 Drain-integration (`app/api/runs/drain/route.ts`)
Konkreta ändringar (utöver designens pseudokod):

1. **Lägg flaggan** bredvid `UNIFIED_EXECUTOR`:
   `const POLICY_GATE = process.env.H1_POLICY_GATE === '1'`
2. **Fånga executor-returen** i agent-steg-grenen (idag slängd) i loop-scopade variabler:
   `let outputContent: string | undefined; let lastOutputKey: string | undefined`
   → i unified-grenen: `const r = await executeRunSteps(...); outputContent = r.outputContent; lastOutputKey = r.lastOutputKey`
3. **Ersätt den enda ovillkorliga `done`-skrivningen** med ett gate-beslut:
   ```
   const outcome = POLICY_GATE ? decideGate(run.policy_class) : 'done'
   if (outcome === 'awaiting_approval') {
     // a) idempotent approval (skapa bara om ingen finns för run_id)
     const { data: existing } = await db.from('approvals')
       .select('id').eq('run_id', run.id).limit(1).maybeSingle()
     if (!existing) {
       await db.from('approvals').insert({
         run_id: run.id, project_id: run.project_id,
         output_key: lastOutputKey ?? 'output',
         content: outputContent ?? '',         // se §9 öppet beslut B (content-källa)
         status: 'pending', kind: 'workflow_output',
       })
       void sendAdminNotification(getApprovalPendingEmail({ /* återanvänt */ }))
     }
     // b) flippa run SIST (approval finns alltid före markeringen)
     await db.from('runs').update({
       status: 'awaiting_approval', finished_at: new Date().toISOString(),
       claimed_at: null, lease_until: null,
     }).eq('id', run.id)
   } else {
     await db.from('runs').update({          // OFÖRÄNDRAD väg
       status: 'done', finished_at: new Date().toISOString(),
       claimed_at: null, lease_until: null,
     }).eq('id', run.id)
   }
   ```
4. **Felvägen (catch) är orörd** — retry/`failed`-logiken förblir exakt som idag.

### 2.3 Invarianter (verifierade mot `claim_runs`/reaper)
- `claim_runs` plockar **endast** `pending` → `awaiting_approval`/`rejected` återstartas aldrig.
- `awaiting_approval`-skrivningen **nollar `claimed_at`+`lease_until`** → reapern (rör endast `running` med utgången lease) tar aldrig i den.
- `done`/`failed`/`rejected` terminala; `awaiting_approval` vilande (ej terminal), lämnas tills mänskligt beslut.

### 2.4 Flagga & beroende
- `H1_POLICY_GATE` **default OFF**. Av ⇒ byte-för-byte dagens beteende (`done` oavsett class).
- **Beroende:** `H1_POLICY_GATE=1` förutsätter `H1_UNIFIED_EXECUTOR=1` (gaten behöver `outputContent`). Dokumenteras; vid drift faller gaten fail-safe till `awaiting_approval` (se §9-B för content-källa i legacy/marketing).

---

## 3. Commit 4 — Run-transition i approval-PATCH

### 3.1 Integration (`app/api/approvals/[id]/route.ts`)
Lägg en **villkorad, non-blocking** run-transition **efter** att approval-statusen satts (efter den befintliga `update`-blocken), parallellt med `saveFeedback`/publish-hooken. `existing.run_id` finns redan.

```
// efter lyckad approval-update, oberoende av publish-utfall:
if (existing.run_id && action === 'approved') {
  await db.from('runs').update({ status: 'done' })
    .eq('id', existing.run_id).eq('status', 'awaiting_approval')   // idempotent/racefri
}
if (existing.run_id && action === 'rejected') {
  await db.from('runs').update({
      status: 'rejected',
      error: `approval_rejected: ${reviewer_notes ?? ''}`.slice(0, 500),
    })
    .eq('id', existing.run_id).eq('status', 'awaiting_approval')
}
// 'revised' → ingen run-transition i PR2 (uppskjutet)
```

### 3.2 Designval (grundade i den lästa koden)
- **`.eq('status','awaiting_approval')`** gör övergången idempotent och racefri — en andra PATCH (eller en approval mot en redan-done run) uppdaterar noll rader.
- **Ordning:** approval-status först (oförändrat), sedan run-transition. `saveFeedback` (Band 3) och publish-on-approve-hooken förblir **byte-för-byte oförändrade** och körs i samma ordning. Run-status speglar **godkännandebeslutet**, inte publiceringsutfallet (medvetet; designen R6).
- **Non-blocking:** wrappa i try/catch-loggning som de andra hookarna, så en run-update-miss aldrig fäller själva approval-svaret.
- **Marketing-/artikel-approvals:** samma kod gäller alla `kind` — men flippar bara en run som faktiskt är `awaiting_approval`. Approvals utan run i det tillståndet påverkas inte (villkoret skyddar).

---

## 4. Scope (drain-only) — uttryckligt

**In:** drain-vägens slutbeslut (Commit 3) + approval-PATCH-transition (Commit 4), flaggstyrt.
**Ute (medvetet uppskjutet):** legacy `executeWorkflow`-wrappern (orörd; unifieras i senare PR), per-steg-override `steps[].gated`, `revised`→re-run, cancel/`cancel_requested`/fencing (**P5**), budget-/kostnadströsklar som gate-källa (**Band 2** — gaten är dock den uttalade kroken). Inga nya minnessystem (Band 3 oförändrat; PersonaPlex orört).

---

## 5. Rollback-plan (tre lager, snabbast först)

1. **Flagga (sekunder, ingen deploy):** `H1_POLICY_GATE=0`. Drainen återgår till ovillkorligt `done`; approval-PATCH-transitionen blir effektivt no-op (inga runs når `awaiting_approval`). Exakt `H1_UNIFIED_EXECUTOR`-mönstret.
2. **Deploy-revert:** beteende-bara ändringar i två filer + en ren funktion → revert av PR-mergen återställer. Migrationen (Commit 1) är additiv, lämnas kvar (skadar inget; `rejected` skrivs bara av gate-koden).
3. **Datasanering vid övergivande:** vilande runs frigörs manuellt —
   `UPDATE public.runs SET status='done', finished_at=now() WHERE status='awaiting_approval';`
   (Behåll CHECK-vidgningen; ta bort `'rejected'` ur CHECKen endast efter att inga rader har statusen.)

**Förhandsdefinierade rollback-triggers:** (a) oväntad flod av `awaiting_approval` (Default Deny bredare än P1:s klassning antydde), (b) dashboards renderar fel på ny status (skyddat av Commit 2, men övervaka), (c) approval-PATCH flippar inte run korrekt i prod.

---

## 6. Riskanalys (uppdaterad med kod-fynd)

| # | Risk | S | K | Mitigering |
|---|---|---|---|---|
| R1 | **Approval-flod**: Default Deny gör att fler runs än väntat fastnar i `awaiting_approval` (NULL/oklassade + ev. marketing). | Med | Operatör översvämmas. | Flaggstyrd utrullning; övervaka `awaiting_approval`-count direkt efter aktivering; rollback via flagga. P1 klassade befintliga workflows `non_destructive` utom publishers. |
| R2 | **Content saknas i approval** för legacy/marketing-runs (ingen `outputContent`). | Med | Approval skapas med tom `content`. | Öppet beslut §9-B: content-källa. Rekommendation: kräv `H1_UNIFIED_EXECUTOR=1`, annars hämta sista `outputs.content` för run-id, annars tom + flagga i UI. |
| R3 | **Marketing-runs oavsiktligt gateade** (no-op-handlers idag → tom output → `awaiting_approval` via Default Deny). | Med | Marketing-runs fastnar väntande. | Öppet beslut §9-A: scope:a gaten till agent-steg-runs i PR2, **eller** bekräfta marketing-runs har `policy_class='non_destructive'`. |
| R4 | **Partiell skrivning** (approval skapad men run ej flippad / vice versa). | Låg | Approval utan markerad run. | Ordning: approval (idempotent på `run_id`) → flippa run sist. Reaper rör ej await-state. |
| R5 | **Dubbel approval** vid re-entrant drain/resume. | Låg | Dubblett + dubbelnotis. | Idempotent `existing`-check före insert (befintligt mönster). |
| R6 | **Approve men publish-hook fallerar** → run `done`, ej publicerad. | Låg | Förväntad publicering uteblir. | Medvetet: run-status speglar beslutet, ej publiceringen. `publishError` surfas redan i svaret. |
| R7 | **Legacy `executeWorkflow` ogateead** (skapar fortfarande approval+done utan gate). | Med | Två beteenden beroende på väg. | Scope-beslut; legacy används sällan (manuell execute); unifieras senare. |
| R8 | **`rejected` terminal — ingen re-run-väg ut.** | Låg | Manuell omstart krävs. | Avsiktligt i PR2; P3:s retry skapar en *ny* run vid behov; `revised`-driven re-run designas separat. |
| R9 | **Flaggdrift** `H1_POLICY_GATE=1` men `H1_UNIFIED_EXECUTOR=0`. | Låg | Gate utan content. | Dokumentera beroendet; fail-safe `awaiting_approval`; testfall. |
| R10 | **P5-kollision** cancel ↔ `awaiting_approval`. | Låg | Oklar interaktion. | `cancelled` hålls ledig (separat från `rejected`); P5 designar cancel av await explicit. |

---

## 7. Testplan (Vitest, stil som `h1-resume.test.ts`)

### 7.1 Enhetstester
- `decideGate`: `non_destructive→done`; `approval_required→awaiting_approval`; `null→awaiting_approval`; okänt värde → `awaiting_approval`.
- Drain, gate **på**: `non_destructive`-run → `done`, **ingen** approval skapas.
- Drain, gate **på**: `approval_required`-run → `awaiting_approval` + **en** approval; andra varvet → ingen dubblett (idempotent).
- Drain, gate **på**: `policy_class=null` → `awaiting_approval` (Default Deny / fail-safe).
- Drain, gate **av**: beteende identiskt med dagens (`done` oavsett class) — regressionsskydd.
- Drain: `awaiting_approval`-skrivningen nollar `claimed_at`+`lease_until`.
- PATCH `approved`: `awaiting_approval`-run → `done`; andra PATCH → noll rader.
- PATCH `rejected`: → `rejected` + `error` satt; idempotent; `reviewer_notes` trunkeras till 500.
- PATCH mot run som **inte** är `awaiting_approval` → noll run-rader ändras.
- PATCH `revised` → run-status **orörd**.

### 7.2 Invariant-/concurrency-tester
- `claim_runs` plockar aldrig `awaiting_approval`/`rejected` (selektivt på `pending`).
- Reapern flippar inte `awaiting_approval` även med "utgången" lease.

### 7.3 Preview-verifiering (RED→GREEN, Migration Guard-disciplin)
Migrationen är redan applicerad (Commit 1 live) → guarden grön; RED→GREEN-beviset gäller redan. Funktionella preview-fall med `H1_POLICY_GATE=1`:
1. `approval_required`-run → `awaiting_approval` + approval skapad + notis skickad.
2. Approve via UI/PATCH → run → `done`.
3. Ny run, Reject → run → `rejected` med reason.
4. `non_destructive`-run → `done`, ingen approval (regressionsskydd).
5. `policy_class=null`-run → `awaiting_approval` (Default Deny i prod).
6. Diff-genomgång: legacy `executeWorkflow`-vägen byte-för-byte oförändrad.

### 7.4 Definition of Done
`npx tsc --noEmit` + `npx vitest run` gröna (de 3 historiska nav-felen oförändrade, orelaterade); preview-fallen avbockade; `H1_POLICY_GATE` **av** i prod vid merge.

---

## 8. Commit-ordning & utrullning

| Steg | Innehåll | Verifiering |
|---|---|---|
| **Commit 3** | `lib/ai/policy-gate.ts` (ren) + drain-integration (fånga executor-retur, gate-beslut, idempotent approval+notis, flippa run sist), flaggstyrd | enhetstester §7.1 (decideGate + drain on/off) |
| **Commit 4** | approval-PATCH run-transition (approved→done, rejected→rejected), villkorad/non-blocking | PATCH-tester + idempotens §7.1 |
| *(Commit 5)* | *Observability: counts/manager-briefing/aktivitetsflöde/`policy_class`-filter — enligt befintlig implementeringsplan, separat efter 3+4* | counts-tester |
| *(Commit 6)* | *Hela testsviten + preview-fallen + legacy-diff-genomgång* | §7.4 |

**Flagg-utrullning efter merge:** (1) merge med `H1_POLICY_GATE` **av** → noll beteendeändring. (2) aktivera i preview, kör fallen. (3) aktivera i prod, övervaka `awaiting_approval`-count (R1). (4) rollback = `H1_POLICY_GATE=0`.

**Git-arbetssätt (operatören kör git-writes):** ny branch `feat/h1-p4-pr2-policy-gate` → Commit 3 → Commit 4 → diff/Codex-review → push → preview-verifiera (gate av → då på) → PR → merge.

---

## 9. Öppna beslut som behöver godkännas innan kod skrivs

**A. Marketing-runs i gaten.** Ska PR2:s gate gälla även `isMarketingRun`-grenen?
- *Rekommendation:* **Scope:a gaten till agent-steg-runs i PR2** (marketing-handlers är no-op i Fas 1 → tom output → skulle Default-Deny-fastna). Lägg gaten endast i agent-steg-grenens slutbeslut; marketing behåller dagens `done`. Alternativ: bekräfta att marketing-runs får `policy_class='non_destructive'` vid create.

**B. Content-källa när `outputContent` saknas** (legacy `runSteps` / ev. marketing).
- *Rekommendation:* dokumentera `H1_POLICY_GATE=1` ⇒ `H1_UNIFIED_EXECUTOR=1`; i avsaknad: hämta sista `outputs.content` för run-id, annars tom `content` + UI-flagga. Inget krasch-läge — bara potentiellt tom approval-content.

**C. Notis-volym.** Återanvänd `getApprovalPendingEmail`+`sendAdminNotification` per gating. Vid flod (R1): batcha/strypa? *Rekommendation:* behåll per-run-notis i PR2, lägg throttling i Commit 5 (observability) om volymen kräver.

**Ingen kod skrivs förrän A–C är beslutade och denna plan godkänd.**
