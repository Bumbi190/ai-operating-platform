# Atlas Overview and Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Gör Översikt till startsida, behåll Atlas egen sida och ge övriga arbetsytor en liten flyttbar textchatt med valfritt röstsamtal.

**Architecture:** Återanvänd skalets AtlasConversationProvider och röstruntime. Lägg tyst textsändning i den gemensamma controllern, panelens tillstånd och geometri i små separata moduler och översiktens autentiserade läsning i en egen servermodell. Navigationen knyter ihop ytorna efter att delarna fungerar var för sig.

**Tech Stack:** Befintliga Next.js 14, React 18, TypeScript, Supabase, Vitest, Playwright, CSS Modules, react-markdown och remark-gfm. SVG för grafer; inga nya produktberoenden.

**Spec:** `docs/superpowers/specs/2026-10-15-atlas-overview-messenger-design.md`, godkänd av André den 15 oktober 2026.

## Global Constraints

- Arbeta endast i `C:\Users\Andre\Projects\Omnira\.worktrees\atlas-overview-messenger-20261015`, branch `codex/atlas-overview-messenger-20261015`, bas `605cc176dcdd60cae0c45b90947c84ce279b5d8a`.
- Minnespiloten på port 3015 och `codex/atlas-openviking-integration-20261015` ändras inte. Den andra chattens bygggren, budget, modellval och godkännanden ändras inte.
- Endast tre ordinarie panelkontroller: skicka, starta/avsluta samtal och minimera. Text måste fungera utan mikrofon.
- Rund symbol cirka 36–40 CSS-pixlar, träffyta minst 44 pixlar; datorpanel cirka 340 pixlar bred, högst 480 hög och minst åtta pixlars marginal där skärmytan medger det. Skrivfält högst tre rader.
- Återanvänd den fyruddiga Omnira-symbolen. Ingen stor titel, extra verktygsrad, förstoringsknapp, felsökningsinformation eller snabbfrågor i panelen.
- Text från panelen använder `inputSource: 'text'`, `visiblePlan: null`, `buildContext: null`; ingen mikrofon, STT, TTS eller ljuduppspelning. Befintliga servergrindar gäller även här.
- Vanlig navigation och minimering bevarar utkast, svar och samtal. Utloggning rensar tillstånd; sena svar får inte återställa det.
- Översikten visar sju eller trettio kalenderdagar, sju som förval, i Europe/Stockholm. Kostnadskälla är `cost_events.cost_sek`; körningsdag är `runs.created_at` och status är nuvarande status.
- Ägarscope tillämpas före läsning/aggregation. Saknad data och ofullständig paginering får inte bli verifierad nolla eller fullständig totalsumma. Collab-behörigheter utökas inte.
- Inga nya scheman, betalda modell-/bildanrop, insamlingsjobb eller löpande pollning. Ingen merge eller produktionsaktivering ingår i denna plan.

## Review Focus

1. Dubbeltryck medan första konversationen skapas, eller utloggning medan skapandet väntar: högst en tur och inget återupplivat kontotillstånd. Testas i uppgift 1 och 2.
2. En dold byggplan i den delade tråden och texten ”jag godkänner”: ingen plangodkänning eller byggstart. Testas genom faktisk serverväg i uppgift 1.
3. IME, mycket liten skärmyta, ändrad zoom och mobilens tangentbord: ingen ofrivillig sändning eller oåtkomligt skrivfält. Testas i uppgift 2.
4. Sommartidsbyte, negativ kostnadskorrigering, fel på en senare datasida och ägarscope som inte kan verifieras: rätt dygn och ingen falsk totalsumma. Testas i uppgift 3.
5. Collab/revoked session med manipulerad UI-cookie eller returadress: befintlig rollstyrd landning och ingen läsning av ägarens kostnader. Testas i uppgift 3 och 5.

---

## Filkarta och ansvar

Alla nedanstående sökvägar är relativa till `apps/web/`, om inte annat anges.

