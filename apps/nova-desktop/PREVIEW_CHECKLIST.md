# Nova Desktop — skyddad förhandsversion, överlämning 2026-11-06

**Status:** Ej publicerad. Tidigare lokal testkedja med simulerat Atlas-svar godkänd.
Ändringarna i denna omgång är ännu inte omtestade/committade på grund av
klientens kontroll av fjärrkommandot. Ingen ändring i main eller produktion.

## Bekräftat via Vercel (läsning)

- Projekt: `ai-operating-platform-web` (GitHub `Bumbi190/ai-operating-platform`).
- Vercel-preview skyddas med SSO (deployment protection för alla utom egna domäner).
- Inga deploymentposter för `feat/nova-global-shortcut-20261106` vid kontrollen.
- Variabelmetadata (värden ej lästa): `ATLAS_MEMORY` synlig för preview och
  produktion; `ATLAS_MEMORY_RECALL` synlig för produktion. `ATLAS_MEMORY_INJECT`
  syntes inte i det returnerade urvalet. Det bevisar **inte** aktivt minne i preview.

## Färdig kod i arbetsträdet (behöver verifieras)

- `nova_bridge.py`: bara explicit Omnira-produktionsdomän eller namngiven
  Vercel-preview under rätt team. Byte av domän roterar parningsnyckeln, nekar
  gamla anrop och nollställer eventuell pågående lokal uppgift.
- `nova_overlay.py`: Anslut Atlas öppnar inte längre produktionslänk som
  saknar routes; fråga först om skyddad testadress. Högerklick på bubblan för
  *Välj skyddad testmiljö*.
- `app/(platform)/nova-bridge/page.tsx`: statuspollning under långvarig
  AI-ström, browser-abort om Nova trycker Stopp eller om anslutningen faller.
  Kräver `done`-kvitto från Atlas före markering som klart.
- Ingen ny AI-modell, API-nyckel eller Gmail-token på stationära.

## Återstående tester INNAN push/preview

1. Efter att fjärrkommandot godkänts: kör från `apps/nova-desktop/`
   `python -m unittest discover -s tests -p "test_*.py" -v`.
2. Kör `python tests/smoke_relay_ui.py`, `python tests/geometry_overlay.py`,
   `node tests/check_web_syntax.cjs` och `git diff --check`.
3. Läs diffen och verifiera att inga andra projekt/branches följer med.
4. Commit enbart ändringarna för Nova. Push **bara** featurebranchen;
   produktionsbranchen `main` får inte ändras.
5. Verifiera att Vercel-preview är **SSO-skyddad** innan testlänken används.
   Bekräfta korrekt projekt, branch och SHA i deploymentinformationen.
6. Uppdatera Nova med exakt HTTPS-previewadress (inga utomstående webbplatser).
   Tidigare parning ska sluta fungera efter byte.
7. Logga in manuellt i preview vid behov. Klicka **Anslut** i dess /nova-bridge-vy.
   Chrome kan fråga om tillgång till **loopback-nätverket**: ge tillstånd
   endast för den verifierade Omnira-previewn.
8. Skicka en ren läsfråga i Nova, exempelvis `Hur går det för Omnira?`.
   Kontrollera verkliga token i bubblan, rätt projektbegränsning och
   synligt fel om Atlas/Memory är otillgängligt.
9. Klicka Stopp medan svaret kommer. Bekräfta att inga sena tecken visas
   och att den inloggade webbläsarförfrågan avbryts.
10. Skicka en begäran om att posta socialt content / svara på mejl.
    I `nova_readonly` ska det **inte** skickas, publiceras, skrivas till
    projekt eller köa workflows. Kontrollera serverlogg utan innehållsläckor.
11. Kontrollera att inga oväntade kostnader eller parallella workflows uppstår.

## Nuvarande begränsningar

- Ingen live-Atlas-verifiering ännu.
- Ingen garanterad fullständig projektrecall om Memory-flaggor saknas i preview.
- Inget exekveringslager för generell Windows-UI, mejl eller sociala medier.
- Chrome kräver både TLS för preview och användarens loopback-tillstånd.
- Stopp kan inte alltid återkalla redan förbrukade API-tokens.
- Mac och Atticus är uttryckligen utanför denna arbetschatt.
