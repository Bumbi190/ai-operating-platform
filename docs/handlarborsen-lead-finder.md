# Handlarbörsen – Lead Finder (granskning före kontakt)

## Vad denna PR omfattar

Lead Finder visar potentiella juridiska företagskandidater i Omniras projektvy. En post i SCB:s register är **inte automatiskt en kvalificerad bilhandlare**, en ny kontakt eller någon som får mejlas.

Den aktuella testprofilen använder ett manuellt granskningsexempel med **89 juridiska bolag**, varav 83 är verksamma enligt SCB:s kriterier och 6 inte längre verksamma. Underlaget innehåller minst en registrerad kontaktspärr och ett tidigare känt kontaktfall. Den ursprungliga historiska kontaktlistan är inte komplett. **Samtliga kandidater är spärrade för utskick.**

Inga verkliga företagslistor, tidigare utskicksjournaler, SCB-nycklar eller kontaktuppgifter ingår i Git-repot. De ursprungliga granskningsfilerna förvaras privat hos projektägaren.

## Skydd och datamodell

- `public.hb_lead_candidates` skapades i Omniras Supabase den 28 oktober 2026 genom migration `20261028072659_handlarborsen_scb_review_only_candidates`. Tabellen är initialt **tom** och innehåller inga automatiskt godkända kontakter.
- Ägarbaserad RLS ger läsrätt för verifierad projektägare. `anon` saknar rättigheter och vanliga `authenticated` användare saknar skriv-, uppdaterings- och raderingsrättigheter.
- Databasen förhindrar fysiska personer som SCB klassar med juridisk form 10, samt `outreach_ready=true`, kontaktbar status, tidigare kontakt/inaktiv post felaktigt klassad som nytt lead och aktiva SCB-spärrar felaktigt klassade som oproblematiska.
- En serverbaserad importväg använder enbart validerad, manuellt vald CSV och sammanfattning; ingen databas- eller e-poståtkomst sker vid förhandsgranskning. Skrivning kräver en separat flagga, godkänd kontrollsumma och uttrycklig mänsklig bekräftelse. Ingen automatisk schemaläggning ingår.

## Feature-flaggor – samtliga av som standard

| Serverflagga | Funktion när uttryckligen aktiverad |
|---|---|
| `HB_LEADFINDER_IMPORT_PREVIEW_ENABLED` | Ägarens uppladdnings- och förhandsgranskningsvy (ingen DB-skrivning) |
| `HB_LEADFINDER_IMPORT_WRITE_ENABLED` | Separat skrivfunktion, kräver också korrekt digest och mänsklig bekräftelse |
| `HB_LEADFINDER_APPROVED_SHA256` | Den exakt godkända importlistans SHA-256, **inte en API-nyckel** |
| `HB_LEADFINDER_CANDIDATE_READ_ENABLED` | Ägarens RLS-filtrerade läsning av redan sparade kandidater |
| `HB_LEADFINDER_LOCAL_REVIEW_ENABLED` | Endast lokal Windows-utveckling med privata granskade filer |

**Ingen** av flaggorna sätts automatiskt av denna PR. SCB:s personliga API-nyckel ska aldrig ligga i Git, klientkod eller i loggar.

## Försiktigt verifieringsflöde

1. Kontrollera CI, migration guard och säkerhetsklassificeringen med alla ordinarie tester.
2. Prova förhandsvisningssidan med projektägarens inloggning i **skyddad Vercel Preview**. Ingen produktions-URL eller publik import ska aktiveras.
3. Ladda endast upp den separat granskade, sanerade CSV-filen och dess verifierade sammanfattning genom det uttryckliga förhandsgranskningssteget.
4. Granska sammanfattning och kontrollsumma innan ett framtida separat beslut om import. Ett lyckat prov innebär **inte** tillstånd att kontakta företagen.
5. Komplettera företagshistorik, grupp-/aliasmatchning, dataskydds- och marknadsföringsbedömning innan någon separat kontaktfunktion ens planeras.

## Lokal verifiering

```powershell
cd apps/web
..\..\node_modules\.bin\vitest.cmd run lib/qa/handlarborsen-lead-finder.test.ts lib/qa/handlarborsen-lead-finder-local-review.test.ts lib/qa/handlarborsen-lead-finder-import-intake.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

Det finns en separat **privat** lokal insamlings- och kvalificeringshistorik. Den ingår inte i den publika PR:n eftersom den innehåller information om faktiska affärskontakter.

## Förhandsvisning av enskilda företag

Efter att projektägarens två valda filer har verifierats av importens förhandsgransknings-API kan webbläsaren även visa en **tillfällig tabell med de 89 juridiska företagen**. Användaren kan söka på namn, organisationsnummer och ort samt filtrera på verksamhetsstatus, tidigare kontakt i partiell historik, SCB-spärr, annan juridisk form och möjliga gemensamma namnled.

Tabellen byggs endast från den redan manuellt valda och validerade filen i webbläsarens minne. Serverns svar innehåller fortfarande **enbart antal och kontrollsumma**, aldrig en hel företagslista. Ingen databaspost skapas, ingen cookie eller lokal lagring används för företagsraderna, och inga knappar för godkännande, kontakt eller utskick finns i tabellen. Att rapporten saknar historisk träff innebär **inte** att företaget är nytt eller att kontakt är tillåten.

Det tidigare steget ”Granska 50 kandidater” är ersatt med **”Granska 89 juridiska företag”** för just denna verifierade rapport, utan att påstå att SCB har godkänt dem som bilhandlare. Om nästa rapport omfattar ett annat antal krävs en separat uppdatering av den medvetet snävt avgränsade importgrinden.