| Del | Filer | Ansvar |
| --- | --- | --- |
| Gemensam textväg | `lib/atlas/conversation/controller.ts`, `controller.test.ts`, `lib/atlas/runtime.tsx`, `lib/website-build/chat-tools.test.ts` | Första konversationen, samtidig sändning, tysta turer och bygggrindens regression. |
| Kompakt chatt | `components/platform/os/AtlasMiniOrb.tsx`, `AtlasLauncherOrb.tsx`, `AtlasLauncherOrb.module.css`; nya `AtlasMiniChatPanel.tsx`, `AtlasMiniChatPanel.module.css`, `lib/atlas/mini-chat/geometry.ts`, `use-mini-chat-state.ts` | Launcher, endast tre kontroller, minne i skalet, dragning och mobil vy. |
| Översiktens data | Nya `lib/overview/types.ts`, `period.ts`, `read-pages.ts`, `view-model.ts` | Datakontrakt, Stockholmsdygn, begränsad paginering och autentiserad ägarläsning. |
| Översiktens presentation | Nya `components/platform/overview/OverviewDashboard.tsx`, `OverviewCharts.tsx`, `overview.module.css`; `app/(platform)/dashboard/page.tsx` | Periodlänkar, projektkort, verkliga grafer, tillgänglighet och uppdateringstid. |
| Start och navigation | `app/page.tsx`, `lib/nav/registry.ts`, `vnext-nav.ts`, `legacy-nav.ts`, `breadcrumbs.ts`, `lib/auth/safe-redirect.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/update-password/page.tsx`, `app/auth/confirm/page.tsx`, `components/platform/vnext/AtlasHomeVNext.tsx` | Översikt som start; Atlas och historik finns kvar; ta bort extra bygglänk. |
| Enhetstest | Nya `lib/qa/atlas-mini-chat-geometry.test.ts`, `overview-period.test.ts`, `overview-view-model.test.ts`, `overview-dashboard.test.ts`, `overview-auth-navigation.test.ts`; befintliga nav-/auth-/launcher-tester | Beteenden och säkerhetsgränser. Behåll tester som inte ändras av godkänd design. |
| Browserfixture | Nya `e2e/atlas-overview-messenger-entry.tsx`, `atlas-overview-messenger-auth.ts`, `atlas-overview-messenger-server.mjs`, `atlas-overview-messenger.spec.ts`, `playwright.atlas-overview-messenger.config.ts` | Riktiga produktkomponenter med mockad server och mikrofon, utan modellkostnad. |
| Verifiering | `docs/superpowers/verification/2026-10-15-atlas-overview-messenger.md` från reporoten | Jämförbara testresultat, browserbilder och kända begränsningar. |

## Uppgift 1: En gemensam, tyst textsändning

**Files:** Gemensam textväg i filkartan. Ingen ändring av bygggrenens produktkod eller modellinställningar.

**Interfaces:** Controllern får `ensureConversation(input: {firstText: string; inputSource: 'text' | 'voice'; projectId: string | null}): Promise<string | null>` och `sendCompactText(input: {text: string; initialProjectId: string | null}): Promise<TurnResult>`. Exportera `TurnResult = {ok: boolean; notice?: string}` och återanvänd den för `sendTurn`. Befintlig constructor med injicerbar `fetch`, snapshot och generationsisolering behålls.

