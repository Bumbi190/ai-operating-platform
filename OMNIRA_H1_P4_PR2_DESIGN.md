# OMNIRA H1.P4 — PR2: Policy-gate & Approval Lifecycle (DESIGN)

> Status: **DESIGN — ingen kod ännu.** Detta dokument är specen som PR2 byggs mot.
> Föregångare: H1.P3 (durable resume, `runs.steps_snapshot`) + H1.P4 PR1 (per-run
> `runs.policy_class`-snapshot, *inert*). PR2 aktiverar gaten som PR1 förberedde.
> Datum: 2026-06-14. Baseline: commit `68154cf` (live i produktion).

---

## 0. Sammanfattning (TL;DR)

PR1 fångade `side_effect_class` som en **immutabel per-run-snapshot** i `runs.policy_class`
men *ingenting läser den ännu*. PR2 är den **rena beteendeändringen** som läser snapshotten
i drain-vägen och beslutar slutstatus:

- `non_destructive` → `done` (oförändrat dagens beteende)
- `approval_required` **eller** `NULL` (Default Deny) → `awaiting_approval` + en `approvals`-rad

Därefter kopplas approval-beslutet till run-livscykeln:

- approval **approved** → run → `done` (publish-on-approve-hooks får köra)
- approval **rejected** → run → `rejected` (ny förstaklass terminalstatus)

Allt är **flaggstyrt** (`H1_POLICY_GATE`) för omedelbar rollback utan deploy, i exakt
samma mönster som `H1_UNIFIED_EXECUTOR`. Migrationen är additiv och skyddas av den redan
live:a Migration Guard.

### Beslut som ligger fast (från planeringsdialogen)

1. **Reject = förstaklass `rejected`-status** på run-nivå. *Inte* `failed` (reserverat för
   tekniska fel) och *inte* `cancelled` (reserverat för P5:s cancel-mekanism). Kräver en
   liten additiv vidgning av `runs_status_check`.
2. **Gate-scope = endast durable drain-vägen.** `policy_class` läses uteslutande från
   `runs.policy_class` (aldrig från workflowen). Legacy `executeWorkflow`-wrappern lämnas
   helt orörd och planeras i senare unifierings-PR.
3. **En enda approval-signal i PR2.** Per-steg-override (`steps[].gated`) skjuts till
   separat uppföljnings-PR. `policy_class` är den enda signalen nu.

---

## 1. Kontext & nuläge (verifierat i koden)

| Komponent | Nuläge efter PR1 | Källa |
|---|---|---|
| `runs.policy_class` | `text NULL`, snapshot vid create/resume/retry. **Oläst.** | `20260616_h1p4_run_policy_snapshot.sql`, `run-create.ts`, `resume.ts`, `manager.ts` |
| `workflows.side_effect_class` | `text NOT NULL DEFAULT 'approval_required'`, CHECK `('non_destructive','approval_required')` | `20260613_h1p1_execution_policy_foundation.sql` |
| `runs.status` CHECK | `('pending','running','done','failed','awaiting_approval','cancelled')` — `awaiting_approval` redan tillåten, `rejected` **saknas** | `20260613_h1p1...sql` |
| `claim_runs()` | Claimar **endast** `status='pending' AND attempts<max_attempts`, sätter `running` (SKIP LOCKED) | `20260603_durable_runs.sql` |
| Reaper | Rör endast `running` med utgången lease | `20260603_durable_runs.sql` |
| Drain `/api/runs/drain` | Efter lyckade steg: **alltid** `status='done'` (ovillkorligt). Detta är kroken. | `app/api/runs/drain/route.ts` |
| `approvals`-tabell | `run_id, output_key, content, status, reviewer_notes, kind('workflow_output'), project_id, reviewed_at` | `full_schema...sql` + `20260603_marketing_engine_foundation.sql` |
| `approvals.status` CHECK | `('pending','approved','rejected','revised','returned','needs_input')` | `20260603_marketing_engine_foundation.sql` |
| PATCH `/api/approvals/[id]` | Sätter approval-status + `saveFeedback` (Band 3-minne) + publish-on-approve-hook. **Rör inte run-status idag.** | `app/api/approvals/[id]/route.ts` |

