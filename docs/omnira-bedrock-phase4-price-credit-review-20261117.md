# Omnira AWS – fas 4 · kostnadsevidens och kredithantering utan modellkörning

Datum: 2026-11-17 · Europe/Stockholm
Repo: Bumbi190/ai-operating-platform
Existerande branch: `feat/omnira-bedrock-pilot-20261116`
Förälder: `1fded2819e27118a98228fdb14e6ace153fadb53`
Status: **fas 4-Preview publicerad på GitHub/Vercel via godkänd push av `4b403ca`**. Den efterföljande offentliga AWS-prisverifieringen och källkorrigeringen är fortfarande lokalt utvecklingsarbete. Ingen IAM-ändring, modellkörning, Supabase-skrivning, produktionsrelease eller aktivering av betald AWS-trafik.

## Verifierade fakta: AWS kredit

AWS Billing Console `Credits` lästes 2026-11-17 i den auktoriserade inloggade sessionen.

- En **AWS Activate – FOUNDERS**-kredit med `Active` status.
- Visad utgiven summa och återstående saldo: **USD 1 000**.
- Visat förbrukat och uppskattat förbrukat: **USD 0**.
- Start: 2026-11-01. Förfall: **2028-11-30**.
- Via kreditens **See complete list of services** verifierades att **Amazon Bedrock**, **Amazon Bedrock Service** och **AmazonBedrockFoundationModels** förekommer i listan för denna kredit.
- Visad saldostatus och uppskattad debitering kan uppdateras med fördröjning. Detta är **inte** bevis för att varje modell, tredjepartsleverantör, Marketplace-faktura, modalitet, konto eller faktureringstyp omfattas.
- Kreditbeloppet är endast en observation i detta dokument; krediten används **inte** i prismatrisen, i kod eller som rabatt vid budgetreservation. Uppdatera kontots kreditsida vid framtida verkligt beslut.

Källa: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html

## Verifierade fakta: prisregler

- Officiell AWS Bedrock-prissida beror på **provider/modell, modalitet, tier och region**. Inga allmänna USD-per-token-värden gäller alla profiler.
- AWS beskriver att geografisk och global cross-Region inference normalt prissätts från **källregionen**, med särskilda möjliga globala prisnivåer per modell. Detta innebär inte att geoprofilens SKU är verifierad enbart från en in-Region-prisrad.
- Efter initiala tredjepartsreferenser hämtades AWS:s **officiella publika AmazonBedrock Bulk Price List** direkt från `pricing.us-east-1.amazonaws.com`. Regionfilen publicerades `2026-11-11T01:30:37Z` och innehåller 1 082 produkter. De åtta exakta Standard-in-/ut-token-SKU:erna för Nova Micro, Lite, Pro och Premier har kontrollerats och priserna stämmer med referensvärdena. Offentligt SKU-underlag är dock **inte ett personligt avtals-/fakturapris**, inte en modellversionsspecifik Runtime-entitlement och inte tillräckligt för budgetfrisläpp. Vid avvikelse är AWS tjänstens prissida auktoritativ.
- Officiellt Bedrock-modellkort anger att **Nova Premier är Legacy** och har EOL-datum 2026-09-14. En fortfarande synlig eller ACTIVE inference profile får därför inte användas som bevis för framtida lämplighet eller genomförbarhet.

Källor:
- https://aws.amazon.com/bedrock/pricing/
- https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/price-changes.html
- https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/20261111013037/us-east-1/index.json
- https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-premier.html

**Price List-receipt:** `formatVersion=v1.0`, `publicationDate=2026-11-11T01:30:37Z`, alla åtta tokenprisvillkor `effectiveDate=2026-11-01T00:00:00Z`, `currency=USD`, `unit=1K tokens`, erbjudandets SHA-256 `F1AC6A175FB27B3AD80D2C5D8970BE8C2E5F957906349E52D15EC11D43E97896` (1 490 454 byte). 1K-token-priser multiplicerade med 1000 för USD/1M.

## Indikativa prisobservationer (ej aktiverande)

Per 1 miljon TEXT-token, USD, `us-east-1`, Standard, in-Region/direct i den **officiella offentliga prislistan**:

| AWS produktmodell | Omnira Runtime-ID (separat katalogkoppling) | Input USD/1M | Output USD/1M | Input-SKU | Output-SKU |
| --- | --- | ---: | ---: | --- | --- |
| Nova Micro | `amazon.nova-micro-v1:0` | $0.035 | $0.14 | `XAR69MSGZSU6FEM9` | `YUSGHKDUPQRC75RK` |
| Nova Lite | `amazon.nova-lite-v1:0` | $0.06 | $0.24 | `QRGWJ3P8FT28EYX2` | `CBZ6A6U7XK8WJ3KA` |
| Nova Pro | `amazon.nova-pro-v1:0` | $0.80 | $3.20 | `8X836UXRHN5Q5T2H` | `ARFVY95XGU794VBG` |
| Nova Premier (Legacy) | `amazon.nova-premier-v1:0` | $2.50 | $12.50 | `AMYWX642VPHEKDZE` | `6QAAYR5SSN69NABR` |

