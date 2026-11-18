# Atlas + Harvey för Handlarbörsen
Datum: 2026-10-17
Status: Godkänd av André 2026-10-17 kl. 11:52 Europe/Stockholm. Ingen installation, modellkörning, postfacksanslutning eller kundsändning har aktiverats.
Arbetsgren: `codex/atlas-harvey-sales-20261017`
Omnira-bas: `146c5db4db2acb2b4c7d4bf959e1603562b6ebaa`
Harvey-underlag: `ethanplusai/harvey@e114e95471b1bf155454fca108f0730b66a47a01`

## 1. Avsikt och färdigt användarflöde
André använder Atlas i Handlarbörsens projekt för att förbereda och senare genomföra relevanta kontakter med svenska bilhandlare. Harvey används som underordnad specialist; André behöver inte växla till Claude eller en separat Harvey-panel. Befintligt Strato-postfack ska kunna vara avsändare och ta emot svar.

Atlas ska kunna ta emot instruktionen ”Undersök nästa fem bilhandlare och förbered personliga mejl med rätt pilotnivå”, skapa ett beständigt uppdrag och återkomma med spårbara utkast. Innehåll, mottagare, avsändare och erbjudande ska granskas som en exakt version. Verifierat genomförande och osäkert genomförande ska visas olika.

Första leveransen är en sammanhängande pilot: Atlasuppdrag → lokal Harvey-specialist → sparat svenskt mejlutkast → granskning i projektet. Strato anslutningsprov och syntetiska mejlprov ingår först när postfacket anslutits säkert och den avgränsade provmottagaren valts. Kundutskick förblir avstängda tills konkreta mottagare och innehåll har godkänts. Full autonom försäljning och löfte om kunder/intäkter ingår inte.

## 2. Verifierat nuläge
| Underlag | Fynd | Betydelse |
| --- | --- | --- |
| Omnira `apps/web/app/api/chat/route.ts` | TOOLS, verktygsnamn, guider och executeTool använder modulära social-content-handlers | Följ befintligt mönster för Atlasverktyg |
| `apps/web/lib/social-launch/content/{atlas-tools,api}.ts` | Projekt-/konversationsbindning, versionsgranskning, same-origin för mutationer, begränsad indata | Återanvänd principerna; återanvänd inte SoMe:s konto- eller publiceringsrättigheter |
| `apps/web/lib/auth/project-access.ts` | Session och ägarbaserad lista över tillåtna projekt | Alla nya serveroperationer kontrollerar projekt innan administrativ databasåtkomst |
| `apps/web/lib/governance/execution-stop.ts` | Skiljer interaktiv läsning från mänskligt begärd och autonom exekvering | Chattmeddelande får inte kringgå projektets eller organisationens stopp |
| `apps/web/lib/os/review-queue.ts`, approval-route | Befintliga granskningar är bundna till en run; beslut sker atomiskt genom resolve_approval | Ett mejlutkast får ingen fristående ”approved”-flagga som ger sändningsrätt |
| Harvey `dashboard.py` | Lokala gränssnitt för status, start/stopp, utkast och beslut | Byggbart gränssnitt, inte en färdig Atlas-integration eller säker publik tjänst |
| Harvey `smtp_mail.py` | SMTP TLS på 465 och IMAP TLS; hämtar UNSEEN med RFC822 | Strato är protokollkompatibelt; delad inkorg behöver annan checkpoint-semantik |
| Harvey `gate.py` | Kontrollerar format, mottagarmatchning och en engelsk fraslista | Bevisar inte att svenska sakpåståenden eller pilotnivåer är korrekta |
| Harvey README | Claude/Codex, lokalt SQLite, kalenderbokning på roadmap | Specialistmotor finns; produktintegration och automatisk kalenderbokning är inte färdiga |

Stratos svenska dokumentation anger SMTP `smtp.strato.de:465` och IMAP `imap.strato.de:993`, SSL/TLS och full mejladress som användarnamn. Kontots faktiska serverinställningar bekräftas vid anslutningsprovet.
Källor: https://github.com/ethanplusai/harvey och https://www.strato.se/faq/e-post/e-postserver-adresser-portar-ssl-tls/

## 3. Alternativ och rekommendation
1. **Rekommenderat: Atlasstyrda jobb, lokal specialist och separata mejloperationer.** Atlas äger uppdrag, projekt, versioner och beslut. Harvey bidrar med forskning och formulering. En lokal worker hämtar avgränsade jobb utgående över HTTPS. Ger beständighet och en gemensam projektvy; kräver adapter och jobbkontrakt.
2. **Vidarebefordra Harveys befintliga HTTP-gränssnitt.** Snabbare prototyp, men kopplar ihop två oberoende köer och beslutsmodeller. Kräver ändå autentisering, projektskopning och sändningskontroll. Väljs inte.
3. **Bygga alla säljfunktioner direkt i Omnira.** Färre externa komponenter men mer ny kod och förlorad återanvändning av Harveys säljarbete. Kan bli aktuellt om specialistadaptern visar sig för dyr att underhålla.