**Nyckelinsikt:** Hela gaten landar på ett ställe i drain-vägen (där `status:'done'` sätts
ovillkorligt idag), plus en run-transition i approval-PATCH. `awaiting_approval` plockas
aldrig upp igen av `claim_runs` (claimar bara `pending`), så den är naturligt terminal tills
ett mänskligt beslut fattas. Reapern rör den inte heller.

---

## 2. Scope

### In-scope (PR2)
- Läs `runs.policy_class` i drain-vägen och beslut `done` vs `awaiting_approval`.
- `NULL` ⇒ Default Deny ⇒ `approval_required` ⇒ `awaiting_approval`.
- Skapa `approvals`-rad (`kind='workflow_output'`, idempotent) vid gating.
- Run-transition i approval-PATCH: approved → `done`, rejected → `rejected`.
- Ny terminalstatus `rejected` (additiv CHECK-vidgning).
- Flagga `H1_POLICY_GATE` för instant rollback.
- Återanvänd befintlig notis (`getApprovalPendingEmail` + `sendAdminNotification`).
- Enhetstester + RED→GREEN preview-verifiering (samma disciplin som Migration Guard).

### Out-of-scope (medvetet uppskjutet)
- Per-steg-override `steps[].gated` (egen PR).
- Unifiering av legacy `executeWorkflow`-vägen (egen unifierings-PR; dess `workflow_id`-bugg
  fixas ändå i P5).
- `revised`-flödets run-transition (re-run). PR2 transitionerar endast på `approved`/`rejected`.
- Cancel/`cancel_requested`/fencing-tokens — det är **P5**.
- Budget-/kostnadströsklar som gatekälla — det är **Band 2** (gaten är dock den naturliga kroken).

---

## 3. Datamodell-förändringar

Endast **en** additiv migration. Inga nya tabeller, inga nya minnessystem (Band 3 = Memory
oförändrat; PersonaPlex orört).

```
-- 20260617_h1p4_pr2_run_rejected_status.sql  (ADDITIV)
ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE public.runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('pending','running','done','failed','awaiting_approval','cancelled','rejected'));

COMMENT ON COLUMN public.runs.status IS
  'pending|running|done|failed|awaiting_approval (gated, väntar beslut)|rejected (approval avvisad, terminal)|cancelled (P5)';
```

- **Additiv & bakåtkompatibel:** vidgar bara den tillåtna mängden. Ingen befintlig rad bryter
  CHECKen. `rejected` skrivs först när gaten är på *och* en approval avvisas.
- **Migration Guard** (live på main) blockerar deploy om denna migration inte är applicerad —
  så koden som skriver `rejected` kan aldrig nå prod före schemat. Detta är samma RED→GREEN-
  kontrakt som redan verifierats.
- `approvals.status` behöver **ingen** ändring — `rejected`/`approved` ryms redan i dess CHECK.

---

## 4. Gate-beslutslogik

En ren, testbar pure-funktion. En enda signal: `policy_class`.

```
// lib/ai/policy-gate.ts  (ny, ren funktion — ingen I/O)
export type GateOutcome = 'done' | 'awaiting_approval'

export function decideGate(policyClass: string | null): GateOutcome {
  // Default Deny: NULL eller okänt värde => kräver godkännande (fail-safe).
  if (policyClass === 'non_destructive') return 'done'
  return 'awaiting_approval'   // 'approval_required' OCH null OCH allt okänt
}
```

Beslutsmatris:

| `runs.policy_class` | Utfall | Skapar approval? |
|---|---|---|
| `'non_destructive'` | `done` | Nej |
| `'approval_required'` | `awaiting_approval` | Ja |
| `NULL` (pre-PR1-run / oklassad) | `awaiting_approval` (Default Deny) | Ja |
| okänt/framtida värde | `awaiting_approval` (fail-safe) | Ja |

**Immutabilitet:** beslutet fattas mot den per-run-snapshot PR1 redan pinnar. En mid-run-
omklassning av workflowen kan inte ändra en pågående runs gate — exakt samma filosofi som
`steps_snapshot` i P3.

---

## 5. State machine

### 5.1 Run-livscykel (PR2)

