# Översikt och kompakt Atlas-chatt

Datum: 2026-10-15
Status: godkänd design; implementerad och verifierad i egen gren. Ingen produktionsaktivering.
Arbetsgren: `codex/atlas-overview-messenger-20261015`
Utgångspunkt: main `605cc176dcdd60cae0c45b90947c84ce279b5d8a`.

## 1. Syfte och beslutad riktning

André vill ha en startsida som ger överblick över hans projekt och en separat sida för Atlas. Atlas ska dessutom vara tillgänglig från andra sidor i en liten flyttbar chatt, liknande ett Messenger-fönster. Text måste fungera utan mikrofon.

Sidstrukturen godkändes i samtalet och preciserades den 15 oktober klockan 22:35: en liten rund Omnira-ikon, huvudsakligen meddelanden och skrivfält, och endast tre ordinarie kontroller: skicka, starta/avsluta samtal och minimera.

Vi använder befintlig konversationscontroller och röstruntime. Det bevarar samma historik, serverkontroller och strömningskontrakt. En separat chattklient skulle ge större UI-isolering men kräva ytterligare synkronisering av dessa delar. Ingen ny modellleverantör eller chatt-API införs.

## 2. Sidstruktur och navigation

| Yta | Ansvar |
| --- | --- |
| Översikt, `/dashboard` | Startsida med projektstatus, kostnadsgraf, körningsgraf och sådant som kräver uppmärksamhet. |
| Atlas, `/atlas` | Atlas befintliga identitet och egen arbetsyta för text och röst. |
| Chat, `/chat` och befintliga konversationer | Historik och större textkonversationer behåller sina adresser. |
| Bygg med Atlas, `/build` | Befintligt byggflöde ligger kvar i vänstermenyn. |
| Rund Atlas-knapp | Öppnar den kompakta chatten på övriga arbetsytor. |

Översikt tillkommer i gemensam navigationsdefinition, mobilmeny, kommandopalett och brödsmulor. Atlas behåller en egen menypunkt. Startsökord som ”hem”, ”start” och ”översikt” ska leda till Översikt, medan ”Atlas” leder till Atlas.

Root och standarddestination efter inloggning leder till Översikt för den vanliga ägarvyn. En uttrycklig giltig returlänk behålls. Befintlig särskild landning och läsåtkomst för collaborator behålls; den nya översikten får inte öppna ägarens ekonomi för en collaborator. Varken UI-cookie eller en klientangiven roll ger behörighet.

Den extra bygglänken ovanför Atlas-ytan tas bort. Projektlistan med byggknappar i den äldre minnespiloten ska inte kopieras till denna gren.

Atlas-sidan använder befintlig stora identitet och ordinarie text-/röstfunktioner. Den kompakta chatten behöver inte visas ovanpå Atlas egen sida eller ovanpå en redan synlig fullständig Atlas-konversation. Dess tillstånd bevaras när den tillfälligt döljs av en sådan vy.

## 3. Den lilla runda knappen och chattrutan

### Stängd och minimerad

- Återanvänd den befintliga fyruddiga Omnira-symbolen i en rund knapp.
- Synlig ikon/knapp cirka 36–40 CSS-pixlar; träffytan minst 44 pixlar.
- Inget stort ansikte, inga extra etiketter och ingen kontinuerlig tung animation.
- Knappen utgår från befintlig hörnplacering och hålls åtskild från aktivitetsknappen.
- Klick öppnar textchatten och fokuserar skrivfältet. Det startar inte ett röstsamtal.
- Ett pågående röstsamtal kan visas med en diskret statusprick och tillgänglig etikett.

### Öppen på dator

Ett kompakt fönster, ungefär 340 pixlar brett och högst 480 pixlar högt, anpassas till det tillgängliga fönstret. Meddelandena får huvuddelen av höjden.

Överkanten är smal: liten rund Omnira-symbol och minimeringsknapp. Den är också dragyta. Ingen stor titel, extra verktygsrad, förstoringsknapp, felsökningsinformation eller snabbfrågor läggs i rutan.

Meddelandeytan visar användarens text och Atlas svar, med enkel visuell åtskillnad och säker befintlig text-/Markdown-rendering. Inga stora avatarer per meddelande. Tekniska verktygskort och latensvärden ska inte fylla den kompakta vyn.

