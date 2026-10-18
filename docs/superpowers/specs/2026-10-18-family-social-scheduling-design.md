# Familje-Stunden: granskade veckobatcher och verifierbara publiceringskvitton

Datum: 2026-10-18
Status: tekniskt designförslag för ägarens granskning. Ingen implementation eller aktivering ingår i denna commit.
Baslinje: Bumbi190/ai-operating-platform, main f0a52321361b7f1a03d5336cbd7a5c8c4d769ac5.

## 1. Avsikt och avgränsning

André vill få organisk trafik till Familje-Stunden genom faktiska aktiviteter och sagoglimtar med Nova och Pling. Han ska kunna granska flera inlägg tillsammans och sedan låta Atlas verkställa dem utan att hålla en webbläsare eller chatt öppen.

Vald riktning är samlad veckogranskning. Alternativen godkännande per enskild publicering och fri, ogranskad löpande produktion har presenterats. Ogranskad publicering ingår inte.

Denna specifikation omfattar säkra kvitton, exakt avgränsad publiceringsrätt, hållbara jobb och projektets kövy. Automatisk produktion av nya veckoförslag samt engagemangsstatistik efter 24/72 timmar är separata följdsteg. Första veckobatchen kan förberedas med befintliga innehållsverktyg. Ingen funktion ska beskriva följdstegen som färdiga.

## 2. Verifierad nulägesbild

- Befintlig innehållsrevision binder text, material, konto och kanalplan. Innehållsgodkännande ger inte automatiskt publiceringsrätt.
- SocialPublicationPanel och /api/social-publications stöder manuell publicering av ett granskat inlägg.
- social_publications och social_publication_events sparar begäran, steg och kvitto. Samma post har högst ett publiceringsförsök; osäkert utfall skickas inte om.
- Atlas verktyg get_social_publication läser kvittot. Det får inte skicka, fortsätta eller godkänna.
- Kalendern verkställer inga publiceringar. Befintlig videokö för media_scripts är en annan pipeline och ska inte användas för dessa bildutkast.
- Första Familje-Stunden-inlägget publicerades på Facebook och Instagram 18 oktober. Instagram har provider_id och permalink. Facebooks försök ac0fbb74-de9f-4870-a401-0658bfbc75f8 är uncertain/provider_unavailable, men inlägget har öppnats och kontrollerats på sidan.
- Provideradaptern använder åtta sekunders timeout. Facebookförsöket gick till uncertain efter cirka 8,46 sekunder. Detta är starkt stöd för att tidsgränsen behöver rättas; ett förlorat svar måste ändå hanteras även med längre timeout.
- Ingen token, lösenord eller annan hemlighet behövs i specifikation eller loggar.

## 3. Redaktionell tid och omfattning

Två ordinarie innehållstillfällen per vecka, på både Facebook och Instagram. Alla tider avser Europe/Stockholm.

| Testvecka | Tisdag | Fredag |
| --- | --- | --- |
| 1 och 3 | 17.00 | 20.30 |
| 2 och 4 | 20.30 | 17.00 |

Startdatum läggs efter verifierad aktivering. Förslaget 20 oktober–13 november flyttas fram om systemet inte är klart; missade tider ska inte köras ikapp. Månadssläpp är ett extra tillfälle kl. 20.30 efter verifierad öppning och räknas separat i tidsjämförelsen. Högst tre innehållstillfällen per vecka och högst två kanaler per tillfälle.

Fyra veckor ger bara tidiga signaler om tiderna. Utvärdering ska skilja på kanal, innehållstyp och inläggets ålder. Det är ingen utlovad optimal publiceringstid.

## 4. Kvittohantering före aktivering

Facebooks skrivande publiceringsanrop får en timeout på 30 sekunder; befintliga läsanrop och Instagram-anrop behåller åtta sekunder. Serverrutten har för närvarande maxDuration=60. Arbete efter provideranropet måste hinna spara kvittot inom den gränsen. Ingen generell retry får läggas runt POST.

Ett sparat provider-ID får inte kastas bort om hämtning av permalink misslyckas. Ett uteblivet svar efter en skrivning leder till uncertain och spärrad omsändning, aldrig till slutsatsen att inget publicerades.

