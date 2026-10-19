# Omnira veckokalender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bygg en bestående privat veckokalender som visar projektens verkliga tider och som Atlas kan läsa och ändra genom text och röstsamtal.

**Architecture:** En användarägd kalenderdomän hanterar manuella möten och arbetsblock. Läsadaptrar projicerar befintliga sociala scheman och workflow-väckningar utan att skapa en parallell körningskö. Kalenderns API och Atlas använder samma tjänster; den gemensamma tids- och statusmodellen förbereder ett senare Gantt-läge.

**Tech Stack:** Befintliga Next.js 14, React 18, TypeScript, Supabase/Postgres, CSS Modules, Intl, Vitest och Playwright. Ingen ny kalenderprenumeration eller betald komponent.

**Spec:** `docs/superpowers/specs/2026-10-18-omnira-calendar-design.md` — läs hela dokumentet inklusive Gantt-tillägget.

## Global Constraints

- Grunddesign och riktningen mot ett senare Gantt-läge godkändes av André 2026-10-18. Planen och Native-genomförande godkändes 2026-10-18T18:14:09Z.
- Ny menypost **Kalender**, destination `/calendar`, på dator och i mobilmenyn. Befintlig Planering behålls.
- Veckan börjar måndag, visningstiden är `Europe/Stockholm`, läsintervall är högst 31 lokala kalenderdagar.
- Första leveransen omfattar veckokalendern. Gantt får samma post-id, start, slut, projekt och status men en egen senare vy.
- Inga påhittade tider, deadlines, arbetslängder eller lyckade sparanden. En punkt utan sluttid förblir utan verklig sluttid.
- Privata poster och deras mutationskvitton är användarägda. En tom projektlista får inte stänga av den privata kalendern eller öppna alla projekt.
- Ändringar i sociala tider måste använda innehålls- och granskningsflödet. Kalenderverktygen får inte godkänna scheman, bekräfta kundåtkomst eller publicera.
- En kalenderbokning startar inte ett agentjobb.
- Befintliga sex Familje-Stunden-jobb lämnas orörda under införandet.
- Inga privata titlar/anteckningar i globala agentloggar eller projektminne. Servervaliderad användare och ägd konversation styr interaktiva Atlasverktyg.
- En unik lokal SQL-fixtur används för kalenderns tester; inga produktionstoken eller produktionsdatabaser får användas i testtransporten.
- Kör bara nödvändiga riktade kontroller under arbetet och samla den obligatoriska slutkontrollen till slutet. Dokumentera verkliga fel utan att hävda att en ej körd kontroll passerat.
- Inget produktarbete börjar förrän denna sparade plan har granskats. Agentupplägget väljs i granskningssvaret.

## Review Focus

1. Kontobyte eller ett sent röstsvar får inte visa en annan användares eller konversations privata poster — testas i Task 2, 4 och 5.
2. Heldag, nattöverskridande och sommartidsveckor ska hamna på rätt lokala datum utan uppfunnen sluttid — testas i Task 1 och 5.
3. Dubbelklick, röstomförsök och konkurrerande uppdateringar ska ge en post och en tydlig konflikt, inte dubbla möten eller tyst överskrivning — testas i Task 2 och 4.
4. Ett ändringsförslag för ett redan godkänt socialt jobb får inte dölja den gamla godkända tiden eller ge ny publiceringsrätt — testas i Task 3 och 6.
5. En trasig eller avklippt projektkälla får inte visas som en komplett tom vecka, och får inte dölja fungerande privata poster — testas i Task 3 och 5.

---

## Filgränser och gemensamma kontrakt

Alla paths nedan är relativa till `apps/web/` om inget annat anges.

