# Atlas – Handlarbörsens kombinerade källevidens, endast läsning

Datum: 2026-10-28. Arbets-ID: HB-COMPOSITE-20261028.
Status: Isolerad draft-PR, ej automatiskt godkänd/driftsatt.

## Omfattning
De befintliga PR #588 och #589 har redan infört varsin verifierad källa:
1. `readHandlarborsenSalesOverview`: ägargrindade, projektlåsta `HEAD/count=exact`-mått från redan befintliga sales-, Strato- och SCB-tabeller. Ingen PII, inga rader, inget utskick.
2. `searchExternalWorkflowReferences`: operatorgrindad sökning i en lokal, pinad referenskatalog för externa workflows; kompletterande statiska JSON-stickprov avslöjar bl.a. `noOp`.

Denna förändring återanvänder BÅDA i ett namngivet jämförelseverktyg
`handlarborsen_compare_workflow_evidence` med **tomt input_schema**.
Inget nytt CRM, n8n-installation, klient-API, leverantörskonto eller AI-arbetare.

## Säkerhetskrav
- Endast en uttrycklig, **användarinitierad tvåkällesjämförelse** om Handlarbörsens interna säljprocess och externa workflows routas till det nya verktyget. Skriv-, start- och sändkommandon ingår inte.
- Chat-routen blockerar alla andra verktyg under den turen, tvingar det namngivna läsverktyget och kontrollerar `resolvePlatformOperator()`. Studio har inget tillträde.
- Inom läsverktyget bevisar samma gamla säljreader ägarskap och projektallowlist. Vid nekad/otillgänglig CRM-läsning görs ingen extern katalogjämförelse. Inget projekt-ID eller mottagare kommer från modellen.
- Endast uttryckligen tillåtna aggregerade fält från sales-resultatet lämnas till modellen; framtida extra privata fält sprids inte.
- Katalogsökningens projektscope, sökord och limit är statiska i serverkoden. Max fem vanliga sökträffar plus de tidigare pinnade `noOp`-stickproven. Källornas namn är opålitliga data; beskrivingar/skript från externa JSON-flöden är inte inkluderade.
- `contactPermissionInferred=false`, `sendingEnabledByThisTool=false`, `externalWorkflowExecutionAuthorized=false` i varje lyckat jämförelsesvar.
- Inga privata kontaktuppgifter, SMTP/Resend, cron, import, skrivningar, RLS-/schemaändringar, nya databasrader, lokala agentinstallationer eller utgående nätverksanrop.
- Separata HEAD-mått är inte ett atomärt snapshot. `confirmed` och `suppressed` kan överlappa; SMTP accepted är inte leverans; 0 importerade SCB-poster är inte bevis om 0 lokalt granskade kandidater.
- Källvarningarna är strukturgranskning, inte verifierad funktion eller licensgranskning. Analysen får inte härleda att en funktion saknas bara från att ett antal är noll.

## Preflight och parallellt arbete
Obligatorisk preflight enligt AGENTS.md utförd mot `origin/main` `2136b8e`, 122 öppna PR och 217 worktrees. Kvittot `C:\Users\Andre\Projects\Omnira\Temp\atlas-pr-preflight-HB-COMPOSITE-SCOPE-20261028.json` gav **new_branch_approved**. Äldre blockeringar mot PR #562 (separat Strato watcher/distribution) och #306 (separat konkurrenthistorik) hade granskas i filscope och dokumenterats i `ATLAS_HB_COMBINED_EVIDENCE_DESIGN_2026-10-28.md`. Denna branch är inte deras arbete.

Ingen agent-worktree har modifierats, och inga SCB-kandidater kontaktas.

## Verifikation och krav före merge
- `handlarborsen-evidence-comparison.test.ts`: avgränsade intent-varianter, nekad operatör/auth route, negativ behörighet, fail-closed, fast källa, inga PII, ingen sidoeffekt, noOp-evidens separat.
- `handlarborsen-sales-overview.test.ts`: befintliga tests bevaras, bara routeförväntan för den nya prioriteten ändras.
- Den existerande `Atlas Project Isolation`-CI kör den nya testfilen med anti-skip-golv. Befintlig external-workflow-CI kör sin route- och TypeScript-regression.
- Nya GitHub Actions på exakt PR-HEAD och Vercel Preview med migrationsskydd ON måste vara gröna.
- Efter eventuellt manuellt godkänd merge: testa inloggad operatör som frågar:
  `Jämför Handlarbörsens CRM och mejluppföljning med externa workflowreferenser. Redovisa källor och vad som redan finns; gör inga åtgärder.`
  Kontrollera att tool-receipt verkligen är `handlarborsen_compare_workflow_evidence`, bara projektscopade antal och pinade käll-URL:er lämnas och inga åtgärder sker.
