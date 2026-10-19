# Omnira Trading – Offline Databento Data Intake Audit

**Datum:** 2026-10-19  
**Status:** TESTAT RESEARCHPROTOTYP – INGEN VERKLIG DATABENTO-DATA, INGEN CANONICAL STRATEGIINDATA  
**Branch:** `feat/trading-databento-offline-intake-audit-20261019`  
**Baserad på:** `feat/trading-historical-provider-research-20261019` @ `e3bc649cdb8f9b7e98a30904c25ee07078c98faf`.

Denna leverans rättar formatbrister i föregående `databento-historical-preflight.mjs` och lägger till en offline-granskare för flera 1m-candles, med tester. Vi har **inte** valt operativ dataleverantör, hämtat historik, fått en offert eller verifierat en licens.

## Det faktiska nya arbetet

1. **Pris-sentinel:** enligt Databentos officiella standardsida är `UNDEF_PRICE = INT64_MAX = 9223372036854775807`. Det är en markering för saknat pris, **inte ett handlingsbart OHLC-pris**. Äldre researchkod tillät värdet; den nya versionen blockerar det i alla fyra OHLC-fält innan det kan bli en priskandidat.
2. **Datafältens numeriska gränser:** `instrument_id` är `uint32` och `publisher_id` är `uint16`. Tidigare koden tillät positiva JavaScript-safe-integers upp till 2^53-1; den nya versionen begränsar instrument-ID till `1..4294967295` och publisher-ID till `1..65535` inom denna icke-canonical granskningsmodell.
3. **Hel dataserie utan reparation:** nya `scripts/trading/research/databento-normalized-batch-audit.mjs` tar en caller-skapad lista med redan **normaliserade** OHLCV-1m-rader. Det vägrar dubbletter, oordnade minuter, fel instrument/publisher, fältfel, fel tidsfönster, pris-sentinel och radantal över max.
4. **Luckor får inte döljas:** rapporten visar antal observerade minuter och *kandidater till icke observerade minuter* i det nominella UTC-fönstret, plus fem exempel. Dessa är **inte** en uppskattning av felaktigt saknade exchange-data. Databento ger ingen OHLCV-stapel för en minut utan trades; veckoslut och börsuppehåll är separata fakta, som bara kan bedömas mot Omniras `SessionCalendar`. Inga syntetiska bars fylls in.
5. **Deterministiskt fälthash:** `normalizedFieldSequenceSha256` bygger på fast ordnade fälttupler och särskild kontrakt-/symbol-/tidsinformation; den är okänslig för JavaScript-objekts insättningsordning men känslig för verkliga värdeändringar. Den är **INTE** en kontrollsumma av Databentos ursprungliga DBN- eller CSV-fil, ett signerat kvitto, en kryptografisk providercertifiering eller bevis på fullständighet.
6. **Ingen auktoritetsuppgradering:** även 60/60 observationer i en timmes testdata ger `status:REVIEW_ONLY`, `sourceState:UNKNOWN`, `dataSourceVerified:false`, `exchangeCalendarVerified:false`, `canBecomeStrategyEvidence:false`, `downloadAllowed:false` och `purchaseAllowed:false`. En tom lista ger samma osäkerhet. Rätt hantering av faktisk slutlig källtäckning hör till C3C-porten och leverantörens auktoriserade mottagare, inte detta researchscript.

## Reproducerade tester

**36/36 PASS**, ingen skip eller failure, Windows Node v22.22.3 i temporär testmapp (2026-10-19):

```bash
node --test \
  scripts/trading/research/databento-historical-preflight.test.mjs \
  scripts/trading/research/databento-normalized-batch-audit.test.mjs
```

20 ursprungliga offline-testfall + 16 nya. Nya regressioner omfattar pris-sentinel i varje OHLC-fält, exakta 16/32-bitars gränser, riktning/tid/dubbletter, ändringskänslig men ordningsstabil fältdigest, noll trades/nollvolym, saknade bars, otillåtet datafönster och no-network/no-authority.

Detta verifierar en **begränsad researchfunktion**, inte Databentos verkliga DBN-payload, licens, en exekverbar C3C-adapter, historiska tradingsignaler eller ekonomiskt resultat. Varken `npm install`, live API, GitHub Actions eller produktionsdeployment har körts.

