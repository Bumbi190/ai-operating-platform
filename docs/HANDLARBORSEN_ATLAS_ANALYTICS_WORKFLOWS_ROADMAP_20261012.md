# Handlarbörsen + Atlas: analys och kontrollerade arbetsflöden

Datum: 2026-10-12. Status: arkitekturförslag, endast dokumentation; ingen aktivering.
Granskningsbas: `76888441fc9d88f635855d3eb70980e02af80f97`, branch `codex/omnira-atlas-stats-workflows-plan-20261012`.
Riktad lokal källgranskning utan nätverk, produktionsläsning, miljö-/credentialläsning eller testkörning.
**verified in repo** betyder att implementation/identifierare finns, aldrig att den är driftsatt eller fungerar i produktion.
**draft** betyder förberedd vy/design/plan; **not confirmed** betyder att underlag saknas här; **requires gate** betyder separat verifiering och operatörsbeslut före användning.
Alla nya kontrakt, regler och gränser nedan är föreslagna om inte uttryckligen verifierade.

## 1. Audit och beroenden

| Del | REAL status | Lokal evidens och begränsning |
|---|---|---|
| Marketplace-collector | verified in repo | `apps/web/lib/atlas/collectors/handlarborsen-marketplace.ts`: `HandlarborsenMarketplaceCollector`, version `handlarborsen-marketplace-collector-1.1.0`, 11 aggregat, fast HTTPS-destination, inga redirects, 10 s timeout, 16 KiB kroppstak. Ingen live-hämtning verifierad här. |
| Behörighet och rapportläsning | verified in repo | `apps/web/lib/atlas/project-analytics/handlarborsen-marketplace-read.ts`: `loadHandlarborsenMarketplaceReport`; allowlist + fast id/slug före admin-klient, DB-läst `atlas_mode` observer/active, namngivna kolumner, högst 30 snapshots och 30 audit-rader. |
| Guarded lagring | verified in repo / requires gate | `apps/web/supabase/migrations/20261010130000_handlarborsen_guarded_snapshot_store.sql`: RPC `handlarborsen_store_marketplace_snapshot`, radlås, endast dagens UTC-datum; faktisk migration/grants i produktion obekräftade. Grundtabell: `20261010100000_handlarborsen_marketplace_snapshots.sql` i samma katalog. |
| Daglig observation | draft / requires gate | `docs/handlarborsen-p1e/README.md`, `activate-cron.sql`, `rollback-cron.sql`: förberett jobb `omnira_handlarborsen_marketplace`, `55 6 * * *` = 06:55 UTC. README säger prepared/not activated; aktuellt cron-läge är not confirmed. |
| Collector-route/heartbeat | verified in repo | `apps/web/app/api/collectors/handlarborsen/marketplace/route.ts`: CRON_SECRET-grind, `dry_run=1` utan snapshot/signal/audit-skrivning, men med externa läsningar. `apps/web/app/api/media/cron/heartbeat/route.ts`; route/heartbeat bevisar inte aktivt jobb. |
| Atlas verkliga chatt | verified in repo | `apps/web/lib/atlas/project-analytics/handlarborsen-chat.ts`: `buildHandlarborsenChatFacts`, anrop i `apps/web/app/api/chat/route.ts`; bara entydigt namngivet och auktoriserat projekt. Marketplace-fakta, inte PostHog-fakta. Assemblerns fact-reader är inte registrerad enligt läsarens kommentar. |
| PostHog serverläsning, PR #308 | verified in repo / requires gate | `apps/web/lib/atlas/project-analytics/handlarborsen-posthog-traffic.ts`: `loadHandlarborsenTraffic`, separat EU HogQLQuery för `$pageview`; `HANDLARBORSEN_POSTHOG_PROJECT_ID` + `HANDLARBORSEN_POSTHOG_READ_TOKEN` måste båda valideras. Inga write/ingest-anrop eller permanent lagring i läsaren. |
| PostHog-ingestion i HB, PR #134 | not confirmed / requires gate | Oberoende repo/aktivering. `docs/HANDLARBORSEN_POSTHOG_TRAFFIC_P1.md` kräver samtycke/GDPR, verifierade events och separat produktionsgodkännande. Cookieless är ingen verifierad laglighets- eller samtyckesgaranti. |
| Statistik-UI och marknadspuls | verified in repo / draft | `apps/web/lib/atlas/project-analytics/handlarborsen-{overview,trends,visual-pulse}.ts`; pulse är ren presentation med regelbaserade förslag, inga AI-anrop/actions. `docs/HANDLARBORSEN_DASHBOARD_VISUAL_V2.md` är design draft ovanpå #308. |
| Workflow/approval-infrastruktur | verified in repo | `apps/web/lib/os/project-command-center.ts` läser `workflows`, `workflow_instances`, `runs`, `approvals`, `outputs`; inga driftbevis. `apps/web/lib/workflows/action-registry.ts` har sluten executor-allowlist, inget verifierat HB/LinkedIn-actionkind. |
| Handlarbudet, PR #305/#306 | not confirmed / requires gate | Branchunderlag anges av uppdraget men Handlarbudet-kod/migration hittades inte i riktat lokalt underlag. Kontrollera exakt source-branch, fast on-demand-scan, migration/RLS och Atlas-read separat. Migration kan vara oapplicerad; ingen automatisk Handlarbudet-scheduler verifierad. |
| Äldre competitor/reply-cron | verified in repo, annan funktion | `apps/web/app/api/media/cron/competitors/route.ts`: Hermes/AI-nyheter, inte bevis för Handlarbudet. `apps/web/app/api/media/cron/reply-comments/route.ts`: Meta och The Prompt-kontext, inte HB FAQ/LinkedIn. Återanvänd inte som färdiga HB-flöden. |
| LinkedIn företagskonto/API | not confirmed / requires gate | Inget lokalt bevis för organisation, OAuth, API-produkt, entitlements, godkänd app eller publicerings-/community-adapter. Alla leverantörsvillkor och scopes måste verifieras vid framtida onboarding. |

