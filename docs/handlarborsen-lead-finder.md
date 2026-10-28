# Handlarbörsen – Lead Finder (granskning före kontakt)

## Vad denna PR omfattar

Lead Finder visar potentiella juridiska företagskandidater i Omniras projektvy. En post i SCB:s register är **inte automatiskt en kvalificerad bilhandlare**, en ny kontakt eller någon som får mejlas.

Den aktuella testprofilen använder ett manuellt granskningsexempel med **89 juridiska bolag**, varav 83 är verksamma enligt SCB:s kriterier och 6 inte längre verksamma. Underlaget innehåller minst en registrerad kontaktspärr och ett tidigare känt kontaktfall. Den ursprungliga historiska kontaktlistan är inte komplett. **Samtliga kandidater är spärrade för utskick.**

Inga verkliga företagslistor, tidigare utskicksjournaler, SCB-nycklar eller kontaktuppgifter ingår i Git-repot. De ursprungliga granskningsfilerna förvaras privat hos projektägaren.

## Skydd och datamodell

- `public.hb_lead_candidates` skapades i Omniras Supabase den 28 oktober 2026 genom migration `20261028072659_handlarborsen_scb_review_only_candidates`. Tabellen är initialt **tom** och innehåller inga automatiskt godkända kontakter.
- Ägarbaserad RLS ger läsrätt för verifierad projektägare. `anon` saknar rättigheter och vanliga `authenticated` användare saknar skriv-, uppdaterings- och raderingsrättigheter.
- Databasen förhindrar fysiska personer som SCB klassar med juridisk form 10, samt `outreach_ready=true`, kontaktbar status, tidigare kontakt/inaktiv post felaktigt klassad som nytt lead och aktiva SCB-spärrar felaktigt klassade som oproblematiska.
- En serverbaserad importväg använder enbart validerad, manuellt vald CSV och sammanfattning; ingen databas- eller e-poståtkomst sker vid förhandsgranskning. Skrivning kräver en separat flagga, godkänd kontrollsumma och uttrycklig mänsklig bekräftelse. Ingen automatisk schemaläggning ingår.

## Feature-flaggor – samtliga av som standard

| Serverflagga | Funktion när uttryckligen aktiverad |
|---|---|
| `HB_LEADFINDER_IMPORT_PREVIEW_ENABLED` | Ägarens uppladdnings- och förhandsgranskningsvy (ingen DB-skrivning) |
| `HB_LEADFINDER_IMPORT_WRITE_ENABLED` | Separat skrivfunktion, kräver också korrekt digest och mänsklig bekräftelse |
| `HB_LEADFINDER_APPROVED_SHA256` | Den exakt godkända importlistans SHA-256, **inte en API-nyckel** |
| `HB_LEADFINDER_CANDIDATE_READ_ENABLED` | Ägarens RLS-filtrerade läsning av redan sparade kandidater |
| `HB_LEADFINDER_LOCAL_REVIEW_ENABLED` | Endast lokal Windows-utveckling med privata granskade filer |

**Ingen** av flaggorna sätts automatiskt av denna PR. SCB:s personliga API-nyckel ska aldrig ligga i Git, klientkod eller i loggar.

## Försiktigt verifieringsflöde

1. Kontrollera CI, migration guard och säkerhetsklassificeringen med alla ordinarie tester.
2. Prova förhandsvisningssidan med projektägarens inloggning i **skyddad Vercel Preview**. Ingen produktions-URL eller publik import ska aktiveras.
3. Ladda endast upp den separat granskade, sanerade CSV-filen och dess verifierade sammanfattning genom det uttryckliga förhandsgranskningssteget.
4. Granska sammanfattning och kontrollsumma innan ett framtida separat beslut om import. Ett lyckat prov innebär **inte** tillstånd att kontakta företagen.
5. Komplettera företagshistorik, grupp-/aliasmatchning, dataskydds- och marknadsföringsbedömning innan någon separat kontaktfunktion ens planeras.

## Lokal verifiering

