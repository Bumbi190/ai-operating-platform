# Handlarbörsen – säker konkurrenthistorik P2

Status 2026-10-14: lokal, ren analysmotor för sex fastlåsta offentliga källor. Ingen DB-installation, nätverksläsning, cron, Atlas-exekvering eller ändring i produktion.

## Datakontrakt

- Sex fasta källa-ID:n: tre Handlarbudet-nyheter samt AutoProff, BCA Sverige och AUTO1.com. Ingen fri URL från klienten.
- Högst en oföränderlig observation per UTC-dag och källa. Titel och tid normaliseras före lagring; okänd eller nekad källa sparas som status utan titel.
- Maximalt 30 dagar och 180 poster läses per begäran. Ogiltiga tider, dubbel dag/källa, olistad källa, osäker titel och framtidsdatum nekas.
- Skillnad betyder endast att två efterföljande, framgångsrika observationer av samma källa har olika rubriker. Ett fel mellan dem bryter jämförelsen. Ingen automatisk slutsats om pris, produktlansering eller ändrad tjänst.
- För grafer: endast datum med riktiga observationer. Saknade dagar fylls inte med nollor. Antalet jämförbara par visas bredvid antalet ändrade rubriker.
- Atlas förslag är käll- och tidsbundna, review_only och executable:false. De kräver manuell kontroll och pilotfeedback.

## Databasgrind – inte utförd

Tidigare draft-PR #306 innehåller en prototyp för endast tre Handlarbudet-källor. Den måste utökas och verifieras separat innan den kan appliceras. Före schemaändring krävs:

1. Stäm av produktionsledgern och Oscars redan mergade migrationsfiler. Inget undantag från Omniras migration-guard.
2. Projektlåst tabell med exakta källa-ID/status; RLS och FORCE RLS, inga anon/authenticated grants, service role endast SELECT/INSERT och skydd mot UPDATE/DELETE.
3. Isolerat PostgreSQL-test av rättigheter, hash, tidsstämplar, idempotens vid samtidighet, rollback och 30-dagarsfrågor.
4. Separat godkänd migration; därefter owner-gatad serverläsning och explicit användar-POST med Origin/CSRF, budget, audit och begränsad frekvens.
5. End-to-end-verifiering med verkliga observationer över minst två UTC-dagar innan någon förändringsgraf kan hävda skillnader.

## Autonom bevakning – fortfarande låst

ATLAS_ROADMAP_SV.md kräver verifierad Cost Governance i både Preview och produktion före autonom exekvering. Schemaläggning behöver separat godkännande, budgettak, robots/terms-kontroller, rate limit, kill switch, audit och återkallning. Denna etapp aktiverar inget av detta.

Inga GitHub Actions-körningar, migrationsändringar, behörigheter eller produktionstokens ingår i P2-kärnan.