Beroendeordning från uppdraget: **Omnira #304 → #308 → #309 → #310 → orb/chart-brancher**.
Lokalt stöd: PostHog-dokumentet anger #304 som bas; design-v2 anger stacked ovanpå #308. PR-numren #309/#310, merge-status och orb/chart-heads kan inte verifieras offline och får inte användas som produktionsbevis.
**HB #134 är oberoende**: UI-kedjans merge aktiverar inte ingestion. #305/#306 är separat konkurrentkedja; verifiera dess exakta interna beroenden innan integration.
Äldre `docs/handlarborsen-analytics-foundation-plan.md` är historiskt förslag, inte aktuell konfiguration: t.ex. credentiallagring och analytics-val ersätts av de konkreta läsarna ovan.

## 2. Normaliserat faktakontrakt och kvalitetsgrind

Föreslagen ren typ `AnalyticsFactV1`; varje faktum måste bära följande fält innan analys eller promptbygge:

| Fält | Kontrakt |
|---|---|
| Identitet | `project_id` = `8f673c09-1c8f-4d78-876e-4c14bf1c89b3`, `project_slug=handlarborsen`; obligatorisk serververifierad allowlist. PostHogs numeriska `source_project_id` är separat och måste operatörsverifieras mot rätt HB-projekt. |
| Mått/source | `metric_key`, `source=handlarborsen.marketplace\|posthog.pageviews\|handlarbudet.public`, `semantic_kind=total\|current\|rolling24h\|utc_calendar_day\|document_change`, enhet och definitionsversion. Inga summeringar över olika populationer. |
| Tid | `observed_at`, `captured_at`/`checked_at`, `snapshot_date`, `window_start`, `window_end`, `timezone=UTC`, `window_complete`. Visning kan formatera Stockholm; regelmotorn räknar UTC. |
| Värde/status | `value: number\|null`, `availability`, `unavailable_reason`; null = okänt, 0 = faktiskt rapporterat nollvärde. Nekad åtkomst ger ingen faktapost och får inte avslöja projektets data. |
| Fullständighet | Källans `complete\|partial\|unavailable`, antal tillgängliga av 11 samt per-mått-kvalitet. För PostHog: query-status, ingestion-verifiering, avslutad dag och täckningsstatus separat. |
| Proveniens/auktorisering | Source-schema, collector/query-version, snapshotreferens eller innehållshash, observerat URL-id för offentlig källa; `authorization_scope_ref` utan token. Tillåtna källor avgörs server-side, aldrig av LLM eller klient. |
| Jämförelse/färskhet | `previous_date`, `days_between`, `missing_dates`, `freshness`, `comparison_eligible`, blockerande skäl. Marketplace är stale efter >26 h enligt `STALE_AFTER_HOURS`; collection-audit okänd är inte lyckad insamling. |
| Integritet | `privacy_gate=verified\|pending\|blocked`, consent-/policyversion och verifieringsreferens. Endast aggregat till Atlas; ingen e-post, VIN, användar-/sessionsidentitet, råa events eller känsliga frågetexter. |

