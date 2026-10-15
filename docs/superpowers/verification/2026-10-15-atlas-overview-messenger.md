# Översikt och kompakt Atlas-chatt — verifiering

Arbetsgren: `codex/atlas-overview-messenger-20261015`.
Bas: `605cc176dcdd60cae0c45b90947c84ce279b5d8a`.
Arbetet startade 2026-10-15; verifieringen fortsatte 2026-10-16, Europe/Stockholm.
Status: funktionerna är implementerade och riktad acceptans är körd. Oberoende granskning och helsvitens jämförelse slutförs före draft-PR. Ingen merge eller produktionsaktivering.

## Levererat beteende

- Ägarens startsida är Översikt, med 7/30 kalenderdagar i Stockholm, registrerad AI-kostnad, körningar och projektkort. Atlas har kvar sin egen sida och menypunkt.
- Den extra bygglänken ovanför Atlas är borttagen. Byggflödet ligger kvar i ordinarie navigation.
- Den runda knappen öppnar en liten textchatt. Panelen har endast skicka, samtal/lägg på och minimera som ordinarie kontroller.
- Textvägen använder samma controller som fullchatten, utan STT/TTS. Minimering, vanliga länkar och periodbyte bevarar utkast och svar.
- Första konversationens skapande markeras som pågående även efter återöppning. Explicit trådbyte släpper den gamla trådens sändlås och sena svar/fel påverkar inte den nya panelen.
- Utloggning rensar konversation, panelutkast och koordinater. Chatttext skrivs inte till panelens lokala lagring.
- Dolda byggreferenser utesluts uttryckligen. Texten ”jag godkänner” kan inte i den kompakta vägen godkänna en plan som inte visas.
- Översiktens serverläsare verifierar färskt ägarscope före alla aggregeringar. Arkiverade och raderade projekt undantas; läsfel/ofullständiga sidor visas inte som verifierad nolla.

## Riktade kontroller

| Kontroll | Resultat |
| --- | --- |
| Playwright, desktop 1280/1920 och mobil 390, samma konversation i riktig fullchatt/Atlas-yta | 24/24 passerar |
| Enhetstester för controller, geometri, datamodell, perioder, rendering, navigation och auth | 283 passerar; 1 befintligt fel nedan |
| Verklig POST /api/chat med mockad provider och separat lokal SQL-testdatabas | 1/1 vald säkerhetsregression passerar, 8 andra tester ej valda |
| TypeScript, samma lokala beroenden före/efter | Samma 3 befintliga fel i lib/media/lambda-render.ts; inga nya |
| ESLint med installerad Next core-web-vitals-konfiguration på ändrade kodfiler | 0 fel; 2 befintliga runtime-varningar |
| git diff --check | Passerar |

Det riktade kvarvarande felet är `breadcrumbs · accessibility uses semantic breadcrumb markup`. Dess källkodstest kräver att aria-label kommer direkt efter nav-taggen och fallerar även på den oförändrade basen. Breadcrumb-komponentens markup ändras inte i denna gren.

TypeScript-felen är TS2307 för `@remotion/lambda/client` på rad 21 och TS2339 för `region` på rad 50 och 90 i samma befintliga fil, med de återanvända lokala beroendena. Riktad lint lämnar de två befintliga react-hooks/exhaustive-deps-varningarna i runtime.tsx.

Standardkommandot `npm run lint` vill konfigurera ESLint även på basen. Verifieringen använder därför en isolerad konfiguration med den redan installerade Next core-web-vitals-presetsen; ingen ny global lintpolicy eller något produktberoende har lagts till.

### Bygggrindens bevis och gräns

Testet skapar en riktig väntande plan i en egen lokal testdatabas, skickar ”jag godkänner” och ”starta bygget nu” utan synlig planreferens genom den autentiserade chat-route som används i produkten, och låter den mockade modellen föreslå byggverktyget. Båda får det uttryckliga avslaget `PLAN_REVIEW_REQUIRED`; beslut och byggsessioner förblir noll. Inga betalda provideranrop görs.

Controller-testet innehåller både en dold plan och en dold byggsession. En temporär mutation som ändrar buildContext från null till undefined ger det avsedda testfelet; återställd kod passerar. Mutationen ingår inte i grenen.

Den befintliga bredare SQL-byggsviten har separata baslinjefel (BUILD_UNAVAILABLE, kvitto för synligt godkännande och en femsekunderstimeout i den lokala fixturen). Denna ändring gör inget påstående om att hela byggflödet är grönt.

## Helsvit mot samma bas

Körmiljö: Node 22 bookworm, samma befintliga Linux-beroenden, två workers, högst två CPU-kärnor och 3 GiB, nätverk avstängt. Inga API-nycklar eller lokala produktionsmiljöfiler kopieras till körningen.

| Snapshot | Pass | Fail | Pending |
| --- | ---: | ---: | ---: |
| Bas 605cc176 | 12 578 | 251 | 1 202 |
| UI-gren | Jämförelse pågår | Jämförelse pågår | Jämförelse pågår |

Basens fulla körning rapporterade 14 035 tester och tog cirka 12 minuter. Helsviten är redan röd på basen. Slutliga differenser och namngivna fel sparas tillsammans med detta dokument när kandidatens körning är färdig.

## Browserbevisets räckvidd

Riktiga produktkomponenter körs i en separat localhost-fixtur med mockad auth, router, chat-API och mikrofon. Översiktens browserdata är uttryckliga testdata; servermodellens ägarscope testas separat med en läsare som kan lämna främmande rader om filtrering saknas.

Detta verifierar rendering och interaktion, inklusive IME, Skift+Enter, dubbeltryck, dragning, zoom, simulerat skärmtangentbord, nekad mikrofon, trådbyte och utloggning under väntande svar. Det verifierar inte ett riktigt röstsamtal med fysisk mikrofon eller alla mobila tangentbord. Inga skarpa modell- eller bildanrop har gjorts.

## Så provar André efter aktivering av denna gren

1. Logga in som ägare: Översikt ska vara startsidan. Välj 7/30 dagar och öppna ett projekt.
2. Klicka på den lilla runda Omnira-symbolen. Skriv utan mikrofon; minimera och öppna igen.
3. Dra via överkanten på dator. Skriv ett utkast och byt vanlig sida: utkastet ska finnas kvar.
4. Atlas i menyn öppnar Atlas egen yta; Chat öppnar den befintliga fullchatten.
5. Samtalsknappen är valfri. Nekad/saknad mikrofon ska lämna text användbar.

Den befintliga minnespiloten och port 3015 är oförändrade och ingår inte i den här aktiveringen. Den andra konversationens bygggren, modellval och budget är orörda.

## Beslut under genomförandet

Fylls från körningsloggen före slutleverans, tillsammans med slutgranskningens eventuella fynd.
