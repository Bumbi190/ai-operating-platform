# Omnira — Workflow Reliability: analys, arkitektur & rekommendation

_Datum: 2026-06-03. Ingen implementation — beslutsunderlag. Grundat i faktisk kod._

---

## TL;DR

Omnira startar workflow‑körningar på två fundamentalt olika sätt. **Ett är robust, det andra tappar körningar.**

- **Robust:** Media‑pipelinen (step1→2→3→4→publish→youtube) triggas av **pg_cron** — varje steg är sitt eget Vercel‑anrop som kör synkront. Inget tappas.
- **Tappar körningar:** Alla *on‑demand*‑starter — `/api/runs`, **`/api/v1/runs` (kund‑API:t)** och Atlas Chat `trigger_workflow` — gör `void executeWorkflow(...)` (fire‑and‑forget) i samma serverless‑anrop och svarar `202` direkt. När svaret skickats **fryser/avslutar Vercel funktionen och dödar den pågående promisen** → körningen lämnas `running` för alltid och exekveras aldrig. Det är exakt "workflow startad i bakgrunden men inget händer".

Rekommendation: **gör alla körningar durable via en pg_cron‑drivare nu** (återbrukar den redan beprövade infran), och designa run‑modellen så att vi senare kan migrera till en dedikerad durable‑motor (Inngest/Trigger.dev) när vi skalar till många kunder.

---

## 1. Hur runs startas idag (verifierat i koden)

| Väg | Hur den kör | Robust? |
|---|---|---|
| **Media‑pipeline** (cron/step1–4, publish, youtube) | pg_cron → `call_vercel` → endpoint kör **synkront** i egen invocation | ✅ Ja |
| **`/api/runs`** (POST, UI) | insert `running` → `void executeWorkflow(...)` → 202 | ❌ Nej (fire‑and‑forget) |
| **`/api/v1/runs`** (POST, **kund/extern‑API**) | insert `running` → `void executeWorkflow(...)` → 202 | ❌ Nej |
| **Atlas Chat `trigger_workflow`** | insert `running` → fire‑and‑forget `fetch('/api/runs/execute')` → svar | ❌ Nej (dessutom cross‑function) |
| **`/api/runs/execute`** | kör `executeWorkflow` synkront (maxDuration 300s) | ✅ *om* den nås |
| **resume** (`/api/runs/[id]/resume`) | kör synkront från ett steg | ✅ om/inkört |

Det gemensamma felmönstret: **`void executeWorkflow(...)` (eller fire‑and‑forget‑fetch) i en serverless‑request.**

## 2. Varför fire‑and‑forget tappas i serverless

Vercel‑funktioner är efemära: när HTTP‑svaret skickats **fryses event‑loopen och instansen kan termineras**. En `void`‑promise (eller en oavvaktad `fetch`) som fortfarande kör då dödas — ingen garanti att den ens hann skickas. Det finns ingen "kör vidare i bakgrunden" utan en *durable* mekanism (queue/cron) eller `waitUntil` (och även `waitUntil` är tidsbegränsat och olämpligt för långa workflows). Resultat: run‑raden står kvar som `running`, ingen exekverar den, **och det finns ingen återhämtning** (ingen reaper som plockar upp fastnade körningar).

## 3. Vad som riskerar att aldrig köras

- **Alla on‑demand‑körningar:** UI (`/api/runs`), **kund‑API (`/api/v1/runs`)** och Atlas‑initierade workflows. Det är precis den yta som Atlas, Familje‑Stunden, GainPilot och framtida kunder ska använda.
- **Zombie‑runs:** varje transient fel lämnar en `running`‑rad som aldrig städas eller körs om.
- **Säkert idag:** bara media‑pipelinen (pg_cron per steg).

Severity: **hög** för en framtida multi‑tenant Omnira — det är tillväxtytan som är opålitlig.

## 4. Alternativ — A vs B

### A) pg_cron plockar `pending` runs (återbruk av befintlig infra)
Alla start‑vägar **insertar `pending`** och kör inget inline. En pg_cron‑drivare (var ~30–60s) anropar `/api/runs/drain` som **atomiskt claimar** pending runs (`FOR UPDATE SKIP LOCKED`), kör dem (en run/steg per invocation), och en **reaper** återställer `running` som fastnat > timeout → `pending` (självläkande, `attempts++`).

