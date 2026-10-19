# C3C -> SessionCalendar: historisk bucket-evidence – verifierad integrationsfas

**Datum:** 2026-10-19  
**Status:** KOD PÅ SEPARAT BRANCH – EJ MERGAD / EJ LIVE / INGEN VERKLIG MARKNADSDATA  
**Branch:** `feat/trading-c3c-session-evidence-20261019`  
**Baserad på:** `feat/trading-c3c-historical-source-boundary-20261019` @ `28d4f4d927c8f356f7264a9e9281879f4e65d0f5`  
**Canonical underlag:** `docs/trading-system/specifications/market-data/…Market Data & Contract Lifecycle – Canonical v1.0.md` och `…Contract-Scoped Historical Candle Source Result – Canonical v1.0.md` (Beslut I och N).

## Konkreta leveranser

- **`apps/web/lib/trading/historical-evidence/historical-bucket-evidence.ts`**: ny read-only orkestrering ÖVER marknadsdata och session calendar. Funktionen `readHistoricalBucketEvidence` tar en redan vald `ResolvedContract`, en caller-ägd kanonisk bucket, en explicit versionerad `SessionCalendar` och en injicerad `HistoricalContractCandleSource`.
- **`apps/web/lib/trading/historical-evidence/index.ts`**: isolerad exportyta. Ingen export från den publika `@/lib/trading` authority-barrelen.
- **`apps/web/lib/trading/historical-evidence/historical-bucket-evidence.test.ts`**: 22 integrationstester.
- **`apps/web/lib/trading/historical-evidence/import-discipline.test.ts`**: fem nya strukturella säkerhetskontroller som förbjuder provider-/broker-/nätverks-/order- och authority-importer i orkestreringen.
- **`apps/web/lib/trading/market-data/historical-contract-source.ts`**: korrigerar ett redan befintligt typberoende från föregående C3C-branch som bröt session-kalenderns strict one-way importregel. Källstatus förblir **exakt** `SETTLED | UNKNOWN`, och `HistoricalObservedMinutes` är en lokal strukturellt kompatibel **typform**, inte ny observationssemantik. Vi lade till ett test som kompilations- och runtimekontrollerar kompatibiliteten med `ObservedMinutes` och `OBSERVATION_SOURCE_STATES`. Session-kalenderns implementation och dess gränstester har INTE ändrats.

## Läsflöde (inga handelsbeslut)

```
Injected HistoricalContractCandleSource (1m / one ResolvedContract)
  -> inspectHistoricalContractResult / buildContractCandleSegment
  -> settle **hela** den efterfrågade bucketen, med explicit prefixfortsättning
  -> samlade minutöppningar, endast från accepterade SETTLED-chunks
  -> sessionExpectation(versioned SessionCalendar, canonical NominalBucket)
  -> evaluateBucketEvidence(...): COMPLETE | PARTIAL | UNKNOWN | NO_CANONICAL_CANDLE
  -> valfri befintlig fourHourStrategyStanding (endast datakvalitet; inte signal)
```

En förkortad eller delvis returnerad källtäckning får aldrig markeras PARTIAL innan hela source-begäran verkligen har täckts. En `UNKNOWN` källstatus stoppar kedjan; den omtolkas inte som frånvaro. `NO_DATA` betyder endast att källan rapporterade inga observationer, inte att börsen var stängd. Källan behöver aldrig veta vilken kalender som gäller; kalendern talar om vad som **förväntades**, källan vad som **observerades**.

För hela bucketens read-only-orkestrering finns en explicit operativ fail-closed-gräns på **256 chunks**. Den är inte en strategi-, risk- eller handelsregel och den påstår inte att en källa är uttömd. Begränsningen stoppar bara en alltför finfördelad, lång kedja i stället för att fortsätta obegränsat.

## Testbevis (faktiskt körda, på isolerad arbetskopia)

- **Mac, Vitest 2.1.9:** `lib/trading/market-data`, `lib/trading/session-calendar`, `lib/trading/historical-evidence`: **9/9 testfiler och 242/242 tester PASS** vid körning på branchens exakta head efter säkerhetsrefaktorn.
- **Mac, scoped strict TypeScript:** C3C och historical-evidence implementationsfiler + integrationstester **PASS** före tillägget av den sista importgränstestfilen; kör även denna i avslutande kontroll om möjligt.
- Alla förändrade och tillagda filer hämtades från den specifika GitHub-commiten till en **tillfällig kopia**. Den aktiva Mac-arbetskopians andra filer/worktrees ändrades inte. Tempkopian städades efter körningen.

Exempel på **syntetiskt verifierade** fall: en komplett 5m- och 4H-bucket; verkligt saknad förväntad minut ⇒ PARTIAL; avbruten prefixkätting ⇒ BLOCKED, inte optimistisk partial; hel stängning utan observationsdata ⇒ NO_CANONICAL_CANDLE; källans `UNKNOWN` eller en okänd session calendar ⇒ blockerad; fel kontrakt, ogiltig täckning eller dubbletter ⇒ blockerad; 02:00 New York vinter/sommar korrekt absolut tid; tidig stängning kan vara COMPLETE men `sessionTruncated=true` och inte 4H-strategibevis; 14:00 är inte en strategirelevant 4H-open; 256 små prefix kan inte lura en fullständig leverans.

## Granskningsfynd, avhjälpta

Bredare testkörning avslöjade ett verkligt arkitekturproblem som enbart snäv C3C-testning missade: `session-calendar/import-discipline.test.ts` förbjuder att `market-data` konsumerar kalenderns andra funktioner än grid-predikatet. Den första prototypen importerade `sessionExpectation` och `evaluateBucketEvidence` där, vilket bröt regeln. Orkestreringen flyttades till det separata paketet `historical-evidence` ovanpå båda, **utan att mjuka upp testets importbegränsning**.

Ett äldre `market-data`-type-only-import från `session-calendar` var också inkompatibelt med denna brandvägg. Vi tog bort importen, behöll den kanoniska värdemängden `SETTLED | UNKNOWN` och lade till type-/runtime-kompatibilitetskontroll. Efter detta passerade även de äldre arkitekturtesterna.

## Avgränsningar och nästa steg

- Inga verkliga marknadsdata har hämtats; ingen CME-licens/dataprovider är verifierad, vald eller aktiverad.
- `ContractCalendar`/operativ `SessionCalendar` är inte populerade med auktoritativa faktiska utbytesdata. Fixturer är självförfattade testintervall, aldrig riktiga session- eller helgdagstabeller.
- Den externa dataadapter som producerar kontraktsspecifika källresultat är fortfarande saknad. Körhistorik/data snapshots och verklig replay/backtest saknas.
- Mönsterreglerna **GATE-01/02/03/04 är fortfarande öppna**. Ingen iFVG, CISD, equal highs/lows eller SMT-definition har promoverats.
- Inga `TradeProposal`, `StrategySignal`, API-nycklar, ordermetoder, CRON-jobb, databasmigrationer, billable AI-anrop, release eller livefunktioner har aktiverats.

**Nästa implementeringsval:** oberoende review av branch + parent C3C, därefter undersöka licensierad historisk 1m NQ/MNQ/ES per konkret kontrakt. Separat behöver GATE-01–04 få mänskligt signerade maskinläsbara definitioner innan backtesting kan bedöma strategins verkliga edge. Börsdatakostnad måste vara uttryckligen verifierad och godkänd före köp.
