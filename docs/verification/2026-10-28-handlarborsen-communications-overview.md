# Handlarbörsen – kommunikationsöversikt, enbart läsning

Datum: 2026-10-28
Work ID: HB-COMM-OVERVIEW-20261028
Bas: main bdf1943b07681befdacf9e48b458bc303a4002b1 (PR #596)

## Syfte och gränser

Förbättra operatörens presentation, inte mejlmotor eller CRM. Omniras main har
redan ett källgrundat sales overview (15 HEAD-counts) och reply lifecycle (sex
avgränsade tekniska metadata-källor), men saknar en produktionsansluten säljarbetsvy.
Den stora, öppna PR #386 innehåller en separat sales-vy och
PR #562 innehåller en avstängd Strato-inkorgsbrygga. Ingen av dessa aktiveras här.

Ny route: /projects/handlarborsen/communications
Navigation: endast Handlarbörsens egen översiktskomponent visar länken
"Kommunikation · inkorg och AI-svar"; gemensamma ProjectCommandCenter lämnas
oförändrat för att undvika filöverlapp med den äldre öppna Sales-PR #386.

## Säkerhetskedja

1. Projekt hämtas via RLS-bunden getProjectBySlug och måste vara den exakta
   Handlarbörsen-identiteten (id + slug + registrerat namn).
2. resolveProjectAccess kontrollerar inloggad användare och ägar-allowlist
   innan service-role-klienten ens skapas.
3. Befintliga readHandlarborsenSalesOverview och readHandlarborsenReplyLifecycle
   kontrollerar ägare/allowlist/mode oberoende.
4. not_permitted ger 404; unavailable kan visas, aldrig falskt antal 0.
5. Ingen metadata för kontakt, rubrik, avsändare, mottagare, mejltext, tekniska
   jobb-ID:n eller fulla rader förs vidare till UI:t.
6. Allt är SSR-läsningar, inget nytt API, ingen migration, RLS, cron, SMTP,
   Resend, sändpolicyändring, SCB-import eller extern workflowkörning.

## Operativ tolkning

- Synkade inkorgsposter är inte "olästa mejl".
- awaiting_review är en processstatus; approved gäller en konkret revision.
- smtp_accepted betyder SMTP-acceptans, inte mottagarleverans.
- Giltig sändpolicy innebär inte kontakt-/sändrätt; suppressed och confirmed
  kan överlappa och antas aldrig ge utskickstillstånd.
- 14 dagars väntan / högst en påminnelse är konfiguration, inte genomförd
  uppföljning. sales_jobs_total är inte antalet påminnelser.
- Källorna läses oberoende med egna observerade tider, inte i samma transaktion.

## Testbevis och återstående granskning

- Lokal riktad Vitest för kommunikationsvy, åtkomstgrind, CRM och svarskedja:
  58 av 58 gröna (14 + 7 + 12 + 25). Behörighetstesterna kör den riktiga
  sidkomponenten mot mockade sessioner: okänd/annat projekt, oinloggad och
  obehörig ägare stoppas innan service-role-klient eller statusläsningar.
- Syntetisk HTML/React/Tailwind-granskning i Playwright: 1440, 390 och 360
  pixlars bredd, inget dokumentöverflöde. Mobil visar alla tre statusdimensioner
  i ett separat kort i stället för en sidledsrullad tabell. Detta är INTE en
  autentiserad previewgranskning med riktiga konton.
- Båda kommunikationssviterna ligger i befintlig Atlas Project Isolation CI
  med anti-skip-minima 14 respektive 7. Kör CI på exakt PR-head före merge.
- Den första CI-omgången på 881afbc körde testerna men tre oberoende
  typkontroller stoppades av TS1501 på två regex /s-flaggor i ett nytt UI-test
  (projektet targetar äldre ECMAScript än ES2018). Testuttrycken är nu ändrade
  till [\s\S] utan att sänka assertionerna. Riktad Vitest 58/58 är grön igen;
  exakt ny commit måste fortfarande bekräftas av GitHub CI.
- Full lokal TypeScript-kontroll blockerades av den lånade beroendemappens saknade
  @omnira/local-text-contract, @modelcontextprotocol/client och @remotion/lambda.
  Felen var utanför de nya kommunikationsfilerna; detta är inte en grön typkontroll.
  En ren CI-miljö och Vercel-build måste avgöra innan merge.
- Vercel-preview och autentiserad browsergranskning återstår vid denna notering.
- Ingen produktionseffekt förrän PR uttryckligen är granskad och mergad.

## Framåt

Individuell inbox, vald mejltext, svarsredigering, godkännande och manuell
uppföljning ska byggas vidare i det redan existerande rättighetsstyrda
Sales/Strato-flödet – först efter separat kod- och produktionsgranskning.
En ny mejlmotor eller automatiska utskick är inte aktuellt.