```powershell
cd apps/web
..\..\node_modules\.bin\vitest.cmd run lib/qa/handlarborsen-lead-finder.test.ts lib/qa/handlarborsen-lead-finder-local-review.test.ts lib/qa/handlarborsen-lead-finder-import-intake.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

Det finns en separat **privat** lokal insamlings- och kvalificeringshistorik. Den ingår inte i den publika PR:n eftersom den innehåller information om faktiska affärskontakter.

## Förhandsvisning av enskilda företag

Efter att projektägarens två valda filer har verifierats av importens förhandsgransknings-API kan webbläsaren även visa en **tillfällig tabell med de 89 juridiska företagen**. Användaren kan söka på namn, organisationsnummer och ort samt filtrera på verksamhetsstatus, tidigare kontakt i partiell historik, SCB-spärr, annan juridisk form och möjliga gemensamma namnled.

Tabellen byggs endast från den redan manuellt valda och validerade filen i webbläsarens minne. Serverns svar innehåller fortfarande **enbart antal och kontrollsumma**, aldrig en hel företagslista. Ingen databaspost skapas, ingen cookie eller lokal lagring används för företagsraderna, och inga knappar för godkännande, kontakt eller utskick finns i tabellen. Att rapporten saknar historisk träff innebär **inte** att företaget är nytt eller att kontakt är tillåten.

Det tidigare steget ”Granska 50 kandidater” är ersatt med **”Granska 89 juridiska företag”** för just denna verifierade rapport, utan att påstå att SCB har godkänt dem som bilhandlare. Om nästa rapport omfattar ett annat antal krävs en separat uppdatering av den medvetet snävt avgränsade importgrinden.

**Webbläsarsäker validering:** tabellen efter en lyckad förhandskontroll använder `client-review-core.ts`, som inte importerar Node.js-kryptografi, filsystem, API-nycklar eller servermiljö. CSV-format och juridiska nummer valideras konservativt och fail-closed. Kodens exakta kolumnschema delas med den skyddade serverexporten. Serverns digest-/ägarkontroll och databasskrivningsgrind är oförändrade. Sex riktade gränstester jämför klient och server; ingen databasimport aktiveras.

## Smidigare genomgång av de 89 bolagen

Den tillfälliga, ägarstyrda förhandsvisningen visar nu **15 företag per sida**, i alfabetisk ordning. Sidknapparna bläddrar i hela den verifierade rapporten, medan sökning och filter gäller alla 89 – även de som inte syns på aktuell sida. Om ett filter minskar antalet träffar återgår visningen automatiskt till första sidan. Ingen post faller bort från rapporten.

En felaktig namn-/koncernvarning för det generiska första namnledet **AKTIEBOLAGET** är borttagen. Mer särskiljande namnled som Bilia och Hedbergs kan fortfarande markeras som **möjliga namnkopplingar**, men är inte bevis för koncernrelationer. Offlinekontroll av den faktiska rensade rapporten gav 89 unika företag fördelade över 6 sidor (15 på första och 14 på sista), en SCB-spärr och en dokumenterad tidigare kontakt i ofullständig historik.

**Alla 89 är fortfarande ej kontaktbara**. Sidindelning, sortering och visningsändringar ger ingen tillåtelse att kontakta företag och påverkar inte API:ets separata import-/skrivspärrar eller Supabase-data.

## Atlas Lead Research Worker v1 (grund före Tavily-anslutningen)

Atlas ska undersöka vilka företag som faktiskt säljer bilar. Den ursprungliga version 1-grunden omfattar en begränsad forskningskö, strikt bevisutvärdering och ett servergränssnitt för en injicerad sökadapter. Grundmodulerna har ingen nätverksåtkomst, schemaläggning eller databasskrivning. Det separat aktiverade, manuella Tavily-flödet för Handlarbörsens skyddade Preview beskrivs nedan och får aldrig automatiskt godkänna kontakter.

- **Forskningskö** (`lead-research.ts`, webbläsarsäker): `buildResearchQueue` väljer deterministiskt 5 företag (hårt tak 10) ur den verifierade rapporten, utan poäng eller rangordning. Endast verksamma bolag utan känd tidigare kontakt och utan SCB-spärr får en *forskningsförfrågan* – inte kontakttillstånd. Inaktiva, tidigare kontaktade och spärrade hoppas över uttryckligen. Urvalet sprids över orter, SNI-koder och namngrupper. Varje jobb har högst 3 specifika sökfrågor, status `RESEARCH_NOT_STARTED` och `outreachReady: false`. Kön vägras om proveniens, antal, partiell historik eller blockerad kontaktbarhet inte stämmer.
- **Bevisbaserad klassificering**: `evaluateLeadEvidence` tar högst 5 observationer med strikt publika https-adresser (inga IP-adresser, localhost, inloggningsuppgifter, ovanliga portar eller privata namn), ISO-datum, källtyp, kort utdrag (≤160 tecken) och uppräknade verksamhetsindikatorer. `DEALER_EVIDENCE` kräver officiell företagssida med bevisad juridisk identitet (exakt organisationsnummer eller exakt normaliserat bolagsnamn) och bevis för bilförsäljning/fordonslager. `OUT_OF_SCOPE_EVIDENCE` kräver verifierad officiell sida och uttryckligt annat branschbevis utan försäljningssignal. Allt annat blir `NEEDS_FURTHER_RESEARCH` – aldrig slutsats från SNI-kod ensam. Koncerndomäner (t.ex. Bilia) intygar bara via exakt organisationsnummer.
- **Generella företagskontakter**: endast om identiteten är verifierad: generisk brevlåda (info, kontakt, kundservice …) på samma domän som den officiella sidan, och telefon uttryckligen märkt ”company switchboard” (inga mobil- eller personnummer). Varje fält kräver sin egen publika käll-URL. Allt flaggas `NEEDS_MANUAL_CONTACT_CHECK` och `BLOCKED_PENDING_VERIFICATION`. Inget skickas och inget är godkänt.
- **Worker** (`lead-research-worker.ts`, endast server): tar en injicerad `SearchAdapter`, max 5 jobb, 5 observationer per jobb, ett anrop per jobb med tidsgräns. Utan adapter är den spärrad (`adapter_absent`). Adapterutdata är opålitlig och valideras om; adapterfel exponeras inte.
- **Ägarförhandsvisning**: under den verifierade tabellen visar ”Atlas forskningskö” högst 5 mål med märkningen ”Research ej körd”. Inga kontakt-, godkänn- eller skickaknappar och inga kontaktuppgifter visas.

Utskick förblir **blockerat**. Kontakthistoriken är fortfarande ofullständig och inget i denna version ger samtycke eller tillåtelse att kontakta något företag.

## Atlas manuell webbsökning via Tavily (av som standard)

Ägaren kan manuellt starta en begränsad webbsökning för de 5 företagen i forskningskön. Funktionen är **avstängd** tills servern har `HB_LEADFINDER_IMPORT_PREVIEW_ENABLED=true`, `HB_LEADFINDER_RESEARCH_ENABLED=true` och en egen `TAVILY_API_KEY`. Utan alla tre vägras anropet (404) och sidan ser ut som tidigare. Inga miljövariabler eller flaggor har ändrats av denna ändring.

- **Kostnad**: Tavily anger för närvarande 1 000 gratiskrediter per månad utan kort. En grundsökning (`search_depth: basic`) kostar 1 kredit. Kontrollera att nyckeln tillhör gratisplanen och att eventuell betalning per användning inte är aktiverad. Gratisplanen stoppar anrop när krediterna är slut; appen har däremot ingen egen månads- eller dubbelklickskvot.
- **Gräns per klick**: högst 5 grundsökningar (≤1 per företag, `max_results: 3`, utan svar, rådata eller bilder). Inga omförsök, ingen schemaläggning/cron och ingen hämtning av godtyckliga webbadresser; endast `https://api.tavily.com/search` anropas. Svar över 150 kB avvisas.
- **Spärrar före varje sökning** (`research-api.ts`): samma origin, JSON, begränsad kropp, verifierad session, projektägare, exakt projekt, ej pausat, exakt bekräftelsefras `UNDERSÖK 5 FÖRETAG` samt att rapportens kontrollsumma matchar förhandsvisningen. Misslyckas något kostar det 0 krediter.
- **Ingen lagring**: ingen databasskrivning, ingen service-role-klient, inget utskick. Inget sparas i appen; resultaten visas bara för ägaren och försvinner när filerna byts.
- **Källhantering** (`tavily-research-adapter.ts`): alla Tavily-träffar behandlas som **obekräftade sökutdrag** (`search_snippet`), även när webbadressen ser ut att höra till bolaget och utdraget innehåller organisationsnummer. Utdrag rensas från markup, länkar, e-post, telefonnummer och långa id:n (≤160 tecken). Sökutdrag kan ge ledtrådar om försäljning men får **inte** ge `DEALER_EVIDENCE`, `OUT_OF_SCOPE_EVIDENCE` eller `identityVerified: true`. För sådana slutsatser krävs ett separat framtida verifieringssteg som kontrollerar faktisk företagswebbplats och juridisk identitet. Inga kontaktuppgifter föreslås i denna version.
- **Allt är preliminärt**: resultat är sökindikationer, inte godkännande. Alla företag förblir **Ej kontaktbara** (`outreachReady: false`) och kontaktväg måste klareras manuellt innan något utskick.
- **Företagsspecifik träffkontroll (2026-10-28)**: innan ett sökutdrag får visas krävs exakt organisationsnummer eller fullständigt normaliserat juridiskt namn i titel/innehåll, alternativt ett särskiljande flerdelat företagsnamn i en katalogs specifika företagsprofil-URL. En tydligt angiven avvikande organisationsidentitet avvisas. Generella annonser från exempelvis Bilweb, KVD och Bytbil utan sådan koppling kastas bort. Formuleringar som ”0 aktuella bilannonser” eller ”inga bilar till salu” får inte skapa positiv försäljningsindikator. Det är fortfarande **enbart källrelevans**, inte autentisering av företagets webbplats. En verklig juridisk verifiering kräver ett separat framtida steg; inga fler API-anrop tillkommer.

