# Atlas: verifierad testdata i Handlarbörsen

Datum: 2026-10-17
Status: Förslag för ägarens granskning. Ingen produktkod, aktivering eller datarensning ingår i denna dokumentändring.

## Avsikt och första leverans

André vill kunna ge Atlas ett jobb under ett röstsamtal och se jobbet utföras. Första leveransen är kommandot ”rensa testhandlarna i Handlarbörsen”. Riktiga handlare och deras data får aldrig ingå. Samma arbetsflöde ska fungera från textchatten. Anders-rösten och den accepterade samtalsmotorn påverkas inte.

Vi delar upp den större önskan i tre separata leveranser: (1) verifierad testdata och rensning, (2) webbsökning med källor, (3) kodarbete via befintlig SDF/broker med test och granskning. Detta dokument omfattar endast den första. Det aktiverar inte generell SQL, terminal, webbläsarstyrning eller fri åtkomst till projektens kod.

## Verifierat nuläge

Read-only-kontroll av Handlarbörsens live-databas den 17 oktober hittade tio organisationer. De tio ID:na matchar inte organisationerna i `supabase/seeds/demo.sql`, vars ID:n är `30000000-0000-4000-8000-000000000001` till `...0005`. Flera live-poster har medlemskap, fordon eller bud. Det finns ingen `is_test`/`is_demo`-kolumn på organisationerna. Ett testliknande namn, ett visst antal organisationer eller användning under ett test bevisar inte att ett företag är fiktivt.

`docs/SEED_DATA.md` i Handlarbörsen säger att seed-data inte får läggas i produktion. `scripts/seed-database.mjs` vägrar icke-lokal databas. Detta verktyg ska aldrig användas för rensningen.

Handlarbörsen har redan säker företagsstängning med spärrar för bland annat aktiva annonser, erbjudanden, affärer och oreglerade auktioner. Stängning kan också ändra prenumerationsstatus. Den befintliga funktionen kräver organisationens dealer_admin. Atlas får inte imitera denna användare eller använda en service-role-nyckel för generell tabellåtkomst.

Atlas nuvarande Handlarbörsen-integration läser elva aggregerade mått via en fast serveradress. `companies_registered_total` inkluderar stängda företag. Att bara stänga ett konto skulle därför inte lösa missvisande statistik. Historiska observationer får inte skrivas om till påhittade värden.

Undersökta referenser: Omnira `origin/main` f6f016c631d56ba6fce23afdc20e85f3930df9dc; Handlarbörsen `origin/main` ec1cdbfee9272a7a603c42a5a8cde900702baa0a. Lokala ändringar i Handlarbörsens abonnemangssida har lämnats orörda. Ingen live-post har klassificerats eller ändrats.

## Val av lösning

| Alternativ | Följd | Beslut |
|---|---|---|
| Permanent radering och kaskadrensning | Svårt att återställa, riskerar affärshistorik och delade användare | Ingår inte |
| Manuellt SQL-skript per önskemål | Kan lösa ett engångsjobb men ger inte Atlas ett användbart verktyg | Ingår inte |
| Verifierat testregister och återställbar karantän | Avgränsat mandat, kontroller före körning och verifierbart kvitto | Rekommenderas |

”Ta bort” betyder i första versionen att verifierade testorganisationer och deras verifierade testobjekt tas ur aktiva produktflöden och produktionsstatistik, medan originaldata och revision finns kvar för återställning. UI och Atlas ska säga ”testdata undanlagd”, inte ”permanent raderad”. Fysisk radering av data, Auth-användare eller Storage-objekt är en senare, separat beslutad funktion.

## Klassificering och mandat

Handlarbörsen äger ett privat register med organisationens exakta ID, klassning `unknown | real | verified_test`, underlag, klassande plattformsadministratör, tidpunkt och revision. `unknown` är standard för alla befintliga poster; inga tio poster förklassas. `real` och `unknown` är blockerade för rensning. Användarredigerad profilmetadata, namn, e-postmönster och språkmodellens slutsats ger ingen behörighet.

Ägaren granskar och klassar exakta poster i ett separat administratörssteg. En verklig organisation som bara använts vid test ska vara `real`; dess specifika testannonser kräver ett separat avgränsat flöde och ingår inte i organisationsrensningen. Atlas får inte ändra klassningen som ett led i sin egen rensning. Gemensamma användare, verkliga motparter och plattformsadministratörens identitet ska behållas.

För att omfattas måste varje organisation vara `verified_test` och hela dess kommersiella datagraf verifierat test. Detta kräver ID-bundet underlag för fordon och medlemskap samt för samtliga motparter i bud, intressen, erbjudanden, affärer och konversationer. Okänt ursprung, delat aktivt medlemskap i en verklig organisation, extern motpart, Stripe-koppling eller obekräftad affärskoppling blockerar hela paketet. En namnmatchning eller bara en testmarkerad säljare räcker inte.

