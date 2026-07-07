# Omnira — Durable Workflow Execution (Alternativ A): konkret design

_Datum: 2026-06-03. DESIGN för granskning — ingen implementation påbörjad._
_Mål: inga fire-and-forget, alla runs startar `pending`, atomisk claim (SKIP LOCKED), reaper, retries, status = verkligheten. Multi-tenant (Atlas, The Prompt, Familje-Stunden, GainPilot, framtida kunder). Lätt migrering till Inngest/Trigger.dev senare._

---

## 1. Schemaändringar (`runs`)

Befintliga kolumner: `id, workflow_id, project_id, status (default 'pending'), input, context, error, started_at, finished_at, created_at`.

Tillägg:
```sql
alter table public.runs add column if not exists attempts     integer not null default 0;
alter table public.runs add column if not exists max_attempts integer not null default 3;
alter table public.runs add column if not exists claimed_at   timestamptz;   -- när en worker tog den
alter table public.runs add column if not exists lease_until  timestamptz;   -- claim-deadline (reaper)
alter table public.runs add column if not exists last_error   text;          -- senaste fel (mellan retries)

-- Status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
alter table public.runs add constraint runs_status_chk
  check (status in ('pending','running','done','failed','cancelled')) not valid;

-- Effektiv claim + reaper:
create index if not exists runs_pending_idx on public.runs (created_at) where status = 'pending';
create index if not exists runs_running_lease_idx on public.runs (lease_until) where status = 'running';
```

**Atomisk claim (kärnprimitiven)** — en Postgres-funktion med `FOR UPDATE SKIP LOCKED` så flera drain-anrop aldrig dubbelkör:
```sql
create or replace function omnira_cron.claim_runs(p_limit int, p_lease_seconds int default 280)
returns setof public.runs
language plpgsql security definer set search_path to '' as $$
begin
  return query
  update public.runs r set
    status      = 'running',
    claimed_at  = now(),
    started_at  = coalesce(r.started_at, now()),
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts    = r.attempts + 1
  where r.id in (
    select id from public.runs
    where status = 'pending' and attempts < max_attempts
    order by created_at
    for update skip locked
    limit p_limit
  )
  returning r.*;
end $$;
```

## 2. API-förändringar (inga fire-and-forget kvar)

Alla start-vägar slutar köra inline och **insertar bara `pending`**:

| Väg | Före | Efter |
|---|---|---|
| `/api/runs` (UI) | insert `running` + `void executeWorkflow` | insert `pending` → `202 {run_id, status:'pending'}` |
| `/api/v1/runs` (kund-API) | insert `running` + `void executeWorkflow` | insert `pending` → `202 {run_id, status:'pending'}` |
| Atlas `trigger_workflow` | insert `running` + fire-and-forget fetch | insert `pending` → returnera `{run_id, status:'queued'}` |
| `/api/runs/execute` | (fire-and-forget-mål) | **utgår** — ersätts av drain (eller behålls som intern per-run-körare som drain anropar) |

**Atlas-språk (trovärdighets-fixen):** `trigger_workflow` returnerar nu *"Körningen är **köad** (run_id …) och körs durabelt — fråga om status när du vill."* Aldrig "startad/kör nu". `get_run_status` speglar alltid verkligt status.

Den faktiska körlogiken faktoreras till **en återanvändbar funktion** `runWorkflowRun(db, run)` (= dagens `executeWorkflow` + statusuppdateringar). Den anropas av drain idag och av en Inngest/Trigger.dev-handler imorgon — bara *triggern* byts vid migrering.

## 3. Drain-endpoint — `/api/runs/drain` (CRON_SECRET, maxDuration 300)
```
1. claimed = rpc omnira_cron.claim_runs(p_limit = 3, p_lease_seconds = 280)
2. för varje run (sekventiellt, inom leasen):
     try  → runWorkflowRun(db, run)         // återupptar från klara steg via context
            → status='done', finished_at=now(), lease_until=null
     catch→ om attempts < max_attempts: status='pending', last_error=msg, claimed_at/lease=null  (retry nästa tick)
            annars:                          status='failed', error=msg, finished_at=now()
3. returnera { claimed, done, requeued, failed }
```
- `p_limit` litet (3) så invocationen ryms i 300s. Fler ticks + `SKIP LOCKED` ger genomströmning.
- **Långa workflows:** kör ett steg per claim och re-queuea (sätt `pending` igen) → obegränsad total tid, samma princip som media-pipelinen. v1 kan köra helt inom leasen; reapern täcker överskridanden.