- `lib/calendar/types.ts`: serialiserbara kontrakt och felkoder.
- `lib/calendar/time.ts`, `validate.ts`, `layout.ts`: rena tids-, indata- och kalendergeometrifunktioner.
- `lib/calendar/access.ts`, `store.ts`: inloggad ägare, autentiserad lagring och atomiska mutationer.
- `lib/calendar/source-social.ts`, `source-workflows.ts`, `source-tasks.ts`, `read.ts`: projektkällor, deduplicering och gemensam veckomodell.
- `lib/calendar/source-changes.ts`: begärda sociala tidsändringar genom befintliga källfunktioner.
- `lib/calendar/api.ts`, `atlas-tools.ts`, `stream-effect.ts`: HTTP, Atlas och kvitterad UI-uppdatering.
- `components/calendar/CalendarWorkspace.tsx`, `CalendarWeek.tsx`, `CalendarEventPanel.tsx`, `use-calendar.ts`, `Calendar.module.css`: egen kalenderupplevelse.
- `app/(platform)/calendar/page.tsx`, `app/api/calendar/route.ts`: tunna serveringångar.
- `lib/calendar/test-db.ts`, `fixtures.test-utils.ts` och tester bredvid respektive kalenderfil: ägda lokala fixturer.
- `e2e/calendar.spec.ts`, `e2e/calendar-server.mjs`, `playwright.calendar.config.ts`: deterministiska webbläsartester.

### Modell som alla tasks använder

`CalendarRange = {fromDate:string;toDateExclusive:string;timeZone:'Europe/Stockholm'}`, med lokala ISO-datum.

`CalendarTime = {kind:'timed';startUtc:string;endUtc:string|null;timeZone:'Europe/Stockholm'} | {kind:'all_day';startDate:string;endDateExclusive:string;timeZone:'Europe/Stockholm'}`.

`CalendarEventDraft = {kind:'private'|'work_block';title:string;description:string;location:string;projectId:string|null;taskId:string|null;time:CalendarTime;workStatus:'planned'|'in_progress'|'done'|null}`. Privat möte kräver `workStatus=null`; arbetsblock kräver ett värde.

`CalendarEvent = CalendarEventDraft & {id:string;version:number;status:'scheduled'|'cancelled';createdAt:string;updatedAt:string}`.

`CalendarActor = {userId:string;allowedProjectIds:string[]}` konstrueras endast på servern från den aktuella sessionen.

`CalendarSourceRef = {kind:'manual';eventId:string;version:number} | {kind:'social';projectId:string;postId:string;revisionId:string;sha256:string;jobId:string|null} | {kind:'workflow';projectId:string;instanceId:string}`.

`CalendarEntry = {id:string;source:CalendarSourceRef;title:string;time:CalendarTime;projectId:string|null;status:string;editable:boolean;href:string|null;pendingChange:{time:CalendarTime;reviewHref:string}|null}`. Källstatus behåller sin betydelse; UI har svenska etiketter.

`CalendarEventPage = {events:CalendarEvent[];truncated:boolean}`; läsaren hämtar högst 501 matchningar och returnerar högst 500.

`CalendarLayout = {days:{date:string;allDay:CalendarEntry[];timed:{entryId:string;startMinute:number;endMinute:number;column:number;columnCount:number;isPoint:boolean}[]}[]}`; visningsminuter är geometri, aldrig en ändring av originalets sluttid.

`CalendarWeekModel = {range:CalendarRange;entries:CalendarEntry[];unscheduledTasks:{id:string;projectId:string;title:string;status:string}[];projects:{id:string;name:string;color:string}[];availability:{manual:boolean;social:boolean;workflows:boolean;tasks:boolean};truncated:{manual:boolean;social:boolean;workflows:boolean;tasks:boolean}}`.

`CalendarMutation = {operation:'create';eventId:string;idempotencyKey:string;draft:CalendarEventDraft} | {operation:'update';eventId:string;expectedVersion:number;idempotencyKey:string;draft:CalendarEventDraft} | {operation:'cancel'|'restore';eventId:string;expectedVersion:number;idempotencyKey:string}`.

