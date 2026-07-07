# Mark-XXXIX vs Omnira (nuläge) vs Omnira v1 (mål) — Jämförelse & Roadmap

_Mark används som **referensprojekt, inte målarkitektur.** Tredje kolumnen (Omnira nuläge) är grundad i faktisk kod: `apps/web/lib/atlas/*`, `apps/web/lib/ai/*`, `apps/web/lib/qa/*`, `packages/db/full_schema_run_in_supabase.sql`, `supabase/migrations/*`. Ingen kod skriven — endast arkitektur + roadmap._

**Invariant som styr allt nedan:** Familje-Stunden, GainPilot, The Prompt och framtida projekt får **aldrig** dela minne, embeddings, secrets, canon eller arbetsyta. Cross-project sker **endast** via Global Atlas som broker.

**Komplexitetsskala:** S (dagar) · M (1–2 veckor) · L (3–5 veckor) · XL (6+ veckor). **Prioritet:** P0 (säkerhet/grund, blockerar resten) · P1 (kärnvärde) · P2 (skalning) · P3 (embodiment/senare).

---

## 1. Agenthierarki

| | |
|---|---|
| **Mark bra** | Tydlig enda orkestrator som äger konversation + verktygsval; ren delegering till en worker via `agent_task`. |
| **Mark dåligt** | Faktiskt ett enagent-system; ingen hierarki; worker är minnesblind; `max_concurrent=1`; ingen supervisor. |
| **Omnira har** | Manager-agent (`ai/manager.ts`, singleton) + per-projekt-profiler (`atlas/identity.ts` `BUSINESS_PROFILES`); `agent_messages`-tabell med `handoff`/`approval_request`/`delegate`-typer; **ett** enat Atlas (`atlas/context.ts`, `operations.ts`). |
| **Omnira saknar** | Global Atlas vs Project Atlas-distinktion; ett enat Atlas resonerar över alla projekt samtidigt (isolations­risk); delegerade `manager_tasks` **exekveras inte autonomt** (skapar bara rader). |
| **Exakt implementation** | Inför **tre tiers**: (a) **Global Atlas** = supervisor, äger org-minne, ser bara redigerade summeringar, delegerar nedåt, broker:ar mellan projekt. (b) **Project Atlas** = `manager.ts` instansierad **per projekt** (en kontext, secrets, tool-set, minne per `project_id`) — aldrig en delad instans. (c) **Projekt-agenter** = specialister scopade till projektet. Stäng loopen: en drainer plockar `manager_tasks` (status `approved`) och kör dem som durable runs. Global Atlas instansieras aldrig med ett projekts råa kontext. |

## 2. Memory architecture

| | |
|---|---|
| **Mark bra** | Modell-kurerat tyst minne (`save_memory`); kompakt, injiceras naturligt. |
| **Mark dåligt** | 2,2 KB flat JSON, oldest-first-radering, **inga embeddings**, ingen retrieval, en maskin. |
| **Omnira har** | `platform_memory`-tabell (SQL + JSONB + confidence, 5 kategorier), **per-projekt** (`project_id` + RLS-policy), lär sig från feedback (`ai/memory/feedback-store.ts`); per-projekt seeding. **Redan isolerat och bättre än Mark.** |
| **Omnira saknar** | **Inga vector-embeddings / pgvector** → ingen semantisk recall; ingen isolerad per-projekt **canon/embedding-namespace** (Familje-canon ligger ännu inte i ett hårt isolerat lager); Global-tier-minne saknas. |
| **Exakt implementation** | Behåll `platform_memory` (det är rätt). Lägg till ett **semantiskt lager med pgvector**, en **logisk namespace per projekt** (rader nycklade på `project_id`, RLS, embeddings delas **aldrig** mellan projekt — Familje-Stunden och GainPilot får separata index, separata embedding-rader, separata similarity-scopes). Lägg **canon** (Familje) i egen projekt-scopad tabell med RLS. Ge Global Atlas en **egen org-minnestabell** utan läsrätt till projektminne — den ser bara summeringar som broker:as upp. |

