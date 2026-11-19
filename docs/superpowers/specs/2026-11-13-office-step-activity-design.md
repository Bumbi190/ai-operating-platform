Ägaren godkände lokal utveckling enligt detta förslag den13november2026. Publicering och driftaktivering ingår inte.

# Office: avgränsad arbetsindikering för vald projektagent

Design och läsande nulägeskontroll, 13 november 2026. Ingen ny implementation eller driftaktivering genom detta dokument.

## Avsikt

Nästa del efter den accepterade Office-starten är att ge Familje-Pling användbar information om den uttryckligen valda agentens arbete. Identitetskopplingen ska fortsätta fungera med stängd webbsida och upphöra med kontorsbesöket. Status ska beskriva registrerade fakta utan att tillskriva en agent arbete som inte är bevisat.

## Verifierat nuläge

- PR #634 är mergad: main-merge `941b76e31f736564e02689b231288e8ffe1332b8`, Office-grenens head `03977982c0c33bd3c5ff08c37ae30e88c1009e21`. PR-kvittot dokumenterar accepterad Windows-start, riktig kontobunden identitet, fortsatt uppdatering efter stängd webbsida och frånkoppling vid spelstopp. Dessa acceptansprov har inte upprepats i detta steg.
- Aktuell arbetskopia: `C:\Users\Andre\Projects\Omnira\.worktrees\atlas-office-entry-20261106`. En genererad design-bundle har en befintlig lokal ändring och har inte ändrats här. Ingen ny gren eller PR har skapats.
- Läsande kontroll av Omniras databas `iboepohjwrhtgshrqaol`: Familje-Stunden har agenten Saga-berättare, kopplad genom `steps[].agent_id` till workflow **Familje-Stunden Månadspaket**.
- För just Saga-berättare hittades **0** körningar vars lagrade `runs.steps_snapshot[].agent_id` matchar agenten och **0** nu giltiga körningar med lease. Detta är en tidsbunden observation och bevisar inte frånvaro av alla tänkbara äldre körningar utan detta snapshotformat.
- Projektet som helhet har andra körningar. De får inte tillskrivas Saga-berättare bara för att de hör till samma projekt.
- Befintlig `step-evidence.ts` kan identifiera en färsk stegbegäran utan efterföljande svar när körningen fortfarande har giltig claim/lease. Det är en loggindikation, inte bevis på pågående modellkörning eller ett godkänt resultat.
- `visits.ts` skickar avsiktligt `stepEvidence:false` och `stepRequest:null`. Den privata SQL-funktionen `office_private.presence` återger endast vald identitet. Unreals sparade mottagare ignorerar idag frivilliga stegfält och visar fast text om okänd arbetsstatus.

## Alternativ och rekommendation

1. **Rekommenderad första etapp: registrerad stegaktivitet via besökskopplingen.** Återanvänd befintlig strikt klassificering och befintlig companion. Utöka den privata serverläsningen endast med avgränsad kör-/loggmetadata för vald agent. Detta ger nyttig men försiktigt namngiven aktivitet utan nya tjänster eller modellkörningar.
2. **Verifierad exekvering och resultat i samma etapp.** Kräver även producerande worker, bevis om exakt agentsteg, claim/attempt och resultat samt ett riktigt godkänt arbetsprov. En `running`-rad, en förnyad lease eller en lyckad hel workflowkörning räcker inte. Större arbete och eventuell separat provbudget.

Alternativ 1 är mitt förslag, inte ett redan fattat ägarbeslut. Alternativ 2 är fortsatt mål för följande etapp. En ny ständig lokal tjänst och browserberoende pollning rekommenderas inte: de strider mot det redan valda kontorsbesöket respektive stängd-webbläsare-kravet.

## Användarbeteende i första etappen

