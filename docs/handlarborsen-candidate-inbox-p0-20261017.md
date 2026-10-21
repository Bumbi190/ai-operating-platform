# Omnira / Handlarbörsen – Atlas personliga konkurrentinkorg P0

Datum: 2026-10-17. Utvecklingsfas. **Featureflaggan är AV i samtliga miljöer och SQL-förslaget har inte installerats.**

## Mål

Förbered riktiga, beständiga **in-app-notiser** per användare när en NY officiellt verifierad konkurrentkandidat faktiskt läggs in. Detta är **inte** generiska Atlas-signaler, inte e-post, inte push och inte automatiska webbsökningar.

## Beslutad säker arkitektur

- Ett nytt, separat table proposal: `docs/sql/handlarborsen_candidate_inbox_p0_proposed.sql`. Inga ändringar av `atlas_signals`, befintliga kandidatbevis, mänsklig P2-granskning eller sexkällors historik.
- Unik nyckel `(project_id,candidate_host,recipient_id)`: **en enda upptäcktsnotis per verifierad kandidat och mottagare**. Dubblettklick och omladdningar skapar inga nya notiser.
- En `SECURITY INVOKER` PostgreSQL-trigger på **verkligt ny** insert i det oföränderliga kandidatregistret registrerar personliga in-app-rader för aktiv organisationsägare och aktiva medarbetare för exakt Handlarbörsen. Den kontrollerar att originalets officiella källa och SHA256-digest fortfarande är giltiga.
- **Inga gamla kandidater backfylls automatiskt.** Den redan sparade TradingSolutions D2D-kandidaten ger alltså ingen ny notis bara för att denna framtida funktion aktiveras. Det förhindrar falska ”ny konkurrent idag”-signaler; en eventuell explicit historisk välkomstnotis skulle behöva ett nytt godkännande.
- Mottagarspecifikt `read_at`, där ägare/medarbetare kan markera läst eller oläst via en strikt, serverkontrollerad `POST`. Webbklienten får bara ange kanonisk host och boolean read; varken projektidentitet eller mottagaridentitet accepteras.
- Sessionen, aktivt organisationsmedlemskap, exakt Handlarbörsen-projekt och samma server-anropets mottagar-ID verifieras innan service-role SELECT/RPC. Databasfunktionen omkontrollerar medlemskapet innan kvittensuppdateringen.
- RLS + FORCE RLS, noll klientpolicies, noll direkta anon/auth grants. Service-role SELECT/INSERT och **enbart kolumn-UPDATE(read_at)**, ingen DELETE eller generell UPDATE. Varken anon eller authenticated får exekvera RPC-funktionen.
- Inbox-UI på båda Konkurrentspanarens redan godkända rollrutter med riktiga olästa/total-värden, officiell källa och explicit text: in-app, ingen skickad mejl-/pushnotis. Vid fel står **okänt, inte noll**.
- Kollaboratörens middleware får enbart det nya exakta `POST /api/organization/projects/handlarborsen/competitors/inbox`; inga nya andra projekt eller HTTP-metoder.

## Verifierat – isolerad PostgreSQL 17.6

- Ett redan existerande historiskt kandidatbevis gav **0** notiser efter schemaförslaget (ingen bakåtfyllning).
- Ny, verifierad fixture-kandidat skapade **2** personliga notiser (ägare + aktiv medarbetare); upprepning `ON CONFLICT DO NOTHING` gav fortfarande **2**, ingen dubblett.
- Läs, identiskt återförsök och oläst-funktion fungerade. Ägarens läskvittens förblev oförändrad när medarbetaren kvitterade.
- Efter medlemskapsåterkallelse nekades kvittens och en ny fixture-kandidat gav endast **1** notis till den kvarvarande ägaren.
- RLS/FORCE RLS, noll policies, anon SELECT, authenticated INSERT/RPC, service-role DELETE och ändring av evidens-digest nekades; service-role kvittens-RPC godkänd.
- Totalt **3** fixture-notiser efter säkerhetstester. PostgreSQL-testcontainern borttagen. **Inga ändringar i Omniras riktiga Supabase.**

## Fortsatt gate

1. Låt den här PR:n passera 7 obligatoriska GitHub CI och Vercel Preview. P0-lösningen är inert bakom `HANDLARBORSEN_CANDIDATE_INBOX_ENABLED`, som är **UNSET**.
2. För schemaaktivering krävs separat operatörsbeslut: canonical migration, Supabase ledger check, Migration Guard + schema-security inventory och skyddad Preview. Aktivera inte SQL eller flagga enbart på grund av en grön PR.
3. När en framtida faktisk ny konkurrent verifieras i kandidatminnet kan första in-app-notisen skapas automatiskt i databasen **utan** externa nätverksanrop. Ingen sökprovider eller schemaläggare är installerad i denna fas.
4. Oscars riktiga Preview-test av P1/P2-konkurrentgranskningen återstår sedan tidigare. Det påverkar inte isolerade P0-kodtester men måste fortfarande bekräftas för verklig medarbetar-UX.
5. Före automatiska externsökningar: separat godkännande för API-villkor, robots, kostnadsbudget, idempotens, audit och global/projektbaserad stoppknapp.
6. Global Atlas-inkorg, push/e-post och notisinställningar per kanal kommer senare som egna faser. Denna version är en projektlokal in-app-inkorg.

**OBS:** Handlarbörsen är i dag en enda organisation med en aktiv ägare och en aktiv medarbetare. Om Omnira senare får flera olika organisationer måste recipient-join flyttas till en uttrycklig organisationskoppling; det får inte antas att alla aktiva medarbetare tillhör samma företag.