**Extra skydd 2026-10-28:** Research-API:t avvisar körningar med HTTP 404 när Vercel rapporterar produktionsmiljö, även om andra flaggor skulle vara felaktigt aktiverade. Projektägaren måste uttryckligen förhandsgranska och bekräfta. Klienten tillåter bara ett researchförsök per förhandsgranskning för att motverka oavsiktliga upprepade krediter; en ny körning kräver ett nytt användarinitiativ. Det är **inte** en global kvotspärr över enheter eller sessioner: konfigurera separat månadsbudget/hårt kredittak hos Tavily innan nyckeln används. Sökträffar redovisas med tydliga osäkra indikatorer ("sökutdrag nämner bilhandel") och blir inte juridiskt verifierad bilhandlare utan separat kontroll. Ingen Tavily-nyckel eller verkliga sökträffar finns i Git.

## Atlas Lead Research – forskningskön först och valfri källsidkontroll

Ägarens verifierade SCB-förhandsvisning visar nu **Atlas forskningskö överst**, före den långa företagstabellen. Den manuella knappen för sökning och tillhörande preliminära resultat ligger intill kön, så ägaren slipper skrolla förbi 89 företag. Sökning och företagsgranskning är fortfarande strikt separata från importskrivning och utskick.

Forskningskön behåller sin geografiska/branschmässiga spridning men använder nu en försiktig **namnindikation enbart som sista utslagsregel** om andra faktorer är lika. Tydliga bilhandelsord kan få tidigare forskning än t.ex. ”Inkasso” eller ”Kapitalinvest”; ingen post avvisas på namn eller blir kontaktbar.