Återkoppling för ett redan osäkert Facebookförsök sker i en separat operatörsstyrd åtgärd:
1. Läs möjliga publicerade inlägg på exakt det bundna Facebookkontot. Använd endast läsanrop.
2. Begränsa kandidater till samma exakta text och skapandetid från 60 sekunder före requested_at till fem minuter efter requested_at. Visa publiceringslänk och bild för manuell jämförelse. Ingen kandidat får automatiskt räknas som bevis enbart för att texten matchar.
3. Operatören jämför kandidatens bild med det godkända materialet och väljer uttryckligen rätt kandidat.
4. Servern läser om den valda kandidatens konto, ID, text, skapandetid, bildbilaga och kanoniska permalink. Konto och ursprunglig revisionsidentitet måste fortfarande matcha försöket.
5. En compare-and-set-övergång lagrar provider-ID, permalink och en särskild reconcile_verified-händelse med operatör, tid, källkontroll och bildattestation. Visningen säger Publicerat – återkopplat efter kontroll.
6. Fel konto, ändrad text, saknad bild, motstridigt kvitto, utgången kandidatkontroll eller ändrat försök ger avslag. Utfallet förblir osäkert. Inget publiceringsanrop görs.

Kandidater ska läsas via en fast Meta-adapter, inte via en godtycklig användar-URL. Kandidatens kontrollbevis löper ut efter fem minuter. Ingen rå token, capability-URL eller providerfeltext sparas. Denna väg får inte öppna en ny möjlighet att publicera eller godkänna nytt innehåll.

Kontrollen kan användas för första testinlägget utan ny offentlig post. Leverantörens fält och läsbehörighet måste verifieras mot aktuell officiell dokumentation och ett befintligt inlägg under implementationen. Om verifieringen inte går igenom lämnas försöket osäkert; manuellt redigerad databasstatus är inte en reservväg.

## 5. Veckobatch och granskningsvy

En batch är en fast manifestversion med två innehållstillfällen och normalt fyra kanalspecifika jobb. Ett villkorat månadssläpp kan ge ytterligare två jobb.

Varje manifestpost binder:
- project_id, post_id, revision_id och revisionens SHA-256;
- innehållsgodkännandets decision_id och kanalplanens revision;
- konto-binding_id, account_id och channel;
- materialets ID och SHA-256;
- önskad lokal tid, tidszon och entydig UTC-tid;
- eventuell month_release_evidence_id;
- sista tillåtna publiceringstid och manifestets hash.

Ägaren ser exakt text, bild, konto och datum/tid för varje jobb. Knappen heter Godkänn och schemalägg veckans inlägg och anger antal inlägg samt båda kontona. Detta är ett separat, uttryckligt publiceringsbeslut. Ett tidigare innehållsgodkännande eller ett allmänt ja i en chatt räcker inte som maskinläsbar batchbehörighet.

Batchgodkännandet och köjobben sparas atomiskt. Dubbla klick skapar inte flera jobb. Ändring av någon bunden uppgift ger en ny manifestversion och upphäver rättigheten att skicka den ändrade versionen.

Atlas får läsa köstatus och förbereda ett manifestutkast. Atlas får inte utfärda ägargodkännande eller skapa ett eget bredare mandat.

## 6. Data och ansvar

Nya projektspecifika poster behövs för batchmanifest, ägarbeslut, schemalagda jobb och deras händelser. Befintliga social_publications används fortsatt som kanalens försöks- och kvittojournal.

Ett jobb refererar en enda manifestpost och en enda bestående publiceringsavsikt. Databasen upprätthåller unik identitet per batchpost, postrevision och kanal. En ny idempotency-nyckel får inte kunna kringgå ett befintligt publiceringsförsök för posten.

Kötillstånd: queued, claimed, waiting, published, failed, uncertain, blocked, cancelled och missed. Kanalens container-/publiceringssteg ligger kvar i social_publications. Jobbstatus härleds från det sparade kanalutfallet.

Serviceoperationer måste verifiera ett aktivt databasutfärdat jobbanspråk och dess exakta batchbeslut. Arbetsprocessen får inte konstruera en mänsklig principal eller skicka in ett godtyckligt owner user_id för att passera befintliga mänskliga grindar. Befintlig manuell API-väg behåller sina egna krav.

## 7. Arbetsprocess och tider