| Känt underlag | Text i Office |
| --- | --- |
| Ingen giltig koppling | Ingen verifierad anslutning |
| Verifierad identitet, ingen färsk entydig stegindikation | Identitet verifierad · arbetsstatus okänd |
| Färsk, entydig begäran för exakt vald agent och giltig claim/lease | Stegbegäran registrerad · körning ej verifierad |
| Svar har kommit, lease upphört, körning stoppats, metadata är tvetydig eller underlaget har blivit för gammalt | Identitet verifierad · arbetsstatus okänd, om identiteten fortfarande är färsk |
| Identitetsläsningen löper ut eller anslutningen nekas | Anslutning inaktuell · arbetsstatus okänd |

Ingen markering Ledig, Arbetar eller Klar utan motsvarande starkare bevis. En stegbegäran startar ingen arbetsanimation. Avsaknad av aktivitet ska inte vara en grön framgångssignal.

## Teknisk omfattning och rättigheter

- Första versionen gäller samma enda uttryckligen valda avatar/projekt/agent som idag. Inga nya agenter eller workflows skapas.
- Befintliga besök och äldre klienter behåller identitetsbehörighet. Ingen redan utfärdad grant uppgraderas. Implementatörens föreslagna beslut är en serverlagrad versionsbestämd läsomfattning med identitet som standard; bara ett nytt besök efter uttrycklig bekräftelse på en uppdaterad sida får stegmetadata. Sidan ska ange att den läser tekniska aktivitetsuppgifter för den valda agenten. Äldre create-anrop kan inte få den nya omfattningen av misstag, och native-paketet måste stödja samma kontraktsversion före attach. Okänd scope/version nekas. Vid rollback släcks aktivitetsbehörigheten medan tidigare identitetsläge kan behållas efter normalt nytt besök.
- Ny, lokalt förberedd uppföljningsmigration; den redan installerade migreringen ändras eller körs inte om. Befintlig `office_private.presence` utökas med begränsade, serverägda urval efter samma digest-/visit-, auth.sessions-, ägar-, projekt- och agentkontroller. Inga publika tabellgrants eller breda klientnycklar.
- Endast teknisk metadata som körnings-ID, stegordning, roll, tid, claim/lease, terminal-/cancel-/reconciliationflaggor och det avgränsade agentmappande snapshotet får läsas av statusklassificeraren. Prompter, inputs, kontext, svarstext, feltext, modeller, hemligheter och kommandon får inte hämtas eller skickas till Office.
- HTTP-svaret ska bara innehålla det minsta klassificerade stegunderlaget för den valda agenten. Extra interna fält ska inte slinka igenom rått. Projektscope och agentmappning verifieras mot lagrad körningssnapshot, aldrig endast aktuell workflowmall eller ett projekttotal.
- Avgränsade läsningar med samma dokumenterade tak som befintlig klassificering: högst 12 körningar och 120 loggposter. Träff på tak, databasfel, tvetydighet eller ofullständig snapshot ger ingen positiv indikation. Klassificeraren återanvänds i stället för en andra parallell tolkning i SQL.
- Bevara fyra timmars maxbesök, 30 sekunders serverlease, sekventiell befintlig åttasekunders uppdatering, fem sekunders total nätverksbudget och 20 sekunders identitetsgräns.
- Stegindikationen upphör senast vid det tidigaste av källans 90-sekundersgräns, källans claim-lease och identitetens giltighet. Den lokala mottagaren behöver skärpas för den kortare claim-gränsen; upprepade snapshots får inte förnya ett gammalt steg. Monoton lokal utgångstid krävs även vid klockändring eller pausad spelvärld.
- Uppdatera serverns strikta DTO, Python-mottagare och separat versionsbestämd Blueprint-konsument tillsammans. Unreals text väljs ur fasta texter efter fältvalidering, aldrig från godtycklig servertext. Bevara riggar, spelstyrning, bar, bartender och skylten.
- Bevara kompatibilitet och installationskontroller. Ändrade native-/pakethashar ska granskas och installeras genom befintligt kontrollerat flöde; inga hashkontroller slås av för att få starten att fungera.

## Acceptans och verifiering