Semantisk korrigering krävs: `MARKETPLACE_METRIC_DEFINITIONS` klassar `companies_verified_total` som total, medan pulse visar **Verifierade nu** och varnar för stängda företag i skillnaden. Behåll source-key, använd etiketten **verifierade vid observationen**, markera populationsdefinitionen som ej källverifierad och blockera historisk tillväxt-/konverteringstolkning för detta mått tills HB-kontraktet kontrollerats.
Marketplace-parsern kräver schema 1, 24 h och observation inom ±10 min vid hämtning; lagrade rapporter använder sin egen historikvalidering och 26 h-gräns. Ett gammalt snapshot blir inte nytt genom ny analys.
Guarded store rangordnar antal kända mått: högre kvalitet kan ersätta en nyare ofullständig observation även när observationen är äldre; färskhet måste därför prövas separat. `unchanged/rejected` ger inget nytt signalbevis.
PostHog-läsaren hämtar sju UTC-datum **inklusive idag**. Dagens värde är partiellt; query-slut är nästa midnatt men observationen är `checkedAt`. Ingen jämförelse av idag med ett helt dygn.
`parsePageviewRows` fyller saknade datum med 0 efter giltigt icke-tomt svar; detta bevisar bara inga mottagna matchande events, inte fungerande tracking. Tomt svar blir `waiting_for_events`; `not_connected/unavailable` blir aldrig 0. Kontraktet måste skilja query-resultat från ingestion-täckning innan trendanalys.
Besökare, sessioner, online nu, omsättning och konvertering är okända: pageviews är inte personer och marknadsplats-/trafikmåtten saknar verifierad gemensam kohort.
Datagrind: source/schema/project/privacy måste passera; sedan kontrolleras färskhet och varje regels nödvändiga mått/fönster. Partial får ge begränsad nivåobservation med varning; saknat nödvändigt mått blockerar regeln. Ingen interpolation eller orsaksslutsats.

## 3. Trigger, ansvar och körningsgränser

| Triggerklass | Deterministisk ingång | Tillåtet resultat |
|---|---|---|
| Schemalagd observation | Operatörsaktiverad collector, ett jobb/dygn; framtida analys endast efter verifierat sparat snapshot. Ingen ny cron införs nu. | READ: samla/validera aggregat; intern lagring kräver sin egen behörighet och audit. Schemat ger ingen extern handlingsrätt. |
| On-demand-analys | Autentiserad ägare väljer HB och explicit rapport/allowlist; offentlig scan kräver separat aktiverad läsadapter. | READ + deterministisk sammanställning, därefter RECOMMEND med underlag och blockerande skäl. |
| Tillståndsbaserat förslag | Versionsbunden regel passerar datagrind och saknar redan skapat förslag för samma evidens. | RECOMMEND: intern granskningspost/draft; får aldrig direkt bli EXECUTE. |

