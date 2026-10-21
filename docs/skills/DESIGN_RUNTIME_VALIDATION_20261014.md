# Atlas designkunskap — implementation och verifiering

Plan: docs/superpowers/plans/2026-10-14-atlas-design-skill-loading.md
Spec: docs/superpowers/specs/2026-10-14-atlas-design-skill-loading.md

## Genomförda delar

- Task 1: versionslåst deploybart register; åtta skills, 67 Markdown-dokument. Generatorn verifierar hela den installerade filmanifestet och körs före webbbygget. Runtime läser bara den genererade JSON-filen.
- Task 2: autentiserad Atlas-chatt erbjuder list_design_skills och read_design_skill. Pagination max 16 000 tecken, källa/commit/hash följer med. Verktygen utför inga nätverks-/fil-/publiceringsåtgärder. Svensk progress-copy tillagd.
- Task 3: både legacy-runner och unified-executor komponerar explicit tilldelade skill_ids inom rätt projekts agentlookup. Okända etiketter ger inga instruktioner. Max 64 000 tecken, ingen tyst trunkering; samma komposition används vid valideringsretry.
- Task 4: riktade tester och typecheck passerade lokalt. Preview-/liveverifiering är BLOCKERAD enligt nedan.

## Avvägningar

Ruling: lägg till komposition även i workflow-executor.ts — den är den nyare körmotorn; bara ändring av legacy-runner hade inte täckt dagliga jobb. Kostnad om fel: fler exekveringsvägar måste verifieras.
Ruling: projektfiltrera agentlookup i båda motorerna — annars kan en agent från ett annat projekt väljas och dess instruktioner laddas. Kostnad om fel: ett tidigare felkonfigurerat workflow kan nu nekas i stället för att köra en främmande agent.
Ruling: ändra Remotion-anropets inputProps till en kopierad JSON-record — SDK-versionen som redan är låst i package.json kräver Record<string, unknown>; det befintliga interface-objektet saknade indexsignatur och blockerade typecheck. Kostnad om fel: icke-enumererbara/inärvda egenskaper skulle inte följa med; avsedd indata är ett serialiserbart props-objekt.
Ruling: normalisera radslut och inkludera importerade skillverktyg i befintligt tool-label-kontraktstest — exakt samma etikett-till-verktygskrav bevaras även på Windows och efter uppdelningen av schemadefinitioner.

## Utförda kontroller

- Ursprungliga nya testsuiter kördes först med saknade implementationer och misslyckades, därefter grönt.
- Register: 7/7 pass, inklusive traversal, okända ID:n/referenser, fel hash, pagination och immutabel returmetadata.
- Agentkomposition: 6/6 pass, inklusive explicit tilldelning, okända etiketter, dubbletter, hel stor skill och budgetfel.
- Chatt: verklig POST/tool-loop returnerade pinned impeccable-innehåll. Oinloggad request returnerade 401 innan modellanrop. Endast fake provider/testdata användes.
- Svenska designverktygsetiketter: observerad RED innan labels lades till; därefter GREEN.
- Typecheck: först hittades generated-JSON union-typing och befintligt Remotion-propsproblem. Båda lösta; slutlig tsc --noEmit exit 0.
- Full lokal suite kördes en gång: 436 filer; 330 pass, 73 fail, 33 skip. Testfall: 12017 pass, 369 fail, 1110 skip. Den körningen gjordes före slutlig etikettfix och ny beteendecoverage. Det är INTE en grön totalsvit.
- Flera fullsuite-fel visade Windows-sökvägar/radslut eller saknade grep/true; andra var fixtures/legacy-kontrakt. Samtliga felande filnamn listas nedan. Ingen full baseline-jämförelse har utförts och felen påstås inte alla vara tidigare fel.
- Inga hosted GitHub Actions-körningar triggades manuellt.

## Oberoende kodgranskning

Reviewer rapporterade inga Critical/Important fynd. Minor: källtexttester täckte inte faktisk auth/engineprompt. Auth-delen stärktes därefter med verklig route/tool-loop. Kvarstående Minor: ytterligare beteendetest för varje motors projektbundna skillprompt och validation-retry; dessa vägar är kodgranskade, men de nya engine-gluetesterna är ännu källtextbaserade.

## Previewblockerare

Vercel deployment dpl_AMdf2xaicJtvrdf7YaMYWWp8KtP5 för commit 4891ebd byggde skillpaketet korrekt på Linux (åtta skills/67 dokument), men stoppades sedan av befintlig migrationskontroll:

`production ledger contains unknown migration name: omnira_org_memberships_v1 (fail-closed)`.