`CalendarDb = Awaited<ReturnType<typeof createClient>>` från `lib/supabase/server.ts`; `AdminDb = ReturnType<typeof createAdminClient>` från `lib/supabase/admin.ts`. Dessa används som type-importer i servertjänsterna. `CalendarReadDeps = {sessionDb:CalendarDb;adminDb:AdminDb}`. Den gemensamma klientmodellen tar inte emot klienter eller autentiseringsdata.

`CalendarReceipt = {ok:true;mutationId:string;event:CalendarEvent;calendarHref:string}`. Feltypen `CalendarFailure` är `{ok:false;code:'UNAUTHORIZED'|'NOT_FOUND'|'INVALID_INPUT'|'CONFLICT'|'UNAVAILABLE'}`.

## Task 1: Kalenderkontrakt, svensk tid och geometri

**Files:** Create `lib/calendar/{types,time,validate,layout}.ts` och `time.test.ts`, `validate.test.ts`, `layout.test.ts`. Modify `vitest.config.ts` för `lib/calendar/**/*.test.ts`.

**Interfaces:** Producerar kontrakten ovan samt `stockholmDate(instant:string):string`, `weekRange(date:string):CalendarRange`, `resolveCalendarLocal(local:string):string`, `parseCalendarRange(input:unknown):CalendarRange`, `parseCalendarMutation(input:unknown):CalendarMutation`, `layoutCalendarWeek(entries:CalendarEntry[],range:CalendarRange):CalendarLayout`. `CalendarLayout` följer det gemensamma kontraktet ovan och ändrar inte `CalendarEntry.time`.

- [x] Skriv röda tester med dessa exakta förväntningar:
  `weekRange('2026-10-18').fromDate === '2026-10-12'`;
  `resolveCalendarLocal('2026-12-01T20:30') === '2026-12-01T19:30:00.000Z'`;
  `2026-03-29T02:30` och `2026-10-25T02:30` avvisas;
  heldag 2026-10-25 till exklusivt 2026-10-26 visas den 25:e.
- [x] Lägg assertions för >31 lokala dagar, ogiltiga datum/UUID, titel >150, beskrivning >5000, plats >500, kontrolltecken, okända fält/ägare i indata, end<=start och fel kombination av kind/workStatus. För titel används trimmad icke-tom sträng; övriga gränser avser lagrad längd.
- [x] Testa två överlappande möten, ett nattöverskridande arbetsblock och en punkt med `endUtc=null`. Geometrin får segmentera för visning men ska bevara originaltid och original-id.
- [x] Kör `npm run test -- lib/calendar/time.test.ts lib/calendar/validate.test.ts lib/calendar/layout.test.ts`; verifiera meningsfullt FAIL före implementation.
- [x] Implementera de angivna funktionerna med Intl och kalenderdatumaritmetik. Återanvänd beteendet hos `lib/social-launch/content/validate.ts` för svensk tidsdisambiguering; flytta inte socialkod i denna task.
- [x] Kör samma tester till PASS och committa endast taskens filer.

## Task 2: Bestående privata poster och atomiska ändringar

**Files:** Create CLI-genererad migration med unikt suffix `_user_calendar_v1.sql`, `lib/calendar/{access,store,test-db,fixtures.test-utils}.ts`, `store.test.ts`, `isolation.test.ts`. Modify `scripts/migration-guard-policy.mjs`, `lib/qa/migration-guard-v2.test.ts`, `tests/isolation/schema-security.json`.

**Interfaces:** `resolveCalendarAccess():Promise<{ok:true;actor:CalendarActor;sessionDb:CalendarDb}|{ok:false;response:Response}>`; `listCalendarEvents(db:CalendarDb,range:CalendarRange):Promise<CalendarEventPage>`; `mutateCalendarEvent(db:CalendarDb,input:CalendarMutation):Promise<CalendarReceipt>`. `CalendarDb` är Supabase-klienten knuten till aktuell användarsession, inte admin-klienten. Den lokala testtransporten kör samma SQL med två olika autentiserade användaridentiteter.