Föreslagen kedja: `observed → quality_blocked|analysis_ready → proposed → awaiting_review → approved|rejected|expired → scheduled → dispatching → confirmed|outcome_unknown|failed|cancelled`.
Detta är målmodell, inte dagens `RunStatus`. Förslag/evidens ska kunna granskas innan någon action registreras i runtime.
**READ** kräver rätt projekt/källa och integritetsgrind. **RECOMMEND** får aldrig spara/aktivera ett körbart workflow i observer-läge; använd en separat analysdraft. **EXECUTE** kräver verifierad adapter, kanoniskt actionkind, projektets exekveringsläge, live behörighet, stop-kontroll, kostnadsgrind och mänskligt approval eller uttryckligen utfärdad snäv licens.
`apps/web/lib/atlas/lifecycle.ts`: observer/active får samla, endast active är executable. Inga förslag här innebär ändring av atlas_mode.
Återanvänd gränserna i `apps/web/lib/workflows/{action-target,action-run,action-executor}.ts` och `apps/web/lib/atlas/autonomy-runtime/policy.ts`; nya actions är stängda tills registry/executor/policy granskats. Klass, risk och autonominivå är olika begrepp.
Approval ska binda `project_id + organization/account_id + actionkind + content_hash + evidence_hash + rule_version + scheduled_at + expiry + max_cost`; redigering av text/mål/tid kräver nytt approval. Content-review är inte generell exekveringsrätt.
`apps/web/lib/atlas/authorization/human-execution-grant.ts` visar mänskligt JWT/RPC-grant för M4; inte bevis att samma grant redan stöder LinkedIn. `apps/web/app/api/approvals/[id]/route.ts` använder `resolve_approval` för atomiskt beslut med run-bindning; migrationens driftläge måste verifieras separat.
`apps/web/app/api/workflows/tick/route.ts` utvärderar och ger inte sig själv rätt att avancera eller dispatcha. Command Center visar lagrade tillstånd, inte verifierad verksamhetsberedskap.
Stop: globalt/projekt-/workflowstopp, utgången behörighet, schemafel, kontodrift, integritetsfel eller budgetfel blockerar nästa försök. Okänt gate-svar = stop. Kontrollera igen precis före varje provider-anrop.
`apps/web/lib/governance/execution-dispatch.ts` erkänner att redan tillåtet in-flight-anrop kan slutföras efter stop; lova inte återkallelse eller noll paket efter stopp.
Föreslagsnyckel: `project + workflow + rule_version + evidence_hash`; samma evidens ger samma draft, ny rapport får supersede med audit. Första slice saknar persistence och visar endast stabilt id.
Publiceringsnyckel: `project + organization + approved_content_hash + slot`; varaktig claim och provider-resultatreferens behövs före aktivering. `EXTERNAL_COMMUNICATION` har `maxAttempts=1` i klasspolicyn; timeout ger `outcome_unknown`, ingen blind retry. Read-retry får ha lägre lokal gräns än policyns fem försök.
Återställning: stoppa kö/återkalla grant, behåll evidens och audit. Publicering/svar kan inte göras ogjorda; radering/rättelse är separat godkänd kompensation. Framtida bounded license måste ha mål, innehållstyper, tid, kvot, kostnad, utgång och revokering; ingen licens utfärdas här.

## 4. Fyra startflöden

### A. Daglig statistik: avvikelse och förslag

- Ingång: auktoriserad `MarketplaceReport` + separat trafikkontrakt; start manuellt, senare en analys per sparad dagsrapport. Nivåregler kan användas vid en rapport; trend kräver historik.
- Trigger v1: datakvalitetsproblem → kontrollförslag; registrerade > verifierade → statusgranskning; två intilliggande giltiga datum och förändring i `vehicles_published_active` → märkt förändringsobservation. Förslag om ihållande 0 bud kräver tre jämförbara 24 h-fönster och känt positivt publicerat utbud vid alla tre observationer.
- Trafikavvikelse senare: senaste avslutade UTC-dygn mot median av sju föregående verifierade hela dygn, både |delta| ≥20 pageviews och ≥50 %, median >0. Nuvarande sjudagarsläsare ger för lite historik; utökat kontrakt/test krävs innan regeln kan aktiveras. Små tal ger ingen procentvarning.
- Saknat/stale underlag: endast kvalitetsnotice, ingen affärsavvikelse för berörd regel. PostHog saknas → marketplace kan analyseras fristående med uttrycklig trafiklucka.
- Rättigheter/approval: befintligt projekt-READ; RECOMMEND är granskningsdraft. Ingen kontakt med handlare, kampanj, verifieringsändring eller workflow-aktivering utan separat godkännande.
- Kostnad/risk: 0 SEK med ren regelmotor; LLM-sammanfattning avstängd. Risk: fel population, överlappande fönster, pilotbrus och trackingbortfall.
- Bevis/rollback: frysta fixtures för null/0, en dag, dygnslucka, tre fönster, stale och tröskelgränser; samma input ger samma resultat/id. Dölj draftpanelen eller återgå till befintlig rapport; insamlingshistorik bevaras.

### B. Handlarbudet: ändringsbevakning