## 4. pg_cron-konfiguration
```sql
-- Plocka & kör pending runs (varje minut; två offset-jobb om vi vill ~30s)
select cron.schedule('omnira_runs_drain', '* * * * *',
  $$select omnira_cron.call_vercel('/api/runs/drain')$$);

-- Reaper: ren DB-funktion (ingen HTTP) — robustast
select cron.schedule('omnira_runs_reaper', '* * * * *',
  $$select omnira_cron.reap_stuck_runs()$$);
```

## 5. Reaper-strategi (självläkning — detta är själva fixen för "startad men inget händer")
```sql
create or replace function omnira_cron.reap_stuck_runs()
returns int language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  update public.runs set
    status      = case when attempts >= max_attempts then 'failed' else 'pending' end,
    error       = case when attempts >= max_attempts then coalesce(last_error,'Lease expired (stuck run)') else error end,
    finished_at = case when attempts >= max_attempts then now() else finished_at end,
    claimed_at  = null,
    lease_until = null
  where status = 'running' and lease_until < now();
  get diagnostics n = row_count;
  return n;
end $$;
```
Om drain-invocationen dör mitt i en körning löper leasen ut → reapern återställer till `pending` (eller `failed` vid max attempts). **Inget kan fastna som "running" för alltid.**

## 6. Run lifecycle (state machine)
```
                 claim_runs (SKIP LOCKED)
   ┌─ pending ───────────────────────────► running ──── success ──► done
   │     ▲                                    │
   │     │ retry (attempts<max)               │ error (attempts<max)
   │     └────────────────────────────────────┘
   │                                          │ error (attempts>=max)
   │                                          └─────────────────────► failed
   └─ pending ◄── reaper (lease_until < now, attempts<max) ── running
                  reaper (attempts>=max) ───────────────────────────► failed
   (operatör kan: cancelled, eller "Retry" → pending, attempts=0)
```
- `attempts`/`max_attempts` styr retries. `claimed_at`/`lease_until` styr reapern. `error` = slutligt fel, `last_error` = mellanliggande.

## 7. Activity Center & Atlas — status = verkligheten

**Activity Center (befintlig vy, inga nya dashboards):** runs grupperade per status med ärliga badges:
- ⏳ **Köad** (pending) — "i kö, startar inom ~1 min"
- ▶ **Kör** (running) — "kör sedan Xs" (+ attempts om >1)
- ✓ **Klar** (done)
- ✗ **Misslyckad** (failed) — visa `error` + attempts; **Retry**-knapp → `pending`, `attempts=0`
- Visa `attempts/max_attempts` och (för running) lease-tid, så man ser självläkning hända.

**Atlas (`lib/atlas/activity.ts` finns redan med `runsQueued`/`runsRunning`/`runsFailed`/`stalledRuns`):** dessa blir nu *korrekta* mot den durable modellen. Atlas säger t.ex. "3 köade, 1 kör, 0 misslyckade senaste dygnet" och — viktigast — `trigger_workflow` rapporterar **"köad"**, aldrig falskt "startad". Stuck-begreppet ersätts av reapern (inget fastnar tyst).

## 8. Migrering till Inngest / Trigger.dev (när vi växer ur pg_cron)
- `runs` förblir källa till sanning med ren status-maskin + `attempts` + idempotens.
- Eftersom körlogiken redan är en ren funktion `runWorkflowRun(db, run)` byter vi bara **triggern**: pg_cron→drain ersätts av en Inngest/Trigger.dev-funktion som anropar samma `runWorkflowRun` per run-event (med deras inbyggda retries/concurrency/step-checkpointing).
- Inget är fire-and-forget i någon version → migreringen blir inkrementell, inte en omskrivning.

---

## Implementationsordning (när du godkänt)
1. Schema + `claim_runs` + `reap_stuck_runs` (migration via Supabase).
2. Faktorera `runWorkflowRun(db, run)` (återanvänder `executeWorkflow`).
3. `/api/runs/drain` + ändra alla start-vägar till `pending` (inkl. Atlas-språket).
4. pg_cron: `omnira_runs_drain` + `omnira_runs_reaper`.
5. Activity Center-badges + Retry; verifiera med en avsiktligt fallerande run att reaper + retry fungerar.

Inget byggs förrän du godkänt designen.
