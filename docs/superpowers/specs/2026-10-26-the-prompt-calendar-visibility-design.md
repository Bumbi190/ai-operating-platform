# The Prompt i kalendern och Familjestundens första granskningsvecka

Status: design godkänd av André den 26 oktober 2026 genom ”Perfekt då fortsätter vi :)” efter det konkreta designförslaget. Genomförandeplan ska granskas före produktkod. Ingen ny automation eller publicering har aktiverats med detta dokument.

## Beslut från André

The Prompt fortsätter analysera dagens aktuella AI-nyheter och publicera genom sitt befintliga godkännandeflöde. Torsdag ska inte bli en ny veckogranskning eller ett villkor som håller tillbaka dess dagliga produktion. André vill direkt i kalendern kunna se vilka nyheter som är godkända och ska publiceras.

Familjestundens material ska till en början planeras en vecka i förväg och kunna granskas på torsdagen. Första omgången utvärderas innan återkommande veckoförberedelse aktiveras. Nästa svenska kalendervecka är 2–8 november 2026. Befintlig planering lämnas intakt; veckoförberedelsen får bara föreslå lediga tillfällen. Klockan 10.00 är ett tidigare förslag från Codex, inte en av André uttryckligen vald exakt tid.

Handlarbörsens önskade granskning fredag förmiddag och möjligheten att senare bestämma fler projekttider med Atlas behålls som kommande krav. De är inte del av kalenderkopplingen för The Prompt.

## Befintligt läge och vald väg

Kalenderns sociala källa läser social_content_posts och social_schedule_batches. The Prompts äldre videoproduktion använder media_scripts, med separat publicering för Facebook, Instagram och YouTube. Den kön läses inte av kalendern idag. En läsande projektion av den befintliga kön är därför nästa avgränsade ändring, enligt Andrés val att behålla det fungerande dagliga flödet.

En gemensam veckoproducent för alla tre projekten skulle förändra The Prompts aktualitet och behövs inte för kalenderinsyn. Att kopiera filmer till nya sociala jobb skulle ge en andra kö och riskera dubbelpublicering. Ingendera ingår. Familjestundens befintliga veckoverktyg används separat för första granskningen; ingen ny schemalagd modellkörning ingår här.

Läsningen 26 oktober visade sex publicerade/färdiga filmer och en godkänd post med video_status=none under de senaste fyra dagarna. Det visar varför godkänd nyhet och färdig film måste visas som olika tillstånd. Detta är en ögonblicksbild, inte fasta förväntningar i tester.

## Kalenderns beteende

Lägg till en kompakt, läsande sektion för The Prompts aktuella publiceringskö inne i kalendern. Den följer projektfiltret och visas bara när användaren äger och har kalenderåtkomst till The Prompt. En post visas en gång per script, med begriplig titel och kanalernas individuella utfall. Facebook, Instagram och YouTube är skilda destinationer.

media_scripts saknar avtalad publiceringstid. Kön ska därför visas som aktuell kö utan tid, separat från veckans tidsrutor. Den ska uttryckligen märkas som aktuell även om användaren bläddrar till en annan kalendervecka. Skapandetid, reviewed_at, cronens nästa körning eller första kanalens published_at får inte omvandlas till en utlovad publiceringstid. Förslaget skapar inga kalenderhändelser eller framtida tider.

Visa följande innebörd med befintliga kalenderfärger:

- Blått: godkänd, video klar, väntar på publicering; alternativt godkänd men video förbereds. Visa orden så att skillnaden framgår.
- Blått pågående: befintlig köstatus publishing. Kalendern ändrar eller återställer aldrig den statusen.
- Grönt per kanal endast när kanalens befintliga sparade provider-id finns. Ett gemensamt published_at eller publish_channel_state.ok utan kanal-id bekräftar inte andra kanaler. Ett id betyder sparat publiceringskvitto, ingen ny verifiering hos plattformen.
- Orange: ofullständigt/oklart utfall, saknat underlag eller en godkänd post som blivit för gammal för det befintliga flödet. Ingen automatisk ompublicering föreslås.
- Rött: befintligt misslyckat videosteg eller uttryckligt kanalstopp. Råa felmeddelanden visas inte.

Kön läser väntande approved/publishing-poster och även published-poster som fortfarande saknar kvitto för en av projektets aktuella verifierade destinationer. Meta-flödet kan sätta published innan YouTube har blivit färdigt, och YouTube läser uttryckligen både approved och published; ett gemensamt published får därför inte dölja en kvarvarande YouTube-publicering. För varje känd destination skiljs sparat kvitto, kvarvarande publicering och saknad/spärrad koppling åt. Om destinationsunderlaget inte kan läsas säkert är kanalläget okänt, inte färdigpublicerat. Först när alla kända aktuella destinationer har egna kvitton kan filmen försvinna som helt klar. Detta är en visningsregel, inte ny sändningsauktoritet.