```
                      claim_runs (SKIP LOCKED)
        ┌──────────┐  status=pending→running   ┌───────────┐
        │ pending  │ ─────────────────────────▶│  running  │
        └──────────┘                            └─────┬─────┘
             ▲                                        │ steg klara
             │ retry (attempts<max)                   │
             │  ◀─────────────────────────────────────┤ tekniskt fel, retrybart
             │                                         │
             │                          decideGate(policy_class)
             │                    ┌────────────────────┴───────────────────┐
             │                    │                                         │
             │            non_destructive                       approval_required / NULL
             │                    ▼                                         ▼
             │              ┌──────────┐                          ┌──────────────────┐
             │              │   done   │  (terminal)              │ awaiting_approval │
             │              └──────────┘                          └─────────┬────────┘
             │                                                              │
             │   tekniskt fel, attempts≥max                  approval-PATCH (människa)
             │              ▼                              ┌────────────────┴───────────────┐
             │         ┌──────────┐                        │                                 │
             └─────────┤  failed  │ (terminal)        approved                          rejected
                       └──────────┘                        ▼                                 ▼
                                                      ┌──────────┐                    ┌──────────┐
                                                      │   done   │ (terminal)         │ rejected │ (terminal)
                                                      └──────────┘                    └──────────┘
```

Tillåtna transitioner:

| Från | Till | Trigger | Skrivs av |
|---|---|---|---|
| `pending` | `running` | `claim_runs` | RPC (oförändrad) |
| `running` | `done` | steg klara **&** gate=`done` | drain |
| `running` | `awaiting_approval` | steg klara **&** gate=`awaiting_approval` | drain (**NY**) |
| `running` | `pending` | retrybart fel, `attempts<max` | drain (oförändrad) |
| `running` | `failed` | terminalt/maxat tekniskt fel | drain (oförändrad) |
| `awaiting_approval` | `done` | approval `approved` | approval-PATCH (**NY**) |
| `awaiting_approval` | `rejected` | approval `rejected` | approval-PATCH (**NY**) |

Invarianter:
- `claim_runs` claimar **endast** `pending` → `awaiting_approval`/`rejected` återstartas aldrig av drainen.
- Reapern rör **endast** `running` med utgången lease → terminala/väntande states orörda.
- `done`, `failed`, `rejected` är terminala. `awaiting_approval` är *vilande*, ej terminal.
- Ingen automatisk transition ut ur `awaiting_approval` — endast mänskligt beslut (eller P5-cancel senare).

### 5.2 Approval-livscykel (PR2-relevant delmängd)

```
   skapas av gaten
        │
        ▼
   ┌──────────┐  PATCH action=approved   ┌──────────┐
   │ pending  │ ───────────────────────▶ │ approved │ → run→done (+ publish-hook)
   └────┬─────┘                           └──────────┘
        │ PATCH action=rejected
        ▼
   ┌──────────┐
   │ rejected │ → run→rejected
   └──────────┘
        (revised/returned/needs_input: tillåtna i tabellen men
         transitionerar INTE run i PR2 — uppskjutet)
```

Approval skapas med: `run_id`, `project_id`, `output_key` (sista stegets `output_key`),
`content` (sista outputen), `status='pending'`, `kind='workflow_output'`. Idempotent på
`run_id` (befintligt mönster: kolla `existingApproval` innan insert).

---

## 6. API-förändringar

### 6.1 `/api/runs/drain` (kärnan i PR2)
Efter att stegen körts klart, ersätt det ovillkorliga `status:'done'` med ett gate-beslut.
Pseudokod (flaggstyrt):

```
const GATE = process.env.H1_POLICY_GATE === '1'

// ...efter lyckad runSteps/executeRunSteps:
const outcome = GATE ? decideGate(run.policy_class) : 'done'

if (outcome === 'awaiting_approval') {
  // 1) idempotent approval (skapa bara om ingen finns för run_id)
  const { data: existing } = await db.from('approvals')
      .select('id').eq('run_id', run.id).limit(1).maybeSingle()
  if (!existing) {
    await db.from('approvals').insert({
      run_id: run.id, project_id: run.project_id,
      output_key: lastOutputKey ?? 'output', content: outputContent ?? '',
      status: 'pending', kind: 'workflow_output',
    })
    void sendAdminNotification(...getApprovalPendingEmail({...}))   // återanvänt
  }
  // 2) flippa run-status SIST (så en approval aldrig saknar sin run-markering)
  await db.from('runs').update({
    status: 'awaiting_approval', finished_at: new Date().toISOString(),
    claimed_at: null, lease_until: null,
  }).eq('id', run.id)
} else {
  await db.from('runs').update({
    status: 'done', finished_at: ..., claimed_at: null, lease_until: null,
  }).eq('id', run.id)   // oförändrad väg
}
```