**Viktig begränsning:** AWS:s pris-SKU anger modellfamiljen (t.ex. `Nova Micro`), inte det exakta Runtime-modell-ID:t med `:0`. Vi kan verifiera officiella prisrader per familj, region och standardenhet men **inte utan vidare påstå personligt kontopris, versionsspecifik modellåtkomst eller priskorrekthet för profilanrop**. Inget får skrivas till `cost_rates`, aktivera betald trafik eller bli ett hårt budgettak utan separat verifiering. Geografisk/global routing, cache, batch, video, bilder, ljud och andra prisnivåer förblir oprissatta i denna kalkylator.

Exempelscenario, 10 000 input + 2 000 output token (brutto utan krediter):
- Nova Micro $0.00063
- Nova Lite $0.00108
- Nova Pro $0.0144
- Nova Premier $0.05 (**Legacy-hold**)

Beräkningsskalan är för **scenarier**, inte en övre gräns för faktiska anrop. Den kan inte användas för kostnadsspärrar.

## Lokalt kodarbete

- `apps/web/lib/ai/model-control/bedrock-price-advisory.ts` är en **pure** och effektfri referensprisbok + scenariokalkylator som nu använder AWS:s officiella, publicerade SKU-identifierare, `sourceModelAttribute`, publicerings- och giltighetsdatum. `publicSkuRatesVerified=true` gäller **endast offentliga SKU-priser**; `exactRuntimeVersionPriceVerified=false` och `accountRateVerified=false` gäller fortsatt. Alla beräkningar returnerar `canDispatch=false`, `hasHardCeiling=false`, `liveAccountPriceVerified=false`, `fxRatePinned=false`, `canonicalBudgetReserved=false` och `creditDeductionUsd=0`.
- Både modell-ID, källregion, Standard-tier, direkt körväg och textmodalitet måste matcha en **exakt** referensrad; inga generiska prisfallbacks tillåts. Felaktiga token, borttappade versioner och geo/global pricing avvisas som `unpriced`. Även ett injicerat kreditsaldo får aldrig sänka bruttopriset.
- `apps/web/app/model-control-preview/bedrock-price-advisory-panel.tsx` visar de fyra referenspriserna, deras daterade källor och en **interaktiv, ej-körande scenariojämförelse** med 0–1 miljon input-/output-token vardera. UI redovisar att uppgifterna inte är verifierad rate-/budget- eller behörighetsevidens.
- Omniras befintliga `lib/cost/governed-spend.ts`, `spend-ceiling.ts`, `budget-gate.ts` och `MODEL_PRICING` har inte ändrats. Den tidigare godkända Nova Micro-piloten är oförändrat avstängd och inte ansluten till generell Atlas routing.

## Fortsatta blockerare inför verkliga betalda anrop

1. AWS:s **officiella standard-SKU-priser för fyra Nova-familjer i us-east-1** är nu verifierade i en daterad Bulk Price List-snapshot. Återstår: validera koppling till exakt Runtime-version, profilens kommersiella pris och andra eventuella avgifter, kontovillkor, kontextfönster, modalitet, prisklass och källregion mot AWS tjänstens prissida. Om någon uppgift inte går att förena: **fail closed**. Varken standard-SKU eller äldre tredjepartspris räcker för en verklig körgräns.
2. Verifiera per modellversion att avtalsstatus och profilroutning gäller avsedd **runtime-roll**; katalogrollens läsmetadata är inte samma sak.
3. Granska EU-/US-datahantering med konkreta destinationsregioner och regler; inga globala destinationsprofiler per default.
4. Fastställ verifierad USD→SEK-rate med giltighetsperiod och valutabuffert. Den befintliga `getRates()` har en fallback `usd_sek=10.5` i kod, vilket är en **teknisk fallback**, inte ett här verifierat aktuellt marknadspris.
5. Koppla framtida produktionsanrop till **det befintliga** `withGovernedSpend`, `tokenWindowCeiling`, `H1_SPEND_GATE`, STOP, projektidentitet och settlement. Bruttokostnad före krediter, verifierat maximalt tokenfönster och output-cap måste vara bevisat innan reservation. Om adapter ger en större möjlig faktura än reserverat belopp: vägra.
6. Separat, uttryckligt beslut om maximal kostnad och personligt godkänd faktisk pilotkörning, även om AWS krediter finns. Ingen automatik eller blanketträtt för alla modeller.

## Publiceringsavgränsning

Den tidigare godkända vanliga Git-pushen av `4b403ca` till befintlig Preview-gren har genomförts och Vercel byggde den som READY. Den kompletterande offentliga SKU-verifieringen ovan är **ännu inte pushad**. Fortfarande **ingen ny IAM-grant, Vercel-variabel, betald trafik eller produktion**. Ingen merge eller automatisk Runtime-aktivering ingår.
