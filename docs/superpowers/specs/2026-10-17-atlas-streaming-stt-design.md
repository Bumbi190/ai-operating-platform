# Atlas: strömmande taligenkänning
Datum: 2026-10-17
Status: André godkände designen 2026-10-17 kl. 07:34 Europe/Stockholm. Genomförandeplan skriven för granskning; inte implementerat eller aktiverat.
Bas: 09a32df71772473794ffdeea0ac335d15b267baf, accepterad isolerad röstpreview.

## Mål och avgränsning
André vill minska väntan mellan en avslutad fråga och hörbart svar. Han gillar nuvarande Anders-röst och det förbättrade automatiska samtalsflödet. Förslaget överlappar taligenkänningen med tiden han pratar. Det ändrar inte Atlas befogenheter eller hur ett projektjobb godkänns.
Behåll Anders, befintlig chatt/TTS, Silero och vald tankepaus (standard 1,2 s), rättelse/avbrott, högtalarens inputspärr och hörlursläget. Låst skärm/fickläge och GPT-Live ingår inte.

## Underlag och alternativ
Fyra verkliga batchtolkningar på basversionen tog 625–1330 ms. Detta är serversteget efter avslutad inspelning, inte hela mobilens väntetid. Chattens första token och ljuduppspelningen har egna fördröjningar; strömmande STT kan inte ta bort dem.
1. Rekommenderat: STT-relä på vår server, en WebSocket per fråga. Ljud skickas till Scribe under talet; befintliga komponenter äger pausen och svaret. Kräver nytt transport-/kostnadsliv men begränsar beteendeförändringen.
2. Behåll batch: minst förändring och redan accepterat, men samma seriella tolkningssteg kvar.
3. ElevenLabs Speech Engine: större samlad realtidslösning, men byter mer av mikrofon, turväxling och uppspelning. Utvärderas inte i denna leverans.

## Transport och ansvar
Klienten behåller native AudioWorklet, PCM16 mono 16 kHz och lokal Silero. Bekräftad talstart öppnar samma-origin-anslutningen. En högst två sekunder stor minnesbuffert inklusive befintlig pre-roll håller början medan anslutningen startar. Vid överfull buffert avbryts frågan tydligt; inget tappat ljud skickas som komplett fråga.
Servern gör färsk operatörs-/medlemskapskontroll och verifierar Origin före uppgradering och leverantörsdispatch. Saknad Origin eller fel origin avvisas. Klienten får ingen leverantörsnyckel eller återanvändbar leverantörstoken.
En inkommande anslutning äger exakt en utgående Scribe-anslutning och en fråga. Ingen global Map antas samordna olika Vercel-instanser. Befintlig governance måste godkänna varje ny betald session; klientens aktiva-fråga-spärr är inte en servergaranti om global samtidighet.
Scribe-konfiguration ägs av servern: scribe_v2_realtime, pcm_16000, svenska swe, commit_strategy=manual, samma sex namn/keyterms som batchversionen. Inga entity-, redigerings- eller timestamptillägg.
Klienten skickar numrerade binära PCM-block runt 200 ms. Servern validerar format, storlek och ordning och skapar leverantörens meddelanden. Klienten får inte välja modell, språk, keyterms eller kostnadstak.

## Frågans liv
Tillstånd: ansluter, lyssnar/strömmande, avslutar, färdig eller avbruten. Varje callback bär befintlig generation/revision så att gammal anslutning inte kan skriva över en ny fråga.
Den nuvarande lokala tystnadsregeln avslutar frågan en enda gång efter sista ljudblocket. Interna leverantörs-checkpoints får inte avsluta användarens fråga; förslaget beskrivs i protokollförtydligandet nedan. Klar med frågan fungerar som manuell motsvarighet. Ofärdig partialtext får aldrig starta chatt, verktyg eller TTS.
Endast stabilt slutresultat från aktuell fråga lämnas en gång till befintlig conversation-controller. Leverantörens segmenthändelser måste hanteras utan att en fråga dubbelsänds; detta ingår i protokolltesterna.
Vid 90-sekundersgräns bevaras text för manuell kontroll, samma princip som dagens klippta fråga. Ingen automatisk inskickning av avklippt innehåll.
Stopp, rättelse, utloggning, sidbyte, förlorad mikrofon och generationsbyte stänger båda anslutningarna. Tom fråga ger inget chattsvar. Avbruten eller osäker dispatch återförsöks inte automatiskt.
Om tjänsten inte kan användas före betald dispatch behålls batch som val för nästa fråga. Samma ljud skickas aldrig automatiskt igen efter möjlig leverantörsdispatch. Användaren får tydligt fel och kan själv försöka igen.