- [x] Spara en baslinje för riktade tester, typkontroll och lint innan produktändringar. Kör från `apps/web`: `npx vitest run lib/atlas/conversation/controller.test.ts lib/qa/atlas-launcher-vnext.test.ts lib/qa/navigation-closure.test.ts lib/qa/safe-redirect.test.ts`, `npm run typecheck`, `npm run lint`. Spara kommandon, SHA och felidentiteter utanför spårade produktfiler; befintliga fel är inte nya regressioner.
- [x] Lägg beteendetester i `controller.test.ts` med injicerad fetch och styrbar SSE. Testnamn och centrala assertioner:

  ```ts
  // 'compact text is quiet and excludes an unseen plan'
  expect(body.inputSource).toBe('text')
  expect(body).not.toHaveProperty('voice')
  expect(body).not.toHaveProperty('websitePlanRef')
  expect(body).not.toHaveProperty('buildContext')
  // 'double send during creation sends one turn'
  expect(createRequests).toHaveLength(1)
  expect(chatRequests).toHaveLength(1)
  // 'signout or explicit thread switch invalidates pending creation'
  expect(controller.snapshot().id).toBe(expectedCurrentId) // null efter utloggning, annan vald tråd annars
  expect(chatRequests).toHaveLength(0)
  ```

  Lägg också assertioner för nekad/trasig skapanderespons, delat historikförlopp text→röst→text och att befintligt projekt-ID består när en annan initialProjectId skickas.
- [x] Kör `npx vitest run lib/atlas/conversation/controller.test.ts`; de nya testerna ska falla på saknade metoder/beteenden.
- [x] Implementera metoderna i `controller.ts`. Flytta själva skapandeflödet från runtime till `ensureConversation`; dela pågående skapandelöfte, kontrollera generation efter await och lås kompakta sändningar synkront. `sendCompactText` trimkontrollerar, återanvänder aktuell tråd och anropar `sendTurn` med uttryckliga null-referenser och utan röstcallback. Runtime delegerar sitt befintliga skapande till samma metod och behåller röstfelmeddelandet. Ny projektbindning får endast hämtas ur runtime-skalets serverlevererade projektlista och befintlig servervalidering.
- [x] Utöka `lib/website-build/chat-tools.test.ts` med `'compact approval without a visible reference does not dispatch a build'`. Använd dess isolerade SQL-fixture och mockade provider: skapa en riktig väntande plan, skicka den kompakta requestformen till verklig `POST /api/chat`, låt även mockmodellen föreslå bekräftelse. Assert `expect(newDecisions).toHaveLength(0)` och `expect(newBuildSessions).toHaveLength(0)` för både ”jag godkänner” och modellens verktygsförslag. Inga riktiga provideranrop. Om detta avslöjar en serverlucka: dokumentera den och stoppa nästa UI-uppgift tills gränsen har rättats och testet passerar.
- [x] Kör `npx vitest run lib/atlas/conversation/controller.test.ts lib/website-build/chat-tools.test.ts lib/atlas/voice-capture.test.ts`. Förväntat: nya tester gröna; befintliga SQL-setupfel måste särskiljas från testresultat och lösas i testmiljön, inte rapporteras som godkänd bygggrind.
- [x] Granska diff och committa endast uppgiftens fyra filer: `feat(atlas): add a quiet shared text path`.

## Uppgift 2: Den lilla flyttbara chatten

**Files:** Kompakt chatt och browserfixture i filkartan, nya geometritestet samt befintligt `lib/qa/atlas-launcher-vnext.test.ts`. `AtlasMiniOrb` sitter kvar utan route-key i det autentiserade skalet.

**Interfaces:** `Point = {x: number; y: number}`, `Viewport = {left: number; top: number; width: number; height: number}`. `clampMiniChat(position: Point, size: {width: number; height: number}, viewport: Viewport, margin?: number): Point` har marginal 8 som förval. `useMiniChatState(onSignout: () => void): MiniChatState`, där `MiniChatState = {isOpen:boolean; draft:string; position:Point|null; openPanel:()=>void; minimize:()=>void; setDraft:(text:string)=>void; setPosition:(point:Point)=>void}`; tillståndet lever i hookens beständiga skalinstans. `AtlasMiniChatPanel(props: {onMinimize: () => void; draft: string; onDraftChange: (text: string) => void; position: Point | null; onPositionChange: (point: Point) => void; initialProjectId: string | null}): JSX.Element` konsumerar delad controller och runtime direkt.

