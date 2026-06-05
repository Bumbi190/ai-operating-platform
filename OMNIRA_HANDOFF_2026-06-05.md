# Omnira / Familje-Stunden — Handoff (2026-06-05)

Detta är en överlämning till en ny chattsession. Läs igenom, och börja med "Första steg" längst ner för att verifiera nuläget mot kod och live-data.

## Översikt

**Omnira** är en AI Operations Platform som ska driva flera isolerade affärer och vara **single source of truth** (bl.a. för leads). Affärer: **The Prompt** (mogen, publicerar redan), **Familje-Stunden** (prenumeration för barnfamiljer, fokus nu), **GainPilot**.

Strategi/prioritet: bevisa att det befintliga systemet ger mätbara affärsresultat innan vi bygger mer plattform. Ordning: (1) landningssidans konvertering, (2) Meta-anslutning + riktig trafik, (3) leads till Omnira, (4) marknadsgransknings-UI, sedan Meta-publicering.

## Miljö / nycklar att känna till

Repos (anslutna mappar):
- `/Users/andrehultgren/Documents/familje-stunden-v2` (Vite/React + Supabase edge functions; sajten familje-stunden.se)
- `/Users/andrehultgren/Documents/AI Operating Platform` (Omnira; Next.js i `apps/web`)

Supabase:
- Omnira-DB: `iboepohjwrhtgshrqaol`
- Familje-DB: `zcpnionjkacbbnamhrjk`

Vercel (team `team_NlGVrs9ZItxkK4nMgRblBCI4`):
- Familje: projekt `familje-stunden-v2` (`prj_QgFIPR8RJwCDtnbpXHSGhi1GX6gF`)
- Omnira: `ai-operating-platform-web` (`prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T`), domän `https://ai-operating-platform-web.vercel.app`

Familje-projektets id i Omnira: `77cda551-57c9-4dc0-b019-1bb6438777f7` (slug `familje-stunden`).

Tillgängliga verktyg: Supabase MCP (båda DB), Vercel MCP, Claude in Chrome, bash-sandbox.

## Arbetsregler (viktigt)

- Svara på **svenska**.
- Jobba i både `familje-stunden-v2` och `AI Operating Platform` enligt användarens styrning (även om projektkontexten säger "Gainpilot").
- **Plan/audit före implementation.** Committa inte förrän användaren ber om det; användaren kör git själv.
- I zsh: använd **enkla** citattecken i commit-meddelanden (undvik `!` → "event not found").
- Verifiera alltid mot **faktisk kod och live-data** (grundat), inte antaganden.
- `npm run build` / deploy kan **inte** köras i sandboxen (trasig toolkedja, deno saknas) → användaren bygger/deployar lokalt.
- **Synk-varning:** nya filer som användaren lägger i mappen på Mac-sidan propagerar inte alltid till sandboxen utan att mappen kopplas om/sessionen startas om. (Mina *skrivningar* når däremot Mac.)

## KLART och deployat (Familje landningssida + leads)

Senaste commit i `familje-stunden-v2`: `9e76fec` (deployad READY i prod).

1. **Gratis-sample-sektion** (ersatte låst "SneakPeek"): `src/components/landing/SneakPeekSection.tsx`. Tre kort — riktig färgläggning (`/pdfs/startpaket/2-farglaggning.pdf`), Känslokort-förhandstitt, "Möt Nova & Pling". Endast godkända publika assets. Nedladdningsfilnamn: `familje-stunden-farglaggning.pdf`. CTA → `/prova-gratis`.
2. **CTA-standardisering + header**: `Navbar.tsx` (CTA vänster, hamburgare höger, glöd −50%, admin "Gratis startpaket" nedtonad), och alla primära "Prova gratis i 1 månad" pekar nu på `/prova-gratis` (`MobileCtaBar`, `Home` ×2, `MonthCard`, `AretsTeman`, `StickySidebar`, `GratisStartpaket`). `/prenumerera` behålls som pris-/hanteringssida.
3. **Exit-intent "gratis pyssel"-popup** var en platshållare (sparade ingen lead, skickade inget mail). Nu:
   - Ny edge-funktion `supabase/functions/send-pyssel-lead/index.ts`: skriver `email_send_log` **först** (recovery), skickar Brevo-mail med PDF-länk, POST:ar leaden till Omnira `/api/business/leads` med 2–3 retries. Deployad med `--no-verify-jwt`.
   - `src/components/landing/ExitIntentPopup.tsx` wirad: riktigt `functions.invoke`, loading/fel, Meta Pixel `Lead`.

## Viktiga findings / beslut

