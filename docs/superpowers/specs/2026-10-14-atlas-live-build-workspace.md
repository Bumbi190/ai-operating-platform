# Atlas: byggvy med preview och feedback under arbetet

Status: föreslagen design för granskning. Ingen runtime/UI implementerad genom detta dokument.

## Användarens mål

André vill att Atlas ska bygga hemsidor från idé till färdig produkt, visa resultatet i ett previewfönster inne i Omnira och kunna ta emot text eller tal medan bygget pågår. Han ska snabbt kunna säga att något inte känns rätt eller ska läggas till, se att Atlas har förstått det och se förändringen i nästa version.

## Grundad nulägesbild

Designkunskapen är implementerad i draft-PR #332, men inte aktiverad på main. Preview av den PR:n blockeras av organisationens medlemskapsmigration i separat #331.

Det finns idag ingen byggsession eller webbpreview i kodarbetsvyn. Befintlig CodeWorkDetail visar ett begränsat kontrollplan med status och kvitton. SDF-kodarbetskontraktet tillåter begränsade filoperationer och har en worker utan generell shell-/verktygsåtkomst. Den befintliga chattkomponenten har ingen verklig stopphandling för en pågående modellbegäran. Att bara lägga dit en iframe eller en aktiverad stoppknapp skulle därför inte uppfylla målet.

Röstfunktioner finns i Omnira, men samtidigt röstsamtal och byggstyrning i en versionsbunden session är inte verifierat.

## Alternativ

1. Rekommenderat: separat projektbunden byggsession med stabila previewversioner och en feedbackkö. Chatten är en styrkanal; byggjobbet fortsätter separat.
2. Enbart iframe bredvid dagens chatt: enklare UI, men saknar byggmotor, versionskoppling och säker feedback under arbetet. Uppfyller inte målet.
3. Full generell utvecklingsmiljö direkt: stödjer fler appar, men kräver ännu mer integration av dependencies, sandbox, workerverktyg och deployments. Senare utökning.

## Första leveransens produktomfattning

Börja med riktiga statiska webbplatser i HTML/CSS/JavaScript, utan krav på npm-installation för varje genererad sida. Den första leveransen ska kunna skapa flera sidor, mobilmeny, grundläggande interaktioner, riktiga texter och ett exportbart sidpaket från en brief. Funktioner som behöver backend, betalning eller verklig formulärleverans måste beskrivas som separat integration; en visuell form får inte visas som levererande om den inte skickar någonstans.

Detta är ett föreslaget första steg, inte ett redan beslutat byte av användarens befintliga Next.js-projekt. Förbättring av befintliga appar kräver respektive repos etablerade teknik och en senare adapter.

## Arbetsvyn

På desktop visas Atlas-konversationen till vänster och preview till höger, med justerbar bredd. Mobil har tydliga flikar för Preview och Atlas; byggjobb och meddelanden fortsätter även när användaren byter flik.

Preview har sidväljare, mobil-/desktopbredd, aktuell version, senaste uppdatering och en lista med tidigare versioner. Visa senaste fungerande version medan nästa byggs. Om nästa version misslyckas ligger förra kvar med en tydlig fel-/arbetsstatus; visa aldrig en gammal version som den nya.

En enkel statusrad anger det verkliga steget: skapar första utkast, tillämpar feedback, kontrollerar funktioner eller väntar på beslut. Publicerad och preview är separata tillstånd.

## Samtidig text och röst

Byggjobbet ska ligga i en separat varaktig körning. Användaren måste kunna fortsätta prata eller skriva utan att en lång byggbegäran låser chatten.

Återanvänd Omniras tal-till-text för ett meddelande i taget. Visa transkriptionen så att fel går att rätta innan instruktionen skickas. Atlas kan läsa sitt svar med befintlig röstfunktion. Kontinuerlig full duplex-konversation är inte ett löfte i första leveransen.

En stängd mikrofon eller avbruten uppläsning stoppar inte bygget. Pausa bygge, Fortsätt och Avbryt är separata kontroller med verklig serverkvittens. En paus ska observeras innan nästa byggsteg; en redan startad extern begäran får inte påstås vara återkallad om det inte är bevisat.

## Feedbackkontrakt

