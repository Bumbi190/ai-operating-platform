# Atlas: svenska och naturliga röstsamtal

Datum: 2026-10-16. Status: förslag för granskning; ingen röstimplementation eller leverantörsaktivering gjord.

## Uppdrag och isolering

André vill ha naturligare svenska, en bättre passande röst, snabbare svar, utrymme för tankepauser och möjlighet att avbryta Atlas genom att prata. Kostnaden ska vara rimlig. Arbetet ska ligga på en ny branch för att skydda parallella byggen.

- Repository: `Bumbi190/ai-operating-platform`.
- Ny branch: `codex/atlas-swedish-live-voice-20261016`.
- Granskad bas: `496e826cd130994a362c76305890fc49f5dd70bf` (main vid branchskapandet).
- Separat lokal klon. Pågående PR #266 (äldre latencyarbete) och #355 (översikt/messenger) är identifierade men inte ändrade eller införlivade.

## Verifierat i koden

| Observation | Kod | Betydelse |
| --- | --- | --- |
| `SILENCE_MS = 800` | `apps/web/lib/atlas/runtime.tsx` | Textresultat från taligenkänningen startar en fast timer. Det är inte en semantisk bedömning av om användaren talat färdigt. Timern utgår dessutom från senaste textresultatet, inte en direkt uppmätt tystnad. |
| `sendMessage()` anropar `stopListening()` | Samma fil | Taligenkänningen är avstängd under svarsgenerering/uppläsning. Naturlig röstbaserad avbrytning finns inte i det granskade flödet. |
| Meningar skickas till separat TTS | Samma fil | Första uppläsningen väntar på text som kan skickas till TTS. |
| Servern väntar på `arrayBuffer()`, klienten på `blob()` | `app/api/chat/tts/route.ts` och runtime | Hela respektive ljudsegment tas emot före uppspelning. |
| `tts-1` och `onyx` | Samma två filer | Detta är aktuell röstväg; ElevenLabs-konfigurationen för medieproduktion styr inte Atlas samtalsröst. |
| Endast talmodeller som faktureras per tecken kan kostnadsbegränsas här | `lib/cost/spend-ceiling.ts`, `lib/ai/openai-client.ts` | `gpt-4o-mini-tts` är avsiktligt spärrad i befintligt kostnadslager. Modellbyte kräver korrekt kostnadsstöd. |

Detta är en kodgranskning som förklarar rapporterade symtom. Ingen aktuell mikrofonlatens, brytning eller ljudkvalitet har mätts i användarens webbläsare. Äldre mätningar i `ATLAS_VOICE_TTS_ANALYSIS.md` används inte som dagens resultat.

## Alternativ

1. **GPT-Live via WebRTC, med Atlas befintliga backend. Rekommenderad första pilot.** Tjänsten stöder samtidig lyssning och tal och kan delegera till en valfri befintlig backend. Samtalsröst och operativa beslut hålls åtskilda. Känslan och svenskan måste verifieras med verkligt ljud; dokumentationen garanterar inte en identisk ChatGPT-upplevelse.
2. **GPT-Realtime-2.1 Mini via WebRTC.** Billigare grundkostnad i ett kort, jämnt fördelat samtal. Semantisk turdetektering och avbrytning kan konfigureras. Verktyg kan anropa Atlas backend för projektarbete och verifierade uppgifter. Kräver egen hantering av samtalskontext och kostnadsreservationer.
3. **Behåll kedjan och byt/trimma TTS.** Mindre ingrepp, men röstbyte löser inte att mikrofonen stängs eller att flera sekventiella steg orsakar väntan. Inte rekommenderat som huvudspår för den efterfrågade upplevelsen.

## Föreslagen pilot

- Skapa ett explicit valt, avstängningsbart samtalsläge i förhandsvisning. Befintligt gränssnitt ska återanvändas; samordna gemensamma runtimefiler med messengerarbetet vid integration.
- Börja med GPT-Live och klientdelegering till Atlas server. Behåll serverstyrd användaridentitet, projekttillgång, minne, verktyg, godkännanden och kostnadskontroller. Röstmodellen är inte auktoritet för att ett jobb är utfört.
- Välj två stödda röster för jämförelse på samma svenska text, med `marin` som dokumenterad Live-standard och ytterligare en kandidat först efter kontroll av Live-modellens röstlista. Anta inte att röster för TTS eller Realtime automatiskt stöds i Live.
- Instruktioner på svenska: naturlig svensk prosodi, korta kollegiala svar, lyssna under tankepauser och lämna ordet när användaren avbryter. Testa å/ä/ö, tal, datum, André, Hässleholm, Omnira, Atlas, Handlarbörsen och Familje-Stunden.
- Separera att stoppa tal från att avbryta ett bakomliggande jobb. Korrigeringar får inte starta samma jobb dubbelt eller låta ett gammalt resultat skriva över ett nyare.
- Mät tid till första **användbara, hörbara** svar och tid från användarens avbrott till tystnad. Ett kort utfyllnadsljud räknas inte som färdigt svar. Redovisa verktygsväntan separat.
- Stäng inaktiva sessioner med hänsyn till tankepauser, pågående uppspelning och arbete. Avsluta samtal och frigör mikrofonen vid utloggning/konversationsbyte. Tydlig återuppta-knapp efter avslut.

