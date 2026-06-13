# Omnira / Atlas — Roadmap (styrande dokument)

> **Status:** Aktiv, styrande roadmap. Uppdaterad efter H1/P3 för att koda de låsta
> roadmap-principerna. Detta dokument är arkitekturvaktens referens — nya idéer vägs
> mot den låsta prioriteringsordningen nedan, inte tvärtom.

Omnira utvecklas mot ett **AI Operating System för företag**. Atlas är den centrala
operativa ytan. Långsiktig utvecklingsbåge:

**Reporting → Analysis → Recommendations → Workflow Creation → Workflow Execution → Autonomous Operations**

Atlas ersätter inte de underliggande systemen (agenter, workflows, kostnader,
granskningar, minne) — det blir OS-lagret *ovanpå* dem, och det första operatören möter.

---

## Låst prioriteringsordning

**Reliability → Governance → Memory → Intelligence → UX → Autonomy**

Allt nytt utvärderas mot denna ordning. En senare band får inte börja konsumera
autonomi-budget innan tidigare band är verifierat.

### Arkitekturvaktsregel (gäller varje förslag)
Om ett förslag ligger utanför roadmapen ska det:
1. flaggas som avvikelse,
2. mappas mot påverkad del av roadmapen,
3. redovisas med för- och nackdelar,
4. kräva ett aktivt beslut innan implementation.

Syftet är att undvika roadmap-drift där nya idéer successivt ersätter tidigare prioriteringar.

### Cost Governance — hård grind
Ingen ny **autonom exekvering** får implementeras innan Cost Governance är verifierad i
preview + produktion. Detta inkluderar: Workflow Creation, Workflow Execution, Agent
Chaining, Multi-Agent Systems, Operator, Specialistagenter, självskapande workflows.
Atlas får **analysera och rekommendera** innan dess; **exekvering kräver governance.**
(Skäl, verifierat i kod: kostnad loggas idag bara i efterhand i `cost_events`; ingen
pre-flight-spärr, ingen kill switch, inget rekursionsskydd; `project_budgets` är endast
`monthly_sek` utan enforcement. Med automatisk API-påfyllning saknas naturligt tak.)

---

## Band 1 — Reliability (H1 Execution Unification)  — pågår

Durabel, idempotent, återupptagbar körmotor som senare band ärver automatiskt.

