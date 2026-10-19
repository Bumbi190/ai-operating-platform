# OMNIRA → CLAUDE: nästa steg mot riktig NQ/ES-historik

**Överlämning:** 2026-10-19, 17-tiden svensk tid  
**Primär branch:** `research/trading-databento-gated-real-intake-20261019`  
**Repo:** `Bumbi190/ai-operating-platform`  
**Status:** Riktig offert är verifierad och en säker, ännu **icke körbar** importplan är skapad. **Ingen betald prisdata har hämtats. Ingen riktig backtest har körts.**

## 1. Vad användaren vill

Omniras Atlas ska bli en autonom, men mänskligt övervakad, NQ/MNQ-tradingresearchmotor. För närvarande är målet **verklig historisk statistik och backtest** som underlag innan strategin finjusteras, med minimal kostnad. Ägaren har uttryckligen prioriterat att fortsätta snabbt en stund och därefter lämna över till Claude.

**Strategival från senaste samtalen:**
- iFVG betyder **Inversion Fair Value Gap**, inte Implied FVG.
- Inversionens crossing bekräftas **enbart av en färdig 1m-candles stängning strikt förbi den ursprungliga FVG-zonens bortre kant**. En wick räcker inte och likhet med gränsen räcker inte.
- Strategikontakten Axel säger att ursprungs-FVG kan bildas både före och efter manipulationen, men efteråt (B) är vanligast. Vi forskar tills vidare på **B-only**: ursprungs-FVG:s *tredje candle* är stängd strikt efter avslutad manipulation. Detta är ett **forskningsantagande**, inte en slutligt godkänd detektor.
- **Ännu olöst:** måste alla tre FVG-candles vara efter manipulationen? CISD-exakta regler, gap mitigation/invalidation/expiry, multiple FVG tie-break, equal highs/lows och SMT NQ/ES-varianten.
- Alla GATE-01–04 och GATE-08 är fortfarande öppna; ingen livehandel, inga brokerorders, ingen version-promotion.

## 2. Operativ miljö och försiktighetsåtgärder

- Användaren arbetar på stationära Windowsdatorn **Hultgren**, Remote Desktop Commander device ID `0880811c-d0bf-4fca-b636-a36b4f556836`, inte Mac.
- Aktiva användarens arbetskopia: `C:\Users\Andre\Projects\Omnira\Code\ai-operating-platform`. Vid senaste kontrollen branch `feat/phase3b1b-atomic-bind-provenance`, **9 befintliga ändrade filer**. **ALDRIG git checkout, reset, clean, merge eller skriva över denna arbetskopia**. Använd ny isolerad klon/tempdir vid testning.
- Branch `main` var `d3f9fcc1045026042f6bb9c0cd302ed0b7283127`, inte förändrad i det här arbetet.
- Skapa ingen PR, merge, kör inte CI eller deployment utan uttryckligt godkännande p.g.a. användarens kostnader.
- Ingen Databento API-nyckel finns sparad i GitHub. Nyckel matas endast lokalt i dold PowerShell-prompt; visa/läs/logga ALDRIG credential.
- Användaren är inloggad på Databento i **Brave** på stationära eftersom Chrome registrering inte fungerade.
- Användaren har själv bekräftat **125 USD startkrediter**. Vi har inte verifierat månads-/usage-limit i kontot.

## 3. Verifierad riktig Databento-offert – källa på Windows

`C:\Users\Andre\Projects\Omnira\Previews\Databento-Metadata-20261019\Quote_Result_Public.json`

Kontrollerad 2026-10-19. Följande är leverantörens **metadatauppgifter**, inte mockvärden:

| Fält | Verifierat |
|---|---|
| Status | `FREE_METADATA_ONLY_COMPLETE` |
| Dataset | `GLBX.MDP3` |
| Schema | `ohlcv-1m` |
| Start UTC | `2026-10-15T00:00:00Z` |
| Slut UTC | `2026-10-16T00:00:00Z` |
| NQ | `NQZ6`, instrument ID `261401` |
| ES | `ESZ6`, instrument ID `10252` |
| Prisestimat NQ | **0.0050380826 USD** |
| Prisestimat ES | **0.0050380826 USD** |
| Totalt rapporterat | **0.010076165 USD** (avrundning från summan) |
| Tid för offert | `2026-10-19T14:20:34.8041245Z` |
| Debiterbara anrop | 0 |
| Nedladdade dataposter | 0 |