Notera: `executeRunSteps` returnerar redan `outputContent`/`lastOutputKey` i unified-vägen.
För legacy `runSteps`-vägen (flag `H1_UNIFIED_EXECUTOR` av) skrivs outputen till `outputs`-
tabellen — gaten kan då hämta sista `outputs.content` för run-id:t, eller (enklare) gaten
aktiveras endast i kombination med unified executor. **Rekommendation:** dokumentera att
`H1_POLICY_GATE` förutsätter `H1_UNIFIED_EXECUTOR=1` (vilket redan är vägen mot prod), så
gaten alltid har `outputContent` i handen. Annat fall → fail-safe `awaiting_approval` utan content-krav.

### 6.2 PATCH `/api/approvals/[id]` (run-transition)
Lägg till run-statusövergång **efter** att approval-statusen satts (befintlig ownership-gate,
`saveFeedback` och publish-on-approve-hook behålls oförändrade och körs i samma ordning):

```
if (action === 'approved') {
  await db.from('runs').update({ status: 'done' })
      .eq('id', existing.run_id).eq('status', 'awaiting_approval')  // villkorad = idempotent
}
if (action === 'rejected') {
  await db.from('runs').update({
        status: 'rejected', error: `approval_rejected: ${reviewer_notes ?? ''}`.slice(0,500),
      })
      .eq('id', existing.run_id).eq('status', 'awaiting_approval')
}
```

`.eq('status','awaiting_approval')` gör övergången **idempotent** och racefri: en andra PATCH
uppdaterar noll rader. `revised`/`returned`/`needs_input` lämnar run-status orörd i PR2.

### 6.3 GET `/api/approvals` & GET `/api/runs`
- `GET /api/approvals?status=pending` listar redan väntande approvals — fungerar direkt.
- `GET /api/runs` bör inkludera `policy_class` + tillåta filter på `status=awaiting_approval`
  (liten select-utökning; `policy_class` redan exponerad i typerna).

### 6.4 Inga ändringar
- `claim_runs`, reaper, `buildAgentRunInsert`, `resumeRun`, `manager.retryFailedRun` — orörda
  (PR1 satte redan `policy_class` i alla tre skapande-vägar).
- Legacy `executeWorkflow` (`workflow-executor.ts` / `workflow-runner.ts`) — orörd.

---

## 7. UI-förändringar

Minimal yta — återanvänder befintliga `/approvals`-sidan och `ApprovalCard`.

1. **Run-lista / dashboard:** rendera `awaiting_approval` som eget tillstånd (t.ex. gul
   "Väntar godkännande"-badge) och `rejected` (röd "Avvisad"). Lägg `policy_class`-badge på
   run-raden (`non_destructive` / `approval_required`).
2. **Run-detalj:** visa gate-utfall; vid `rejected` visa `error` (avvisningsnotisen); länk till
   tillhörande approval.
3. **Approvals-sida:** befintliga Approve/Reject-knappar driver redan PATCH — nu med synlig
   effekt att run flippar `done`/`rejected`. Lägg ev. en räknare/filterflik "Väntar".
4. **Statusfärger/labels:** lägg `rejected` i den delade statusfärgs-/etikettmappen så
   dashboards inte visar okänd status.

Ingen ny route, ingen ny vy krävs.

---

## 8. Rollback-plan

Tre lager, snabbast först:

1. **Flagga (sekunder, ingen deploy):** sätt `H1_POLICY_GATE=0` (eller ta bort den). Drainen
   återgår omedelbart till ovillkorligt `done`. Exakt `H1_UNIFIED_EXECUTOR`-mönstret.