- **P1 ✅** Schema-grund: `runs.status` utökad, `workflows.side_effect_class`, klassificering (inert).
- **P2 ✅** En executor + checkpointad drain (flag-gated). Idempotent finalisering (#1),
  retry-maxImages (#4), kvalitetsmetadata för skippade steg (#5), checkpoint-felhantering (#8).
- **P3 ✅** Durable resume via requeue→drain, lease-ägande, `runs.steps_snapshot`
  (workflow-versionering), `manager.retryFailedRun` durabel.
- **P4 ⏳** Policy-gate: läs `side_effect_class`, approval-on-drain. *Naturlig krok för
  approval-trösklar i Band 2.*
- **P5 ⏳** Cancel (`cancel_requested` inkopplad), fencing-token på drainens writes,
  DB-enforced unik `outputs(run_id)`, workflow-lookup-fix.

**Utträdeskriterium:** P4+P5 verifierade. Först därefter får Band 2 påbörjas.

---

## Band 2 — Governance (Cost & Safety)  — HÅRD GRIND

Substratet som all framtida autonomi ärver. Bygger på `cost_events`, `cost_rates`,
`project_budgets`, `side_effect_class` och cancel-mekanismen.

### Default Deny Autonomy (grundprincip)
- Atlas får **analysera, rekommendera och simulera** som standard.
- **Exekvering kräver explicit policy, governance och godkännande.**
- Nya autonoma funktioner är **avstängda som standard** tills de uttryckligen aktiveras
  (fail-safe: frånvaro av beslut = ingen autonom exekvering). Detta speglas redan i koden
  via `side_effect_class` default `approval_required` och flaggstyrda rollouts.

- **Budget limits:** daily / weekly / monthly spend-limits per projekt (utöka
  `project_budgets` bortom `monthly_sek`).
- **Pre-flight enforcement:** kostnad kontrolleras *före* körning, inte bara loggas efteråt.
- **Model limits & Image limits:** tak per modell och per bildoperation.
- **Approval thresholds:** kostnad/risk över tröskel → `awaiting_approval` (via P4-gaten).
- **Emergency kill switch:** global + per projekt; stoppar all exekvering omedelbart.
- **Workflow recursion protection:** djup-/spawn-gräns så självskapande/kedjade workflows
  inte kan loopa obegränsat.

**Utträdeskriterium:** governance verifierad i preview + produktion. Detta är grinden
som låser upp all autonom exekvering (Band 6).

---

## Band 3 — Memory (Organizational Memory)

Atlas Memory som förstaklassobjekt. Konsolidera på befintliga `platform_memory`
(confidence + evidence) och relationsdata snarare än många nya stores.

- **Organizational / Company Knowledge** och **Project Knowledge** — kategorier i `platform_memory`.
- **Knowledge Layer** — retrieval som förstaklass-kontextbyggare (halvt redan i `buildLiveContext`).
- **Workflow History** — via `runs` / `run_logs` / `steps_snapshot`.
- **KPI History** — tidsserie (Executive-briefingen efterfrågar den redan).
- **Graphify / Obsidian-koncept i detta band, ej separat produkt:** Knowledge Graph,
  Linked Context, Backlinks, Graph Navigation — modelleras på befintliga FK-relationer
  (decisions→runs→workflows→outputs→opportunities). Billig "linked context" först;
  tung grafvisualisering senare.

---

## Band 4 — Intelligence (Decision Intelligence)

Atlas resonerar utifrån tidigare beslut, resultat och historisk data.

- **Decision Registry** — utöka `atlas_actions` (handlingsregister) till *beslut* med
  rationale, länkad run/workflow/output **och mätt utfall + kostnad**.
- **Historical Outcomes** — koppla beslut → resultat → kostnad (auditability-loopen).
- **Workflow Learning / Learned Recommendations** — rekommendationer som förbättras av
  historiska utfall; bygger på Decision Registry + Memory.

---

## Band 5 — UX (framtida spår, ej nu)

Låst riktning, implementeras efter Intelligence. (Atlas Home + konversation finns redan
byggt; detta band är nästa UX-pass.)

- Större bastext + större rubriker över hela Atlas; **Large Text Mode**; högre kontrast.
- Mer centrerad layout, mindre tom yta; KPI och status närmare mitten; viktig info inom synfält.
- **Executive Assistant som tydligt visuellt centrum.**
- Kortare svar, naturligare svenska, mer konversationslik känsla.
- **Navigation:** renare vänsternavigation, färre nivåer, projekt synliga direkt,
  Atlas/Executive Assistant först. Hermes synlig som aktiv del av exekveringslagret
  (marknadsförs inte, men användaren förstår att han är aktiv).

---

## Band 6 — Autonomy (Operator)  — gatad bakom Band 2

Slås på först när Cost Governance är verifierad. Ärver durability (Band 1), governance
(Band 2), memory (Band 3) och decision-logging (Band 4) automatiskt.

- Operator O1–O5 (detaljerade faser i `OMNIRA_ATLAS_OPERATOR_DESIGN.md`).
- Workflow Creation, Workflow Execution, Agent Chaining, Multi-Agent.
- **Självskapande workflows** — endast med recursion protection (Band 2) aktiv.
- **Specialistagenter (kandidater, gatade bakom Memory + Governance):** Atlas Executive,
  Atlas Analyst, Atlas Growth, Atlas Operations, Atlas Finance, Atlas QA, Atlas SEO.
  Börjar som **roller/lägen** (memory + tool-scope + prompt) av en Atlas-motor, inte fem
  fristående tjänster; splittas till separata agenter först när en roll har distinkta
  verktyg, kadens och autonomi-envelope.

---

## Långsiktiga designprinciper (styrande)

Dessa gäller framtida design och vägs in i varje band. De omordnar inte den låsta
prioriteringsordningen — de förtydligar bandinnehåll.

1. **Atlas som central yta.** Verktyg, workflows och funktioner ska successivt flyttas
   *bakom* Atlas istället för att vara separata system. Atlas blir den primära
   operativa ytan och navigationspunkten; övriga vyer blir stödjande detaljvyer.
2. **Graphify & Obsidian = Memory-komponenter (Band 3).** Knowledge Graph, Linked
   Context, Backlinks och Graph Navigation planeras som del av Atlas Memory — inte som
   separata produkter. Modelleras på befintliga FK-relationer; billig linked context
   först, tung grafvisualisering senare.
3. **Hermes = exekveringsmotorn bakom Atlas.** Fortsätter utvecklas som motorn, och ska
   på sikt bli *synlig* i plattformen som en aktiv systemkomponent (marknadsförs inte,
   men användaren förstår att han är aktiv del av exekveringslagret). UX-synlighet i Band 5.
4. **UX-riktning (Band 5, ej nu):** större bastext och rubriker; bättre kontrast;
   large-text mode; mer centrerad layout; mindre tom yta; Executive Assistant som
   tydligt centrum; projekt lätt åtkomliga i navigationen; Hermes synlig som del av
   systemet; Atlas som primär navigationspunkt.
5. **Connected Systems (framtida modul).** En yta där Atlas visar anslutna system,
   integrationer, AI-modeller, kunskapskällor, automationer och deras status. Dataskikt
   hör till Band 3 (Memory/Knowledge sources), ytan till Band 5 (UX). Visibilitet, inte
   autonom exekvering — passerar därför Cost Governance-grinden.
6. **Cost Governance = fortsatt hård grind.** Med automatisk API-påfyllning är
   kostnadskontroll, kill switches, budgettak och rekursionsskydd **obligatoriska** innan
   någon Operator-funktionalitet aktiveras. (Se Band 2.)
7. **Specialistagenter börjar som roller.** Implementeras initialt som roller/lägen
   ovanpå en Atlas-motor (memory + tool-scope + prompt) innan någon uppdelning till
   separata agenter övervägs. (Se Band 6.)

---

## Research-spike — Claude OS / Agent OS (efter H1/P3/P4/P5)

Strategisk analys (ej produkt) av: Agent OS, Claude OS, Founder OS, "Dive Into Claude
Code", Claude Code Subagents. Fråga: vilka 3–5 koncept ger högst strategisk avkastning
för Omnira de kommande 6–12 månaderna? Resultatet matar designen av Band 3/4/6.

---

## Arbetssätt — Ultra Code för större epics

För större Omnira-epics (execution engine, Atlas, approvals, workflows, migrations,
säkerhet, autonomi): djup verifiering av faktisk kod/schema/beroenden före rekommendation;
identifiera risker, blockerare och roadmap-konflikter; prioritera långsiktig arkitektur
före kortsiktiga features; arkitektur föreslås före implementation; rollback-, test- och
migrationspåverkan identifieras innan kod skrivs.

> **Not:** `ATLAS_ROADMAP.md` (engelsk, 2026-06-02) och tidigare Fas 1–3-roadmapen är nu
> ersatta av detta band-strukturerade dokument. Det built:a Atlas Home + kontext-hjärnan
> lever vidare under Band 5 (UX) / Band 3 (Memory-retrieval).