Nederst finns ett skrivfält med två små ikonknappar: skicka och samtal. Fältet växer till högst tre rader och får därefter egen rullning. Enter skickar, Skift+Enter ger ny rad; pågående IME-inmatning får inte skickas av misstag. Dubbeltryck får inte skapa dubbla turer. Skicka är inaktiv när fältet är tomt eller ett svar redan behandlas.

Rutan kan dras via överkanten, inte via meddelanden eller skrivfält. Hela rutan hålls inom synligt fönster med minst åtta pixlars marginal. Den kläms tillbaka inom fönstret efter storleksändring, zoom eller ändrad skärmyta. En dragning får inte räknas som knapptryckning. Senaste position kan sparas som enbart UI-koordinater; innehåll och utkast sparas inte i sådan lokal lagring.

Minimera döljer rutan och lämnar den runda knappen. Meddelanden, pågående textsvar och oskickat utkast bevaras vid vanlig navigation och återställning. Minimering avslutar inte ett röstsamtal. Utkast och konversationstillstånd rensas vid utloggning enligt den befintliga controllergränsen.

### På mobil

Samma tre kontroller används i en rymlig panel som ryms inom den synliga skärmen. Ingen fri dragning krävs på mobil. Skrivfältet ligger ovanför skärmtangentbordet och hänsyn tas till safe-area. Det ska gå att läsa meddelanden utan att sidans bakgrund rullar oavsiktligt.

Alla ikonknappar får begripliga tillgängliga namn och synlig tangentbordsfokus. Minimering lämnar fokus på den runda knappen.

## 4. Text, röst och konversationsgränser

`AtlasConversationProvider` i det autentiserade skalet är fortsatt gemensam källa för konversationer, historik, strömning och pågående svar. Panelens öppet/minimerat-tillstånd och utkast behöver leva i det beständiga skalet, inte i en routelokal komponent.

Text från den kompakta chatten skickas som en uttrycklig texttur via befintlig controller, utan att anropa mikrofonaktivering, taligenkänning, TTS eller ljuduppspelning. Den nuvarande `AtlasRuntime.sendMessage` har en TTS-pipeline och ska därför inte okritiskt återanvändas som den tysta textvägen.

En konversation skapas först när användaren skickar sitt första meddelande eller uttryckligen startar ett samtal. Att öppna, flytta eller minimera rutan ska inte anropa en modell, skapa konversationer eller be om mikrofonåtkomst.

Samtalsikonen startar det befintliga röstflödet efter en uttrycklig handling. Under samtalet växlar samma knapp till lägg på. Saknad eller nekad mikrofon ger ett kort meddelande om att text fortfarande fungerar; inga falska ”lyssnar”-statusar eller återförsök i loop. Befintliga stopp- och generationskontroller för ljud behålls.

Konversationens projektbindning kommer från befintligt verifierat konversationstillstånd och serverdata. Att besöka en annan sida ändrar inte i tysthet konversationens projekt-ID. Vid behov anges projektet kort i text eller via ikonens tillgängliga beskrivning. Klientens vyinformation är fortsatt en ledtråd, aldrig åtkomstbevis.

Vanlig sidnavigation bevarar en pågående konversation. Om användaren uttryckligen väljer en annan konversation gäller controllerns befintliga generationsisolering; sena svar får inte hamna i fel tråd.

**Byggflödets beslutsgrind:** Controllern kan idag automatiskt fylla i referensen till en aktiv byggplan. Den kompakta chatten ska uttryckligen utesluta dold `visiblePlan` och `buildContext` vid vanliga textturer. Den får aldrig godkänna eller starta en byggplan som inte visas för granskning i rutan. När en sådan granskning behövs leder en kort textlänk till befintlig fullständig byggvy. Strukturerade bygggrindar och servervalidering behålls. Bygggrenen i den andra konversationen ändras inte här.

## 5. Översiktens data och grafer

Första versionen visar:

1. Projektkort med nuvarande projektstatus och länk till projektets befintliga sida.
2. AI-kostnader per dag under vald period, med jämförelse per projekt.
3. Antal körningar per dag, fördelade på deras nuvarande status.
4. Pågående körningar, fel senaste dygnet och väntande godkännanden.

Periodval är sju eller trettio kalenderdagar, med sju dagar som förval. Dagsgränser och visad tid använder Europe/Stockholm. Körningsgrafens dagar kommer från `runs.created_at`; den är ingen logg över historiska statusövergångar.

