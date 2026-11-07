# Nova Desktop – skyddad preview och verifiering

**Arbetsgren:** `feat/nova-main-integration-20261106`  
**Bas:** senaste `origin/main` vid skapandet (2026-11-06).  
**Miljö:** Endast stationära Hultgren; Mac orörd.
**Skyddad preview:** `https://ai-operating-platform-2vteosw04-bumbi190s-projects.vercel.app` (Vercel READY, commit `bea226e`, SSO-skydd enligt projektinställningen).

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
- Testat med 23 Python-funktionstester, browser-transportmock, TS-syntaxkontroll,
  kontrollerade guardfunktioner och geometrikontroll av chattpanel.
- `max_tokens` 900 för Nova-anslutningen; lokal gräns 10 frågor/5 minuter.

## Steg kvar för riktiga Atlas-svar

1. Kontrollera enbart Nova-diffen mot senaste main; ingen ändring av andra
   pågående brancher och inga migreringar eller hemligheter i commit.
2. Genomfört: featurebranchen `feat/nova-main-integration-20261106` pushad; ingen ändring i main.
3. Genomfört: Vercel har skapat en **READY preview** av `bea226e`, separat
   från `omniraos.se` och `main`.
4. Kontrollera att den nya deploymenten visar rätt SHA, korrekt Vercel-projekt
   `ai-operating-platform-web`, status READY och aktivt SSO-skydd.
5. På stationära sparas endast exakt HTTPS-preview-origin i
   `%LOCALAPPDATA%\Omnira\Nova\preview-origin.txt`. Nova läser den efter
   omstart och roterar sin parningsnyckel. Använd `Välj skyddad testmiljö`
   endast om en ny testdeployment senare ska väljas.
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
