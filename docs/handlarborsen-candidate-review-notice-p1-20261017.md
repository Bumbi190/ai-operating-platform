# Handlarbörsen · Atlas granskningssignal på projektöversikten

2026-10-17. Avgränsad P1 för synliggörande av redan verifierade kandidatposter, oberoende av Oscars senare riktiga Preview-test.

## Kontrakt

- En *projektbunden granskningssignal* visas på Handlarbörsens översikt för Owner och aktiv Collaborator när kandidatminnet är aktiverat och en verifierad kandidat verkligen finns lagrad.
- Owner-översikt läser genom befintlig Owner-kontrollerad `loadCandidateMemory()`. Collaborator-översikten genom `loadOrganizationCandidateMemory()`, efter organisationens redan verifierade scope + exakta Handlarbörsen-identitet.
- Samma sparade kandidat kan inte bli en ny signalrad på varje sidladdning. P1 är en deterministisk VY över minnesregistret; den skickar inga meddelanden eller nya databasposter.
- Kortet innehåller faktiskt antal kandidater för granskning, senast sparad kandidat och datum samt en rollriktig länk till källorna. Det påstår inte att företaget är nystartat eller att en push-/mejlnotis har skickats.
- Flaggad läsning som misslyckas visas som okänt (inte som noll). Felaktig identitet, dubbla domäner, trasiga datum och felaktig review-lifecycle fail-closed.
- När `HANDLARBORSEN_CANDIDATE_MEMORY_ENABLED` är OFF: ingen inläsning och ingen cue på översikten. Nuvarande produktion är fortsatt OFF.
- Ingen schemaläggning, ny sök-API, nya källor, Atlas-agentjobb, betalning, organisationsroll, ny tabell, migration, automatisk avisering, kvittering eller ändring av Oscars konto.

## Senare steg (inte del av denna PR)

1. Efter Oscars verkliga Preview-verifiering: aktivera kandidatminnet i produktion separat, med ägarens godkännandegrind.
2. Bestäm livscykel för granskad/ignorerad/godkänd kandidat och varaktig **per mottagare** läst/oläst-kvittens, med append-only audit och idempotens.
3. Skapa in-app-notiser som kräver en faktiskt ny, verifierad kandidat; ingen notis på varje sidladdning eller vid upprepad skanning.
4. Välj sökprovider med avtalsgodkänd lagring av oberoende förstahandsbevis, Cost Governance, globala/projektbundna stopp samt manuellt godkänd övergång till återkommande insamling.

## Säkerhet

- Omniras befintliga server-only candidate memory-gate kontrollerar projektbehörighet innan service_role används. Inga client-level RLS-grants breddas.
- Komponentens länk är konfigurerad, inte härledd från kandidatens externa URL. Den visar endast text som React escapes.
- Detta är **inte** ett globalt eller betalt notificeringssystem; ett separat beslutsprotokoll krävs för verkliga aviseringar.
