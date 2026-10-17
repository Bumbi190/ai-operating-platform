# Handlarbörsen · kandidatgranskning P2 — kod bakom avstängd flagga

Datum: 2026-10-17. Consolidated review worktree. **Denna PR installerar INTE schema och aktiverar INTE någon review-flagga.**

## Ändringsomfång

- Både aktiv organisation Owner och behörig Handlarbörsen Collaborator kan, via samma server-kontrollerade route, markera en beständigt lagrad konkurrent som **intressant**, **granskad**, **ignorerad** eller **återöppnad** (status pending).
- En separat append-only beslutslogg bevarar vem som tog beslutet, exakt tidsstämpel och status, utan att ändra den ursprungliga källverifierade kandidatposten.
- Gränssnittet visar senaste status och upp till fem revisionshändelser. Kontrollernas klientanrop skickar bara kanonisk käll-domän, ett giltigt statusvärde och ett idempotens-ID.
- Kandidatens URL, projektnamn, actor_id och source_evidence väljs aldrig av klienten. All faktisk åtkomst verifierar inloggad session, aktiv organisation-roll, projektallowlist och Handlarbörsens exakt registrerade identitet. Databasfunktionen omkontrollerar medlemskapet i transaktionen.
- Databasen serialiserar beslut per kandidat med transaktionslås. **Samma status skapar ingen ny händelse** och återförsök med samma ID kan inte sparas två gånger.
- Atlas granskningssignal på ägarens och medarbetarens projektöversikt räknar **pending och intressant**. Granskad/ignorerad visas fortsatt som beslutshistorik men räknas inte som väntande. Ogiltig/misslyckad beslutshistorik visas som okänd, aldrig falskt noll.
- Ingen autopostning, ingen ny konkurrentkälla, inget sök-API, ingen timer, push/e-postavisering, kostnad eller agent-exekvering.

## Aktivering och säkerhetsgrind

1. **Förslag, inte produktion:** `docs/sql/handlarborsen_competitor_review_p2_proposed.sql` måste få separat schema-/säkerhetsgodkännande. Ingen canonical migration förrän ett godkänt införande reconcilerats mot den senast installerade migrationsledgern, schema-inventory och aktuella Migration Guard-pins.
2. Isolerat PostgreSQL 17.6-bevis: testade appendering intressant → granskad → ignorerad → återöppnad, samma requests dubblettfria, olika aktörsreplay konflikt, revokerat medlemskap nekat, främmande kandidat/projekt nekat, RLS/FORCE RLS, anon/auth RPC nekad, service-role UPDATE/DELETE nekade, och service-role RPC lyckas. Testcontainern raderad. Gäller *enbart* isolerad fixture, inte faktiska konton.
3. Featureflaggan är `HANDLARBORSEN_CANDIDATE_REVIEW_ENABLED` (kräver dessutom `HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED`). **Ingen flagga har satts på Vercel**; P2 default OFF i alla miljöer.
4. Grönt GitHub CI och Vercel READY krävs före merge av *enbart inert kod*.
5. Äkta användartest med Oscar av P1 kandidatminnet väntar fortfarande. Aktivera inte kandidatminnet eller P2 i produktion innan separata operatörsbeslut och autentiserade Preview-kontroller.

## Data och beslut

- `handlarborsen_competitor_review_decisions`: host och project bundet till kandidatens primärnyckel, actor_id som server-verifierad UUID, request_id UUIDv4, giltiga statusvärden, monotont bigint-ID.
- `handlarborsen_decide_candidate_review_v1`: invoker-function som granskar aktivt org-medlemskap, projektägare och kandidatkoppling inne i transaktionen. RPC begränsad till service_role.
- Upprepade klick med ny requestId på redan aktuell status returnerar `unchanged`; om samma requestId kommer igen returneras `already_applied`, utan ny datarad.
- Granskningshistorik är ett mänskligt arbetsbeslut; status `reviewed` ger **inte** teknisk tillåtelse att börja skanna den nya domänen eller ändra Handlarbörsen.