- **Leads → direkt till Omnira** (ingen ny `pyssel_leads`-tabell). Endpoint `apps/web/app/api/business/leads/route.ts` → `lib/business/store.ts` (`createLead`), auth via `lib/api-auth.ts` (`requireUserOrApiKey` → API-nyckel `AIOPS_API_KEY`, Bearer).
- **`AIOPS_API_KEY` var TOM i prod** → API-nyckel-vägen gav 500, leads-tabellen är tom, endpointen används bara av leads-routen, inga externa anropare. Alltså: aldrig aktiverad — riskfritt att slå på. Användaren har satt nycklar (Omnira Vercel-env + Familje-funktionens secret). **Måste bekräftas:** att värdena matchar och att Omnira är **redeployad** så nyckeln laddas.
- **Mailprovider = Brevo** (inte Resend). Återanvändbar `supabase/functions/_utils/email.ts` (`sendEmailBrevo`, stödjer bilaga). `email_send_log` (tidigare tom) = recovery-spår. `suppressed_emails` respekteras. PDF skickas som **länk** (4,25 MB för stor att bifoga).
- **Marketing Engine (Omnira)** kör mot Familje: 2 planer, 14 briefs, 22 utkast (`guard_passed`), 33 runs `done`. Review-UI finns: `apps/web/app/(platform)/atlas/marketing/MarketingReviewClient.tsx` (data: `lib/marketing/review.ts`). UX-audit gjord — behöver premium-uppgradering (glas/mörk OS-stil, tydligare status, bildförhandsvisning, handlingsbar landningsvarning, skalbarhet 50+). Ej byggt.
- **Meta-integration (Omnira)**: token-infra finns (isolerad `platform_tokens` per `project_id`), men blockerare kvar: Meta app-review för `instagram_content_publish` (+ business-verifiering), Familje IG Business + FB Page, lagra tokens, project-aware publicering (klienterna `lib/media/{instagram,facebook}.ts` är env/Prompt-bundna), bild-publiceringsväg (endast REELS idag), per-projekt token-refresh. Ej påbörjat.

## PÅGÅR NU (blockerare)

**A. Uppgradera gratis-pysselpaketet (PDF) — ej klart.**
Mål: byt 7-sidig A4-PDF, behåll länk/flöde (skriv över `public/pdfs/startpaket/2-farglaggning.pdf`, ingen kodändring). Sidordning: 1) Omslag, 2) befintlig färgläggning 1, 3) befintlig färgläggning 2 (extraheras ur nuvarande 3-sidiga PDF), 4) ny färgläggning, 5) skattjakt, 6) känslomätare, 7) känslokort. Känslokort används som det är (med "Trött" istället för "Lugn") — beslutat.
**Blockerat:** de fem nya PNG:erna ligger i `pyssel-assets/` på Mac men **syns inte i sandboxen** (synk-problem; mappens mtime oförändrad, inga nya bilder hittade). Måste lösas (koppla om mappen / starta ny session / re-lägg filerna) innan bygget.
Premium-tillägg planerade utan fler sidor: PDF-metadata (titel "Familje-Stunden – Gratis pysselpaket"), enhetlig A4, max kvalitet. Valfritt (av): sidfot-URL, klickbart omslag → /prova-gratis.

**B. Verifiera send-pyssel-lead end-to-end.**
Senaste test visade att **gammal platshållare** kördes (PWA service-worker-cache) — `email_send_log` tom, inga funktionsanrop. Deployen är dock live (commit `9e76fec` READY). Nästa: testa i **inkognito**, leta i Network efter POST `https://zcpnionjkacbbnamhrjk.supabase.co/functions/v1/send-pyssel-lead` → svar `{ok:true,omnira:true}`. Verifiera sedan `email_send_log` (status `ok`, `omnira_synced:true`) och Omniras `leads`.

## NÄSTA STEG (todo, i ordning)

1. Lös PNG-synken → bygg 7-sidig PDF → skriv över `2-farglaggning.pdf` → verifiera 7 sidor + miniatyrer → git commit/push.
2. Verifiera leadflödet i inkognito (Network + `email_send_log` + Omnira `leads`).
3. Bekräfta `AIOPS_API_KEY` matchar på båda sidor + Omnira redeployad.
4. (Senare) Premium-uppgradera Marketing Review-UI enligt auditen.
5. (Senare) Meta-anslutning: kontosetup, app-review, tokens, publisher, bild-väg.

## Första steg för den nya chatten (verifiera nuläget)

1. Bekräfta arbetsmapp och lista topp-nivå i båda repos.
2. `git --no-pager log -3 --oneline` i `familje-stunden-v2` (förvänta `9e76fec` överst).
3. Kontrollera om PNG:erna nu syns: `ls -la pyssel-assets` i Familje-repo.
4. Snabb DB-koll (Supabase MCP): `select count(*) from email_send_log` och `select count(*) from leads` (Omnira `iboepohjwrhtgshrqaol`) för att se om leadflödet börjat skriva.
5. Läs `send-pyssel-lead/index.ts` och `ExitIntentPopup.tsx` för att förstå leadflödet.
6. Fortsätt med "Nästa steg" ovan.