## 3. Tool registry

| | |
|---|---|
| **Mark bra** | Schema-first function-calling; **en uniform verktygssignatur**; billig-modell-planerar/stark-modell-fixar. |
| **Mark dåligt** | 3–4 handsynkade listor som driftat isär ("MARK XXV", 20/18/17 verktyg); ingen discovery; okänt verktyg → godtycklig kod. |
| **Omnira har** | Modell-routing i `ai/runner.ts` (Anthropic/OpenAI/bild hårdkodat); agentbeteende via `system_prompt`; per-steg output-validering. |
| **Omnira saknar** | **Ingen tool-registry** med schema/capabilities/scope; verktyg är implicita i workflow-steg; ingen per-projekt verktygs-aktivering; ingen capability/permission-modell. |
| **Exakt implementation** | Bygg **manifest-driven registry** (ett deklarativt manifest per verktyg/version = single source of truth → genererar modell-schema, dispatch, docs). Varje manifest bär `runtime` (cloud / browser-agent / desktop-agent), `capabilities`, `risk`, `consent`, `scope` (global/workspace/project). Project Atlas frågar registryt scopat: "vilka verktyg för **detta** projekt?". Capability-tokens är **projekt-scopade** — ett verktygsanrop kan fysiskt inte röra ett annat projekts data/credentials. Ersätt "okänt verktyg → kör kod" med hårt fel. |

## 4. Browser automation

| | |
|---|---|
| **Mark bra** | **Äkta Playwright** på riktiga inloggade profiler; semantisk locator-kaskad (`smart_click`/`smart_type`); multi-browser-registry; anti-detection. |
| **Mark dåligt** | Modellen siktar **blint** (ingen observe); öppen loop (ingen verifiering); ingen retry; **ingen iframe-hantering**; väntar bara på `domcontentloaded`. |
| **Omnira har** | Ingen riktig browser-automation (`media/hermes.ts`/`competitor_reader.py` är mediepipeline, inte styrning). |
| **Omnira saknar** | Hela browser-agent-förmågan. |
| **Exakt implementation** | Bygg **browser-agent som ett registry-runtime** enligt designen i `MARK_XXXIX_BROWSER_AUTOMATION_ANALYSIS.md`: **observe→act→verify**-loop (a11y-träd + element-inventory inkl. iframes), deterministisk intent-cache + self-healing, vision/Set-of-Marks som sista utväg. **Isolerad context per projekt** med projektets egna `platform_tokens` (redan per-`project_id`). Ingen delad browser-context mellan projekt. |

## 5. Desktop automation

| | |
|---|---|
| **Mark bra** | Universell OS-räckvidd (PyAutoGUI), vision-as-locator (`_screen_find`), genuin Win/Mac/Linux-paritet, clipboard-typing. |
| **Mark dåligt** | Rå pixel-koordinat-regression; latent Retina/HiDPI-bugg; öppen loop; "one-call, no-retry"; inget a11y-träd. |
| **Omnira har** | Inget. |
| **Omnira saknar** | Hela desktop-agent-förmågan. |
| **Exakt implementation** | **Lägst prioritet (P3).** När det byggs: **desktop-agent som registry-runtime** enligt `MARK_XXXIX_DESKTOP_AUTOMATION_AUDIT.md` — **accessibility-tree först** (Win UIA / macOS AX / AT-SPI, DPI-fritt), Set-of-Marks före rå koordinat, stängd act→verify-loop, normaliserad koordinat-pipeline. Lokal signerad companion per användare; consent-gating för riskfyllda actions; aldrig delad mellan projekt. |

## 6. Project isolation _(invarianten — högsta vikt)_