2. **Deploy-revert:** koden är beteende-bara ändringar i två filer + en ren funktion. Revert av
   PR2-merge återställer beteendet. Migrationen (CHECK-vidgning) är additiv och kan lämnas kvar
   (skadar inget — `rejected` skrivs bara av gate-koden).
3. **Datasanering vid övergivande:** runs som hunnit bli `awaiting_approval` plockas aldrig upp
   igen (claim_runs ignorerar dem) → de "fastnar" inte tekniskt men blir kvar som vilande.
   Manuell sweep om gaten avvecklas:
   ```
   UPDATE public.runs SET status='done', finished_at=now()
   WHERE status='awaiting_approval';   -- frigör vilande runs efter rollback
   ```
   Migrationen behöver *inte* rullas tillbaka; om man ändå vill: ta bort `'rejected'` ur CHECKen
   först efter att inga rader har den statusen.

**Rollback-trigger (i förväg definierade):** (a) oväntad flod av `awaiting_approval` (Default
Deny träffar mer än P1:s klassning antydde), (b) dashboards kraschar på okänd status, (c)
approval-PATCH flippar inte run korrekt i prod.

---

## 9. Testplan

### 9.1 Enhetstester (Vitest, samma stil som `h1-resume.test.ts`)
- `decideGate`: `'non_destructive'→'done'`; `'approval_required'→'awaiting_approval'`;
  `null→'awaiting_approval'` (Default Deny); okänt värde → `'awaiting_approval'`.
- Drain, gate på: `non_destructive`-run → `done`, **ingen** approval skapas.
- Drain, gate på: `approval_required`-run → `awaiting_approval` + **en** approval (idempotent:
  andra varvet skapar ingen dubblett).
- Drain, gate på: `policy_class=null` → `awaiting_approval` (verifierar fail-safe).
- Drain, gate **av** (`H1_POLICY_GATE` unset): beteende identiskt med dagens (`done` oavsett class).
- PATCH approved: `awaiting_approval`-run → `done`; andra PATCH = noll rader (idempotent).
- PATCH rejected: `awaiting_approval`-run → `rejected`, `error` satt; idempotent.
- PATCH approved/rejected mot run som **inte** är `awaiting_approval` → noll run-rader ändras.

### 9.2 Concurrency / invariant-tester
- Två samtidiga drains kan inte dubbelköra samma run (`claim_runs` SKIP LOCKED — befintligt).
- `claim_runs` plockar aldrig `awaiting_approval`/`rejected`.
- Reapern flippar inte `awaiting_approval` även med "utgången" lease (lease nollställd vid gate).

### 9.3 Integrationsverifiering i Vercel preview (RED→GREEN, som Migration Guard)
1. Deploy preview med migration **ej** applicerad → Migration Guard blockerar (RED) — bevisar kontraktet.
2. Applicera migration → deploy passerar (GREEN).
3. Skapa `approval_required`-workflow-run → verifiera run hamnar i `awaiting_approval` + approval skapad + notis skickad.
4. Approve via UI/PATCH → run → `done`.
5. Skapa ny run, Reject → run → `rejected` med reason.
6. Skapa `non_destructive`-run → run → `done`, ingen approval (regressionsskydd).
7. Backfill-fall: run med `policy_class=null` → `awaiting_approval` (Default Deny i prod).

### 9.4 Verifieringssteg (definition of done)
`pnpm test` grön, preview RED→GREEN dokumenterad, de sju integrationsfallen avbockade, och en
diff-genomgång som bekräftar att legacy `executeWorkflow`-vägen är byte-för-byte oförändrad.

---

## 10. Riskanalys