## Samtal och bekräftelse

1. André säger ”Visa testhandlarna som kan tas bort”. Atlas hämtar en färsk inventering med tillåtna företagsnamn/ID:n, klassning och antal beroenden. Ingen kontaktinformation, meddelandetext eller betalningsuppgift behövs.
2. Atlas förbereder ett paket med exakta ID:n, antal objekt per typ, spärrar, registerrevision och ett fingeravtryck av tillståndet. Den läser upp en kort sammanfattning och visar ett granskningskort i samtalspanelen. ”Alla testhandlare” fryses till denna lista och får inte bli en öppen framtida regel.
3. André bekräftar det paketet en gång i granskningskortet. Befintlig serververifierad operator-/projektbehörighet och godkännandebindning återanvänds där de passar. Ett `confirm=true` från språkmodellen eller ett löst ”ja” får inte skapa mandat. Röstbaserat godkännande utan kortet ingår inte i första versionen.
4. Atlas utför samma paket, hämtar kvittot och berättar exakt vad som blev undanlagt och vad som blockerades. Samtalet kan fortsätta mellan vyerna under jobbet. Mikrofonstopp ska inte beskrivas som att ett redan startat serverjobb avbröts.

Vid spärr för en enda post blir utfallet `blocked` för hela paketet; Atlas skapar ingen tyst mindre delmängd. Ägaren kan därefter be om ett nytt, separat paket. Ett tomt urval ger `nothing_to_do`, inte ett lyckat borttagande.

## Servergräns och kontrakt

Handlarbörsen behåller all datamyndighet. Omnira får en dedikerad integration för inventering, förberedelse, utförande och kvittoläsning för exakt projektet Handlarbörsen. Föreslagen fast basadress: `https://www.handlarborsen.se/api/internal/atlas-test-data`. Inga URL:er, tabellnamn, filteruttryck, SQL, målmiljöer eller godtyckliga operationer accepteras från modellen.

Åtkomst till inventering och utförande hålls isär med nya serverlagrade autentiseringsuppgifter; det befintliga metrics-tokenet får aldrig få skrivrättigheter. Uppgifter ska inte visas i chatten, verktygsresultat, loggar eller klientkod. Destination är fast, HTTPS krävs och redirects nekas. Kropp, metod, sökväg, tidsstämpel och unikt request-ID binds kryptografiskt till anropet; utgångna eller återspelade anrop avvisas. Automatisk HTTP-omskickning av en mutation används inte.

Handlarbörsen registrerar en återkallelig integrationsprincipal med exakt operation, Omnira-projekt och tillåten operatorbindning. Omnira verifierar en färsk inloggad operator och ägarskap på servern; Handlarbörsen kontrollerar sin integrationsprincipal vid varje känsligt anrop. Inget användar-ID från modellen är en attest. Ett observer-projekt får inventeras men får inte mutera: ett separat uttryckligt mandat för denna operation krävs, utan att göra andra observer-förmågor skrivbara.

Förberedelsen skapar ett serverlagrat paket med `package_id`, `expires_at` (tio minuter), sorterade mål-ID:n, revisionsfingeravtryck, exakta objekttyper/antal och blockeringskoder. Utförande tar endast paket-ID, serververifierad godkännandereferens och idempotensnyckel. Paketet måste vara bundet till samma projekt, operator och granskade revision. Modellen kan inte byta mål eller utöka omfattningen vid utförande.

Föreslagna Atlas-verktyg: `inspect_handlarborsen_test_data`, `prepare_handlarborsen_test_cleanup`, `execute_handlarborsen_test_cleanup`, `get_handlarborsen_test_cleanup_receipt`. Återställning använder samma paket-/granskningsmodell och en separat uttrycklig operation. Inventeringen ska inte hämtas eller köras som ett extra steg för vanliga röstsvar.

## Atomär körning och samtidighet

Utföraren använder smala databasfunktioner enligt Handlarbörsens befintliga privilegiegräns. Inga breda tabellprivilegier till service_role, inga klientprivilegier till testregister eller körningskvitton. Privat register och hjälpfunktioner hålls utanför exponerade scheman; eventuella RPC-ingångar ska ha uttryckliga grants och befintliga säkerhetstester ska bevaras.

En transaktion låser paket och målorganisationer i stabil ID-ordning, verifierar färskt mandat, klassning, revision och samtliga beroenden, och skriver karantän samt revisionslogg tillsammans. Nya bud, annonser, erbjudanden och medlemskap måste använda samma organisationslås och verifiera karantänstatus. Annars kan inventering och körning ge olika resultat. Parallella jobb ska inte kunna kringgå detta.