- [x] Skriv röda integrationstester: ägare A skapar, laddar om, uppdaterar, avbokar och återställer; ägare B kan varken läsa raden, ändra den eller läsa dess mutationskvitto. En användare utan projekt kan skapa ett privat möte.
- [x] Skriv tester för samma idempotensnyckel/samma innehåll => samma kvitto, samma nyckel/annat innehåll => CONFLICT, två samtidiga uppdateringar med samma version => exakt en lyckas. Testa främmande projekt-/uppgiftsreferens och statusändring för ett arbetsblock.
- [x] Gör `initializeCalendarDb()` med ägarskapskontrollerad lokal Docker-fixtur enligt `lib/website-build/test-db.ts` och `lib/social-launch/scheduling/test-db.ts`. Använd en separat testdatabas för denna körning; vägra annan container/etikett än den godkända lokala testmiljön. Ingen nätverksadress eller produktionshemlighet tas emot som reserv.
- [x] Kör `npm run test -- lib/calendar/store.test.ts lib/calendar/isolation.test.ts`; verifiera FAIL mot ännu ej implementerad lagring.
- [x] Läs CLI `supabase migration new --help`, kör `supabase migration new user_calendar_v1` från webbprojektet och använd det faktiskt genererade filnamnet. Lägg inte till en tom migration förrän tasken utförs.
- [x] Implementera `user_calendar_events` och `user_calendar_mutations`. Ägare sätts av `auth.uid()`; RLS avgränsar båda tabellerna till ägaren. Ingen anon-åtkomst eller PUBLIC-funktionsrätt. Åtkomst med användarklienten hålls till egna poster.
- [x] Lägg atomiska `calendar_event_list(p_input jsonb)` och `calendar_event_apply(p_input jsonb)` som SECURITY INVOKER. Validera projektägande och uppgiftsreferens även på servern. Versionsjämförelse, ändring och journalföring sker i samma transaktion. Journalens unika nyckel är (owner_user_id,idempotency_key); kanoniskt requesthash och svar sparas i ägarens rad.
- [x] Uppdatera migrations- och säkerhetsregistret för exakt denna nya migration och dessa två ägarskopade tabeller. Öka verifierade aktuella antal; ändra aldrig frysta äldre undantag eller tidigare SQL-filer för att få test att passera.
- [x] Kör testerna samt `npm run test -- lib/qa/migration-guard-v2.test.ts lib/qa/schema-security-invariant.test.ts lib/qa/migration-security-gate.test.ts`; committa först efter PASS.

## Task 3: Verkliga projektkällor och säkra tidsändringsförslag

**Files:** Create `lib/calendar/{source-social,source-workflows,source-tasks,source-changes,read}.ts`, `sources.test.ts`, `source-changes.test.ts`.

**Interfaces:** `readCalendarWeek(deps:CalendarReadDeps,actor:CalendarActor,range:CalendarRange):Promise<CalendarWeekModel>`. `CalendarReadDeps` innehåller sessionDb och separat adminDb för befintliga ägarskopade projektläsare. `requestCalendarSourceMove(db:AdminDb,actor:CalendarActor,input:{source:CalendarSourceRef;localMinute:string;idempotencyKey:string}):Promise<{ok:true;reviewRequired:true;reviewHref:string}|CalendarFailure>`. `CalendarFailure` är felvarianten från Task 1. Källa workflow returnerar INVALID_INPUT och dess detaljlänk i UI; den får inte lokalredigeras som ett möte.