| | |
|---|---|
| **Mark bra** | Ej tillämpligt (en användare, en maskin) — men dess `_user_profile()`-läsning visar hur lätt minne läcker utan gränser. |
| **Mark dåligt** | Ingen isolation alls; allt globalt. |
| **Omnira har** | `projects`-tabell (`owner_id`, `slug`); RLS-policies på kärntabeller (`runs`, `workflows`, `memories`, `evaluations`, `manager_tasks`, `agent_messages`); per-projekt `platform_tokens` (sedan `20260602_g1_multitenant_platform_tokens.sql`); per-projekt minne/QA. |
| **Omnira saknar** | **Konsekvent isolation.** Affärs-/marketing-tabeller (`leads`, `campaigns`, `revenue_events`, `campaign_plans`, `draft_posts`, `guard_reports`) har RLS **påslaget men saknar policies**; appen kör **service-role** (`createAdminClient`) som **kringgår RLS** och förlitar sig 100% på manuell `project_id`-filtrering; `fetchBusinessSnapshots` (`os/business.ts`) hämtar **alla rader** och filtrerar i minnet → läckagerisk om kodlogik brister. Ingen embedding-isolation (finns inga embeddings än). |
| **Exakt implementation** | **P0, säkerhetskritiskt.** (a) Lägg **explicita owner/`project_id`-policies på ALLA tenant-tabeller** (samma mönster som `runs_owner`). (b) **Sluta hämta-allt-och-filtrera-i-minnet** — alla queries scopas på `project_id` i SQL. (c) Inför ett **tenancy-guard-lager** som varje datafunktion går igenom (likt `qa/cca/d2.ts`-vakten `params.project_id === input.projectId` — generalisera den). (d) Separera secrets, embeddings, canon och arbetsyta fysiskt/logiskt per projekt. (e) Integrationstest: projekt A kan aldrig läsa projekt B via någon väg (auth + admin). |

## 7. Cross-project communication

| | |
|---|---|
| **Mark bra** | Ej tillämpligt. |
| **Mark dåligt** | Ingen kommunikation alls (ingen bus/blackboard). |
| **Omnira har** | `agent_messages` med `from_agent`/`to_agent`/`handoff`/`approval_request` (schemat finns); delade tabeller (`runs`, `approvals`, `platform_config`). |
| **Omnira saknar** | **Broker.** `claim_runs()` filtrerar **inte** på projekt; `platform_config` är global singleton; inget redigerings-/capability-lager mellan projekt; projekt kan i princip se varandras runs via delade tabeller. |
| **Exakt implementation** | Bygg **Global Atlas som enda broker**: projekt-agenter adresserar **aldrig** varandra. Projekt A publicerar request/event till sin Project Atlas → redigerad summering upp till Global Atlas → Global Atlas delegerar (under policy) en ny task ned till projekt B:s Project Atlas. Tre garantier: (1) brokered, ej peer-to-peer; (2) **redigering + capability-grant** vid gränsen (kunskap korsar, rådata/secrets/canon **aldrig**); (3) audit på varje cross-project-meddelande. Scopa `claim_runs()` per projekt-worker. Återanvänd `agent_messages` som transport. |

## 8. Human approval workflows

| | |
|---|---|
| **Mark bra** | Nästan inget — bara `confirmed=yes` för restart/shutdown. |
| **Mark dåligt** | Filradering, meddelanden, kodkörning, klick — allt oskyddat. |
| **Omnira har** | **Bra grund:** `approvals`-tabell (status `pending` + e-postnotis i `ai/workflow-executor.ts`); Manager `evaluateOutput` (Claude-scoring, rådgivande); **Brand Guard** (`marketing/guard.ts`, verdict `approved/warning/rejected`, deterministisk). |
| **Omnira saknar** | **Hård spärr.** Godkännande är idag rådgivande/sidospår — det är ingen state-maskin-grind som faktiskt stoppar en run; ingen risk-tiering; ingen koppling till capability/consent. |
| **Exakt implementation** | Gör approval till en **hård grind i den durable run-state-maskinen** för `risk ≥ medium` (publicera, spendera, skicka, deploya, radera): run pausar i `awaiting_approval` tills beslut. Risk-tiera via tool-registry-manifestets `consent`-fält. Per-projekt approval-policy (Familje-Stunden kan kräva strängare grindar än The Prompt). Behåll Brand Guard + evaluateOutput som **input** till grinden, inte som ersättning för den. |

