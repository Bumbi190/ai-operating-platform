# Omnira AWS – fas 5 (lokal) · FX-referens och säkerhetsgrind inför SEK-budget

Datum: 2026-11-17
Existerande gren: `feat/omnira-bedrock-pilot-20261116`
Bas-HEAD: `1b050e5fb1c92bd7839ba176c6b7face8f2b1edf`
Omfattning: enbart kod för historiska prisexempel, tester och denna dokumentation.
**Ingen push av fas 5, ingen IAM-ändring, ingen Vercel-variabel, ingen modellinvokation, ingen DB-skrivning, ingen budgetreservation och ingen release till produktion.**

## Verifierade fakta och offentliga källor

- Officiell AWS Bedrock Standard-prislista för us-east-1 publicerad 2026-11-11, giltig från 2026-11-01. Den föregående fasens åtta familjebaserade text-token-SKU:er är redan pushade och Preview är READY på `1b050e5`.
- Riksbankens SWEA REST API `GET https://api.riksbank.se/swea/v1/Observations/Latest/sekusdpmi`, direkt läst den 17 november 2026 kl. 11-tiden svensk tid: `{"date":"2026-11-16","value":10.07354}`. En USD motsvarar alltså 10,07354 SEK enligt den senaste då tillgängliga indikativa noteringen.
- Riksbanken publicerar dagliga noteringar normalt kl. 16.15 svensk bankdag. Dess kurser är endast **indikativa**, inte transaktionskurser; statistik kan revideras.
- Omniras `lib/cost/rates.ts` har en teknisk fallback `usd_sek=10.5`. Denna fallback är **inte** ett verificerat aktuellt marknadspris och får inte automatiskt upphöjas till rätt budget-FX.
- Omniras riktiga budgetgräns använder `numeric(12,4)` i SEK, `ceilToLedgerScale`, `withGovernedSpend`, `tokenWindowCeiling`, reservation/settlement och STOP. Dessa delar lämnas orörda.

Källor:
- https://api.riksbank.se/swea/v1/Observations/Latest/sekusdpmi
- https://www.riksbank.se/sv/statistik/rantor-och-valutakurser/hamta-rantor-och-valutakurser-via-api/
- https://www.riksbank.se/sv/statistik/rantor-och-valutakurser/hamta-rantor-och-valutakurser-via-api/fragor-och-svar-om-apiet-for-rantor-och-valutakurser/
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/20261111013037/us-east-1/index.json

## Lokalt utvecklat

- `apps/web/lib/ai/model-control/bedrock-fx-advisory.ts`: **ren, icke auktoriserande** omräkning av indikativa USD-scenarier till SEK. Kräver en explicit daterad Riksbanksnotering, exakt referensoffer, `asOfDate` och en vald *exempelmarginal*. Ingen FX-fallback, inget nätverk, ingen nyckel, ingen rabatt på AWS-krediter.
- Exempeldata Riksbanken 16 november: `1 USD = 10.07354 SEK`; datum för visat historiskt scenario 17 november; `exampleBufferPercent=10` är en **illustrativ variabel**, inte beslutad eller godkänd budgetpolicy.
- Gammal, framtida, ogiltig eller felaktigt daterad notering avvisas av beräknaren. Färskhetsgräns i detta **illustrativa** steg är högst 3 kalenderdagar och räknas från explicit as-of-datum.
- Utdata är alltid `hardCeilingApproved=false`, `fxForBillingVerified=false`, `accountPriceVerified=false`, `budgetReserved=false`, `creditAppliedUsd=0`, `canDispatch=false`, `modelCallsMade=false`.
- Browserberäkningen importerar **inte** `lib/cost/spend-ceiling.ts`, eftersom denna importerar en `server-only` verifierad-budgetmodul. En separat webbläsarsäker uppåtrundning till 4 decimaler följer samma matematiska algoritm och jämförs i server-side tester mot kanoniska `ceilToLedgerScale`.
- `apps/web/app/model-control-preview/bedrock-price-advisory-panel.tsx` visar två **historiska SEK-exempelkolumner** för de fyra Nova-modellerna (referenskurs och +10 % illustration), alltid märkt som historiskt, inte ett aktuellt marknadspris eller realtidsuppslag.
- Omnira-räknaren gör ingen API-fråga från webbläsaren, bygger ingen separat budgetdatabas och ger inga körbehörigheter.

Exempel Nova Micro vid 10 000 input + 2 000 output:
- Indikativt bruttopris `0.00063 USD`.
- Med historisk 10.07354 SEK/USD uppåtrundat till ledgerprecision: `0.0064 SEK`.
- Med 10 % **illustrativ** marginal uppåtrundat: `0.0070 SEK`.
- Dessa två SEK-värden är inte fakturapris, har inte granskats som en hård reservationsgräns och kan inte användas för modellkörning.

## Fortsatta releasehinder

1. Få separata, live-granskade, **köp-/fakturarelevanta** USD→SEK-prisantaganden med konservativ och dokumenterat godkänd buffert, giltighetstid samt hantering vid extrema FX-förändringar. Riksbankens kurs är endast referensdata.
2. Fastställ och verifiera AWS:s konto-, versions-, körvägs- och profilpriser samt maximalt debiterbar tokenmängd; allting annat `unpriced`.
3. Säkerställ ett **hårt** `H1_SPEND_GATE`-läge samt korrekt kanonisk SEK-budgetreservation och STOP. Ingen rådgivande modellväljare får begära faktiska anrop.
4. Kräv projekt-/workflow-scope, separat operatörsgodkännande och en reviderbar faktisk pilotkostnadsgräns före varje betalt körprov.
5. Ingen tryckt valutamarginal (inklusive 10 %) eller AWS-kreditbalans får tolkas som auktoriserad rabatt, budget eller köpbeslut.

### Resultatkontroller

- Pure funktion testar FX-källa, datum, 3-dagars-färskhet, giltig input, nollkostnad, fel modell/pris, negativa/ogiltiga tal, falska kreditavdrag och utgången notering.
- Jämför browser-safe round-up mot `ceilToLedgerScale` i 64 scenarier.
- Inga server-only imports från UI, ingen AWS Runtime eller DB-kod.
