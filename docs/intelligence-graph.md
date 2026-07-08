# Omnira Intelligence Graph

Statisk arkitektur (Graphify) + runtime-drift (Omniras egna tabeller) i en gemensam,
normaliserad grafupplevelse på `/intelligence/graph`.

## Ansvarsfördelning

| Lager | Ansvar | Källa |
|---|---|---|
| Graphify | Codebase intelligence, statisk arkitektur, communities | `graphify-out/graph.json` (AST, lokal, ingen LLM) |
| Omnira runtime | Agents, workflows, runs, approvals, outputs, manager tasks | Supabase-tabeller via `lib/intelligence/operations-graph.ts` |
| Atlas Memory 2.0 | Semantiskt minne | Oförändrat — ersätts INTE av Graphify |

Graphifys `graph.json` är en **importkälla**, inte domänmodellen. Det interna kontraktet
(`lib/intelligence/graph-contract.ts`) är det enda klient och API pratar.

## Pipeline (lokal MVP)

```
graphify update .                                   # AST-scan i repo-root (ingen LLM, inga API-nycklar)
cd apps/web && npx tsx scripts/import-system-graph.ts   # sanitisera → data/intelligence/system-graph.json
```

- `.graphifyignore` i repo-root utesluter `.env*`, credentials, node_modules,
  builds, media, `content/`, `HANDOFF*.md` m.m. `.gitignore` respekteras automatiskt.
- Importern **avbryter** (fail closed) vid: artifact > 32 MiB, ogiltig JSON,
  secret-liknande mönster (API-nycklar, JWT, PEM), absoluta/privata filpaths.
- Ogiltiga relationer/noder droppas och rapporteras; endast repo-relativa paths
  släpps igenom till klienten.
- `graphify-out/` och `apps/web/data/intelligence/` är **gitignorade** —
  artifacts committas aldrig.

## API-ytan (båda kräver inloggad användare, fail closed)

- `GET /api/intelligence/graph/system` — `level=overview | community&community=N |
  neighborhood&node=ID | q=<sök>`. Overview aggregerar communities till supernoder;
  svar cappas till 600 noder / 1500 edges.
- `GET /api/intelligence/graph/operations` — `project=<uuid>&hours=<1..720>`.
  All åtkomst går genom `lib/atlas/isolation` (allow-list ⇒ `IMPOSSIBLE_PROJECT_ID`
  vid tom lista; caller-angivet projekt utanför listan ignoreras).

## Runtime-relationer (endast härledbara)

`CONTAINS`, `DELEGATED_TO` (workflows.steps→agent_id), `STARTED` (runs.workflow_id),
`PRODUCED` (outputs.run_id), `REQUESTED_APPROVAL` (approvals.run_id),
`TRACKS` (manager_tasks.run_id/workflow_id).

**Medvetet utelämnade** (data saknas idag): `USED_TOOL` (ingen tool_calls-tabell —
endast run_logs role='tool'), `READ_MEMORY` (ingen per-run-koppling), `RETRIED_AS`
(ingen run→run-länk), `APPROVED_BY` som egen nod (operator är en textkolumn —
visas som metadata i inspectorn). Execution Replay är därför disabled i UI:t
med förklaring; se "Nästa fas".

## Produktionsdesign för artifacten (BESLUTAD, EJ PROVISIONERAD)

Vald väg: **CI-genererad artifact i privat Supabase Storage** — vald för att den
är minst rörlig del i befintlig stack (ingen ny infra), privat by default och
enkel att knyta till commit SHA. Utvärderade alternativ: committad fixture
(avfärdad: repo-vikt + risk att stale graf ser sann ut), public/-fil (avfärdad:
oautentiserad), separat graf-tjänst (avfärdad: overkill för MVP).

1. CI kör `graphify update` + `import-system-graph.ts` på main-commits.
2. Upload till privat bucket `intelligence-graphs`, key `system-graph-<commitSha>.json`
   (+ pekarfil `latest.json`). Ingen public access; ingen RLS-policy för anon.
3. `system-graph.ts`-loadern byter fil-läsning mot storage-download med service role,
   bakom samma schema-/storleksvalidering som idag. Key valideras mot
   `^system-graph-[0-9a-f]{7,40}\.json$` — ingen path traversal.
4. Graphifys `graph.html` används ALDRIG — endast data renderas, aldrig HTML;
   ingen användaruppladdad HTML accepteras.

Bucket + policies skapas INTE i denna PR — de redovisas ovan och provisioneras
i separat granskad migration när produktionssteget godkänns.

## Designbeslut

- **Ingen ny dependency**: repo hade ingen graf-library (ingen d3/reactflow/cytoscape).
  Vyerna är ≤600 noder efter server-aggregering, så en egen deterministisk
  force-layout (`components/platform/intelligence/force-layout.ts`, ~150 rader)
  räcker och undviker en tung dependency. Omvärderas om detaljvyer ska visa >1k noder.
- Progressiva nivåer: Overview (community-supernoder) → Community (subgraf) →
  Neighborhood (inspector). Aldrig tiotusentals noder samtidigt.
- Animation endast på selected/running-noder — ingen idle-CPU.

## Uppföljning från kodgranskning (medvetet uppskjutet)

- **M3 · Relayout vid filtertoggling** — filterändringar i Detailed-vyn triggar en
  synkron omlayout (~100 ms vid 600 noder). Åtgärd: layouta ofiltrerad mängd och
  dimma bortfiltrerat, alternativt flytta layouten till worker/`requestIdleCallback`.
  Ingen worker-omskrivning i remedieringspasset (beslut).
- **L4 · Staleness-signal** — `builtAtCommit` visas men jämförs inte mot deployens
  commit (`VERCEL_GIT_COMMIT_SHA`); en gammal artifact ser färsk ut. Koppla ihop när
  CI-pipelinen (produktionsdesignen ovan) byggs.
- **L5 · Åtkomstbeslut för System Map** — kodarkitekturen är synlig för varje
  inloggad användare (samma gräns som `/memory`/`/system`). Omvärdera om
  plattformen får användare utanför ägaren.
- **L6 · Manager-tasks utan run-koppling** — TRACKS hämtas via `run_id`; tasks som
  enbart pekar på `workflow_id` visas inte i Live Operations ännu. Utöka frågan när
  workflow-kopplade tasks blir relevanta i vyn.

## Nästa fas (rekommenderad)

1. `run_events`/`tool_calls`-tabell med per-steg-timestamps → aktivera Execution
   Replay (spela upp `STARTED → EXECUTED → PRODUCED` över tid).
2. Supabase Realtime-prenumeration på `runs` för live-pulserande Operations-vy
   (idag: fetch per filterändring).
3. CI-jobb + privat bucket enligt ovan.
4. Koppla `atlas_signals`/`agent_decisions` som overlay på System Map
   ("var i arkitekturen händer besluten?").