Vi har **ännu ingen betald dataimport**. Användaren har gett klartecken att fortsätta utvecklingen men **har inte uttryckligen godkänt den specifika debiterande datahämtningen med en given maxbudget**. Fråga före betalt anrop. Ett förslag är att be om uttryckligt godkännande för en första endagsimport av NQZ6 + ESZ6 med **uppskattning 0.010076165 USD** och **föreslagen personlig budget 0.02 USD**. Notera att kostnadsuppskattning och egen beloppsspärr **inte är en leverantörsgaranterad hård debiteringsgräns**.

**Separata användnings- och lagringsrättigheter behöver kontrolleras** för personligt researchbruk respektive eventuell kommersiell återanvändning i Omnira. T+1 historik innebär inte obegränsad distributionslicens.

## 4. Färdigt i denna branch

`scripts/trading/research/databento-first-day-gate.mjs`:
- Pure/offline `prepareFirstRealNqEsIntake(publicQuote, {proposedHardLimitUSD:'0.02'})` validerar **faktiska metadata**: exakt datum, NQZ6/ESZ6, instrument-ID, två separata kostnader, avrundad total. Returnerar `PLAN_READY_AWAITING_SEPARATE_APPROVAL`, `canExecutePaidRequest:false`, `canDownload:false`, `sourceSettled:false`.
- Skapar **deklarativa**, icke-körbara POST-parametrar för `/v0/timeseries.get_range` med `encoding=json`, `compression=none`, `pretty_px=true`, `pretty_ts=true`, `map_symbols=true`, `limit=1800`, 1 dag och en enskild råsymbol per anrop.
- `auditCandidateDatabentoJsonl(plan, symbol, rawJsonl)` fail-closed på rtype=33, instrument-/publisher-ID, symbol, tid, fullständig newline, felformade eller dubbla rader, OHLCV, filgräns. Rapporterar SHA256 och potentiella saknade minuter men markerar **aldrig** source `SETTLED` eller kalender verifierad.
- Inga nätverksanrop, credentials, broker, signal eller exekvering.

`scripts/trading/research/databento-first-day-plan-cli.mjs`:
- Läser **enbart** publika offertfilen; producerar exklusivt en JSON-plan i vald mapp `Previews`.
- Vägrar skriva i repo-worktree och vägrar skriva över en existerande plan.
- Planen är säker att läsa/dela utan API-nyckel, innehåller offertens SHA256 och visar `userApprovedPaidRequest:false`.

Tester:
`scripts/trading/research/databento-first-day-gate.test.mjs` (15 fall).
`scripts/trading/research/databento-first-day-plan-cli.test.mjs` (6 fall).
**21/21 PASS på Windows Node 22.22.3**. En verklig säkerhetsbrist i målmappskontrollen upptäcktes av testet, åtgärdades med exakt path-segment-kontroll, och full svit passerade efter fixen. Ingen PR/CI.

**Den verkliga offertfilen har använts lokalt för att skapa den första säkra importplanen på Hultgren:**

```text
C:\Users\Andre\Projects\Omnira\Previews\TradingRealData-20261019\First_NQ_ES_Historical_Import_Plan.json
```

Output:
```json
{
  "status": "PLAN_READY_AWAITING_SEPARATE_APPROVAL",
  "contractCount": 2,
  "combinedEstimateUSD": "0.010076165",
  "proposedLimitUSD": "0.02",
  "downloadedRecords": 0,
  "userApprovedPaidRequest": false
}
```

**OBS:** Föreslagna `0.02` USD är inte ett beviljat köp eller hård leverantörsspärr.

## 5. Vad Claude ska göra efter överlämningen