- [x] Skriv geometritest med `expect(clampMiniChat({x: 900,y: -20},{width:340,height:480},{left:0,top:0,width:800,height:600})).toEqual({x:452,y:8})`; lägg varianter för visualViewport-offset, krympning och mindre viewport än panelen. Panelen krymps först till tillgänglig storlek, sedan kläms positionen.
- [x] Bygg browserfixture enligt befintlig `e2e/atlas-entry-server.mjs`: riktiga providers, launcher och panel; Next-navigation och Supabase-klient mappas till fixtures. Servern är enbart localhost på ledig port 54392, en worker och `reuseExistingServer:false`; den ska avbryta om porten redan används. Skapa `atlas-overview-messenger-auth.ts` med styrbar SIGNED_OUT-händelse; återanvänd befintlig navigationstub där möjligt. Mocka `/api/conversations`, SSE `/api/chat`, SpeechRecognition och ljud. Blockera oregistrerade externa requests.
- [x] Skriv browsertester med assertionerna nedan. Uppdatera gamla launcher-källkontrakt som uttryckligen låser röststart, 52-pixelsfotavtryck och maximera-knapp; behåll symbol-, fokus-, reduced-motion-, skalmonterings- och behörighetsregressionerna.

  ```ts
  // 'opening and typing is silent; double Enter sends once'
  expect(micStarts).toBe(0); expect(ttsRequests).toBe(0)
  expect(conversationRequests).toBe(0) // efter öppning, före första skickning
  await expect(panel.getByRole('button')).toHaveCount(3)
  expect(chatRequests).toHaveLength(1)
  // 'IME does not send; Shift+Enter creates a newline'
  expect(chatRequests).toHaveLength(0)
  await expect(editor).toHaveValue('rad ett\nrad två')
  // 'route navigation, hidden full chat, and minimize preserve state'
  await expect(editor).toHaveValue('oskickat utkast')
  await expect(panel).toContainText('hela det strömmade svaret')
  // 'denied microphone leaves text usable; minimize does not hang up'
  await expect(panel).toContainText('text')
  await expect(editor).toBeEditable()
  expect(voiceStopsAfterMinimize).toBe(0)
  ```

  Testa också explicit start/lägg på, fokus tillbaka till launcher, ingen dragning från skrivfältet, länkar säker-renderade utan rå HTML, signout före/under svar och sena skapanderesponser. Mät panelens bounding box inom visualViewport vid 390×844, 1280×800 och 1920×1080, efter resize/zoom samt simulerat mobilt tangentbord. IME-event och virtualViewport-fixtur bevisar browserbeteende i fixturen, inte alla fysiska mobiler.
- [x] Kör `npx vitest run lib/qa/atlas-mini-chat-geometry.test.ts` och `npx playwright test -c playwright.atlas-overview-messenger.config.ts`; nya beteenden ska först falla.
- [x] Implementera geometri och tillståndshook. Bara koordinater får lagras lokalt, schema-/finite-validerade. SIGNED_OUT rensar utkast, öppet tillstånd och position samt stoppar röst. Håll utkast per konversations-ID i minnet så att uttryckligt trådbyte inte flyttar oskickad text till en annan tråd; första skapandet flyttar den nya trådens utkast till dess nya ID. Testa återgång till respektive tråds utkast. Ingen återanvändning av `useComposerDraft` som sparar text i sessionStorage. Panelen förblir monterad när den döljs på `/atlas`, `/chat` och `/chat/[id]`; gör inte routebyte till återställning.
- [x] Implementera panel och launcher. Bara header är dragyta; pointer capture och dragtröskel skiljer drag från klick. Lyssna på fönster-/visualViewport-ändring, använd safe-area och lås bakgrundsrullning när mobilpanelen kräver det. Skicka anropar uppgift 1; knappen för samtal växlar befintlig activate/deactivate. Visa korta röst-/sändfel inline. Säker Markdown som i fullchatten, enbart textmeddelanden och kort workspace-länk vid bygggranskning. Bevara pågående text och röst vid minimera. Meddelanderullning följer nya svar när läsaren redan är nära botten.
- [x] Kör samma tester igen plus `npx vitest run lib/qa/atlas-launcher-vnext.test.ts lib/atlas/conversation/controller.test.ts`; förväntat grönt för nya beteenden. Spara browserbilder för alla tre storlekar.
- [x] Granska diff och committa endast uppgiftens filer: `feat(atlas): add the compact movable messenger`.

