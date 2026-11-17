# Omnira AWS – fas 4 · kostnadsevidens och kredithantering utan modellkörning

Datum: 2026-11-17 · Europe/Stockholm
Repo: Bumbi190/ai-operating-platform
Existerande branch: `feat/omnira-bedrock-pilot-20261116`
Förälder: `1fded2819e27118a98228fdb14e6ace153fadb53`
Status: **lokal förberedelse / ingen IAM-ändring, modellkörning, Supabase-skrivning eller aktivering av betald AWS-trafik**.

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
- Den officiella prissidan visar inte Nova-underlagets faktiska prisrader i vår textbaserade webbinspektion (dynamiskt renderat). Vi klassar därför **ALLA** nedanstående priser som **sekundära referensobservationer**, inte som fakturaverifierade AWS Price List-API-snapshots.
- Officiellt Bedrock-modellkort anger att **Nova Premier är Legacy** och har EOL-datum 2026-09-14. En fortfarande synlig eller ACTIVE inference profile får därför inte användas som bevis för framtida lämplighet eller genomförbarhet.

Källor:
- https://aws.amazon.com/bedrock/pricing/
- https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-premier.html

## Indikativa prisobservationer (ej aktiverande)

Per 1 miljon TEXT-token, USD, `us-east-1`, Standard, in-Region/direct:

| Exakt modell-ID | Input | Output | Observation | Source |
| --- | ---: | ---: | --- | --- |
| `amazon.nova-micro-v1:0` | $0.035 | $0.14 | 2026-10-20 | https://www.modeleol.com/pricing/amazon |
| `amazon.nova-lite-v1:0` | $0.06 | $0.24 | 2026-10-20 | https://www.modeleol.com/pricing/amazon |
| `amazon.nova-pro-v1:0` | $0.80 | $3.20 | 2026-10-20 | https://www.modeleol.com/pricing/amazon |
| `amazon.nova-premier-v1:0` | $2.50 | $12.50 | 2026-10-31 | https://instances.usage.ai/ai/nova-premier |

**Viktig begränsning:** Dessa observationer från tredjepartskällor får inte märkas `verified` i produktion, skickas till `cost_rates`, användas som nytt hårt budgettak eller tillåta modellkörning. Inget annat prisläge, inbyggt verktyg, cache, batch, video, bild, ljud eller profil är prissatt.

Exempelscenario, 10 000 input + 2 000 output token (brutto utan krediter):
- Nova Micro $0.00063
- Nova Lite $0.00108
- Nova Pro $0.0144
- Nova Premier $0.05 (**Legacy-hold**)

Beräkningsskalan är för **scenarier**, inte en övre gräns för faktiska anrop. Den kan inte användas för kostnadsspärrar.

## Lokalt kodarbete

- `apps/web/lib/ai/model-control/bedrock-price-advisory.ts` är en **pure** och effektfri referensprisbok + scenariokalkylator som alltid returnerar `canDispatch=false`, `hasHardCeiling=false`, `liveAccountPriceVerified=false`, `fxRatePinned=false`, `canonicalBudgetReserved=false` och `creditDeductionUsd=0`.
- Både modell-ID, källregion, Standard-tier, direkt körväg och textmodalitet måste matcha en **exakt** referensrad; inga generiska prisfallbacks tillåts. Felaktiga token, borttappade versioner och geo/global pricing avvisas som `unpriced`. Även ett injicerat kreditsaldo får aldrig sänka bruttopriset.
- `apps/web/app/model-control-preview/bedrock-price-advisory-panel.tsx` visar de fyra referenspriserna, deras daterade källor och en **interaktiv, ej-körande scenariojämförelse** med 0–1 miljon input-/output-token vardera. UI redovisar att uppgifterna inte är verifierad rate-/budget- eller behörighetsevidens.
- Omniras befintliga `lib/cost/governed-spend.ts`, `spend-ceiling.ts`, `budget-gate.ts` och `MODEL_PRICING` har inte ändrats. Den tidigare godkända Nova Micro-piloten är oförändrat avstängd och inte ansluten till generell Atlas routing.

## Fortsatta blockerare inför verkliga betalda anrop

1. Hämta signerbar/daterad **exakt** AWS prislistesnapshot per modell-ID, Region, kontextfönster, modalitet, direkt eller geo/global profil, tier och cache/fasta verktyg. Om AWS Price List API och publicerad modellpristabell inte går att förena: **fail closed**. Tredjepartsreferenserna ersätter inte detta.
2. Verifiera per modellversion att avtalsstatus och profilroutning gäller avsedd **runtime-roll**; katalogrollens läsmetadata är inte samma sak.
3. Granska EU-/US-datahantering med konkreta destinationsregioner och regler; inga globala destinationsprofiler per default.
4. Fastställ verifierad USD→SEK-rate med giltighetsperiod och valutabuffert. Den befintliga `getRates()` har en fallback `usd_sek=10.5` i kod, vilket är en **teknisk fallback**, inte ett här verifierat aktuellt marknadspris.
5. Koppla framtida produktionsanrop till **det befintliga** `withGovernedSpend`, `tokenWindowCeiling`, `H1_SPEND_GATE`, STOP, projektidentitet och settlement. Bruttokostnad före krediter, verifierat maximalt tokenfönster och output-cap måste vara bevisat innan reservation. Om adapter ger en större möjlig faktura än reserverat belopp: vägra.
6. Separat, uttryckligt beslut om maximal kostnad och personligt godkänd faktisk pilotkörning, även om AWS krediter finns. Ingen automatik eller blanketträtt för alla modeller.

## Publiceringsavgränsning

Denna fas innehåller **ingen ny IAM-grant, ingen ny Vercel variabel, ingen betald trafik och ingen produktion**. En eventuell vanlig Git-push till den redan aktiva Preview-grenen hanteras separat från lokal test/commit; ingen merge eller automatisk runtimeaktivering ingår.
