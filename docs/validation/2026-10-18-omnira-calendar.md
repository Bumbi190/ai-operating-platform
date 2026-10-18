# Omnira Kalender — verifiering 2026-10-18

Status: produktkoden är byggd lokalt. Slutkontroll och separat granskning pågår. Inte driftsatt.

## Underlag

Godkänd spec: `docs/superpowers/specs/2026-10-18-omnira-calendar-design.md`.
Godkänd plan och Native-metod: André, 2026-10-18T18:14:09Z.
Kontrollerad main: `34d21cde97aa1c25a6d34a613657d8aee91f8591` (fortfarande aktuell vid läsning 2026-10-18).
Produktcommit före sista integrationsprovet: `a964036`.

## Verifierat

- Kalenderns 77 tester: PASS i samlad körning, inklusive riktig lokal SQL, båda inputSource-värdena, ägarisolering och före/efter-snapshots av sociala köer/godkännanden.
- `node <vitest>/vitest.mjs run lib/calendar lib/atlas/conversation lib/qa/calendar-navigation.test.ts lib/qa/migration-guard-v2.test.ts <33 CI-isoleringsfiler> --no-file-parallelism --reporter=default --reporter=json`: 1200/1206 passerade, 6 fel. Detta är inte ett helt grönt projektresultat.
- `node <playwright>/cli.js test --config playwright.calendar.config.ts`: 9/9 PASS (task6-browser.log).
- `node <typescript>/lib/tsc.js --noEmit --pretty false`: PASS, exit0 (task6-typecheck.log).
- Schema/migrationskontroller i Task2: 250/250 PASS inklusive riktiga privata SQL-tester och tre relevanta QA-sviter.
- Separat integrationsprov: 4/4 PASS (HTTP + Atlas text/voice och socialt utkast/godkänt jobb).
- Desktop1440px och mobil390px visuellt granskade. Lokal förhandsvisning visar tydligt märkta exempelposter; inga riktiga privata möten skapas där.

## Fel i den bredare riktade körningen

Alla sex faktiska fel listas här; inga har dolts eller räknats som PASS. Två är 5s-tidsgränser; fyra är Windows-specifika sökvägs-/CRLF-tolkningar i oförändrade äldre tester. Fulla projektkörningen pågår separat med 30s testgräns och 60s hookgräns.

- `lib/qa/chat-conversation-ownership.test.ts` — 9E · reads — a foreign conversation cannot reach the prompt an OWNED conversation supplies its prior tool memory — 5s timeout.
- `lib/qa/platform-authority-closure.test.ts` — A6-2 · the legacy Atlas bug digest is operator diagnostics 1 · unauthenticated → sent to login, and no digest is read — 5s timeout.
- `lib/qa/platform-credential-events.test.ts` — Settings S0 · platform_credential_events migration — append-only and server-only RLS on, no policy, every client grant revoked, and the service role holds SELECT and INSERT only — CRLF gör att äldre kommentarstrippning missar SQL-kommentarer.
- `lib/qa/platform-credential-events.test.ts` — Settings S0 · platform_credential_events migration — append-only and server-only touches no other object and carries no data statement — CRLF gör att äldre kommentarstrippning missar SQL-kommentarer.
- `lib/qa/platform-credential-events.test.ts` — Settings S0 · platform_credential_events — the search_path follow-up pins the append-only function's search_path, and does nothing else — CRLF gör att äldre kommentarstrippning missar SQL-kommentarer.
- `lib/qa/youtube-project-oauth.test.ts` — youtube connection · the codebase, read the state is touched only by the OAuth module; the start route records it, the callback consumes it and alone exchanges a code — Windows \ jämförs med /.

Bevis: de berörda äldre test-/migrationsfilerna är oförändrade mot main. För credential-testet innehåller den lokala CRLF-parsningen ordet platform_tokens, medan exakt samma parser över main:s kanoniska Git/LF-text inte gör det. Inga äldre SQL-filer eller säkerhetsundantag har ändrats.

## Databas och driftsgrind

Ny CLI-genererad migration: `apps/web/supabase/migrations/20261018182213_user_calendar_v1.sql`.
SHA256 för granskning: `6bb10d31b39c3733e1646138cda08fc432135abdcfd00cfda6283b9e0d082c4e`.
Nya tabeller: user_calendar_events och user_calendar_mutations, användarägda med RLS. JSONB-draft delar modell med veckovy och senare Gantt; version/status/ägare/tidsstämplar är relationella.
Produktionsdatabasen har inte ändrats. Inga sociala scheman, godkännanden eller publiceringsrättigheter har ändrats under kalenderarbetet.
Migrationsgrinden förväntas vägra produktion/förhandsbygge mot en ledger som ännu saknar user_calendar_v1. Grinden ska inte kringgås.
Före drift: konkret resultatgranskning, exakt migration, ägar-/grantkontroll, merge och READY-deploy samt läsning av metadata för ursprungliga sex socialjobb.

## Röst och Gantt

Gemensamma text-/voice-transkriptvägen är verifierad med riktiga SQL-funktioner. Ett faktiskt röstsamtal med mikrofon är ännu inte genomfört och röststödet är därför inte markerat som end-to-end-verifierat.
Gantt kan använda samma event-id, UTC-start/slut eller lokala heldagsdatum, projektkoppling och workStatus. Ingen andra planeringslagring finns. Själva Gantt-vyn är kommande.

## Tekniska beslut


- Ruling: Skill helper resources (sdd-workspace, task-start, task-done and writing-good-tests.md) are unavailable through skills.read after exact returned resource paths and the plugin skills-prefix fallback both failed. Use equivalent plan-owned Node lifecycle: extract exact task briefs, record BASE, redirect test logs and append completion only after passing exit status — preserves the required evidence; cost if wrong is helper-format divergence, no product behavior change.
- Ruling: Plan global constraints require scoped checks during implementation and a single full-suite gate at Task6. Follow that approved scope instead of rerunning the entire repository per task — avoids unrelated fixture contention; cost if wrong is later detection of cross-domain regressions.
- Ruling: Store the validated serializable event draft as checked JSONB in user_calendar_events, with owner/id/version/status/timestamps as relational columns — preserves the exact shared model and atomic validation without dual time representations; cost if wrong is later index work for large-scale Gantt queries.
- Ruling: Add readonly monthly source references instead of fabricating post/revision IDs for empty monthly slots — required by approved monthly planning behavior; cost if wrong is one extra source variant for consumers.
- Ruling: Add optional manualEvent details to owner-scoped week entries — form editing and Gantt status require the saved description/location/task/workStatus omitted by the plan entry shape; cost if wrong is larger private response payload, still session-only.
- Ruling: Reuse bounded listInstancesForProjects with 501 rows and explicitly report source truncation even when filtering the selected week leaves fewer — avoids inventing a second workflow reader; cost if wrong is older matching wakes may require the existing workflow view until range filtering is extended.
- Ruling: Extend source-move success with saved revision-based change metadata so Atlas can refresh pending social proposals through the same typed effect — no new publishing authority; cost if wrong is an extra refresh, not a queue write.
- Ruling: Require same-origin proof for calendar tools on the existing chat route and pass its already-authenticated session client explicitly — protects the new private write path without changing other chat tools; cost if wrong is refusing a calendar call from a client that omits Origin.
- Ruling: Do not regenerate the entire stale shared database.types.ts from production for one pending migration — narrow calendar adapters retain typed envelopes while local SQL tests prove the schema; cost if wrong is manual type maintenance until generated schema catches up.

## Separat granskning

En färsk helhetsgranskare används enligt godkänd Native-metod. Resultat/fynd kompletteras före leverans.