Karantän är en separat livscykel, inte ett anrop till företagsstängning och inte en ändring av prenumerationen. Råa statusfält, affärshistorik, tillgångar och Auth-identiteter behålls. Däremot ska centrala åtkomst-, publicerings- och handelsgränser avvisa ny aktivitet från karantänlagda organisationer. Andra organisationers medlemskap och identiteter får inte spärras.

Samma idempotensnyckel och identiskt paket ger samma kvitto. Samma nyckel med annat paket avvisas. Ändrade data, ny motpart, återkallat mandat, ny registerrevision eller utgången förberedelse ger `needs_new_review` utan ändringar. Vid nätverkstimeout är utfallet `unknown`: läs kvitto efter återautentisering, påstå inte misslyckande och skapa inget nytt körnings-ID för att prova igen.

Återställning tar bort karantänen via ett separat godkänt paket, med samma låsning och en kontrollerad revision. Den ändrar inte tidigare affärsstatus, återöppnar inte stängda bolag, återaktiverar inte betalning och rör inte senare manuella ändringar. Externa sidoeffekter som mejl, push och betalningsanrop ska inte skickas av karantän eller återställning. Befintliga bakgrundsjobb och leveransköer ska respektera karantänen före dispatch. Redan skickade meddelanden kan inte återkallas; ett redan påbörjat externt anrop blockerar paketet tills dess utfall är känt.

## Vyer, statistik och historik

Karantänen ska genomsyra centrala läs- och skrivgränser, inte bara gömma rader i React. Marknadsplats, detaljvyer, sök, handlarvyer och live verksamhetsöversikter filtrerar bort dessa objekt. Admin får en tydlig separat lista över undanlagd testdata. Direktlänkar och gamla sessioner ska inte möjliggöra handel. Historiska revisions-/affärsvyer kan visa posterna som bevarad testhistorik; de får inte presenteras som aktiva kunder.

Metrics v1:s historiska definitioner bevaras. En uttrycklig v2 med produktionsomfattning exkluderar verifierad karantän från samtliga relevanta räknare, inklusive båda parter i handelsdata. Svaret anger definition/version, omfattning, observationstid och antal exkluderade testorganisationer. Konsument och producent uppdateras samordnat; tidigare snapshots skrivs inte om och gamla och nya definitioner jämförs inte som organisk tillväxt. UI visar ett definitionsbyte i tidsserien. Tom produktion är noll; fel eller okänt underlag är fortfarande null/otillgängligt.

## Verifiering före aktivering

- Databastester: unknown/real avvisas; klassning kan inte självskapas av Atlas; fel operator/projekt/mandat avvisas; endast exakta godkända ID:n berörs.
- Blandad datagraf: verklig eller okänd motpart, delad identitet och extern betalningskoppling blockerar utan delresultat. Ursprungliga seed-ID:n och testliknande namn ger inte rättighet automatiskt.
- Samtidighet: nytt bud/fordon/medlemskap under förberedelse och utförande, två paket samtidigt, utgånget paket, upprepad nyckel samt timeout efter commit.
- Återställning: samma ursprungliga data finns kvar, senare manuella ändringar bevaras, ingen mejl/push/betalning skickas.
- Åtkomst: anon, vanlig dealer, collaborator/viewer, återkallad principal och direkt RPC saknar mutationsrätt; befintliga RLS/privilegieinvarianter passerar.
- Produkt: karantän respekteras i direkta detaljlänkar, befintliga sessioner och handel; riktig organisation förblir oförändrad. Metrics v1 och v2 har egna kontraktstester och historikgränsen syns.
- Atlas: ett faktiskt verktygskvitto krävs för slutfört språk; röst och text ger samma paket, ett godkännande, rätt projekt och oförändrad samtalslivslängd. Inga externa anrop i vanliga svar.
- Slutkontroll mot live börjar med autentiserad inventering. Första live-körningen kräver ett granskat, exakt klassat paket; dagens tio är inte godkända mål genom detta dokument.

## Leveransgräns och granskning

Första implementationen omfattar register/klassningsvy, inventering/paket/kvitto, karantän/återställning, Atlas-kort och verktyg samt samordnad metrics v2. Det är en gränsöverskridande leverans i båda reporna och måste planeras i separata testbara steg före kodning. Detaljerad implementation och migrationsnamn skapas efter godkänd specifikation med respektive repos aktuella dokumentation och CLI.

Kodning är färdig först när beteendet är testat i båda projekten, skydd av riktiga poster bevisats och ändringen kan granskas. Publicering av funktionen och första hantering av riktiga live-poster redovisas separat. Denna specifikation ger varken allmän rätt att stänga riktiga företag eller att radera något permanent.