## Uppgift 3: Korrekt och ägaravgränsad översiktsdata

**Files:** Översiktens data i filkartan samt `lib/qa/overview-period.test.ts` och `overview-view-model.test.ts`.

**Interfaces:** `OverviewPeriod = 7 | 30`, `DataState = 'complete' | 'partial' | 'unavailable'`, `ReadResult<T> = {state: DataState; rows: T[]}`, `Metric<T> = {state: DataState; value: T | null}`. Icke komplett metric har alltid value null. `stockholmPeriod(days: OverviewPeriod, now: Date): {startIso: string; endIso: string; dayKeys: string[]}` ger vald kalenderperiod inklusive idag och exklusiv nästa midnatt. `readOverviewPages<T>(query: (from: number, to: number) => PromiseLike<{data: T[] | null; error: unknown}>): Promise<ReadResult<T>>` använder sidor om 500, högst 40, och returnerar partial om fullständighet inte kan bevisas.

`OverviewModel = {period: OverviewPeriod; generatedAt: string; projects: ReadResult<OverviewProject>; costByDay: Metric<CostDay[]>; costByProject: Metric<ProjectCost[]>; runsByDay: Metric<RunDay[]>; totals: {running: Metric<number>; failed24h: Metric<number>; pendingApprovals: Metric<number>}}`. Definiera i types.ts: `OverviewProject = {id:string; name:string; slug:string; color:string|null; href:string; runningRuns:Metric<number>; failedRuns24h:Metric<number>; pendingApprovals:Metric<number>}`, `CostDay = {date:string; costSek:number}`, `ProjectCost = {projectId:string; costSek:number}`, `RunDay = {date:string; counts:Record<string,number>}`. `buildOverviewModel({db,userId,period,now}: {db:any; userId:string; period:OverviewPeriod; now:Date}): Promise<OverviewModel>` konsumerar verifierad användaridentitet; `loadOverviewModel(period: OverviewPeriod): Promise<OverviewModel | null>` kör getUser och anropar builder med adminläsare först efter autentisering. AnyDb-mönstret följer befintlig serverläsare; inga adminobjekt serialiseras till klienten.

- [x] Skriv tester för ägare A/B med avsiktligt läckande service-role-dubbel, arkiverade/raderade projekt, tom ägare, nekad autentisering, läsfel och sidgränser. Centrala assertioner:

  ```ts
  // 'Stockholm calendar days cross both DST boundaries'
  expect(stockholmPeriod(7,new Date('2026-03-30T10:00:00Z')).dayKeys).toHaveLength(7)
  expect(stockholmPeriod(7,new Date('2026-03-30T10:00:00Z')).startIso).toBe('2026-03-23T23:00:00.000Z')
  expect(stockholmPeriod(7,new Date('2026-10-27T10:00:00Z')).startIso).toBe('2026-10-20T22:00:00.000Z')
  // 'foreign rows are excluded before all aggregates'
  expect(model.projects.rows.map(p=>p.id)).toEqual([OWNED_ACTIVE])
  expect(model.costByProject.value).toEqual([{projectId:OWNED_ACTIVE,costSek:8.5}]) // 10 + korrigering -1.5
  // 'empty success differs from failure or a truncated later page'
  expect(empty.totals.running).toEqual({state:'complete',value:0})
  expect(failed.costByDay).toEqual({state:'unavailable',value:null})
  expect(truncated.costByDay).toEqual({state:'partial',value:null})
  ```

  Testa dubblett-ID mellan datasidor, exakt full sista tillåten sida, null/NaN-kostnad, ogiltig tidsstämpel, okänd körningsstatus och en fortfarande pågående körning skapad före 30-dagarsperioden. Kontrollera också att ingen adminfråga för kostnader körs utan verifierat scope och att scope-läsfel inte blir en lyckad tom översikt.