En dedikerad autentiserad tick-rutt plockar förfallna jobb med databaslås och versionskontroll. Högst ett providerjobb behandlas per tick. Rutten har maxDuration=60 och en intern arbetsbudget på 45 sekunder, så att återstående tid finns för checkpoint och säkert svar. Den beräknar inte nya redaktionella tider och skapar inget nytt innehåll.

Före varje provider-skrivning, även ett senare Instagram-publish-steg, kontrolleras projektets stopp, aktivt batchbeslut, aktuell revision, innehållsgodkännande, kanalplan, kontobindning, credential-verifiering, materialets checksumma, tidsfönster och eventuellt släppvillkor. En utebliven kontroll stoppar jobbet.

UTC-tiden lagras vid godkännande; lokal visning använder alltid Europe/Stockholm. Exempel vid övergången 25 oktober: 17.00 motsvarar 15.00 UTC före övergången och 16.00 UTC efter; 20.30 motsvarar 18.30 respektive 19.30 UTC. Ogiltiga eller tvetydiga lokala tider ska avslås vid manifestvalideringen.

Ingen publicering får börja före sin godkända tid. Sen ankomst tillåts högst tio minuter. Även Instagrams slutliga publish-steg måste ligga inom detta fönster; en tidigare skapad container ger inte rätt att publicera senare. Därefter blir jobbet missed och kräver en ny granskad tid. Automatisk ikappkörning ingår inte.

Instagram använder samma sparade container vid senare kontroll. Ett nytt tick får fortsätta en processing-container endast så länge exakt publiceringsmandat och alla stoppgrindar fortfarande gäller.

## 8. Dubbletter, avbrott och delvis framgång

- Jobbanspråk använder kort lease och compare-and-set.
- Utgången lease bevisar inte att en provider-skrivning uteblev.
- Finns ett creating/publishing-steg utan säkert kvitto efter avbrott ska utfallet utredas, inte skickas om.
- Definitivt lokalt avslag före första provider-skrivningen kan återgå till queued inom tidsfönstret efter omkontroll. Ett osäkert fjärrutfall får aldrig göra det.
- Facebook och Instagram har separata jobb. Lyckad Instagram får inte skickas om för att Facebook behöver kontroll.
- Projektstopp eller återkallad batch blockerar alla återstående publiceringssteg. Läskontroll och operatörens kvittoåterkoppling kan fortfarande dokumentera något som redan publicerats.
- Avbryt schema tar bort framtida rätt att verkställa. Det raderar inte redan publicerade inlägg eller historik.

## 9. Månadssläpp

Släppinlägg kräver ett projektbundet bevis för rätt månad, aktuell katalogversion och faktisk kundåtkomst. Ett datum, en källkodsfil eller en lyckad driftsättning räcker inte.

I första versionen bekräftar ägaren kundåtkomsten efter kontroll i produktens kundvy. Beviset märks owner_verified_access, gäller en specificerad månad och katalogversion och är högst 24 timmar gammalt när jobbet ska börja. Detta är inte en automatisk mätning av kundåtkomst.

Saknat eller ändrat bevis blockerar släppjobbet. Systemet sparar ett nytt förslag om tid efter bekräftad öppning; ingen senare tid väljs och godkänns automatiskt. En framtida direktintegration med produktens släppsignal behöver separat design.

## 10. Vy, spårbarhet och larm

Projektets kövy visar datum/tid, konto, exakt version och tillstånd, med länkar till sparade kvitton. En tydlig text skiljer schemalagt från publicerat.

Osäkert, blockerat och missat jobb skapar en synlig åtgärd i Omnira. Första versionen skickar inga nya mejl, SMS eller direktmeddelanden. Atlas får återge sparat utfall men får inte beskriva enbart ett planerat jobb som publicerat.

Händelser ska omfatta ägargodkännande, återkallelse, anspråk, blockeringsorsak, publiceringsförsök, provider-kvitto och verifierad återkoppling. Metadata maskeras och minimeras. Projektisolering, ägarbehörighet och operatörsbegränsning behålls; inga klienter får servicebehörighet.

## 11. Drift och kostnadsgräns

Tick-rutten kan anropas en gång per minut på en verifierad befintlig driftlösning. Ingen LLM körs per tick. Tom kö avslutas efter en billig databaskontroll.

