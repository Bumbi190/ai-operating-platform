# Nova Desktop – skyddad preview och verifiering

**Arbetsgren:** `feat/nova-main-integration-20261106`  
**Bas:** senaste `origin/main` vid skapandet (2026-11-06).  
**Miljö:** Endast stationära Hultgren; Mac orörd.

## Genomfört lokalt

- Befintlig Nova-bubbla, lokal programnavigering och kortkommando överförda
  till en ny Git-arbetsyta ovanpå nuvarande huvudgren.
- Ny webbläsarbaserad Atlas-relay med tillfällig nyckel och explicit
  loopback-tillstånd. Token/kakor lagras inte av Python-klienten.
- `nova_readonly` har **inga AI-verktyg**, inga tvingade verktygsanrop och ett
  andra stopp vid oväntat tool_use.
- I den senaste chattmotorn finns även direkt bygggodkännande utanför AI-tools.
  Därför valideras hela Nova-requesten strikt *före* detta flöde.
- Projektminne går genom Atlas befintliga tillståndsflaggor och projektisolering;
  saknas de ska Nova inte hitta på information.
- Testat med 22 Python-funktionstester, browser-transportmock, TS-syntaxkontroll,
  kontrollerade guardfunktioner och geometrikontroll av chattpanel.
- `max_tokens` 900 för Nova-anslutningen; lokal gräns 10 frågor/5 minuter.

## Steg kvar för riktiga Atlas-svar

1. Kontrollera enbart Nova-diffen mot senaste main; ingen ändring av andra
   pågående brancher och inga migreringar eller hemligheter i commit.
2. Push enbart `feat/nova-main-integration-20261106` till GitHub.
3. Vercel ska skapa en **preview** och aldrig lägga ut den på
   `omniraos.se` eller `main`.
4. Kontrollera att den nya deploymenten visar rätt SHA, korrekt Vercel-projekt
   `ai-operating-platform-web`, status READY och aktivt SSO-skydd.
5. Ange exakt HTTPS-preview-URL i Novas `Välj skyddad testmiljö`.
   Tidigare lokal parning återkallas och nyckeln byts.
6. Logga in i förhandsversionen med ditt Omnira-konto och klicka **Anslut**.
   Ge enbart den verifierade preview-domänen Chromes `loopback-network`-tillstånd.
7. Testa en ren läsfråga i Nova-bubblan och verifiera svaret i både
   webbläsaren och skrivbordspanelen. Kontrollera att det verkligen kommer
   från Atlas, inte ett simulerat svar.
8. Testa `Stopp` under pågående AI-ström. Ingen sen text eller falsk
   slutföranderapportering får visas.
9. Testa att begäran om att skicka mejl, publicera socialt, starta workflow
   eller godkänna webbygge **inte utför något** i läsläge. Kontrollera
   run-journal och serverloggar utan att skriva ut privat innehåll.
10. Om autenticering, Vercel-preview eller serververktyg inte fungerar:
    ingen produktionpush. Dokumentera konkret blockerare.

## Begränsningar

- Lokal mock verifierar transport och UI, **inte** faktisk AI-auth.
- SSO vid Vercel är separat från Omniras Supabase-session.
- Projektminne beror på aktiv `ATLAS_MEMORY_RECALL` och
  `ATLAS_MEMORY_INJECT`; detta har inte aktiverats här.
- Ingen fri skärmkontroll, Gmail-läsning eller social publicering ännu.
- Chrome kräver HTTPS och eventuellt explicit local/loopback-tillstånd.
- Befintlig Windows-bubbla ska inte ersättas förrän previewn verifierats.
