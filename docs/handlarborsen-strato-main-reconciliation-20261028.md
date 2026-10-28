# Handlarbörsen / Strato – integrering av befintlig PR #562 med main
Datum: 28 oktober 2026
Arbets-ID: HB-STRATO-PR562-MAIN-INTEGRATION-20261028

## Bas och beslut
- Utgångspunkt: PR #562, branch feat/hb-distribution-20261027,
  tidigare HEAD 112c9d864dc3b4bb337cd05f478a59e30c5dda33.
- Verifierad main: 4f4ee562a8c9da023a01edf8220180b989278fdc
  (inklusive produktionsmergad Handlarbörsen-kommunikationsvy PR #599).
- Omniras pr-preflight kördes med --reuse-pr 562 och gav reuse_existing;
  kvitto C:\Users\Andre\Projects\Omnira\Temp\hb-strato-pr562-reuse-preflight-20261028.json.
- För att skydda andra agenters arbetskopior användes en ny TEMPORÄR,
  detached Git-worktree. Den ursprungliga arbetskopian för PR #562
  var ren och har inte skrivits över.
- Inga nya PR-kedjor, migrationsskript eller separata mejlmotorer skapas.

## Konflikter lösta och funktioner bevarade
En verklig merge av origin/main i PR #562 gav två konfliktfiler:
1. apps/web/app/api/chat/route.ts – sex konfliktblock.
2. apps/web/lib/qa/atlas-notion-chat-read.test.ts – ett konfliktblock.

Integreringen behåller huvudgrenens nyare klassificering av:
- Notion-only källläsning med exakt användarfråga och strikt verktygslista;
- Handlarbörsens kombinerade externa workflow/CRM-belägg;
- CRM-status, svarsgodkännanden och SMTP-livscykel;
- ren navigering, Dream-/operatörsgrindar och externa referensverktyg.

Strato-läsintent läggs bakom dessa prioriteringar, bakom
HB_STRATO_INBOX_READ_ENABLED, och kräver en explicit användarfråga.
På Strato-turner presenteras enbart de två skrivskyddade verktygen,
get_handlarborsen_strato_inbox och get_handlarborsen_strato_message.
På andra turner döljs dessa två verktyg från modellens tool schemas.
Den första Strato-turen tvingar en riktig get_handlarborsen_strato_inbox.
Inga åtgärdsverktyg finns tillgängliga under denna läsintent.
Den exakta sparade konversationen, projektägaren, mailbox och
text-urval granskas fortfarande av den befintliga läsadaptern och SQL-RPC.

NOTION: Frågevariabeln notionUserQuestion förs vidare till Notion och
extern källgranskning; Stratos flagga kommer efteråt och påverkar
inte Notion-only-läsning. Ingen Notion-källa kan ge e-postsändrätt.

## Testbevis från isolerad arbetskopia
- Riktad Vitest med 10 sviter: 136/136 godkända.
  Innefattar Strato-inbox, intent, ägargrindar, Notion, CRM,
  svarslivscykel, externa referenser och manuell LinkedIn.
- Python unittest med fake/isolated test sources:
  21/21 godkända. Ingen verklig IMAP/SMTP användes i dessa tester.
- Testernas textassertioner har anpassats till kombinerad routing utan
  att ta bort skydd för källa, verktygsval eller kontaktspärrar.
- CI-filen atlas-project-isolation.yml har utökats med fyra nya
  anti-skip-bevakade Vitest-sviter (15 + 22 + 12 + 8 tester) och
  en separat Python-unittest-grind som vägrar färre än 21 tester,
  fel eller skippade testfall.
- Lokal full TypeScript-kontroll i lånad node_modules avslutades med
  60 fel, samtliga utanför ändrade Strato-, Notion- och chatfiler.
  Lånade beroenden saknar bland annat @omnira/local-text-contract.
  Detta är INTE en grön typkontroll; kör CI med npm ci.
- Full monorepo-typkontroll, ny Vercel Preview och signerad
  autentiserad Handlarbörsen-läsning ska verifieras på exakt PR-head
  innan PR märks klar för granskning/merge.

## Releasegrindar
1. Lämna PR #562 som DRAFT tills korrekt CI, preview och ägartest.
2. Håll HB_STRATO_INBOX_READ_ENABLED unset/false i Production.
3. Aktivera aldrig gamla sändkapabla Omnira-Sales Windows-arbetaren.
4. Den existerande separata IMAP-only watcher fortsätter oberoende;
   ingen watcher-konfiguration ändrades av denna integrering.
5. Ingen inläsning av ej explicit vald meddelandetext, ingen kontakt-
   eller avsändarverifiering via mejlheader, ingen automatisk AI-svars-
   godkänning, ingen SMTP-sändning eller schemalagd uppföljning.
6. Särskilt: smtp_accepted betyder SMTP-serveracceptans, inte leverans.
7. Undvik sammanblandning med PR #386:s ofärdiga Sales/CRM-sändvägar.

## Avgränsning
Det här dokumentet gäller integrationskod och simulerade tester,
inte en liveacceptans av nya verktyget. Produktionssynk och tidigare
sparade mejl är separata redan etablerade system och lästes inte om
i denna kodintegration. Inga miljövariabler, databaser, PR-flaggor eller
schemalagda jobb ändrades under själva kodsammanfogningen.