Varje feedback får ett stabilt id, sessionId, projectId, authorId, text, inputSource (text/voice), den previewrevision användaren såg och ett tidsstämplat tillstånd: received, acknowledged, applied, rejected eller superseded.

Atlas återger sin tolkning kort. UI skiljer mellan mottaget, förstått och utfört; ett vanligt chatsvar är aldrig bevis för att ändringen är tillämpad.

Byggaren hämtar väntande feedback vid säkra stegränser och binder den till nästa revision. Kvittensen applied måste referera till just den nya artifactrevisionen. Feedback får inte försvinna vid reload, reconnect, retry eller återupptagen worker. Dubbelsändning med samma idempotency key får bara skapa ett meddelande.

Om två instruktioner motsäger varandra markerar Atlas vad som ersätts eller begär ett beslut när innebörden är oklar. En tydlig senare korrigering av samma detalj ersätter den äldre. Ändringar som utökar verktygs-, kostnads-, projekt- eller publiceringsbehörighet ska gå genom befintlig beslutsgrind.

## Versions- och körningsmodell

BuildSession binder projekt, användare, brief, tillåten omfattning, konversation och varaktig körning. PreviewRevision är oföränderlig och binder sidpaketets hash till den brief-/feedbackversion som faktiskt användes. En session har högst en arbetande writer med lease/fence, så en gammal worker inte kan publicera en revision efter avbrott eller ny claim.

Sessionens arbetsstatus är fristående från activePreviewRevisionId. UI kan därmed visa revision 2 samtidigt som revision 3 byggs. Ett sent resultat från revision 1 får aldrig skriva över revision 2.

Använd befintlig run-/governancekedja för modellkostnad, stoppar och projektisolering. Lägg en tydligt deklarerad website-generation-adapter för validerade sidpaket, inte en generell shell-/nätverksbehörighet på Atlas. Källfiler och previews ska vara verifierbara artifacts, inte enbart text i konversationen.

## Previewisolering

Genererad HTML/JS är otillförlitligt innehåll. Visa sidpaketet i en sandboxad iframe med opaque origin, utan åtkomst till Omniras cookies, DOM eller autentiserade API:er. Tillåt interaktioner inne i preview men inte top-navigation, popups, Omnira-inloggning eller godtyckliga nätverksanrop. Alla artifactläsningar och assets måste godkännas för rätt projekt/session. Ingen användarangiven preview-URL får laddas utan validering.

Första versionen kan rendera validerade statiska artifacts lokalt i iframe utan en ny extern hostingtjänst. Preview kan alltså finnas innan offentlig publicering. Export ska ge den verkliga versionens filer. Publik deployment är en separat åtgärd med verifierad URL och livekontroll.

## Uppdateringar och acceptans

Initialt räcker polling var tredje sekund för sessionstatus, nya revisioner och feedbackkvittens. Visa reconnect/statusfel ärligt; ett trasigt statusanrop är inte ett färdigt bygge.

Första riktiga beviset ska vara: starta ett hemsidejobb från en brief, se preview revision 1, skicka en textändring medan nästa steg pågår, se acknowledgement och revision 2 med rätt förändring, sedan ge en röständring via transkription och se revision 3. Reload får inte tappa feedback eller jobb.

Testa att gammal worker/fel projekt/okänd artifact nekas, att replay inte dubblar feedback, att en misslyckad revision inte ersätter fungerande preview, samt att paus och avbrott får riktiga kvittenser. Browser-test ska täcka desktop och mobil och kontrollera att genererad kod inte når Omniras session eller parent-DOM.

## Genomförandeordning

1. Tillåtna webb-artifacts, varaktig byggsession, revisioner och feedbackkontrakt.
2. Körbar statisk webbbyggare med befintliga kostnads-/projektgrindar och verklig första artifact.
3. Arbetsvy med preview, textfeedback och versioner.
4. Röststyrning, serverkvitterad paus/avbryt och browserverifiering.
5. Separat publiceringsadapter och stöd för befintliga app-repos.

Design- och implementationsplan behöver granskas innan runtimeändringar. PR #331/#332 behöver integreras/previewverifieras innan detta kan aktiveras i samma produktionskedja. The Prompts medieanalys och publicering är ett eget arbete och ska inte döljas bakom färdigstatus för denna byggvy.