En äldre godkänd eller delvis publicerad post får visas som behöver kontrolleras, aldrig som garanterat körbar. Följ befintliga publicerares olika färskhetsvillkor; inför ingen ny gemensam publiceringspolicy. Första versionen behöver inte skapa kalenderhistorik för helt färdigpublicerade filmer. Följ befintliga projektsidor för vidare inspektion, exempelvis /projects/ai-media-automation/scripts; kalendern erbjuder inga publiceringsknappar eller flyttbara tider för dessa rader.

## Läsning, isolering och uppdatering

Återanvänd kalenderns autentiserade åtkomst och kontrollera ägarskap på servern också i den nya läsningen. En godtycklig klientparameter med projectId eller projectSlug ger inte åtkomst. Begränsa läsningen uttryckligen till det ägda projekt vars slug är ai-media-automation, som de befintliga publicerarna använder. Andra projekt med media_scripts får inte läcka in.

Välj endast de kolumner som krävs för säker visning. Begränsa och validera titlar/statusar. Läs inte credentials, råa modellutdata, videomanus eller privata provider-svar för kalendern. Kanalobservationsdata används bara för en tillåten tillståndsmappning och serialiseras inte rått. Lägg en tydlig övre gräns på läsning och svar med synlig information om avkortning; ett fel eller överskriden gräns får inte presenteras som en frisk tom kö.

Den nya källan har egen tillgänglighetsstatus så att ett fel inte döljer privata bokningar eller Familjestundens kalenderposter. Uppdatera med kalenderns normala omläsning och vid återgång till sidan; avslutade filmer lämnar den aktuella kön efter en färsk lyckad läsning. Ingen databasändring eller ny bakgrundskörning krävs. Inget från läsningen får anropa renderare, AI-modell eller publicerare.

Inga nya social_content_posts, social_schedule_jobs, manuella kalenderkopior eller notifieringsutskick skapas. En eventuellt redan separat förberedd native social-post hålls fortsatt i sitt befintliga granskningsflöde; kalenderköstatus för ett script innebär aldrig att den posten också är godkänd eller har publiceringstillstånd.

## Familjestundens första granskning

Läs den befintliga veckan 2–8 november med det redan släppta veckoverktyget. Redan planerade onsdags-/söndagstillfällen ska återrapporteras för torsdagens granskning utan nya kopior. Om veckan är full ska resultatet vara noll nya utkast. Ändringar av material görs genom befintlig revisions- och granskningsväg. Den nya önskan om en första granskning återkallar inte tidigare uttryckliga schemagodkännanden och är inte ett godkännande för nya inlägg.

En ny läsning med befintlig ägd konversation den 26 oktober bekräftade fyra köjobb: Facebook och Instagram den 4 november kl. 20.30 samt den 8 november kl. 20.30 svensk tid. Veckan har alltså redan båda ordinarie tillfällena. Ingen veckoförberedelse är sparad för perioden och inga nya utkast eller jobb skapades av kontrollen. Torsdag den 29 oktober är den önskade granskningsdagen för detta befintliga material.

Efter första utvärderingen kan återkommande förberedelse planeras som en separat leverans med tidpunkt, kostnadsgräns, återförsök och notifiering. Repetitionsskyddet gäller fortsatt: exakta kopior stoppas, liknande innehåll inom 14 dagar granskas och samma kampanj får gå samtidigt på Facebook och Instagram. Ingen ändring av sagoproduktionen eller aktiviteterna ingår.

## Verifiering och genomförarens val

Verifiera godkänd ofärdig film, godkänd färdig film, pågående publicering, delvis publicerad film, saknat kanal-id, gammal nyhet, kanalstopp och avvisad post. Bekräfta projektisolering, avkortning, läsfel, projektfilter och att navigering till andra veckor inte skapar falska publiceringstider. Ett gränssnittstest ska visa kön direkt i kalendern och öppna befintlig källvy. Kontrollera att godkännanden, cronkonfiguration, befintliga sändningar och Familjestundens kö förblir orörda.

Genomföraren väljer filuppdelning, interna lästyper, exakt maxantal och kompakt layout inom befintlig kalenderdesign. Dessa val får inte ändra ovanstående produktbeteende. Ett fullständigt test av riktig publicering ingår inte i denna läsande ändring.