Migrationens källfil finns i separat draft-PR #331, https://github.com/Bumbi190/ai-operating-platform/pull/331, och saknas i aktuell main d21cac0. Ingen guard kringgicks och ingen produktionsmigration kördes av denna ändring. Blockeraren måste lösas i den kanoniska migrationskedjan innan preview- och Atlas-liveverifiering kan slutföras.

## Kvar för användarens hela mål

Kunskapsladdning är implementerad; den är ännu inte verifierad på en fungerande hosted preview eller aktiverad på main/produktion. Ingen agents skill_ids ändrades i databasen. Hemsidesbyggare, preview/browser-test av en genererad sida och publicering återstår. Ootto installerades inte; The Prompts analys- och publiceringsflöden är inte ändrade här. Ingen ny prenumeration, social post, kommentar eller DM skapades.

## Fullsuite: felande testfiler
- lib/architecture-knowledge/architecture-knowledge.test.ts
- lib/architecture-knowledge/executive-knowledge.test.ts
- lib/qa/activity-stream.test.ts
- lib/qa/admission-inventory.test.ts
- lib/qa/analysis-draft-sql.test.ts
- lib/qa/atlas-chat.test.ts
- lib/qa/atlas-knowledge-boundary.test.ts
- lib/qa/atlas-knowledge-snapshot.test.ts
- lib/qa/atlas-launcher-vnext.test.ts
- lib/qa/atlas-memory-dream-producers.test.ts
- lib/qa/atlas-memory-emit-durability.test.ts
- lib/qa/atlas-memory-terminal-outcomes.test.ts
- lib/qa/autonomy-bind-guards.test.ts
- lib/qa/autonomy-license.test.ts
- lib/qa/autonomy-runtime-foundation.test.ts
- lib/qa/autonomy-trace-guards.test.ts
- lib/qa/budget-scopes.test.ts
- lib/qa/canonical-evidence-pin.test.ts
- lib/qa/cl-shadow.test.ts
- lib/qa/content-center.test.ts
- lib/qa/delegation-mission-activation.test.ts
- lib/qa/desktop-commander-unlicensed.test.ts
- lib/qa/execution-contract-propagation.test.ts
- lib/qa/executive-brief-apex.test.ts
- lib/qa/executive-intelligence-schema-activation.test.ts
- lib/qa/external-dispatch-guards.test.ts
- lib/qa/global-auth-retired.test.ts
- lib/qa/global-design-tokens.test.ts
- lib/qa/leads-dual-accept.test.ts
- lib/qa/leads-legacy-auth-removed.test.ts
- lib/qa/legacy-v1-api-removed.test.ts
- lib/qa/licensed-bind-m4b-guards.test.ts
- lib/qa/marketing-review.test.ts
- lib/qa/media-orchestration-retry-authority.test.ts
- lib/qa/media-token-authority.test.ts
- lib/qa/memory-vnext.test.ts
- lib/qa/mission-brief-v1.test.ts
- lib/qa/mobile-chrome-contract.test.ts
- lib/qa/money-overview.test.ts
- lib/qa/monthly-release-v2.test.ts
- lib/qa/muapi-media-provider.test.ts
- lib/qa/platform-authority-closure.test.ts
- lib/qa/platform-credential-events.test.ts
- lib/qa/project-api-credentials.test.ts
- lib/qa/project-command-center.test.ts
- lib/qa/project-workspace-vnext.test.ts
- lib/qa/release-gate-proof-workflow.test.ts
- lib/qa/review-queue.test.ts
- lib/qa/run-bound-provider-spend.test.ts
- lib/qa/schema-security-invariant.test.ts
- lib/qa/scoped-read-isolation.test.ts
- lib/qa/sdf1b2-code-work-operator-plane.test.ts
- lib/qa/sdf1c2-broker-control-channel.test.ts
- lib/qa/sdf1c3-isolation-integration.test.ts
- lib/qa/sdf1c3-isolation-substrate.test.ts
- lib/qa/sdf1c-broker-claim-credential.test.ts
- lib/qa/sdf1c-trusted-broker.test.ts
- lib/qa/session-only-routes.test.ts
- lib/qa/social-credentials.test.ts
- lib/qa/spend-financial-decoupling.test.ts
- lib/qa/stop-authority-authorization.test.ts
- lib/qa/survival-funding-sql.test.ts
- lib/qa/survival-history-sql.test.ts
- lib/qa/system-health.test.ts
- lib/qa/vnext-intelligence-graph.test.ts
- lib/qa/vnext-settings.test.ts
- lib/qa/workflows-definition-familje-stunden.test.ts
- lib/qa/youtube-project-oauth.test.ts
- lib/trading/market-data/import-discipline.test.ts
- lib/trading/market-view/import-discipline.test.ts
- lib/trading/provider-normalization/recorded-adapter.test.ts
- lib/trading/replay/import-discipline.test.ts
- lib/trading/session-calendar/import-discipline.test.ts