Baslinje körd på Hultgren: befintliga `step-evidence.test.mjs` och `step-evidence-reader.test.mjs` passerar **14/14** med Node v22.22.3 och testsvitens nödvändiga `--experimental-vm-modules`. Ett första anrop utan VM-flaggan gav ett testladdningsfel; inga källfiler ändrades för att lösa det. Detta verifierar den befintliga klassificeraren och läsaren, inte den planerade Office-integrationen.

1. Separat disponibel lokal databas med syntetiska ägare, auth-sessioner, projekt, agenter, körningar och loggar. Ingen kopia av riktiga prompts eller sessionshemligheter.
2. Positiv kedja: exakt agentmappning → färsk stegbegäran → gällande lease → server-DTO → Pythonprojektion → faktisk native-text i ett osparat/isoleringstest.
3. Negativa fall: fel ägare/projekt/agent/session/digest, utloggning, återkallning, ändrad ägare/agentplacering, avbruten körning, reconciliation, svar efter begäran, leaseutgång, gammalt/framtida underlag, parallella tvetydiga körningar, lästak och DB-fel.
   Befintlig identitetsgrant och äldre klient ska dessutom testas mot den nya serverversionen: ingen aktivitetsläsning och ingen utökad scope utan nytt uttryckligt godkännande.
4. Stängd browser bevarar besöket; spelstopp rensar både identitet och aktivitet; pausad värld och klockbakslag får inte bevara en gammal indikation. Sena svar får inte skriva över en ny koppling.
5. Regression av befintliga Office- och isoleringstester, strikta fält-/storleksgränser, typkontroll och granskning. Befintlig stegklassificerares tester är baslinje, inte bevis för den nya integrationen.
6. Riktigt ägarprov efter granskad release: utan någon verklig körning ska Saga-berättare visa identitet med okänd arbetsstatus. Positiv verklig aktivitet kräver senare separat godkänt arbetsprov; syntetiska testdata får inte beskrivas som agentarbete.

## Kostnad, leverans och återställning

Lokal förberedelse använder befintliga verktyg. Inget nytt abonnemang, API-nyckel, modell-/röstanrop eller arbetsflödesstart föreslås i första etappen. Senare drift ger extra avgränsade DB-läsningar inom befintliga kvoter; det är inte ett löfte om noll marginalkostnad. Mät frågeantal och latenser lokalt före aktivering.

Före ny kodgren/PR krävs färsk ordinarie Git/PR-preflight. PR #634 är redan avslutad och ska inte påstås vara öppen. Kontrollera eventuell återanvändbar Office-fortsättning och bevara andra aktiva worktrees.

Först lokal utveckling, full testkedja och granskad exakt diff. Aktivering av utökad DB-läsning, frontend och ändrad native-installation kräver därefter ett konkret releasebeslut. Återställning återtar statusutökningen till identitetsläget och tidigare granskade paket/native-mottagare genom dokumenterade återställningskvittton; ingen körnings-/projektdata raderas, inga projektworkflows stoppas.

## Källor och granskningsgräns

Läsande verifiering: PR #634 via GitHub; källfilerna `step-evidence.ts`, `step-evidence-reader.ts`, `verified-agent-binding.ts`, `office/visits.ts`, `office_presence.py`, `PRESENCE_ADAPTER.md`, befintlig installerad SQL-migrering samt begränsade metadatafrågor mot rätt Omnira-projekt. Inga driftmutationer, nya tester med riktiga arbetsuppgifter, publicering eller native-assetändringar har gjorts i detta steg.

Den fullständiga Business Blueprint-boken har lokaliserats men inte lästs i denna avgränsade inventering. Före implementation ska relevanta vision-/arkitekturavsnitt och eventuell aktuell Office-överlämning kontrolleras. Dokumentet påstår inte en fullständig visions- eller säkerhetsrevision.

En separat läsande byggbarhetsgranskning identifierade en viktig öppen fråga: äldre identitetsbesök får inte ärva större läsåtkomst. Den är besvarad i kontraktet ovan med oförändrade äldre grants och ett nytt uttryckligt anslutningstillfälle. Detta är designgranskning, inte granskning av ännu obyggd kod.