- [x] Kör `npx vitest run lib/qa/overview-period.test.ts lib/qa/overview-view-model.test.ts`; förväntat rött på saknade moduler.
- [x] Implementera period och paginering. Beräkna verkliga Stockholmsmidnätter, inte 7×24 timmar. Stabila ordningar avslutas med unikt id. Vid fel efter mottagna sidor: partial; första sidans fel: unavailable. Dubbletter, ogiltiga nödvändiga värden eller sidtak får inte ge en komplett metric.
- [x] Implementera loader och builder. Anropa färsk `getAllowedProjectIds`; verifiera dessutom resultatet mot paginerad `projects`-läsning med `.eq('owner_id',userId)`, eftersom befintlig helper döljer läsfel som tom lista. Skillnad mellan listorna eller ofullständig verifiering ger otillgängligt/ofullständigt scope, inga totalsummor. Använd befintlig lifecycle-tolkning och håll bara aktiva synliga ägarprojekt. Alla följande frågor får `.in('project_id',verifiedIds)` före pagination/aggregation; försvarsfiltrera återkomna rader igen. Tomt verifierat scope gör inga projektdatakällfrågor.
- [x] Läs kostnader och körningsserier inom start/end. Läs running, failed senaste 24 timmarna och pending approvals separat så att periodval inte tappar gamla aktiva körningar/godkännanden. Null/global approvals ingår inte. Bevara okänd status i körningsräkningen. Fyll saknade dagar med noll endast för komplett, verifierad dataset; använd inte Atlas-hemmodellens begränsade senaste-40/30-listor för totaler.
- [x] Kör nya tester och `npx vitest run lib/qa/atlas-home-view-model.test.ts lib/qa/collaborator-project-permissions.test.ts`. Förväntat inga nya regressionsfel. Committa endast uppgiftens data-/testfiler: `feat(overview): read scoped costs and run metrics`.

## Uppgift 4: Översikt med verkliga grafer och projektkort

**Files:** Översiktens presentation, `lib/qa/overview-dashboard.test.ts` och utökad browserfixture.

**Interfaces:** `OverviewDashboard({model}: {model: OverviewModel}): JSX.Element` och `OverviewCharts({model}: {model: OverviewModel}): JSX.Element` konsumerar uppgift 3 utan nya dataläsningar. `DashboardPage({searchParams}: {searchParams: {period?: string}}): Promise<JSX.Element>` väljer 30 bara för exakt `period=30`, annars 7, och redirectar till login om loadern returnerar null.

- [x] Skriv render-/browsertester: `expect(html).toContain('Översikt')`, `expect(html).toContain('/atlas')`, `expect(html).toContain('Uppdaterad')`. För lyckad tom serie finns en nollmarkering; unavailable visar ”Data kunde inte läsas”, partial visar ”Ofullständiga data” och varken graf eller totalsumma ser komplett ut. Periodlänkar har `/dashboard?period=7` respektive `30`. Lägg foreign secret-namn i fixtureunderlag och assert att de aldrig visas efter servermodellens filtrering.
- [x] Kör `npx vitest run lib/qa/overview-dashboard.test.ts`; förväntat rött innan komponenterna finns.
- [x] Implementera responsiv översikt i befintligt designspråk: rubrik och periodval, kort för running/failed24h/pending, kostnad per dag, kostnad per projekt, körningar per dag/status och projektkort med respektive projekts körnings-/godkännandestatus och riktiga destinationslänkar. SVG-grafer får titlar, förklaringar och motsvarande tillgängliga värdetabeller. Datum/tid och SEK formateras för svenska med Europe/Stockholm. Inga påhittade demo-/livevärden eller nya trafik-/intäktskort. Behåll Atlas tydligt nåbar utan att lägga tillbaka den redundanta bygglänkraden.
- [x] Kör nya render-tester och browserfixture för alla tre skärmstorlekar samt 7/30, tomt, partial och unavailable. Förväntat läsbara grafer, ingen horisontell sidskroll och inga nya requests när chattpanelen öppnas. Committa uppgiftens filer: `feat(overview): add project and activity dashboard`.