- [x] Skriv tester med lokala sociala fixturer: ett utkast utan kö visas som förslag; ett godkänt jobb deduplicerar samma posts utkast och visar köns tid/status; månatlig planeringsplats utan innehåll märks som innehåll saknas.
- [x] Skriv test där ett godkänt jobb har en ny innehållsrevision: gammal godkänd tid och nytt ändringsförslag syns samtidigt. Snapshotta jobbrader och approvals före/efter kalenderläsning och tidsförslag; inga nya godkännanden eller jobb får skapas.
- [x] Testa tom projektlista, obehöriga projekt, otillgänglig socialkälla, maxgräns och uppgifter utan tid. Privata fungerande poster ska finnas kvar vid fel i annan källa.
- [x] Kör `npm run test -- lib/calendar/sources.test.ts lib/calendar/source-changes.test.ts` till förväntat FAIL.
- [x] Implementera socialläsning genom `readSocialContent`, `readSchedules` och befintlig månadsplanering för godkända projekt. Begränsa varje källa till 500 poster per intervall och redovisa truncering. Lägg aldrig skapandedatum från manager_tasks i tidsrutnätet. Visa workflow_instances.wake_at som väckning/fortsättning.
- [x] Implementera sociala tidsförslag med `proposeSocialContent` och exakt aktuell revision. Återanvänd dess granskning; anropa inte approveSchedule, release_confirm eller dispatch. Återkommande cron-uttryck utan befintlig säker nästa-tid visas inte som uppfunna körningar.
- [x] Kör båda testerna till PASS och committa taskens filer.

## Task 4: Gemensamt HTTP- och Atlasflöde för text och röst

**Files:** Create `lib/calendar/{api,atlas-tools,stream-effect}.ts`, `api.test.ts`, `atlas-tools.test.ts`, `stream-effect.test.ts`, `app/api/calendar/route.ts`. Modify `app/api/chat/route.ts`, `lib/atlas/conversation/controller.ts`, `lib/os/chat-shared.ts`; create `lib/atlas/conversation/calendar-effects.test.ts`.

**Interfaces:** `calendarApi(request:Request):Promise<Response>`; `CALENDAR_TOOLS`, `CALENDAR_TOOL_NAMES`, `CALENDAR_GUIDE`; `handleCalendarTool(name:string,input:Record<string,unknown>,context:{actor:CalendarActor;conversationId:string|null;inputSource:'text'|'voice'},deps:CalendarReadDeps):Promise<unknown>`. `CalendarChangedEffect={event:'calendar_changed';conversationId:string;mutationId:string;eventId:string;version:number;calendarHref:string}`. Controller producerar `subscribeCalendarChanged(listener:(effect:CalendarChangedEffect)=>void):()=>void`.

- [x] Skriv röda API-tester för 401, same-origin POST, 32KiB strömmad bodygräns, okända fält/ägar-id och att ingen framgång returneras före sparat kvitto. GET tar fromDate och toDateExclusive samt valfritt projektfilter; filtret valideras mot actor.
- [x] Skriv verktygstester för samma create/update/cancel genom inputSource text respektive voice, saknad/främmande konversation, ambiguitet som inte får skriva, dubbelretry och användare utan projekt. Verktygen exponerar inte ownerUserId eller andra användares kalender.
- [x] Skriv effekttester: ingen kalenderuppdatering från modelltext, falskt tool_result, annat conversationId eller sent event från förra aktiveringsgenerationen. Endast kvitterad aktuell mutation får trigga omläsning.
- [x] Kör `npm run test -- lib/calendar/api.test.ts lib/calendar/atlas-tools.test.ts lib/calendar/stream-effect.test.ts lib/atlas/conversation/calendar-effects.test.ts` och verifiera FAIL.
- [x] Implementera GET/POST via Task 2/3, sessionens auth.getUser och private,no-store. Stödda POST-operationer är create/update/cancel/restore och source_move.
- [x] Registrera fyra verktyg: get_calendar, create_calendar_event, update_calendar_event och cancel_calendar_event. Update accepterar en diskriminerad manuell mutation eller en social source_move. Använd ägd konversation och sessionDb; kalenderverktygen får inte bli tillgängliga för fristående projektagenter.
- [x] Lägg svensk guide för relativa datum, tydlig följdfråga vid flera möjliga möten och att klar kräver sparat kvitto. Returnera serverbyggd kalenderlänk `/calendar?week=YYYY-MM-DD` där week är veckans lokala måndag. Datumet valideras innan det används i länk eller vy.
- [x] Skicka calendar_changed endast från lyckat serverresultat för aktuell ägd konversation. Validera effekten i controller och ge sidan en prenumeration. Råa privata verktygsindata/resultat ska inte skrivas till globala verktygsloggar eller projektminne; använd privata id-baserade kvitton i befintlig persistencegren.
- [x] Kör testerna till PASS och committa. Verifiera dessutom att både verktygslistan och dispatchgrenen är registrerade; registrering ersätter inte senare rösttest.