- Ingång: manuellt ägarval **Skanna godkända källor**, efter verifiering av #305/#306. Föreslagen fast allowlist: högst tre operatörsvalda offentliga URL:er, inga inloggningar, redirects till andra värdar eller godtycklig URL-input.
- Trigger: skillnad i normaliserad text/hash mot föregående godkända baseline → visa före/efter för pris, produktvillkor eller publikt budskap; första lyckade scan skapar bara baseline. Ingen automatisk scheduler verifierad eller föreslagen i första steget.
- Saknade data: timeout/403/429/parserfel = okänd observation, behåll baseline; tom felsida får inte tolkas som borttagen produkt. Webbinnehåll behandlas som data och får inte instruera Atlas eller verktyg.
- Rättigheter/approval: projektavgränsat READ av offentlig källa efter villkors-/robots-/tillåten användningskontroll; intern ändringsdraft. Människa verifierar viktig diff och varje affärsrespons; inga auto-prisändringar, inlägg eller kontakter.
- Kostnad/risk: 0 SEK i papperskörning; framtida scan max tre hämtningar, 10 s/64 KiB per sida, ingen betald crawler. Risk: sidlayout, felaktig diff, upphovsrätt och prompt injection; lagra minsta nödvändiga utdrag enligt beslutad retention.
- Bevis/rollback: lokala HTML-fixtures för oförändrat/ändrat/layoutfel/blockerat, projektisolering och allowlist-escape. Efter separat migrationsgrind testas RLS lokalt; avaktivera läsadapter och lämna baseline/audit, inget DB-rollback körs här.

### C. LinkedIn: företagsnärvaro, innehållsdraft och granskad publicering

- Ingång: ägaren anger verifierad företagsidentitet, målgrupp och godkända offentliga produktfakta; manuellt **Skapa innehållsidé**. Föreslå ett utbildande inlägg från FAQ/produktnytta; intern marketplace-statistik får inte bli offentlig utan uttryckligt dataägarbeslut.
- Saknade data: utan verifierat konto/API eller faktaunderlag stannar flödet i textdraft med **Publicering ej tillgänglig**; inga påstådda resultat, kundcase eller genererade statistikbevis.
- Onboarding-gate, ej kontrollerad online: organisation/Page och admin-/publiceringsroll, verifierad app och OAuth redirect, officiell organisation-postingprodukt/åtkomstnivå, gällande Posts API/version samt Community Management-onboarding/review och villkor. Kontrollera faktiskt beviljade read/write-scopes, bl.a. om `w_organization_social`/`r_organization_social` eller motsvarande aktuella scopes krävs och är tillgängliga; scope-namn här är kontrollpunkter, inte entitlements.
- Separera organization-postning från kommentarer/läsning/moderering; kontrollera varje endpoint, rate limit, retention, tokenlivslängd/rotation och rätt organisation. Ingen browser-bot, massengagement, scraping av medlemmar, auto-DM eller personkontoautomation.
- Approval: människa godkänner exakt text, bildrättigheter, organisation och UTC-tid **före första och varje pilotpost**. Intern schemakö skickar först vid tiden och efter ny kontroll av approval, stop, konto och adapter; godkänd draft är inte publicerad.
- Kostnad/risk: inga LLM-/bild-/API-anrop som standard; framtida max en godkänd pilotpost/vecka och en dispatch/post, explicit separat budget för betald generation. Risk: varumärke, fel konto, vendoravslag, dubbelpost och oåterkallelig extern kommunikation.
- Bevis/rollback: fake official-API-adapter, paper schedule med fryst klocka, edit-after-approve, expiry, stopp och timeout/dubblett. Kräver dispatch-claim/resultatreferens och negativa tester innan aktivering; stoppa kö, återkalla token via operatör, eventuell rättelse/radering godkänns separat.

### D. Support/FAQ och enkla kommentarer

- Ingång: manuellt, avidentifierat ärende eller framtida godkänd API-kommentar på organisationens eget inlägg; matcha bara versionsbunden, ägargodkänd FAQ. En match ger svarsdraft med FAQ-id/version och källreferens.
- Trigger/eskalering: ingen entydig FAQ-träff eller frågor om konton, betalning, tvister, persondata, juridik, hot eller löften → eskalera till människa utan sakpåstående. Spam/prompt injection ger inget svar och ingen verktygsinstruktion.
- Saknade data: utebliven FAQ, osäker identitet, borttaget inlägg eller obekräftad community-read → draft blockerad; gissa inte och hämta inte kunduppgifter för att fylla luckan.
- Rättigheter/approval: minimal projekt-READ av godkänd FAQ; inga admin-/kundkontoskrivningar. Varje externt svar godkänns i pilot; LinkedIn reply är separat officiell community-write med verifierat scope, målpost/comment-id och approval. Intern FAQ-publicering har eget godkännande.
- Kostnad/risk: 0 SEK med template-draft och manuellt input; senare högst fem granskade svar/dygn, en dispatch/comment. Risk: fel svar, personuppgifter i logg, hallucination och felaktigt upplevd behörighet.
- Bevis/rollback: fixtures för entydig/utgången/motsägande FAQ, känsligt ärende, dubbelkommentar, tokenfel och cross-project. Återkalla FAQ-version/grant och stoppa kön; redan skickat svar kräver granskad rättelse. Retention/radering för ärenden beslutas före ingestion.