## Uppgift 5: Startsida, Atlas och konsekvent navigation

**Files:** Start/navigation i filkartan; `lib/qa/overview-auth-navigation.test.ts`, befintliga `safe-redirect`, `omnira-login-polish`, `navigation-closure`, `vnext-nav-model`, `legacy-nav-contract`, `mobile-nav-contract`, `vnext-mobile-shell-nav`, `breadcrumbs` samt `lib/nav/registry.test.ts` efter behov. Middleware granskas/testas; dess befintliga rollgates ska normalt inte behöva produktändringar.

**Interfaces:** Lägg destination-ID `overview` med bas `/dashboard`, etikett `Översikt`, projektläge none och sökord overview/översikt/home/start/hem. `atlas` behåller `/atlas` och Atlas/briefing. `safeAuthDestination(value: string | null | undefined): string` behåller signatur och exakt befintlig tillåtlista plus `/dashboard`; förval/fel blir `/dashboard`. `collaboratorNavHref('/dashboard')` fortsätter leda till `/organization` via befintligt fallbackbeteende.

- [x] Skriv beteendetester: `expect(safeAuthDestination(null)).toBe('/dashboard')`, `expect(safeAuthDestination('/organization')).toBe('/organization')`, `expect(safeAuthDestination('//evil.example')).toBe('/dashboard')`, `expect(pathToDestination('/dashboard')).toBe('overview')`. Befintliga tillåtna `/atlas` och `/viewer/handlarborsen` bevaras. Testa kommando-/sökordsresolvern för hem→overview och Atlas→atlas, samt konsekvent desktop/mobil/breadcrumb.
- [x] Lägg tester som anropar verklig middleware med NextRequest och mockad färsk Supabase-identitet: collaborator `/dashboard` skickas till `/organization`, collaborator `/atlas` till `/organization/atlas`, revoked får 403 och UI-cookie ändrar inget av detta. Testa root-sidans faktiska redirect-anrop till `/dashboard` separat; ägarens middleware ska släppa igenom till den sidan. Assert att overview-loadern inte frågar cost_events för oautentiserad användare. Förväntningarna gäller returnerad Location/status, rootens redirect och frågespår, inte bara sökning efter kodsträngar.
- [x] Kör `npx vitest run lib/qa/overview-auth-navigation.test.ts lib/qa/safe-redirect.test.ts`; förväntat rött för nytt förval/destination.
- [x] Ändra rootredirect och login/password-update-förval till dashboard. Password-login använder safeAuthDestination för uttrycklig `next`; magic-link/confirm behåller samma allowlistade returväg. Callback använder redan helpern; uppdatera missvisande kommentarer. Låt middleware fortsätta rollstyra collaborator och viewer. Root skapar inga egna roll-/cookieundantag.
- [x] Lägg Översikt först/primary i båda navgenerationerna och behåll Atlas som egen post; uppdatera registry, kommandopalettens befintliga registry-konsumenter och breadcrumbs. Ta bort bara `buildLinks`-navet i AtlasHomeVNext, inte byggposten i sidomenyn eller Atlas övriga funktioner. Bevara `/chat`, bygg- och projektreturlänkar och övriga navgrupper.
- [x] Kör `npx vitest run lib/nav lib/qa/navigation-closure.test.ts lib/qa/vnext-nav-model.test.ts lib/qa/legacy-nav-contract.test.ts lib/qa/mobile-nav-contract.test.ts lib/qa/vnext-mobile-shell-nav.test.ts lib/qa/breadcrumbs.test.ts lib/qa/safe-redirect.test.ts lib/qa/omnira-login-polish.test.ts lib/qa/organization-navigation-guard.test.ts lib/qa/overview-auth-navigation.test.ts`. Avsiktligt ändrade gamla start-/primary-assertioner uppdateras till godkänd design; övriga säkerhetsassertioner behålls. Committa endast uppgiftens filer: `feat(nav): make overview the owner homepage`.