## Task 5: Veckosidan och manuellt kalenderarbete

**Files:** Create `app/(platform)/calendar/page.tsx`, alla `components/calendar/`-filer från filkartan, `e2e/{calendar.spec.ts,calendar-server.mjs}`, `playwright.calendar.config.ts`. Modify `lib/nav/{registry,vnext-nav}.ts`, `lib/atlas/workspace-registry.ts`; create `lib/qa/calendar-navigation.test.ts`.

**Interfaces:** `CalendarWorkspace({initialWeek,userId}:{initialWeek:CalendarWeekModel;userId:string})`; `useCalendarWorkspace(initialWeek:CalendarWeekModel,userId:string)` äger formulär, vald vecka, mutation och avbrutna fetcher. Den använder `useAtlasConversation().controller.subscribeCalendarChanged` och Task 4:s API.

- [x] Skriv röda navigationstester för ny destination calendar, /calendar, meny på dator/mobil, rätt Atlas sidkontext, validerad week-parameter och oförändrad /planning.
- [x] Skriv webbläsartester: skapa möte 2026-10-22 kl14–15, omladdning bevarar det, flytt till 2026-10-23 kl10–11, avboka/återställ och byt konto. Sent svar från föregående konto/vecka får inte ersätta aktuell vy.
- [x] Lägg test för heldag över sommartidsveckan, nattöverskridande arbetsblock, överlapp, punkt utan sluttid och arbetsstatus planned→in_progress→done. DOM ska använda samma stabila post-id och originaltid som modellen.
- [x] Testa 390px och bred datorvy, tangentbordsöppning, Escape som stänger panel utan att kasta osparad text samt läsfel/sparfel. Tillgängliga privata poster ska visas när socialkällan misslyckas.
- [x] Kör `npm run test -- lib/qa/calendar-navigation.test.ts` och `npx playwright test --config playwright.calendar.config.ts` till meningsfullt FAIL.
- [x] Låt serversidan välja aktuell lokal dag med stockholmDate innan weekRange anropas. Implementera CSS Modules-vecka med sju kolumner på dator, heldagsrad, nu-markör, dagsegment och sidopanel. Mobil visar en dag med veckans dagknappar. Verktygsfältet har föregående/nästa vecka, Idag, Ny händelse och projekt/privat-filter.
- [x] Använd bara Task 1:s modell/geometri och Task 4:s API. Avbryt fetcher och ignorera sena svar vid kontobyte, veckobyte eller avmontering. Visa svenska fel och kvarvarande osparat formulär vid skrivfel.
- [x] Knyt källposter till rätt native gransknings-/detaljsida. Inga tekniska tabellnamn, debugkort eller parallell uppgiftsboard i kalenderflödet.
- [x] Kör testerna till PASS, granska skärmbilder för dator/mobil och committa taskens filer.

## Task 6: Integrationsprov och oberoende granskning

**Files:** Create `lib/calendar/integration.test.ts` och `docs/validation/2026-10-18-omnira-calendar.md` i reporoten. Modify relevanta filer endast om prov eller granskning hittar fel.

