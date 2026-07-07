# Design: Cron Heartbeat (revisionens punkt #2)

**Status:** Design för godkännande. Ingen implementation ännu.
**Mål:** Atlas ska kunna säga *"News Hunter har inte kört på 2 timmar"*, *"Publish har missat sitt schema"*, *"Token Health har inte körts idag"*, *"Ett cron-jobb verkar dött"* — och visa det i Operations Center + Action Center, utan falsklarm.

---

## Avgörande insikt: två lager av "lever det?"

Alla cron-jobb triggar via `omnira_cron.call_vercel(...)` (pg_net → Vercel). I `cron.job_run_details` står då "succeeded / 1 row" **så fort HTTP-requesten skickats** — även om Vercel-endpointen svarade 500 eller aldrig körde. Därför mäter vi på **två lager**:

1. **Fyrade schemaläggaren?** → `cron.job_run_details.last_run` per jobb. Fångar pg_cron-/scheduler-död.
2. **Gjorde jobbet faktiskt jobbet?** → *domän-bevis* (senaste nyhet, senaste publicering, senaste token-verifiering, senaste run). Fångar "fyrade men endpointen failade/no-op".

Ett jobb är **OK** bara om båda stämmer. Det skiljer "schemaläggaren tyst" från "endpoint trasig" — olika meddelanden, olika åtgärd.

---

## 1. Kritiska cron-jobb, cadence & domän-bevis