## 5. Atlas-mappning och evidensbaserade formuleringar

| Befintlig yta | Föreslagen anslutning och gräns |
|---|---|
| `handlarborsen_marketplace_snapshots`, `collector_runs` | Auktoriserad läsare → `MarketplaceReport` → facts; använd snapshot/date/observedAt och audit, inga nya direktläsningar från klienten. |
| `atlas_signals`, `SignalRecord` i `apps/web/lib/atlas/signals.ts` | Befintlig signal `handlarborsen.marketplace_snapshot`, source `handlarborsen`, version och projectId. Ny insight måste ha obligatoriskt projekt/proveniens; global/null-project-fallback förbjuds. |
| `readHandlarborsenChatContext` / `buildHandlarborsenChatFacts` | Behåll befintlig marketplace-väg. Ny ren evidence-renderer kan senare fogas in efter samma scope; PostHog kräver egen auktoriserad privacy-gate innan chatten får trafikfakta. |
| Marknadspuls | Återanvänd presentation, men komplettera med `rule_id`, evidenslista, tidsfönster, quality-block och nästa kontroll. Förslag är inte active workflow eller AI-exekvering. |
| Workflow/approval/authorization | Mappa först efter separat adaptergranskning till `workflow_instances`, `runs`, `workflow_action`, `atlas_authorizations` och bundna outputs; återanvänd inte ett UI-approval som generell licens. |

Exempel nedan använder uppdragets tal som **illustrativt fixture**, inte en ny verifierad produktionsrapport:
- **Faktum:** 10 registrerade, 6 verifierade vid observationen. **Analys:** skillnad 4; populationen kan inkludera stängda företag. **Förslag:** granska faktiska statusar i HB-admin. Säg inte ”4 väntar på verifiering” eller ”60 % konvertering”.
- **Faktum:** `bids_total=2`, `bids_last_24h=0`. **Analys:** två bud totalt och inga nya under angivet rullande fönster. Detta visar inte minskad efterfrågan eller en trafikorsak. **Förslag:** invänta jämförbara fönster och kontrollera känt publicerat utbud.
- **Faktum:** PostHog `not_connected/unavailable`. **Analys:** sidvisningar okända, ingen trafiktrend eller konverteringskvot kan räknas. **Förslag:** verifiera #134, samtycke och faktisk ingestion innan serverläsning ansluts.
- Två snapshots med ett dygnsgap över flera dagar: skriv ”förändring sedan YYYY-MM-DD, N dygn”; inte ”ökning idag”. Nivåobservation, tidsförändring, hypotes och rekommendation ska visas som skilda fält; ingen kausalitet utan separat evidens.

## 6. P0–P3: små steg och acceptansgrindar

| Fas | Implementerbar slice | Acceptans innan nästa steg |
|---|---|---|
| P0: evidens och semantik | Ren fact-/insightmodell för marketplace; typer, deterministiska regler, fryst klocka och read-only panel. Därefter separat PostHog-normalisering bakom privacy-gate. | Negativa scope/null/0/stale/gap-tester passerar; korrekt verifierade-nu-etikett, ingen falsk trend, inga nya provider-anrop/persistence/cron. Ägaren kan granska exakt underlag och blockerande skäl. |
| P1: observer/pappersflöden | En manual analysdraft per evidens-id; separat lokal Handlarbudet-fixtureadapter efter #305/#306-revision. FAQ-template-draft med godkänd fakta. | Scenario-replay reproducerbar; dedup/supersede och projektgränser bevisade med fake store, endast lokala testdata. Godkänn faktisk migration/RLS separat före eventuell lagring; ingen extern dispatch. |
| P2: granskning och officiella adapters | Version/hash-bundet approval + schedule paper queue + fake LinkedIn post/reply; separat onboarding-/integritetsprotokoll och kostnads-/stop-integration. | Approval/cancel-race, redigering, revokering, fel konto, expiry, 429, timeout/unknown-outcome och återstart testade utan nätverk. Adapter stängd som standard; slutna actionkind/policy och varaktig idempotens verifierade. |
| P3: avgränsad produktionspilot | Operatören väljer en integration/ett konto/en åtgärdstyp; första officiella API-post och svar bara efter uttrycklig granskning. Daglig observation aktiveras separat enligt P1E. | Verifierad deployment/migrationsstatus, privacy, rätt konto/token/scopes, providerbevis och stop/kompensationsplan; operatören godkänner aktivering, kvot och budget. Därefter beslutas eventuell snäv tidsbegränsad licens separat. |