**Interfaces:** Konsumerar Tasks 1–5. Producerar verifieringsrapport med exakt commit, kommandon, faktiska resultat och tydligt kvarstående manuellt röstprov om det inte har genomförts.

- [x] Skriv integrationstest för skapa→läsa→uppdatera→avboka genom riktiga lokala SQL-funktioner, båda inputSource-värdena och source_move för socialt utkast/godkänt jobb. Behåll före/efter-assertions på ursprungliga approvals och jobbrader.
- [x] Kör `npm run test -- lib/calendar lib/atlas/conversation/calendar-effects.test.ts lib/qa/calendar-navigation.test.ts`, `npx playwright test --config playwright.calendar.config.ts`, `npm run typecheck` och nödvändiga schema-/migrationskontroller från Task 2.
- [x] Kör befintliga obligatoriska projektisolerings- och konversationskontroller för ändrade chat-/nav-filer. Ange exakta urval och verkliga fel i rapporten; gör inga orelaterade baselinefixar.
- [x] Granska hela ändringen med separat granskare enligt det genomförande André väljer. Åtgärda fynd och kör endast berörda kontroller igen.
- [x] Dokumentera att en Gantt-vy kan läsa samma start/slut/projekt/workStatus och att ingen andra planeringslagring byggts. Själva Gantt-gränssnittet markeras som kommande.
- [x] Commita det verifierade slutläget och rapporten.

## Task 7: Granskningsbar förhandsversion och driftsättning

**Files:** Modify verifieringsrapporten. Produktionsmigrationen är enbart det oförändrade CLI-genererade kalender-SQL:et från Task 2.

**Interfaces:** En förhandslänk till /calendar och dokumenterade användartester. Ingen kalender får beskrivas som live utan faktisk migrerad databas, färdig produktionsdeploy och verifierad sida.

- [x] Skapa draft-PR med det faktiska slutbeteendet, datamodell/åtkomst och utförda kontroller. Behåll hela denna plan och godkänd spec i PR:en.
- [ ] Verifiera förhandsversionen med inloggad operatör och tillfälliga kalenderposter som är tydligt märkta test. Visa sparande och flytt genom text. Genomför faktiskt mötesskapande och flytt under röstsamtal när mikrofon finns; text med inputSource=voice räcker inte som ljudbevis.
- [ ] Låt André granska den konkreta förhandsversionen före sammanslagning/driftsättning. Ingen generell ”godkänd plan” ersätter denna resultatgranskning.
- [ ] Efter resultatgodkännande: kontrollera aktuell main/SQL-ledger, tillämpa exakt granskad migration, verifiera RLS/grants, mergat commit och READY-produktionsdeploy. Läs endast metadata för de sex befintliga socialjobben och bekräfta att kalenderinförandet inte ändrat dem.
- [ ] Kontrollera /calendar i produktion, tvåanvändarisolering och ett återställbart möte. Om driftkontroll misslyckas döljs kalenderingången och tidigare drift behålls; befintliga sociala köer ska inte stängas av.
- [ ] Uppdatera rapport/checkpoint med klart respektive ej genomfört. Nästa separat plan gäller Gantt-vyn över samma modell.

## Genomförande att välja vid plangranskningen

- **Native:** samma agent implementerar tasks i ordning, med en separat slutgranskare. Rekommenderas här för lägre kostnad och eftersom tidskontrakt, privat åtkomst och källprojektioner behöver hållas samman.
- **Subagent-driven:** färsk implementerare och granskare per task samt helhetsgranskning. Fler oberoende kontroller men fler agentkontexter och högre kostnad.

Native valdes av André 2026-10-18T18:14:09Z. Tasks1–6 är genomförda. Den frysta helhetskörningen och avgränsad jämförelse mot main är avslutade; faktiska breda baseline-/fixturfel redovisas utan orelaterade rättningar. Task7:s konkreta resultatgranskning, DB-anslutna text-/röstprov och drift återstår. Se verifieringsrapporten för faktiska resultat.