Harveys fristående heartbeat och egen automatiska sändningsdränering körs inte parallellt. Den lokala dashboarden exponeras inte på internet. SQLite får vara lokal specialistcache; Omnira är källa för projekt, tillåtna kontakter, granskade versioner och genomförandekvitton.

## 4. Pilotens omfattning och kontaktregister
Starta med fem manuellt valda företag, högst ett första utkast per företag och körning. Inga nya betalda datakällor. Befintlig lista söks fram och verifieras innan import; uppgiften om 139 rader är tidigare kontext, inte en ny databasräkning.

Founding 5: GP Motor, Autolane, Moberg Bil, Tjänstebils Experten och Newman Bil Hässleholm; tidigare beslut är 12 månader gratis. Nästa 50 har 6 månader och resterande 82 har 2 månader enligt tidigare program. Dessa uppgifter importeras som versionsbundna erbjudanden och bekräftas mot aktuell tracker innan användning. Redan skickade mejl måste registreras innan en kontakt kan få nytt första mejl. Bilenia och Cartrade Europe AB behålls exkluderade enligt tidigare beslut.

Företag och filial är skilda begrepp. Normalisering av domän eller mejladress får inte slå samman filialer automatiskt. Sändningssuppression gäller mottagaradressen så att olika filialrader inte orsakar dubbla mejl till samma inkorg.

För varje utkast sparas fakta och käll-URL, tidigare kontakt, pilotnivå och erbjudandeversion. Saknade fakta blir tydliga frågor, aldrig påhittade kundnyttor, integrationslöften eller priser. Primärt mål är relevant pilotregistrering eller intresse; mötesbokning är ett alternativ, inte automatiskt kampanjmål.

## 5. Atlasverktyg och projektvy
Första verktygen är `get_sales_workspace`, `prepare_sales_drafts` och `get_sales_job`.
- Projekt och konversation valideras mot session och databas; inget standardprojekt eller första-match-fallback.
- `prepare_sales_drafts` kräver explicita kontakt-ID:n, erbjudandeversion och idempotensnyckel. Högst fem kontakter; ingen fri mottagaradress från modellen.
- Verktygen kan läsa, begära förberedelse och visa status; de kan inte godkänna eller skicka.
- Utkastvyn visar bolag/filial, källunderlag, historik, avsändare, mottagare, ämne, brödtext, erbjudande och granskningsstatus.
- Ändring av mottagare, avsändare, innehåll eller erbjudande skapar ny version och ogiltigförklarar föregående beslut.
- Projektet visar om worker eller Strato inte anslutits. Saknad anslutning visas inte som ”Atlas arbetar”.

Använd befintlig projektvy och Granskningar med ett avgränsat säljkort. Skapa ingen separat huvudnavigation. Inkommande mejl och webbtexter renderas som text och behandlas som externa data, inte som instruktioner till Atlas.

## 6. Worker, identitet och modell
Windows-datorn är första placeringsmål. Workern initierar HTTPS-anslutningar till Omnira; inga nya inkommande portar. Varje arbetsanslutning binds till ägare, Handlarbörsens projekt och endast säljförberedelse. Inga produktionsnycklar med generell service-role placeras på datorn.

Jobb har stabilt ID, request-hash, generation, tidsbegränsad claim och attempt-ID. Ny worker får inte överta en redan påbörjad extern operation utan avstämning. Resultat från fel projekt, återkallad identitet, förlorad claim eller gammal generation nekas.

Claude är första Harvey-provider på Windows enligt upstream. Codex-stöd måste kvalificeras separat i stödd miljö; lokala Ollama-modeller är inte en färdig Harvey-provider. Detta ändrar inte Atlas huvudmodell. Ingen fallback eller nedladdning sker tyst.

Modellarbete kräver ett giltigt projektuppdrag, stoppkontroll och en fast gräns om högst tio modellförsök per pilotjobb inklusive omförsök. När kvot saknas eller inte kan fastställas visas det; inga påhittade API-kostnader. Ingen separat API-nyckelväg aktiveras automatiskt. Villkor för vald abonnemangsanvändning verifieras innan verkliga modelljobb.

## 7. Strato och hållbar inkorg
Skriv utkast i Atlas; automatisk lagring i Stratos Utkast-mapp ingår inte i första piloten. Utskick använder det anslutna, verifierade postfackets avsändare.

Credentials matas in via en säker lokal anslutningsväg och lagras i operativsystemets credential-skydd. Lösenord ska inte efterfrågas i chatten, sparas i projektminne, skickas till modellen eller hamna i loggar/Git. SMTP-/IMAP-inloggningsprov skickar inget mejl.