| Jobb | Cadence (UTC) | Domän-bevis på faktiskt arbete | Sen om… |
|------|---------------|-------------------------------|---------|
| **News Hunter** (`news_morning`) | dagligen 06:30 | `media_news_items.max(fetched_at)` idag | inget idag efter 08:00 |
| **Publish** (`publish_morning/evening`) | 08:00 + 18:00 | senaste 'Publish to Social'-run (job_run_details fyrade) | jobbet fyrade ej inom 90 min efter slot |
| **YouTube** (`youtube_*`) | 08:05 + 18:05 | fyrade inom 90 min efter slot | dito |
| **Token Health** (`token_health`) | dagligen 06:15 | `token_health.max(last_verified_at)` idag | ingen verifiering idag efter 08:00 |
| **Runs drain** (`runs_drain`) | varje minut | `cron.job_run_details` last_run | > 5 min |
| **Runs reaper** (`runs_reaper`) | varje minut | last_run | > 5 min |
| **Pipeline retry** (`pipeline_retry`) | var 5:e min | last_run | > 15 min |
| **Refresh tokens** (`refresh_tokens`) | veckovis mån 06:00 | last_run | > 8 dagar |
| step1–4 (morning/evening) | 07:20–07:45 / 17:20–17:45 | bäst övervakade via pipelinens utfall (#2 retry) | (sekundärt — pipeline-retry larmar redan) |

**Icke-kritiska / experimentella** (övervakas mjukt, larmar ej brådskande): reply-comments, warmup, competitors, account-snapshot, insights, briefings.

---

## 2. Hur vi avgör "sen" eller "död" (utan falsklarm)

För varje kritiskt jobb beräknas en **förfallotid** = förväntad körning + **grace**:

- **Intervall-jobb** (varje min / 5 min): sen om `now − last_run > intervall + grace` (drain/reaper grace 5 min; pipeline-retry 15 min).
- **Dagliga jobb**: utvärderas **bara efter** dagens förväntade tid + grace (90 min). Vi flaggar alltså inte "Token Health har inte kört idag" kl 05:00 när den är schemalagd 06:15.
- **Veckovisa jobb**: grace 1 dygn.

**Status per jobb:**
- `ok` — fyrade i tid **och** domän-bevis färskt.
- `late` — förväntad körning passerad + grace, ingen körning ännu.
- `endpoint_failing` — pg_cron fyrade men domän-bevis saknas (endpoint svarar men gör inget / 500).
- `dead` — inget i `job_run_details` på flera cadence-cykler (schemaläggaren verkar borta för jobbet).
- `pending_first_run` — nyskapat jobb som ännu inte nått sin första schemalagda tid (t.ex. dagens `token_health`). **Aldrig larm.**

**Falsklarm-skydd (sammanfattat):**
1. Grace-fönster per cadence-typ.
2. Dagliga/veckovisa: utvärdera först efter förväntad tid.
3. `pending_first_run`-grace för nya jobb.
4. Skilj `endpoint_failing` (fyrade, men trasig) från `dead` (fyrade inte) → inga "dött"-larm vid endpoint-strul.
5. Dedupe: ett larm per jobb per statusövergång (`last_warned_at`), precis som token-larmen.
6. Heartbeat-checkern stämplar sin egen `checked_at`; om den själv är gammal visar Operations Center "heartbeat inaktuell" i stället för falskt "allt grönt".

---

## 3. Arkitektur

PostgREST/app kan inte läsa `cron`-schemat direkt. Därför:

- **`public.cron_job_status()`** (SECURITY DEFINER) → returnerar `(jobname, schedule, last_run, last_status)` från `cron.job` + `cron.job_run_details`. Bryggan, samma mönster som `claim_runs`.
- **Heartbeat-checker** — ny endpoint `/api/media/cron/heartbeat`, cron **var 10:e min**. Anropar `cron_job_status()`, hämtar domän-bevis, beräknar status per kritiskt jobb, skriver till tabellen **`cron_heartbeat`** (jobname, expected_cadence, last_fired_at, last_evidence_at, status, checked_at, last_warned_at).
- Operations Center + Action Center + Atlas läser `cron_heartbeat` (public — enkelt).

### Inneboende begränsning (ärligt)
Om **hela** pg_cron dör slutar även heartbeat-cronen att köra → den kan inte larma om sig själv. Det är samma SPOF som revisionen flaggade. Två alternativ:
- **(Rekommenderas) extern dead-man's-switch:** lägg heartbeat-endpointen även som ett **Vercel-native cron** (oberoende schemaläggare). Då korskontrollerar två oberoende system varandra → total pg_cron-död upptäcks. Liten ändring i `vercel.json`.
- **Acceptera** att in-DB-heartbeat fångar enskild jobb-död + endpoint-fel, men inte total scheduler-död.

---

## 4. Hur Atlas rapporterar

`cron_heartbeat` injiceras i Atlas live-kontext → Atlas svarar direkt:
- *"News Hunter har inte kört på 2 timmar"* (late, med faktisk tid).
- *"Publish missade sitt 08:00-schema."*
- *"Token Health har inte körts idag."*
- *"Pipeline-retry verkar dött — ingen körning på 40 minuter."*
Plus en hälsosammanfattning: *"All automation körde i tid"* när allt är grönt.

## 5. Operations Center

Ny panel **"Automation / Heartbeat"**: per kritiskt jobb en rad med namn, senaste körning, förväntad cadence och statusprick (grön `ok` / gul `late` / orange `endpoint_failing` / röd `dead` / grå `pending`). Plus "Senast kontrollerad: X min sedan" så du ser att heartbeaten själv lever.

## 6. Action Center

- `dead` eller `endpoint_failing` på kritiskt jobb → **urgent**.
- `late` → **viktigt**.
- Deduperat; försvinner automatiskt när jobbet kör igen. Samma mönster som token-/pipeline-larmen.

---

## 7. Öppna beslut innan implementation

1. **Kritisk-lista:** ok med tabellen i §1 (news, publish, youtube, token_health, drain, reaper, pipeline_retry, refresh_tokens som kritiska; step1–4 via pipeline; resten mjuka)?
2. **Total-död-skydd:** vill du ha den externa Vercel-cron-dead-man's-switchen (rekommenderas) eller bara in-DB-heartbeat?
3. **Heartbeat-cadence:** var 10:e min ok?
4. **Grace-värden:** intervall +5–15 min, dagliga +90 min, veckovisa +1 dygn — ok?
5. **Larmkanal:** mail + Action Center (som token/pipeline) — anta ja om inget annat sägs.