**Före betald datahämtning:**
1. Verifiera senaste Github HEAD och läs alla ovanstående filer och öppna GATE-register. Använd isolerad researchgren/klon.
2. Kontrollera Databentos aktuella dokumentation och kundens faktiska usage-limit/credit/access, plus datalicens för avsedd research. Nyckeln får aldrig visas/loggas/sparas.
3. Bygg **separat** betald downloader med *explicit mänskligt godkännande* för exakt kontrakt/datum, föreslaget budgettak och policy. Fräscha upp `metadata.get_cost` före varje debiterbart anrop; stoppa om offert överskrider godkänd gräns; begär nytt godkännande vid ändrad offert. Även då kan slutdebitering avvika – beskriva aldrig mjuk preflight som garanterad hard limit.
4. För själva datan använder Databento `POST https://hist.databento.com/v0/timeseries.get_range`, parametrar **application/x-www-form-urlencoded**, precis enligt Databentos dokumentation. **Riktig prisdata kan debiteras.** Högst exakt två avsedda instrumentsymboler, ett kalenderdygn; inga kontinuerliga symboler eller löpande automatiska hämtningar.
5. Spara originala leverantörsbytes i separat datamapp (aldrig GitHub), med **SHA256, UTF-8 JSONL, källa, instrument och kontrollerad tidsperiod**, atomic writes och no overwrite. Avbryt på tom/oversize/truncated/unexpected data. Betalda POST ska **inte retryas automatiskt** eftersom dubbla köp kan ske. `limit=1800` får inte feltolkas som bevis på fullständigt dygn om gränsen uppnås.
6. Kör `auditCandidateDatabentoJsonl` separat och kräv faktisk CME/sessionskalender, datatäckning, tick-/publisher-instrument-definition samt C3C:s andra verifieringsgrindar före användning i riktig backtest. Databento ohlcv saknar ibland minuter utan avslut; **fyll aldrig sådana luckor med påhittade candles**. `ts_event` markerar **början** av 1-minutsbaren, och signal får inte se candlen förrän 1 min senare.
7. Skapa en kvalitetsrapport för det första riktiga dygnet med exakta barantal, källa/hash och osäkra tider. Först när strategi-/entry-/SL-/TP-/exit-regler är godkända kan riktig win rate, drawdown och expectancy beräknas. Ingen trading utan separat approval.
8. Om användaren vill fortsätta till Claude *innan* ett explicit dataköpbeslut: lämna denna gren och plan intakta, återkom med tydlig fråga om godkännande.

### Officiella Databento-API-dokument

- https://databento.com/docs/api-reference-historical?historical=http
- https://databento.com/docs/schemas-and-data-formats/ohlcv
- https://databento.com/pricing/

Databento: `POST /v0/symbology.resolve` (gratis metadata), `GET /v0/metadata.get_cost` (gratis uppskattning), `POST /v0/timeseries.get_range` (betalbar prisdata, JSON lines eller DBN). `ohlcv-1m` är `rtype 33`; `ts_event` är minutens **öppning**.

## 6. Relaterad tidigare research

- Gratis metadatabranch: `research/trading-databento-free-metadata-20261019`, senaste kända SHA `2f16b7b0f185d5ce435ebb9c42d625a7c40b146e`.
- B-only syntetisk grund: `research/trading-ifvg-b-only-evaluation-20261019`.
- B-only syntetisk statistik: `research/trading-ifvg-b-observation-stats-20261019`, **83/83 PASS** i hela tidigare testsviten (12 handskrivna scenarier; **3 B-only** iFVG-kandidater mot **5 A+B**, ej verklig tradingstatistik).
- GATE-01–04 beslutsunderlag: `research/trading-pattern-decision-matrix-20261019`.
- C3C provider-neutral historiklager, ej merge: `review/trading-c3c-pr-ready-20261019`.
- Original Databento normaliserade syntetiska preflight/audit: `feat/trading-databento-offline-intake-audit-20261019`.
- Visuellt godkänt **Backtest Lab v2**: `feat/trading-backtest-lab-v2-visual-20261019`. Design kvar tills användaren vill polera mer. Den lokala designpreviewn körs med lokal authshim; authshim får **aldrig** committas.
- Ingen faktisk historik ännu. Ingen säkerhet eller strategi-signalsfunktion får aktiveras av bara forskningsresultat.

**Vad som gäller nu:** Fortsätt på stationära i separata arbetsmappar. Använd den verifierade offentliga offerten, den icke-körbara importplanen och de 21 godkända testerna. Betald data och komplett backtest först efter särskild mänsklig approval och dokumenterade licens-/datakvalitetsvillkor.