Vercels dokumentation skiljer på Hobby, där tidsstyrning kan förskjutas inom timmen, och Pro/Enterprise med minutprecision. Nuvarande teaminformation har inte gett ett verifierbart planvärde. Därför är verifierat stöd för minutkörning och dess kostnad en obligatorisk aktiveringsgrind.

Ingen ny prenumeration, betald uppgradering, permanent credential eller utökad agentbehörighet skapas i denna designfas. Om befintlig drift inte klarar kravet ska kostnad och konkret alternativ presenteras före aktivering. Ingen annan schemaläggare kopplas in tyst och ingen ChatGPT-påminnelse ersätter produktens arbetare.

## 12. Tester och acceptans

Nödvändiga tester:
1. Fördröjt lyckat Facebooksvar efter åtta sekunder lagrar ett enda korrekt kvitto inom den längre gränsen.
2. Ett förlorat POST-svar ger uncertain och exakt en fjärrskrivning även vid dubbla klick, parallella tick och omstart.
3. Återkoppling verifierar rätt konto, ID, text, tidsfönster och operatörens bildattestation; felaktig eller gammal kandidat avslås utan POST.
4. Ändrad revision, bild, kanalplan, tid eller kontobindning blockerar ett tidigare godkänt jobb.
5. Ett stopp eller återkallat beslut mellan Instagram-steg blockerar nästa publiceringsskrivning.
6. Samtidiga arbetare medger endast en första skrivning per jobb.
7. Partiell framgång mellan kanaler leder inte till dubbletter.
8. Tidzonstester täcker 25 oktober, för tidigt tick, tio minuters försening och missad tid.
9. Månadssläpp kan inte ske enbart på datum; saknat/utgånget kundåtkomstbevis blockerar.
10. UI visar exakta mottagare och tider före godkännande, sparad status efter omladdning samt tydlig osäkerhet.
11. Tester för behörighet och projektisolering verifierar att ett annat projekt, en läsare eller en självkonstruerad worker-principal inte får verkställa.
12. Logg-/svarstester visar att inga tokens eller bildcapabilities läcker.

Före aktivering ska en driftkörning utan provider-skrivning visa rätt kommande jobb och tider. Ett därefter separat godkänt bildinlägg testas på vardera kanal. Första Facebooktestet återkopplas utan omsändning. Leverantörskvitton och verkliga inlägg ska kontrolleras innan schemat kallas fungerande.

## 13. Införande och återgång

Inför i ordning: (1) kvittorättningen och säker återkoppling, (2) batchbeslut och kö, (3) arbetaradapter och stoppgrindar, (4) UI och driftverifiering. Implementation kräver ett skriftligt genomförandeunderlag efter denna specifikations granskning.

Funktionen levereras avstängd. Ägaren godkänner en konkret första batch och aktivering innan schemalagd publicering börjar. Ingen utökning till The Prompt eller andra projekt sker automatiskt. Deras konton, tokens och videoflöden behålls.

Återgång består av att stänga av tick-verkställighet och återkalla återstående batchmandat. Historik och kvitton bevaras. Om en provider-skrivning redan pågår kan en avstängning inte lova att den dras tillbaka; efterföljande steg och omsändning blockeras.

## 14. Underlag för granskning

Kod:
- apps/web/lib/social-launch/publication/{dispatch,provider,store,types,api,atlas-tools}.ts
- apps/web/components/social-launch/SocialPublicationPanel.tsx
- apps/web/supabase/migrations/20261016115402_social_manual_publication_v1.sql
- apps/web/lib/social-launch/publication/{provider,dispatch}.test.ts
- apps/web/vercel.json

Produktkatalog: Familje-Stunden ef0a5d6551036df339d8adaf65a167f8713c1721, src/monthExperience/november.ts och src/december2026/releasedCatalog.ts. Katalogen bevisar innehåll, inte releaseåtkomst.

Officiella referenser:
- https://about.fb.com/news/2024/10/best-practices-education-hub-creators-instagram/
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/cron-jobs/manage-cron-jobs
- https://developers.facebook.com/docs/pages-api/posts/
- https://developers.facebook.com/docs/graph-api/reference/page/published_posts/

Metas API-dokumentation svarade 429 vid denna research. Inga ändringar i Meta-adaptern för nya läsfält får göras enbart utifrån tredjepartsexempel. Aktuell officiell API-verifiering hör till kvittoadapterstegets godkännandekrav.
