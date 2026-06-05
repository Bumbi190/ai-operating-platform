# Omnira — Principregister + Project Health Score + Familje-kalibrering

_Governance-dokument. Ingen kod. Samlar alla låsta principer på ett ställe och lägger till två nya lås: **Project Health Score** (framtida princip) och **Familje-Stundens kalibreringsfas**. Health Score grundas i befintliga signaler: `os/health.ts`, `os/scoring.ts`, `os/priority.ts`, `atlas/content-score.ts`, `token_health`, `cron_heartbeat`._

---

## DEL A — Principregister (kanonisk lista över allt vi låst)

| # | Princip | Kärna | Status | Var den lever |
|---|---|---|---|---|
| P1 | **Isolation före autonomi** | Hellre långsammare bygge än en grund som läcker när fler projekt/agenter kopplas på. | Låst | Hela Fas 0 |
| P2 | **PR-0 = mätgrund** | Kan vi inte mäta isolation kan vi inte bevisa den. Inget åtgärdas före mätinstrumentet. | Låst | `OMNIRA_PR0_SPEC…` |
| P3 | **Leak-test = säkerhetstest** | Medvetet isolationsbrott **failar CI**. Inte en valfri svit. | Låst | CI `security-isolation` |
| P4 | **Tenancy Guard = officiell dataväg** | RLS = försvarslinje 1 (DB), Guard = försvarslinje 2 (app). Service-role aldrig naket. | Låst | §2, `lib/tenancy/*` |
| P5 | **Global Atlas aldrig rå projektdata** | Endast summeringar + delegering till Project Atlas. Ingen genväg, ens om enklare. | Låst | §3 |
| P6 | **Approval-grind före autonom delegering** | Ingen publicering/spend/deploy/extern förändring utan stoppbart approval-steg. | Låst | §5 |
| P7 | **Autonomy Levels** | L0 Analys → L1 Rekommendation → L2 Utkast → L3 Utför-efter-godkännande → L4 Begränsad → L5 Delegerad. Varje projekt/agent bär en registrerad nivå. Inget >L2 före Fas 0-exit + approval-grind. | Låst | Fas 1 |
| P8 | **Project Kill Switch** | Varje projekt stoppas individuellt utan att påverka andra. Enforcement på lägsta nivå (`claim_runs`/drainer), inte route-för-route. Paus = effektiv L0. | Låst | `claim_runs`, cron |
| P9 | **Browser/Desktop Agent ärver allt** | Byggs ovanpå samma isolation, guard, approval, kill switch, Autonomy Levels. Ingen specialväg. | Låst | Senare |
| **P10** | **(Ny) Project Health Score** | Atlas ser hälsa per projekt och prioriterar uppmärksamhet därefter. Isolations-säker; Global Atlas ser bara summeringar. | **Låst (framtida)** | Del B |
| **P11** | **(Ny) Familje-Stunden kalibreringsfas** | Strikt L3, en bild i taget, QA→Review→Approval→Publicering, ingen batch/autopublicering. Första **100 godkända publiceringar = kalibrering** innan högre autonomi ens diskuteras. | **Låst** | Del C |

---

## DEL B — Project Health Score (P10, framtida princip)

### Syfte
Ge Atlas en **enda hälsosiffra per projekt** (0–100) som komponerar redan insamlade signaler, så att uppmärksamhet och prioritet riktas dit det behövs — utan att korsa isolation.

### Dimensioner (komponerar befintlig data, inte ny mätning)

| Dimension | Källa som redan finns | Signal |
|---|---|---|
| **Isolation** | **PR-0:s instrument** (`security-isolation`, `inventory-drift`, `route-drift`) | Läcker projektet? Saknas policy/scope? → hård negativ vikt |
| **QA** | `evaluations`-tabellen, `ai/evaluator/*`, `qa/cca/d2.ts` | Pass-rate, slop, brand-fails över tid |
| **Publishing** | `os/health.ts` `businessHealth`, `atlas/social.ts`, publish-cron | Publicerar projektet enligt plan? Misslyckade poster? |
| **Token health** | `token_health`-tabellen (`ok/warning/expired/error`) | Döda/utgående tokens per plattform |
| **Automation** | `cron_heartbeat` + `cron_job_status()` (`ok/late/dead`) | Kör projektets jobb? Fastnar runs? |
| **Agent-prestanda** | `os/scoring.ts` `fetchAgentScorecards` (per-agent health 0–100) | Success/latens/recency för projektets agenter |
| **Attention** | `os/priority.ts` `buildAttentionItems` (urgent/important) | Öppna kritiska poster |