## Hårda gränser och kostnad
Allt ljud som går till leverantören räknas på servern före skickning: högst 2 880 000 PCM-byte, inklusive pre-roll och tystnad, motsvarande 90 s. Block som skulle överskrida taket avvisas före vidarebefordran. Köer på båda sidor begränsas till två sekunders PCM; överbelastning stänger frågan i stället för att samla obegränsat ljud.
Färsk behörighetskontroll har högst 5 s och leverantörsanslutning högst 5 s. Absolut serverdeadline är 120 s från routens start. Sluttext får högst 20 s efter commit och alltid inom samma absoluta deadline. Föreslagen function maxDuration är 150 s för stängning och hållbar bokföring. Alla deadlines stänger transporterna; en klienttimer är inte kostnadskontroll.
Offentlig realtime-prislista anger 0,39 USD/timme. Keyterms tillför 20 procent. Kandidat till konservativ canonical rate är 0,48 USD/timme: två hela reserverade minuter ger 0,016 USD för STT per fråga. Detta är inte konfigurerad rate, kontoverifierad faktura eller total samtalskostnad. Dagens batch-rate får inte återanvändas.
Före första betalda dispatch måste befintlig priskatalog/governance ha en verifierad realtime-rate och regler för avrundning/minimidebitering. Fullt tak reserveras före anslutningen. Serverns bytegräns och leverantörens debitering efter skickad ljudmängd måste tillsammans bevisa maxbeloppet; om det inte kan bevisas stannar funktionen av.
Sessionens kostnadsliv registreras i befintlig spend-meter/durable settlement. Oklart avbrott behåller hela reservationen; den frigörs inte utifrån klientuppgiven tid eller ett lokalt close-event. Befintlig serverbaserad bevakning av behörighet ska följa hela sessionen och stänga båda anslutningarna vid återkallelse eller osäker kontroll. Samma fail-closed-princip vid nekad budget eller bokföringsfel som idag.
Ljud/transkript sparas inte i nya loggar. Mät endast ID, tillstånd, tider, byteantal och säkra felkoder. Befintliga provider-retentionsvillkor gäller; inget löfte om zero retention införs.

## Vercel och första verifieringsgrind
Installerad @vercel/functions 3.9.9 har endast den experimentella helpern. Officiellt dokumenterad upgradeWebSocket kräver minst 3.10.0, ws som runtime-dependency och Fluid Compute. npm bekräftar Node >=20; projektet använder Node 22.
Första implementationen efter design/plan är ett färskt autentiserat echo-prov utan ElevenLabs eller mikrofon. Provet verifierar verklig WebSocket-upgrade, binära ramar, origin/auth, payloadgräns, timeout och stängning i separat preview. Lokalt används vc dev >=54.14.2; next dev räcker inte som runtimebevis.
Om den riktiga isolerade deploymenten inte stöder detta stoppas denna lösning och resultatet återrapporteras. Ingen ny infrastruktur eller genväg via oskyddad klienttoken införs automatiskt.

## Ytor och acceptans
Berörda befintliga ytor: pcm-capture, rösttestsidan och voice-pilot-transporten, sanctioned ElevenLabs-adaptern samt canonical pricing/governed spend. Ny serverroute och fokuserad relay-modul. reply/player och chattens beslut ska inte byggas om.
Först verifieras auth före dispatch, byte-/kögränser, exactly-once-final, stale events, återkallelse, stopp/fel/timeout och durable settlement med simulerad leverantör. Native browserproven täcker automatisk paus, tre följdfrågor och rättelse. Typkontroll och relevanta befintliga regressioner krävs; helsvitens kända fel redovisas separat.
Därefter görs ett begränsat STT-prov inom verifierad reservation. Mobil A/B sker med samma frågor, röst och nätförhållanden; mät talets slut till första användbara hörbara svar. Föreslagen beslutströskel: minst 300 ms bättre median och högst 200 ms sämre p90 över 20 jämförbara frågor, utan försämrad transkription eller borttappade turer. Inga sådana resultat finns ännu.
Nuvarande accepterade preview förblir standard tills faktisk förbättring och stabilitet verifierats. Ny funktion får en explicit isolerad pilotaktivering. Ingen produktionsmerge ingår.

## Protokollförtydligande vid planering
Officiell commit-dokumentation visar att även manuellt läge kan segmentera efter cirka 36 s och börjar bearbeta efter cirka 2 s ljud. Ett committed segment får därför inte behandlas som hela frågan. Genomförandeplanen föreslår interna checkpoints efter 20 s skickat ljud, en i taget med samma tvåsekunders kötak, och ett enda slutresultat till chatten när användarens lokala paus avslutar frågan. Detta är ett föreslaget tekniskt förtydligande för planens granskning; faktisk leverantörssemantik måste verifieras före aktivering.

## Källor och granskningsstatus
Kontrollerade 2026-10-17:
- Vercel WebSockets: https://vercel.com/docs/functions/websockets
- Vercel helper/verktygskrav: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- ElevenLabs protokoll/keyterms: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
- ElevenLabs ljudbaserad debitering: https://elevenlabs.io/docs/overview/capabilities/speech-to-text
- ElevenLabs API-prislista: https://elevenlabs.io/pricing/api
Egen granskning: avgränsning, dispatchgränser, tids-/bytegränser och rollback beskrivna. Faktisk Vercel-upgrade, kontopris och mobilvinst är uttryckliga verifieringsgrindar, inte påstått färdiga resultat. Nästa steg är granskning av docs/superpowers/plans/2026-10-17-atlas-streaming-stt.md och val av körsätt enligt Superpowers writing-plans.
