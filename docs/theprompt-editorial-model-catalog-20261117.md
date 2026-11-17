# The Prompt – modellval per redaktionell agent (17 november 2026)

## Målet: rätt modell för varje jobb, inte en enda global modell
Systemet ska kunna utvärdera **alla relevanta modeller som faktiskt stöds** av AWS Bedrock och de övriga leverantörer Omnira är ansluten till, inklusive nya modeller som tillkommer över tid. Katalogupptäckt, modellval, kontobehörighet, verifierad kvalitet och rätt att göra faktiska API-anrop är FEM olika saker.

Den första isolerade Preview-väljaren är nu på förslagsnivå och innehåller fem startkandidater:
- Amazon Nova Micro på Bedrock: kategorisering och enkla sammanfattningar, **endast ett Preview-smoketest verifierat**.
- Amazon Nova Lite på Bedrock: kandidat för källkontext/sammanfattning. **AWS-rollens åtkomst och korrekt pris EJ verifierade**.
- Amazon Nova Pro på Bedrock: kandidat för längre resonemang och oberoende faktakontroll. **AWS-rollens åtkomst och korrekt pris EJ verifierade**.
- Claude Sonnet 4.6 genom Omniras befintliga Anthropic-API: kandidat för långform och källnära redigering. Befintlig provider-kod är inte bevis för att hela det nya flödet har aktiverats.
- GPT-5.4 Mini via Omniras befintliga OpenAI-API: kandidat för enkel analys/kontroll. Inte godkänd som oberoende högnivågranskare utan separat kvalitetsmätning.

UI-valen på /bedrock-daily sparas **inte** i DB, startar inga modeller, påverkar inga artikeljobb och ger inga nya IAM-rättigheter. Den sjätte rollen "publiceringsansvarig" är ingen AI-modell alls: den ska bara verkställa verifierade beslut och auktorisation.

## Medveten skillnad mot Atlas kodrouter
Omnira har redan apps/web/lib/atlas/model-router (pure advisory candidate selection för kod/lokalmodeller). Katalogen är inte en API-dispatcher och har inga automatiska körbehörigheter.
Redaktionsväljaren apps/web/lib/article/daily/model-choice.ts använder samma säkerhetsprinciper men egna uppgiftskriterier: källbevis, originalitet, långformskvalitet och granskning av oberoende modellfamilj. Vi ändrar INTE existerande SDF-1A/code-worker-behörigheter.

## Regeln för framtida faktisk modellrouting
1. Läs Bedrocks **fullständiga aktuella** katalog via control-plane API: ListFoundationModels och ListInferenceProfiles i relevant region. Stöd även aktuella endpoints och API-kompatibilitet; på AWS Bedrock är modell-ID och inference-profile-ID ibland olika.
2. Spara discovered metadata (modell, tillverkare, region, modalitet, supported APIs, profile, lifecycle), men märk **entitlement=okänd** tills AWS-kontots riktiga behörighet och avtal är kontrollerade. Inget API-katalogresultat ensamt ger AWS-krediter eller körbehörighet.
3. Kostnadsprofil måste verifieras från relevant publicerad prislista, region, endpoint, eventuell profil och krediternas faktiska faktura; en okänd modell får ALDRIG få ett syntetiskt Sonnet-pris eller en gissad maxkostnad.
4. Kör test i isolerad Preview efter separat explicit godkännande, tillfälliga OIDC/STS-credentials och exakt IAM-allowlist för modellen. Inga wildcard-rättigheter, Marketplace-autosubscriptioner eller okontrollerade provisionerade abonnemang.
5. Mät kvalitet mot verkliga redaktionella testfall (nyheter, externa fakta, datum, citat, originalitet, hallucinationer, svenska/engelska). Avgör miniminivå per roll. Varje automatisk modellbytesregel kräver färskt testbevis och giltig budget-/STOP-auktoritet.
6. Val av skribent och faktagranskare måste beakta **underliggande modellfamilj**, inte bara om leveransen sker via Bedrock eller separat leverantör. Två Claude-varianter via olika endpoints är inte oberoende granskare.
7. Publicering avsiktligt avstängd. Behörig operatör eller separat tids-, budget-, projekt- och kanalbegränsad autonomilicens krävs för webbsajtsskrivning.

## Återstående arbete för att nå 'alla modeller'
Katalogen i denna första Preview är bara fem tydligt markerade kandidater, INTE alla hundratals Bedrock-modeller och INTE alla som kontot får anropa. Nästa steg är en **separat, skrivskyddad katalogintegration** med IAM-rättighet för ListFoundationModels/ListInferenceProfiles, och en verklig account-/region-/pricingkontroll. Ge inte existerande previewmodellers InvokeModel-policy breda rättigheter bara för att upptäcka modellen.

## Referenser
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/models-get-info.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html

Status: rådgivande, inga faktiska Bedrock-anrop, inga nya API-nycklar, inga ändringar i main eller livepublicering.