**Valfri andra researchfas (separat avstängd flagga):** `HB_LEADFINDER_EXTRACT_ENABLED=true` får endast sättas i en uttryckligen testad Preview-miljö, aldrig automatiskt i produktion. Ägaren måste då manuellt bekräfta den nya texten **”UNDERSÖK 5 FÖRETAG OCH GRANSKA WEBBSIDOR”** i stället för den gamla sökbekräftelsen. Gränserna är maximalt fem Tavily `basic`-sökningar **plus högst fem** extra `basic`-sidextraktioner. Det senare kan förbruka **ytterligare krediter**. En extraktionsmiss lämnar de redan sanerade sökutdragen kvar, utan omsökning.

Den extra kontrollen använder endast fasta Tavily-API-adresser, inte direkta HTTP-anrop till godtyckliga företagssidor. Den väljer högst en plausibel företagsdomän bland de redan företagsrelevanta sökträffarna, nekar kataloger, sociala tjänster, IP-adresser, privata domäner och omdirigeringar, och accepterar utdrag högst 65 000 tecken. För att lyfta en sida till preliminärt **företagssidebelägg** krävs att webbplatsdomänen verkar tillhöra företaget och att sidans text innehåller både **exakt juridiskt namn och organisationsnummer**. Bilförsäljningsindikatorer måste vara observerade på samma verifierade källa. Det är fortfarande ett preliminärt belägg som kräver mänsklig kontroll, aldrig bevis för att företaget får kontaktas.