### Isolations-regler (P5/P4 gäller)
- Health Score beräknas **per projekt, scopat på `project_id`** genom tenancy-guarden — aldrig hämta-allt-och-aggregera.
- **Global Atlas ser endast hälso-summeringar** (siffra + dimensioner + topp-attention), aldrig rå projektdata bakom siffran. Project Atlas ser sitt eget projekts detaljer.
- **Isolations-dimensionen gör PR-0 permanent:** leak-test/inventory blir inte bara en Fas 0-grind utan en löpande hälsosignal. Ett projekt som börjar läcka tappar omedelbart i Health Score.

### Koppling till andra principer
- **Autonomy Levels (P7):** ett projekt kan inte föreslås för högre nivå om dess Health Score (särskilt isolation + QA) inte är grön. Hälsa blir en förutsättning för autonomi.
- **Kill Switch (P8):** kraftigt fallande hälsa (t.ex. isolationslarm) kan trigga förslag om paus.
- **Familje-kalibrering (P11):** kalibreringsfasens utfall mäts via QA- och publishing-dimensionerna.

### Roadmap-placering (viktigt — undvik fällan)
- Health Score är **observability**. Per den befintliga CTO-gap-analysens varning ("bygg inte mätverktyg i stället för värde/isolation") läggs den **efter Fas 0** och efter att approval-grinden finns — **inte** före. Den får inte konkurrera med isolation-arbetet om uppmärksamhet nu.
- Naturlig plats: **Fas 2** (skala plattformen), som ett aggregeringslager ovanpå de signaler som redan finns + PR-0:s isolations-instrument. Låg ny komplexitet (mest komposition), men byggs först när grunden är tät.

---

## DEL C — Familje-Stunden kalibreringsfas (P11)

### Låst driftläge (gäller tills annat beslutas)
- **Autonomy Level: strikt L3** (utför endast efter godkännande, per åtgärd).
- **En bild i taget** — ingen batchgenerering.
- **Kedja:** Generera 1 bild → **QA** (golden-checklist + CCA D2 + style-governance) → **Review** → **Approval (hård grind)** → **Publicering**. Inget steg hoppas över.
- **Ingen autopublicering.** Människa i loopen vid varje publicering.

### Kalibreringsfas: de första 100 godkända publiceringarna
- Behandlas som **kalibrering**, inte produktion-i-skala. Syftet är att bevisa att QA→Review→Approval→Publicering-kedjan håller **stabilt över tid**, inte bara i enstaka fall.
- **Högre autonomi (L4+) får inte ens diskuteras** innan 100 godkända publiceringar är passerade och utvärderade.

### Exit-kriterier (vad som måste bevisas innan L4 ens övervägs)
Mäts via Health Score-dimensionerna (Del B) + approval-loggar:
1. **≥100 godkända publiceringar** genom hela kedjan.
2. **QA-stabilitet:** hög och jämn pass-rate, inga återkommande hard-fails (brand/slop/CCA) över fönstret.
3. **Review-signal:** låg andel som krävde manuell revidering/avvisning sent i kedjan (kedjan fångar fel tidigt).
4. **Noll isolationsincidenter** för projektet under fasen (isolations-dimensionen grön hela tiden).
5. **Publishing-tillförlitlighet:** inga felpubliceringar, dubbletter eller fel-konto-poster.

Först när 1–5 är uppfyllda **diskuteras** en eventuell uppgradering — och även då sker den gradvis (t.ex. L3 → snäv L4-envelope), aldrig ett hopp.

---

## DEL D — Oförändrat fokus

- **Isolation före autonomi (P1)** står fast. Health Score (P10) och all observability ligger **efter** Fas 0.
- **PR-0 är nästa konkreta arbete** och mätgrund för resten av Fas 0. Inget i denna uppdatering flyttar fokus från PR-0; Health Score ärver tvärtom PR-0:s isolations-instrument som en av sina dimensioner.
- Allt nytt (Health Score, Familje-kalibrering, framtida agenter) byggs ovanpå grunden — aldrig vid sidan av den.

---

### Referensfiler
`apps/web/lib/os/{health,scoring,priority}.ts` · `apps/web/lib/atlas/{content-score,social,revenue}.ts` · `supabase/migrations/{20260603_token_health,20260603_cron_heartbeat,20260522_evaluation_memory}.sql` · `apps/web/lib/qa/cca/d2.ts` · `apps/web/lib/ai/evaluator/*` · PR-0-instrument: `apps/web/tests/isolation/*`, `.github/workflows/{security-isolation,inventory-drift,route-drift}`.