Inkorgsläsningen använder mapp + UIDVALIDITY + UID. Använd PEEK, oberoende av lästmarkering. Spara ett inkommande meddelande beständigt och deduplicerat innan checkpoint flyttas. Vid UIDVALIDITY-byte görs begränsad omläsning och deduplicering; ingen blind nollställning som återstartar kampanjer.

Första anslutning importerar inte hela inkorgen till modellen. Operatören väljer relevant historik och en startgräns; automation hanterar endast registrerade kontakter och korrelerade trådar. Okända mejl syns som ej kopplade och får inga automatiska svar. Redan lästa relevanta svar och svar som läses från telefonen ska fångas.

## 8. Beslut, sändning och uppföljning
Förberedelse och redaktionellt godkännande är separata från aktivering av kundutskick. Ett framtida sändningsjobb binds till projekt, mailbox-ID, mottagare, draft-revision, innehållshash, erbjudande och explicit sändningsbeslut. Befintlig resolve_approval behöver kompletteras med hållbar sändningsöverlämning; ett efterföljande löst HTTP-anrop räcker inte.

Kontrollera vid dispatch att beslut och version fortfarande gäller, projekt inte är pausat, mottagaren inte svarat eller tackat nej och att ingen annan körning äger samma sändning. En ny spärr eller ett svar stoppar köade uppföljningar. Operatörens paus stoppar nya dispatchar; ett mejl som servern redan accepterat kan inte återkallas.

SMTP ger inte garanterad exakt-en-gång-leverans. Timeout efter möjlig serveracceptans ger `delivery_unknown` och manuell avstämning, aldrig automatisk omsändning. Kvitto skiljer på serveraccepterat, studs och mottaget svar; serveracceptans bevisar inte att mottagaren läst mejlet.

Första verkliga sändningsprov går till en konkret, av André vald testadress efter godkännande av den exakta testtexten. Svenska regler och Stratos villkor för den planerade kontaktformen verifieras före kundkampanj. Harveys inbyggda utlandsspecifika complianceinställning ersätter inte den kontrollen.

AI-självidentifiering får inte förbjudas av frasfilter. Svenska språkregler och sakgranskning läggs ovanpå formatkontrollen. Agenten får inte utge sig för att vara en människa eller påstå en kontakt/händelse som saknar underlag.

## 9. Genomförandegränser och acceptans
**A. Förberedelsepilot:** beständigt Atlasjobb, lokal adapter, fem kontaktbundna svenska utkast och exakt granskning. Nätverks-/modellfel, paus, fel projekt, dubbel begäran och sent resultat testas. Ingen kundsändning.
**B. Postfackspilot:** Strato-inloggningsprov, UID-baserad läsning, privat credential-lagring och avgränsat testutskick. Testa redan läst svar, dubbelhämtning, UIDVALIDITY-byte och omstart mellan mottagning och checkpoint.
**C. Kontrollerad försäljning:** hållbar sändningsöverlämning, suppression, stopp före dispatch, `delivery_unknown`, pilotnivå och tidigare kontakt. Fem manuellt valda kundkontakter är första möjliga kampanj; ingen generell autopilot.

Varje del ska kunna underkännas utan att de andra aktiveras. Saknat postfack eller modellabonnemang blockerar verkliga prov men inte lokala kontraktstester. Inga andra aktiva worktrees, röstflöden, lokala modellspår eller SoMe-kampanjer ändras.

Före ”klart” krävs verkligt flödesbevis för den del som levereras. Enhetstester eller lyckad SMTP-inloggning får inte presenteras som lyckad kundkontakt. Dagens arbete får inte beskrivas som färdig driftsättning innan det har inträffat.

## 10. Filområden och nästa steg
Nya sammanhållna moduler planeras i `apps/web/lib/sales/` och `workers/sales/`. Chatten får en smal modulregistrering i `apps/web/app/api/chat/route.ts`; projektvyn får ett säljkort. Beständig projektskopad kö och versionsdata följer befintlig Supabase/RLS- och migrationsprocess; exakta schema-/RPC-namn beslutas i genomförandeplanen efter designgranskning.

Upstream hålls på den angivna committen och MIT-licensen bevaras. Adaptern ska inte ändra installerade Claude-/Codex-inställningar eller importera instruktioner från andra projekt.

Självgranskning: avsikt och första leverans är tydliga; Atlas, specialist, modell och mejltransport är skilda; befintliga kontakter räknas inte som nyimporterade; version/beslut är bundna; delad inkorg och osäker sändning har återhämtningsregler; kundautopilot och kalenderbokning utlovas inte. Detta dokument innehåller inga credentials eller produktkod.

Nästa steg är granskning av genomförandeplanen och val av körsätt, därefter implementation med verifiering per del.