Teststrategi: använd befintliga `apps/web/lib/qa/handlarborsen-{marketplace-collector,marketplace-report,daily-collection,chat,posthog-traffic,visual-pulse,trends}.test.ts` som kontraktreferenser, inte som nykörda driftbevis. P0 ska lägga till beteendetester som täcker verkliga semantiska fel och rendera read-only UI på smal/bred skärm med keyboard/screenreader-kontroll.
P1E:s README redovisar tidigare lokal verifiering via `verify-guarded-store.sh` och `verify-cron-sql.sh`; de har inte körts i detta uppdrag. Framtida lagringsändring kräver isolerad lokal DB, konkurrens-/grants-/RLS-test; ingen preview-smoke mot produktions-Supabase.
Alla faser provas först i dry-run/paper med fake fetch/provider/store och nekad egress; collector-routens riktiga dry-run gör externa läsningar och är därför inte tillåten i detta dokumentationsuppdrag.
Kostnadstak: **0 SEK som standard**; ingen betald generation, crawling, ny tjänst eller analytics-aktivering. Framtida anrop kräver verifierad kostnadsmodell och operatörsbudget; okänd kostnad blockerar. Kvoter, timeout och stopp gäller även avgiftsfria externa handlingar.
Produktionscheck senare: separat read-only verifiering av migrationer, grants, cron.job/heartbeat/collector-audit, riktiga aggregerade payloads, PostHog samtycke/EU/retention/egenskaper och organization scopes. Detta görs först efter nytt operatörsuppdrag; planen ger ingen sådan aktivering.

## 7. Föreslagen första implementation: en ren analys-slice

Skapa senare `apps/web/lib/atlas/project-analytics/handlarborsen-insights.ts` med `deriveHandlarborsenInsights(report, now)`; output: stabilt `id`, `ruleVersion`, `kind=fact|quality|proposal`, facts/proveniens, blockingReasons och nästa manuella kontroll. Ingen I/O, modell, lagring eller action-returnvärde.
Omfattning: kvalitetsnotice, verifieringsskillnad med populationsvarning samt total-bud/24h-bud som två separata observationer. Trend bara för känt stockmått på två intilliggande giltiga datum; ingen PostHog- eller konkurrenthämtning i denna slice.
UI: liten serverrenderad **Underlag och förslag**-panel på `apps/web/app/(platform)/projects/[slug]/page.tsx`, efter samma auktoriserade rapportgrind; visa observationstid, fönster, källa, kvalitet och ”Förslag – kräver granskning”. Länk till befintlig statistikrapport; ingen Kör/Publicera-knapp eller påhittad workflowstatus.
Tester senare i `apps/web/lib/qa/handlarborsen-insights.test.ts`: 10/6 inklusive stängda-statusvarning, 2/0 utan kausalitet, null/0, en dag, stale, gap, invalid snapshot, stabila id och berört mått saknat. Route/UI-integration ska bevisa att främmande/nekade projekt aldrig renderar panelen; ren funktions-test kan inte ensam bevisa auth.
Acceptans: granskbar panel och reproducerbara regler, rätt semantik för verifierade nu, inga nya anrop/skriverättigheter eller kostnader; befintliga relevanta tester/typecheck körs då offline. Denna slice **är endast föreslagen och inte implementerad här**.

### Lokal P0-implementation, senare samma datum

Den rena regelmotorn och read-only evidenspanelen är nu implementerade i den isolerade
branchen `codex/omnira-atlas-analytics-p0-20261012`, med negativa semantik- och
isoleringstester. Detta är inte en deployment eller produktionsaktivering.
Se [P0:s data-/UI-gräns och verifieringsstatus](HANDLARBORSEN_ATLAS_ANALYTICS_P0_20261012.md).