## 9. QA pipelines

| | |
|---|---|
| **Mark bra** | Inget att kopiera — Mark har ingen QA. |
| **Mark dåligt** | Ingen output-validering, ingen kvalitetsgrind, ingen slop/brand-kontroll. |
| **Omnira har** | **Långt före Mark.** 5-stegs content-evaluator (slop, pacing, specificity, brand, hook — `ai/evaluator/*`), golden-checklist (vision-QA bilder), output-validator (strukturell), **CCA D2** (deterministisk färg/provenance **med isolationsvakt**), style-governance. Per-projekt-scopade `evaluations`. |
| **Omnira saknar** | QA är **innehållspipeline-specifik**; ingen återanvändbar, generell QA-grind som godtycklig agent/verktygs-output passerar; inte alla framtida agent-outputs (browser/desktop) täcks. |
| **Exakt implementation** | **Generalisera** den befintliga QA-stacken till en **återanvändbar per-projekt QA-gate-tjänst** som varje agent/verktygs-output kan ledas genom (text, bild, action-resultat). Säkerställ att varje grind bär `project_id`-isolation (D2 gör redan rätt — gör det till standard). Detta är en styrka att **bevara och bredda**, inte bygga om. |

## 10. Autonomous execution

| | |
|---|---|
| **Mark bra** | 3-retry/steg + 2-replan + `analyze_error`-beslut (RETRY/SKIP/REPLAN/ABORT); fire-and-forget för långa jobb. |
| **Mark dåligt** | In-memory-kö **förloras vid avslut**; obegränsad; `max_concurrent=1`; minnesblind. |
| **Omnira har** | **Stark grund:** durable runs (`claim_runs()`, `/api/runs/drain`, `20260603_durable_runs.sql`), resumbar workflow-executor (`resume.ts`, `startFromOrder`), `pipeline_retry`, kostnadsspårning per steg. |
| **Omnira saknar** | **Stängd delegerings-loop:** `manager_tasks` är inte kopplade till den durable runnern → delegerade tasks exekveras inte; ingen bounded-autonomy under supervisor; ingen återkopplingsloop. |
| **Exakt implementation** | Koppla **`manager_tasks` → durable runs**: en drainer konverterar godkända tasks till durable runs (återanvänd `claim_runs`). Project Atlas kör **bounded autonomy** inom capability-grants, postar resultat/observationer tillbaka, eskalerar vid fel; Global Atlas övervakar. Behåll durable/retry-motorn — den är redan bättre än Marks. Lägg Marks `analyze_error`-beslutsenum ovanpå som per-steg-recovery. |

---

## Sammanfattande lägesbild

- **Omnira är redan före Mark** på: memory-isolation, QA, durable execution, human-approval-grund, cost tracking, multi-tenancy-ansats.
- **Mark är före Omnira** på: faktisk browser-automation (Playwright), desktop-räckvidd, vision-as-locator, real-time röst/vision-loop.
- **Båda saknar:** äkta agenthierarki (Global→Project→specialist), tool-registry, cross-project-broker, konsekvent isolation, stängd delegerings-loop.
- **Största risken just nu:** isolationen är **inkonsekvent** (RLS utan policies + service-role-bypass + hämta-allt-och-filtrera). Det är ett brott mot din hårda invariant och måste åtgärdas före all ny agent-förmåga.

---

## Roadmap (prioritetsordning + komplexitet)