**Kontaktförslag i ägarvyn:** Endast efter denna extra kontroll och preliminära bilförsäljningsbelägg kan Atlas visa en offentligt publicerad **generisk** brevlåda på den kontrollerade företagssidedomänen eller ett uttryckligen märkt växelnummer, med länk till den ursprungliga källan. Personliga mejl, mobilnummer och frånkopplade katalogträffar filtreras bort. Inga `mailto:`-/`tel:`-åtgärder, automatiska e-postmeddelanden, databaslagringar, scheman eller kontaktgodkännanden ingår.

**Aktuell aktivering:** Den tidigare Tavily-`basic`-sökningen finns i den skyddade PR-förhandsmiljön. **Den nya extraktionsflaggan har INTE aktiverats** och ytterligare Tavily-sidextraktioner har inte körts. Vi har bara använt syntetiska HTTP-fixturer för testerna. Alla 89 företag är fortsatt `BLOCKED_PENDING_VERIFICATION`.

**Separat tolkning av verksamhetssignaler (2026-10-28):** Tavily-sökutdrag och den valfria företagssideextraktionen använder samma konservativa regler. Ett bolagsnamn som ”Aktiebolaget Inkasso” får inte ensamt ge en signal om inkassoverksamhet. En källuppgift om *registrerad detaljhandel med personbilar* visas som ”Registrerad bilhandel nämns – ingen faktisk försäljning verifierad”; den uppgraderar aldrig ett företag till `DEALER_EVIDENCE`. Påstående om faktisk försäljning kräver separata försäljnings-/lagerindikationer, och tillåtelse att kontakta företaget kräver fortfarande separat manuell kontroll. Sökningar, extraktioner, utskick eller databasskrivningar har inte startats i samband med denna kodändring.

**Granskning av fem verkliga Preview-resultat (2026-10-28, utan nya API-anrop):** Förenade Bil i Malmö och Otto Olssons Bil hade registerformuleringarna ”Bolaget skall bedriva handel med motorfordon” respektive ”Föremålet för bolagets verksamhet är handel med bilar”. Båda klassas nu som indikation på *registrerad* bilhandel, inte faktisk försäljning. AutoHub Sveriges företagsspecifika Bytbil-profil nämner att handlaren ”säljer alla typer av begagnade bilar”; detta ger en preliminär försäljningssignal, men ingen verifierad företagssida eller kontaktbehörighet. Wä Bil förblir oklart och A & E Automotive saknar relevanta sökutdrag i den aktuella omgången. Sidan skiljer nu tydligare mellan SCB:s icke aktiverade live-API och den separata, manuella Tavily-sökningen som endast aktiverats i skyddad Preview. Alla slutsatser och UI-etiketter är fortsatt preliminära.
