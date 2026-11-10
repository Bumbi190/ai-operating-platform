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
