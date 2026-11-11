# Nova Desktop – lokal mikrofon och svensk STT (pilot)

Datum: 2026-11-10. Branch: `feat/nova-desktop-ui-automation-20261109`.

## Vad som nu finns

- Fungerande, kortlivad Windows-ljudadapter: `nova_local_audio.py` startar
  `nova_local_voice_worker.py` i en separat, isolerad Python-miljö.
- Mikrofon: Windows standardingång, testad med **Svive Sonic 3**, 16 kHz mono PCM16.
- Talaktivitet (VAD): konservativ lokal RMS-grind, fördröjd talstart och
  tystnadsavslut. En enskild talbit hålls som mest cirka 12 sekunder i minnet.
- Lokal transkribering: `faster-whisper==1.1.0`, den flerspråkiga
  `Systran/faster-whisper-tiny`-modellen med svenska som valt språk.
  Modellen finns i Windows LocalAppData, inte i Git-repot, och laddas endast
  från en lokal sökväg. Inga nedladdningar får ske från den aktiva mikrofonprocessen.
- Inget inspelat ljud sparas till disk, skickas till Atlas eller skrivs i loggar.
  Enbart mätvärden/status och den lokala transkriberade texten skickas till Novas GUI.
- Snabbstart är avsiktligt **opt-in**. Samtalet är inte permanent aktivt,
  och mikrofonen startas aldrig på Windows-inloggning.
- `Ctrl+Alt+.`, Novas Stopp-knapp, minimering eller tidsgränsen stoppar
  mikrofonprocessen. En färdig transkribering stoppar pilotinspelningen.
- Endast en exakt navigeringsfras med ”Nova” i början tillåter snäv, befintlig
  navigation. Andra fraser går bara till ett **utkast för manuell granskning**.
  Ingen tangentbordsinjektion, kodkörning, publicering eller mejlsändning.

## Så provar du på datorn

1. Stäng eller koppla från Atlas gamla röstsession i Brave, om den är aktiv.
   Två parallella mikrofoner ska inte användas.
2. Öppna Novas lilla Windows-fönster och välj **⋯ → Testa lokal mikrofon
   och svenska (25 sek)**.
3. Säg: ”Nova, öppna kalendern”. Vänta ungefär en sekund.
4. I Novas historik visas vad som faktiskt transkriberades. Om texten känns
   igen exakt som ett tillåtet navigeringskommando kan kalendern öppnas.
5. För att prova snabbkommandot väljer du **⋯ → Lokal mikrofon med
   Ctrl+Alt+Space (pilot)**. Inställningen gäller endast den här Nova-sessionen;
   med valet avstängt fungerar det tidigare Atlas-flödet som vanligt.
6. Tryck **Stopp** eller `Ctrl+Alt+.` när som helst för att avsluta taltestet.

## Vad som är uppmätt

- Native PCM via PortAudio/sounddevice gick att öppna och läsa utan överflöde.
- Lokal Whisper-modell laddades på CPU i ca 0,24 sekunder vid diagnostiskt test.
- Två sekunders **syntetisk tystnad** transkriberades på ca 0,31 sekunder utan
  ord eller fel. Det är inte ett giltigt prestandamått för riktig svensk röst.
- En komplett kontrollerad kedja från Nova-controller till lokal worker gav
  start, uppmätt ljudnivå, tidsgräns och korrekt avslut utan ljudfiler.
- Python 148/148 enhetstester passerade före aktivering.
- **Ännu inte liveverifierat:** verkligt tal, svensk förståelse, fullständig
  dialog, TTS, användaridentitet/projektminne utan Brave eller kodagentkörning.

## Tekniska begränsningar / nästa steg

1. Fysisk test med användaren som talar i mikrofonen. Mät taligenkänning,
   respons och falsklarm. Den lilla Tiny-modellen kan behöva ersättas med Base.
2. Lägg till en säker Windows-desktopsession till Atlas (engångsinloggning,
   användarscope och spärrar), INTE något service-role-token i desktop.
3. Strömmande svensk TTS med avbrott, låg latens och automatiskt nästa
   samtalstur. Först då kan pilotläget bli Novas normala snabbkommando.
4. Fortsätt förbättra UI Automation för att kunna skriva i valda chattar
   utan att skicka meddelanden innan användaren godkänt.

Allt görs på samma Nova-branch. Inga andra projekt/worktrees, main,
databaser, mejl eller produktion ska påverkas av den här piloten.

## N2.1 ? Windows microphone with authenticated Atlas response (local feature)

- A NEW native-input mode on the SSO-protected /nova-bridge page verifies that
  the approved Nova/Sanna voice is genuinely available before enabling speech.
  There is **no fallback** to Anders/Peter when Sanna is absent.
- Only the actual Ctrl+Alt+Space user action and a currently paired, approved
  native-mode session may start the local microphone. Brave's microphone stays
  off; the browser remains an AUTHENTICATED RELAY and TTS output player.
  Closing/signing out of that browser session still disconnects Atlas.
  This is NOT yet a fully browser-independent desktop login.
- The small Whisper model transcribes speech OFFLINE. Its short TEXT transcript
  (never the PCM recording) is sent over the authenticated local relay to the
  server's **nova_readonly** Atlas route, limited to 150 output tokens. This
  pilot deliberately has NO Atlas project memories, tool execution or writes.
- Atlas's read-only response streams to Nova's text history and the approved
  Sanna ElevenLabs voice in the browser. Voice is billable only for actual
  spoken replies; no audio, tokens or model keys live in the Windows bridge.
- A Sanna-only PCM receipt must confirm audio reached the browser sink. Blocked audio, an empty stream or Stop must fail closed; no fallback to Anders.
- Sanna playback must complete before the native microphone is rearmed. A
  consented conversation is limited to 10 minutes from the hotkey and local
  capture windows are capped to 25 seconds. Global Stopp, collapse, quit and
  revoked pairing stop microphone restart. Risky instructions still require
  the separate existing manual approval flow.
- This wiring is covered by unit and local HTTP tests. Sanna output, Windows
  mic recognition and timing need physical operator testing in Brave and on
  the Sonic microphone. Browser audio autoplay might still require a click.
- Project-scoped, memory-aware interactive tools and a true desktop-only
  SSO/PKCE session remain follow-up projects, not part of this release.