| # | Insats | Område | Prio | Komplexitet | Beror på | Varför här |
|---|---|---|---|---|---|---|
| 1 | **Isolation-härdning:** RLS-policies på ALLA tenant-tabeller; sluta hämta-allt-och-filtrera; SQL-scopad `project_id` överallt | Project isolation | **P0** | **L** | — | Säkerhetskritiskt + din hårda invariant. Blockerar allt annat. |
| 2 | **Tenancy-guard-lager** + fysisk/logisk separation av secrets, canon, arbetsyta per projekt (generalisera D2-vakten) | Project isolation | **P0** | **M** | 1 | Gör isolation till en framtvingad invariant, inte en förhoppning. |
| 3 | **Global Atlas / Project Atlas-split** (supervisor-tier; `manager.ts` instansieras per projekt) | Agenthierarki | **P1** | **L** | 1, 2 | Kärnan i din målarkitektur; allt agent-arbete hänger på detta. |
| 4 | **Stäng delegerings-loopen:** `manager_tasks` → durable runs-drainer (bounded autonomy) | Autonomous execution | **P1** | **M** | 3 | Fixar "delegerar men exekverar inte" från CTO-gap. Hög affärsnytta. |
| 5 | **Cross-project-broker** via Global Atlas (redigering + capability + audit; scopa `claim_runs`) | Cross-project comms | **P1** | **L** | 2, 3 | Enda tillåtna kanalen mellan projekt; bevarar isolation under samarbete. |
| 6 | **Human approval som hård grind** i run-state-maskinen (risk-tiered, per-projekt policy) | Human approval | **P1** | **M** | 4 | Gör godkännande till spärr, inte rådgivning; krävs innan autonomi breddas. |
| 7 | **Tool Registry** (manifest-driven, capability + scope + consent) | Tool registry | **P2** | **XL** | 3 | Single source of truth; förutsättning för browser/desktop-runtimes. |
| 8 | **Semantiskt minne** (pgvector, per-projekt namespace, isolerade embeddings) | Memory | **P2** | **M** | 1, 2 | Lyfter recall; måste byggas isolerat från dag ett. |
| 9 | **Generalisera QA** till återanvändbar per-projekt gate-tjänst | QA pipelines | **P2** | **M** | 2 | Bredda en befintlig styrka till alla agent-outputs. |
| 10 | **Browser-agent runtime** (observe→act→verify, isolerad context per projekt) | Browser automation | **P3** | **XL** | 7 | Hög nytta (Meta/Vercel/GitHub), men kräver registry + isolation först. |
| 11 | **Desktop-agent companion** (accessibility-first, closed loop, consent-gated) | Desktop automation | **P3** | **XL** | 7 | Störst räckvidd men lägst omedelbar affärsnytta; sist. |

### Sekvenslogik
- **Fas 0 (P0): Lås huset.** #1–#2. Inget nytt agent-arbete innan isolationen är bevisbart tät.
- **Fas 1 (P1): Hierarki + loop.** #3–#6. Global→Project→agent, stängd delegering, broker, hård approval. Här uppstår den faktiska "Atlas agerar"-förmågan.
- **Fas 2 (P2): Skala plattformen.** #7–#9. Registry, semantiskt minne, generell QA — bredd och underhållbarhet.
- **Fas 3 (P3): Embodiment.** #10–#11. Browser- och desktop-agenter som registry-runtimes, projekt-isolerade.

**Enrads-syntes:** Mark visar *vad* en kropp (browser/desktop/röst) kan göra; Omnira har redan en bättre *hjärna* (durable, QA, isolerat minne). Bygg i ordningen **isolation → hierarki → loop → registry → embodiment** — då blir Mark-förmågorna additiv kraft i en plattform som förblir säker och projekt-isolerad, istället för att ärva Marks bräcklighet.

---

### Referensfiler
**Mark:** se de fyra föregående analyserna i denna mapp. **Omnira:** `apps/web/lib/atlas/{identity,context,operations,actions}.ts` · `apps/web/lib/ai/{manager,runner,workflow-executor,resume}.ts` · `apps/web/lib/ai/memory/{memory-store,feedback-store}.ts` · `apps/web/lib/ai/evaluator/*` · `apps/web/lib/qa/cca/d2.ts` · `apps/web/lib/marketing/guard.ts` · `packages/db/full_schema_run_in_supabase.sql` · `supabase/migrations/{20260603_durable_runs,20260603_pipeline_retry,20260602_g1_multitenant_platform_tokens,20260522_evaluation_memory}.sql`.