En separat servermodell för Översikt läser befintliga tabeller efter `auth.getUser()` och färsk `getAllowedProjectIds`. Ägarscope tillämpas före aggregation av `cost_events`, `runs` och godkännanden. Kostnadskällan är befintligt registrerad `cost_events.cost_sek`; grafen ska inte beräkna eller ändra modellpriser, reserver eller budgetar.

Läsfel, saknad datakälla och ofullständig paginering markeras som otillgängligt eller ofullständigt. De får inte visas som en verifierad nolla eller ett fullständigt totalbelopp. Verkligt tomma, lyckade frågor får däremot visa noll. Varje sammanställning visar uppdateringstid. Inga syntetiska produktionsserier eller påstådda livevärden.

Intäkts- och besöksgrafer ingår inte i första versionen. Inga nya integrationer, schemalagda insamlingar, AI-anrop, databasscheman eller löpande pollningsjobb införs för att fylla översikten.

## 6. Berörda komponenter och avgränsning

Navigation: `app/page.tsx`, `app/(platform)/dashboard/page.tsx`, befintlig rollmedveten landning, `lib/nav/registry.ts`, `vnext-nav.ts` och `legacy-nav.ts`.

Översikt: ny servermodell och fokuserade visuella komponenter, med befintliga projekt-, behörighets- och tillgänglighetsmönster från `lib/atlas/home-view-model.ts`.

Atlas: ta bort den extra byggingången från `AtlasHomeVNext.tsx`; behåll den egna Atlas-sidan.

Kompakt chatt: ersätt den röststartande klickhanteringen i `AtlasMiniOrb.tsx` med textöppning; återanvänd symbolen från `OmniraLogo`/`AtlasLauncherOrb`. Håll panel, positionering och beständigt UI-tillstånd i små separata moduler. Lägg inte hela fönsterlogiken i den redan stora `runtime.tsx`.

Samma konversationscontroller och röstruntime återanvänds med en uttrycklig tyst textväg och synliga godkännandegränser. Inget andra parallella system för samtal, historik eller modellspend skapas.

Minnespiloten och dess gränser stannar på `codex/atlas-openviking-integration-20261015`. Den lokala kopian på port 3015, dess API-budget och temperaturvakt ändras inte genom denna UI-design. Ingen merge eller produktionsaktivering ingår i designstadiet.

## 7. Godkännandekriterier och verifiering

- Tre ordinarie kontroller i den lilla chatten: skicka, samtal/lägg på, minimera.
- Rund kompakt Omnira-knapp och smal överkant; meddelanden och skrivfält prioriteras.
- Öppna och skicka text fungerar utan mikrofon och orsakar ingen STT/TTS eller ljuduppspelning.
- Starta samtal är uttryckligt; mikrofonfel lämnar text fullt användbar.
- Minimering och vanlig navigation bevarar utkast, svar och samtal; utloggning rensar dem.
- Dragning, ändrad fönsterstorlek och mobilens tangentbord lämnar rutan åtkomlig.
- Samma konversation visas i kompakt och fullständig chatt; inga dubbla API-anrop eller förlorade strömningsdelar.
- En dold byggplan kan inte godkännas eller startas från den kompakta chatten.
- Översikt och Atlas nås separat via konsekvent navigation och giltiga gamla länkar.
- Grafer och totaler innehåller enbart behöriga projekt och rätt tidsperiod; saknade data skiljs från noll.
- Collab-läsning, projektisolering, strukturerade godkännanden och befintlig budgetstyrning får inga nya befogenheter.
- Browserkontroller på mobil, vanlig dator och bred skärm verifierar layout, tangentbord och position. Mockad mikrofon bevisar felhantering men ska inte rapporteras som ett verkligt röstsamtal.
- Riktade komponent-/controller-/behörighetstester, typkontroll, lint och jämförelse mot samma baslinje körs vid implementation. Inga betalda modell- eller bildanrop behövs för att verifiera UI-designen.

## 8. Nästa granskningssteg

Ägaren granskar detta dokument med den senaste preciseringen av den lilla chatten. Därefter tas den skriftliga implementationsplanen fram enligt den valda Superpowers-processen. Ingen produktkod eller installation av produktberoenden har genomförts i designstadiet.