## Exakta begränsningar före riktig historikimport

- Researchtesternas `evidenceId: VERIFIED-SYNTHETIC-ONLY-2026`, `rawSymbol: NQZ6` och numeriska instrument-ID är **påhittade fixturevärden**. Prefixet `VERIFIED-` i en sträng betyder inte faktisk externt verifierad symbolrelation. Ingen sådan verifiering har gjorts.
- Databento råa DBN-fält är integer-priser med 1e-9 skala, men en CSV- eller JSON-export kan använda `pretty_px` och därför ge **decimalsträngar** snarare än skalade heltal. Denna auditor accepterar **endast** uttryckligen normaliserade heltalsfält `open_nano`, `high_nano`, `low_nano`, `close_nano`. En riktig exporterad fil får aldrig matas direkt till denna modul utan att dess prisencoding först identifierats och översatts av en separat granskad decoder. Felaktigt 1e-9 antagande skulle skapa marknadspriser som är en miljard gånger fel.
- Databento `symbology.resolve` kan användas för att översätta ett faktiskt `raw_symbol` till instrument-ID över ett specificerat datumintervall. Databento kan återanvända symboler över tiden. Även efter uppslag krävs Omniras separat signerade `ContractCalendar` och jämförelse mot `ResolvedContract`.
- Licensklass för **historisk intern analys** respektive **non-display/autonom signalbehandling** och kommersiellt användningsfall är **inte bekräftad**. Databento beskriver olika personliga/kommersiella och display/non-display-kategorier; vi ska bekräfta vilken som gäller Omniras tänkta research och eventuell drift, inte anta det.
- `metadata.get_cost` är avsett för prisuppskattning och är gratis metadataåtkomst enligt aktuell Databento API-dokumentation, men inget faktiskt API-anrop eller kontoverifiering har genomförts. Den verkliga historikkostnaden är därför fortsatt **OKÄND**.
- En framtida rådataimport måste registrera faktisk leverantörsfil med **filbytes SHA256**, dataset-/schema-/encodingversion, rättighetsunderlag, faktisk point-in-time instrumentdefinition och om så är möjligt source-version/metadata, samt calendar-version; denna forskningsmoduls *normaliserade fältdigest* är endast ett kompletterande integritetsspår.

## Nästa arbete – utan automatiskt köp

1. Genomför oberoende kodgranskning av researchmodulen; var tydlig med att koden inte är en komplett DBN/CSV decoder.
2. När konto och licens finns: verifiera `metadata.get_dataset_range`, `symbology.resolve` och `metadata.get_cost` för **ett explicit faktiskt NQ-kontrakt**, sedan **ett separat ES-kontrakt**. Gör aldrig `ALL_SYMBOLS`-förfrågningar av misstag.
3. Innan en enda historisk datarange hämtas: spara exakt offererade USD, eventuellt saldo i användarens konto, historiska rättigheter, kontoklass och en liten godkänd USD-gräns.
4. Separat och endast efter godkännande: skapa filbaserad rådata-snapshot, en oberoende testad DBN/CSV-decoder och en riktig C3C-källadapter för accepterade data.
5. Pattern gates GATE-01–04, verkliga sessionskalendrar och out-of-sample-data fortsätter vara blockerare för statistiska tradingpåståenden. Jev och livehandel är uppskjutna.

## Officiella primärkällor

- Databento standards/priser/sentinel: https://databento.com/docs/standards-and-conventions/common-fields-enums-types
- Databento OHLCV-1m och uteblivna minuters bars: https://databento.com/docs/schemas-and-data-formats/ohlcv
- Databento instrument identifier och symbology resolve: https://databento.com/docs/api-reference-historical
- Databento symbolåteranvändning: https://databento.com/docs/standards-and-conventions/symbology
- Databento licens och personal/commercial/non-display: https://databento.com/docs/portal
- Databento avgifter och krediter: https://databento.com/docs/faqs/usage-pricing-and-data-credits

**Status i slutet av detta arbete:** forskningsprototyp testad; ingen riktig data, betalning, trade, PR/merge eller ändring av `main`.