| # | Risk | Sannolikhet | Konsekvens | Mitigering |
|---|---|---|---|---|
| R1 | **Approval-flod**: Default Deny gör att fler runs än väntat hamnar i `awaiting_approval` (NULL/oklassade). | Medel | Operatör översvämmas; throughput-känsla sjunker. | P1 klassade redan befintliga workflows `non_destructive` utom publishers. Flaggstyrd utrullning + övervaka `awaiting_approval`-count efter aktivering. Rollback R1 via flagga. |
| R2 | **Oläst `rejected`-status** i andra konsumenter (manager.ts-räkningar, dashboards, dream.ts) → visningsglapp/krasch. | Medel | UI visar fel/okänd status. | Audit av alla `status ===`-läsare innan merge; lägg `rejected` i delade label/färg-mappar; täck i 9.1. |
| R3 | **Migration ej applicerad före kod** → insert av `rejected` bryter CHECK. | Låg | Insert-fel i prod. | Migration Guard (live) blockerar deploy; bevisas i 9.3 steg 1–2. |
| R4 | **Partiell skrivning**: approval skapad men run-status ej flippad (eller tvärtom). | Låg | Approval utan `awaiting_approval`-run, eller run utan approval. | Ordning: skapa approval (idempotent) → flippa run sist. Idempotent på `run_id`. Reaper rör ej await-state, så ingen dubbelkörning. |
| R5 | **Dubbel approval** vid re-entrant drain/resume. | Låg | Två approvals + dubbelnotis. | Befintligt `existingApproval`-mönster (kolla innan insert), behålls. |
| R6 | **Approve men publish-hook fallerar** → run `done` men ej publicerad. | Låg | Förväntad publicering uteblir. | Hooken är redan non-blocking och rapporterar `publishError`; surfas i svar/UI. Run-status speglar godkännandebeslutet, inte publiceringen (medvetet). |
| R7 | **Inkonsekvens mellan drain-gate och legacy `executeWorkflow`** (legacy skapar fortfarande approval+done utan gate). | Medel | Två beteenden för approval beroende på väg. | Medvetet uppskjutet (scope-beslut). Legacy-vägen används sällan (manuell execute); dokumenteras; unifieras i senare PR. |
| R8 | **Ingen re-run-väg ut ur `rejected`** (terminal). | Låg | Operatör måste manuellt återstarta. | Avsiktligt i PR2. `revised`-driven re-run designas separat. P3:s retry skapar ändå en *ny* run om man vill köra om. |
| R9 | **Flagg-drift**: `H1_POLICY_GATE` på men `H1_UNIFIED_EXECUTOR` av → gaten saknar `outputContent`. | Låg | Approval utan content / fel utfall. | Dokumentera beroendet; gaten faller fail-safe till `awaiting_approval` och hämtar content från `outputs` vid behov. Testfall i 9.1. |
| R10 | **P5-kollision**: framtida cancel + `awaiting_approval`. | Låg | Oklar interaktion cancel↔await. | Statusarna är separata (`cancelled` vs `rejected`); P5 designar cancel av `awaiting_approval` explicit. Noteras som forward-dependency. |

---

## 11. Framåtkompatibilitet (P5 & Band 2)

- **P5 (cancel + fencing):** `awaiting_approval` ska bli avbrytbar via `cancel_requested` →
  `cancelled`. PR2 håller `cancelled` ledig för just detta (därav `rejected` som separat status).
  Fencing-tokens på drainens writes (P5) påverkar inte gate-logiken, bara skrivskyddet.
- **Band 2 (Governance):** gaten är den uttalade kroken för kostnads-/risktrösklar
  (roadmap: "kostnad/risk över tröskel → `awaiting_approval` via P4-gaten"). `decideGate` kan
  senare ta emot fler signaler (budget, modelltak) utan att run-livscykeln ändras.
- **Band 3 (Memory):** approval-PATCH:ens `saveFeedback` matar redan befintligt
  `platform_memory`/feedback-store. **Inget nytt minnessystem införs** — minnesregeln respekteras.

---

## 12. Leverans-checklista (när kod påbörjas — ej nu)

1. `lib/ai/policy-gate.ts` — ren `decideGate`.
2. Migration `20260617_h1p4_pr2_run_rejected_status.sql` (additiv CHECK-vidgning).
3. `app/api/runs/drain/route.ts` — flaggstyrd gate efter lyckad körning.
4. `app/api/approvals/[id]/route.ts` — run-transition på approved/rejected.
5. `app/api/runs/route.ts` (+ os/data.ts) — exponera `policy_class`, filter `awaiting_approval`.
6. UI: status-labels/-färger för `awaiting_approval` + `rejected`; policy-badge.
7. Tester enligt §9; preview RED→GREEN enligt Migration Guard-disciplin.
8. `database.types.ts` — inga typändringar krävs (`status` är redan `string`).

**Ingen kod skrivs förrän denna spec är godkänd.**