| | |
|---|---|
| **Durability** | Hög — pending plockas alltid upp; inget tappas; självläkande |
| **Latens till start** | ~30–60s (cron‑granularitet) — bra för innehåll/automation, ej "instant" interaktivt |
| **Långa workflows** | Kör ett **steg per claim** och re‑queuea nästa → obegränsad total tid (samma princip som media‑pipelinen redan använder) |
| **Kostnad/infra** | Noll ny — pg_cron + pg_net finns redan och driver media‑pipelinen i drift |
| **Concurrency** | `SKIP LOCKED` + N per tick; flera ticks parallellt |
| **Multi‑tenant** | En `runs`‑tabell, alla projekt/kunder; rättvis plock + per‑projekt‑kvoter möjliga |
| **Lock‑in** | Supabase‑specifikt (men ni är redan all‑in på Supabase) |
| **Insats** | **Låg–medel** — flippa inserts till `pending`, lägg `/api/runs/drain` + 1 pg_cron‑jobb + reaper |

### B) Dedikerad durable‑motor / kö (Inngest, Trigger.dev, QStash, SQS+worker)
Start = lägg ett event på kön; motorn kör durabelt med retries/backoff/concurrency/step‑checkpoints/observability.

| | |
|---|---|
| **Durability** | Högst — step‑level checkpointing, överlever omstarter, inbyggda retries |
| **Latens till start** | Nära‑omedelbar |
| **Långa workflows** | Förstklassigt (durable steps, långa sleeps) — Inngest/Trigger.dev gjorda för detta |
| **Observability** | Inbyggda dashboards, retries, dead‑letter |
| **Kostnad/infra** | Ny leverantör + beroende + drift + kostnad |
| **Skala** | Bäst för många kunder/tunga workflows |
| **Insats** | **Medel–hög** — ny integration + migrering av run‑modellen |

## 5. Rekommendation

**Nu: bygg A (pg_cron‑drivare).** Det är den mest robusta lösningen *givet det som redan finns*, minsta möjliga förändring, och löser dropped‑runs **helt** + lägger till självläkning. Det är samma mekanism som redan kör media‑pipelinen pålitligt i produktion — generaliserad till `runs`‑tabellen. Konkret design:

1. Alla start‑vägar (`/api/runs`, `/api/v1/runs`, Atlas `trigger_workflow`) → insert `status='pending'`, **kör inget inline**, svara 202 med `run_id`.
2. `runs` får `claimed_at`, `attempts`, `max_attempts`.
3. Ny `/api/runs/drain` (CRON_SECRET): claima atomiskt (`update … set status='running', claimed_at=now() … where status='pending' … for update skip locked limit N`), kör ett steg, re‑queuea om fler steg kvar.
4. pg_cron‑jobb var ~30–60s → `drain`. + en **reaper** som återställer `running` äldre än X min → `pending` (`attempts++`, failar vid `max_attempts`).
5. Status syns redan i Activity Center.

**Framtid (vid skala / tunga långkörande kund‑workflows): migrera till Inngest eller Trigger.dev (B).** Designa A:s status‑maskin (`pending → running → done/failed`, med `claimed_at`/`attempts`) så den mappar rent mot en kö senare — drain‑logiken blir då "workern". Migrering blir inkrementell, inte en omskrivning.

**Principer att baka in nu (oavsett A/B):**
- Aldrig fire‑and‑forget — runs är `pending` tills en durable mekanism kör dem.
- Atomisk claim (`SKIP LOCKED`) → ingen dubbelkörning.
- Idempotens + `attempts/max_attempts` → säkra retries.
- Reaper för fastnade körningar → självläkning.
- Ett steg per invocation → obegränsad total körtid.

---

## En mening

Media‑pipelinen bevisar redan att pg_cron är pålitligt i Omnira — gör samma sak för *alla* runs nu (Alternativ A), och designa modellen så att en dedikerad durable‑motor (Inngest/Trigger.dev) kan ta över när kundvolymen kräver det.
