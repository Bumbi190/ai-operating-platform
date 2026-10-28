# Atlas – källkvalitet för externa workflowreferenser

**Datum:** 2026-10-28. **Status:** Skrivskyddad, begränsad förbättring på separat utvecklingsgren; inte automatiskt driftsatt.

## Syfte
Atlas externa n8n-katalog innehåller 2 060 referensvägar i en fastlåst
GitHub-revision. Det betyder **inte** att 2 060 fungerande, licensgranskade
eller godkända automationer finns.

Efter verklig operatörstest visade Atlas fem externa idéer för Handlarbörsen,
utan att beskriva att flera utpekade AI-steg är platshållare. Denna ändring
ger modellens befintliga, operatörsgrindade sökverktyg enbart **källbundna
varningssignaler**. Ingen ny agent eller sökväg introduceras.

### Statisk strukturrapport – inte körtest

Alla fem JSON-filer är lästa som data från
`Zie619/n8n-workflows` på commit
`94007c1445d9258a7da116646b79473e7c7c3282`.
Endast antal noder, connections, `noOp`, mejl/Gmail-noder,
HTTP Request-noder och credential-referensnoder sparas.
Inga nodparametrar, skript, mejladresser eller hemligheter sparas.

| Fil | Noder | Anslutna kanter | noOp | Mejlfunktioner | HTTP | Credential-referensnoder |
|---|---:|---:|---:|---:|---:|---:|
| `Emailreadimap/1284_Emailreadimap_Markdown_Send.json` | 18 | 19 | **6** | 2 | 0 | 7 |
| `Emailreadimap/1427_Emailreadimap_Manual_Send_Webhook.json` | 31 | 39 | **12** | 2 | 2 | 13 |
| `Emailreadimap/1277_Emailreadimap_Manual_Send_Webhook.json` | 26 | 42 | **15** | 1 | 2 | 14 |
| `Emailsend/1628_Emailsend_Code_Automation_Webhook.json` | 16 | 15 | 0 | 1 | 2 | 0 |
| `Manual/0024_Manual_Clearbit_Send_Triggered.json` | 3 | **0** | 0 | 0 | 0 | 1 |

**Begränsning:** ett större antal kanter är inte liktydigt med en fungerande
automation. `noOp` kan betyda att namngivna AI-steg är platshållare. En
mejlnod kan ha extern effekt, men det har inte testats vad den gör. En
credential-referens visar en autentiseringskoppling, inte att någon nyckel
lästs eller exponerats.

## Kontraktsförändring
`search_external_workflow_references` behåller sin befintliga signatur,
operatorbehörighet, topp 8-träffar och `runnableInOmnira: false`.

Varje träff får ett `qualityAssessment` med:
- `evidenceLevel`: `metadata_only_unverified` eller
  `pinned_json_structure_spot_checked`.
- `workingAutomationVerified: false` och
  `approvedForIntegration: false`, **alltid**.
- `observedStructure`: endast för de fem pinnade källfilerna.
- `warnings`: saklig begränsning, platshållare, okopplade steg,
  eventuella mejl-/credential-risker och eventuella avvikelser
  mot indexets föråldrade nodantal.

Okända workflowfiler har `observedStructure: null` och får **inte**
en slutsats om att de är fungerande eller säkra. Revision eller filväg som
inte matchar den fasta granskningen får inte ärva granskningen.

## Test och driftgränser
- Skrivskyddade Node/Vitest-tester kontrollerar de fem kända fallen,
  icke-granskade källor och revisionsmismatch.
- Den existerande GitHub CI-kedjan kör fortfarande hela testfilen och full
  TypeScript; inga UI-, provider-, SCB- eller migrationsändringar ingår.
- Ingen exekvering, nya uppslag, n8n-installation, Resend-sändning,
  arbetsflödesstart, cron eller ändring i användarens affärsdata.
- **Ingen automatisk kvalitetsgaranti:** nya stickprover måste granskas
  för källproveniens, licens, säkerhet och faktisk funktion innan de någonsin
  får vara mer än idéer.
- Handlarbörsens aktiva leads och dess SCB-kandidater är olika datamängder.
  Detta verktyg är en extern källkatalog och får inte härleda verklig
  kontaktbarhet, aktuell leadvolym eller företagets pilotstatus.