## Kostnad, kontrollerad 2026-10-16

| Alternativ | Jämförelse för tio minuter |
| --- | --- |
| GPT-Live-1 | $0,50 för en aktiv tiominuterssession, plus backend/verktyg. Även tystnad och väntan faktureras. WebRTC-start debiterar 15 sekunder som avräknas mot den startade sessionens tid; räkna inte dem två gånger. |
| GPT-Realtime-2.1 Mini | Ungefär $0,15 för **enbart nytt ljud** om användaren talar fem minuter och Atlas fem minuter: 3 000 inkommande ljudtoken × $10/miljon + 6 000 utgående × $20/miljon. Historik, text, eventuell transkribering och backend tillkommer. Detta är inte en uppskattning av hela fakturan eller ett kostnadstak. |

För GPT-Live motsvarar tio minuter dagligen i 30 dagar $15 i röstkostnad; trettio minuter dagligen motsvarar $45. Backendkostnad tillkommer. Ingen valutakurs eller SEK-faktura antas här.

Föreslagen första lyssningsjämförelse: sammanlagt högst tio minuter aktiv röst, uppdelat på två röster. Det innebär $0,50 för röstdelen vid full användning av tiden, före backend. Före betald körning måste modellen vara tillgänglig i befintligt konto och en separat verifierad kostnadsgräns för hela försöket finnas.

Omniras befintliga hårda kostnadsgräns får inte ersättas med en genomsnittskostnad eller en timer i webbläsaren. Innan leverantören anropas måste serverstyrd reservation, prissättning, sessionslivslängd, stängning och hantering av saknad slutlig användning vara definierade och testade. Om en faktisk övre kostnadsgräns inte går att belägga för valt transportkontrakt förblir betalt läge avstängt. Aktivering kräver ingen ny API-nyckel om befintlig serverkonfiguration kan användas; inga nycklar har lästs eller ändrats i denna granskning.

## Verifiering före integration

1. Tester med simulerad transport: avbrott under tal/generering, sena händelser, paus/återuppta, nekad mikrofon, nätverksfel och städning.
2. Servertester: autentisering, projektisolering, återanvända/förfalskade sessioner, dubbla delegeringar, budgetreservation, avstängning och ofullständig kostnadsrapportering.
3. Riktade regressionskontroller för nuvarande textchatt, byggestudio, röstinmatningsutkast och uppläsning. Kör relevanta obligatoriska repo-kontroller inför PR.
4. Verklig svensk lyssningsjämförelse på dator och mobil: korta frågor, flermeningstal med tankepauser, rättningar under Atlas tal och högtalare jämfört med hörlurar. Rapportera faktisk kostnad och latens; gör inga ljudkvalitetsanspråk utifrån simulerade tester.
5. Granska utfallet innan standardröst eller produktion ändras.

## Officiella källor

- [GPT-Live: arkitektur och egen backend](https://developers.openai.com/api/docs/guides/live)
- [GPT-Live: klientdelegering](https://developers.openai.com/api/docs/guides/live-delegation)
- [GPT-Live: språk, pauser och avbrott](https://developers.openai.com/api/docs/guides/live-prompting)
- [GPT-Live: röstval, sessioner och avslut](https://developers.openai.com/api/docs/guides/live-conversations)
- [Aktuell API-prissättning](https://developers.openai.com/api/docs/pricing)
- [Röstkostnader och tokenomräkning](https://developers.openai.com/api/docs/guides/voice-latency-cost)
- [Realtime: semantisk turdetektering](https://developers.openai.com/api/docs/guides/realtime-vad)
- [Realtime: avbrott och ej uppspelat ljud](https://developers.openai.com/api/docs/guides/realtime-conversations)

## Beslut som behövs

Granska förslaget att börja med en begränsad GPT-Live-pilot och jämföra svenska röster. Kostnads- och sessionskontraktet måste konkretiseras i implementationsplanen innan betald körning. Det billigare Realtime Mini-spåret väljs i stället om det är viktigare att minimera röstkostnaden än att först utvärdera Live-samtalsbeteendet.