## Uppgift 6: Samlad verifiering och konkret leverans

**Files:** Browserfixture och verifieringsdokument i filkartan. Inga produktändringar om kontrollerna inte visar fel.

**Interfaces:** Föregående uppgifters kontrakt är låsta. Denna uppgift producerar verifieringsrapport med branch-/bas-SHA, kommandon, resultat, bilder och tydlig åtskillnad mellan fixtureprov och verklig driftsmiljö.

- [x] Utöka browseracceptansen för en sammanhängande resa: översikt→projekt→öppna panel→skriv→minimera under SSE→annan sida→återställ utkast/svar→full chatt samma id→Atlas egen sida. Assert en konversation, en request per tur och ingen STT/TTS på textvägen. Testa vald annan tråd och utloggning mitt under svar. Kör från `apps/web`: `npx playwright test -c playwright.atlas-overview-messenger.config.ts`.
- [x] Kör fokuserade Vitest-filer från uppgift 1–5, `npm run typecheck` och `npm run lint`. Jämför varje fel mot samma bas-SHA och samma beroenden/SQL-fixture. Jämför hela Vitest-sviten mot basen en gång; redovisa nya testantal och identiska kvarvarande fel utan att kalla en röd helsvit grön. Upprepa bara efter relevanta nya ändringar/fel.
- [x] Inspektera sparade browserbilder på mobil, vanlig och bred dator samt tangentbordsfokus. Mockad mikrofon rapporteras som mockad; ett verkligt röstsamtal är inte verifierat av dessa prov. Ett isolerat preview får inte ersätta eller återanvända minnespilotens port/runtime eller göra skarpa provideranrop.
- [x] Skriv verifieringsrapporten med uppfyllda kriterier, återstående begränsningar och hur André provar: startsidan Översikt, Atlas i menyn, rund ikon på projektsida, text utan mic och minimera/återöppna. Nämn separat var befintligt minnestest finns om efterfrågat, utan att flytta in det som ny dashboardfunktion.
- [x] Genomför oberoende helgrensgranskning enligt vald exekveringsmetod. Åtgärda relevanta fynd och kör de berörda kontrollerna. Ingen review-agent används under denna plans självgranskning.
- [x] Kör `git diff --check`, kontrollera endast avsedda filer och committa verifieringsdokumentet. Pusha enbart `codex/atlas-overview-messenger-20261015`; verifiera remote-SHA och lämna en draft-PR med konkret beteende, testbevis och begränsningar. Ingen merge eller produktion. Slutrapporten länkar PR/preview där tillgängligt och säger uttryckligen vad som faktiskt är testat.

## Självgranskning och exekveringsval

Specens sidstruktur täcks av 4–5, kompakt UI av 2, konversations-/bygggränser av 1–2, data av 3–4 och samlad acceptans av 6. De fem Review Focus-punkterna har namngivna tester ovan. Gemensamma typer definieras före konsumtion; tester som tidigare låste det godkända gamla beteendet uppdateras uttryckligen. Inga kända specglapp kvar efter självgranskningen.

Godkänt exekveringsval: **Native**, 2026-10-15 kl. 23:01 Europe/Stockholm. Samma agent implementerar de fem kopplade funktionsdelarna och tar därefter en oberoende helgrensgranskning; det minskar kontext-/reviewkostnaden när controller, skal och navigation delar kontrakt. Alternativet **Subagent-driven** använder separat implementerare och granskare per uppgift samt helgrensgranskning och kräver fler färska kontexter. Ägaren granskar denna sparade plan och väljer metod innan implementation börjar, enligt writing-plans-processen.
