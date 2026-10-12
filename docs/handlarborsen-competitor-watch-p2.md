# Handlarbörsen Konkurrentspanaren P2 – sparad manuell historik

Status: **endast draft och lokal kod**, produktionsmigration ej installerad, ingen agent- eller cron-automation aktiverad.

## Ändring

P1 har en källkatalog med tre officiella Handlarbudet-nyheter och säker manuell hämtning av deras korta sidtitlar. P2 lägger till en separat, begränsad historiktabell och en **manuellt initierad POST-kontroll**. En vanlig GET-visning får endast läsa historik, aldrig skriva till databasen eller kontakta webbplatsen.

- Projekt: exakt Handlarbörsens verifierade id/slug/namn, först upplöst genom användarens RLS-bound session.
- Källa: endast de tre hårdkodade käll-ID:n från P1, aldrig en användarsupplerad URL.
- Sparat per UTC-dag och källa: kontrolltid, status, kort normaliserad HTML-title och ett SHA-256-värde av just den titeln vid lyckad läsning.
- En unik observation per källa/dag/projekt, med **första godkända inskrivning bevarad**. Ingen UPDATE/DELETE-rättighet för service_role, anon eller authenticated.
- Historiken begränsas i läsning till de senaste 30 UTC-dagarna (högst 90 rader); saknas behörighet eller fungerar inte lagringen är resultatet nekat eller okänt, aldrig ett fabricerat nollvärde.
- `Sidtitel ändrades` får visas endast när två verkliga, lyckade källkontroller med olika titlar finns. **Det är inte ett bevis på ny funktion, ändrat erbjudande eller aktivitet bakom inloggning.**

## Säkerhet och vad som inte ingår

- Befintlig `robots.txt`-policy, fasta offentliga URL:er, avböjda redirects, svarsstorlek och timeout är oförändrade.
- POST kräver inloggad användare och godkänt Origin; därefter kontroll av RLS-projektets exakta identitet före service-role-instans.
- Inga sidtexter, bilder, personuppgifter, hemligheter, medlemskonton, köpta API:er eller extern AI-modell sparas/anropas.
- Ingen kalender, cron, agent-loop, autonom exekvering, nya uppgifter eller roadmap-status genereras.
- Kostnads-/säkerhetsgrinden i `ATLAS_ROADMAP_SV.md` gäller fortfarande före eventuell autonom veckokörning.

## Produktionsgrindar

1. Behåll P1 draft #305 och P2 separata; den visuella basen #304 får inte försvinna vid framtida rebase.
2. Granska migrationens SQL och kör lokala databasreplay-/RLS-tester. Statisk testning räcker **inte** för en produktionsmigration.
3. Verifiera exakt commits SHA och produktionsdatabasens migrationsledger, och planera separat godkänd migration under ett säkert fönster. Den kan göra migrationsgrinden avsiktligt röd i preview **tills den är korrekt applicerad**. Ändra aldrig grinden för att kringgå denna kontroll.
4. Efter explicit tillstånd: godkänd produktionsmigration, därefter säker deploy; kontrollera att normal GET inte skapar nätverk eller DB-skrivningar och att obehörig POST ger avslag.
5. Utför en explicit manuell scan i produktionsvyn först när användaren godkänt. Kontrollera en sparad observation per källa samt idempotens samma UTC-dag. Använd inte artificiella titlar för att simulera riktiga konkurrentförändringar i produktion.
6. Innan någon automatisk bevakning: separat projektbudget, audit, avbrott, körningsfrekvens och autonomibehörighet enligt governance.

## Rollback

- Pausa fortsatt P2-körning genom att backa appkoden; P1:s läsande källdossier kan fortsätta utan historiken.
- Radera **inte** sparad historik automatiskt vid rollback. Tabellen ligger kvar tills datalagring och retention har hanterats genom särskilt godkänt beslut.
- Om databasschemat ska återställas krävs granskad migrationsåterställning och säker hantering av sparade observationer. Ingen automatisk DROP eller rensning ingår.

## QA-status

Verifierat i separat, isolerad Windows-worktree med återanvända **lokalt installerade** dependencies (inga paketinstaller eller produktionstester):

- **179 av 179 relevanta Vitest-tester passerar** i 11 testfiler för P1/P2, Handlarbörsen-sidan, ägarvyn, daglig statistikrapport och historik.
- `npm run typecheck --workspace=apps/web`: **PASS**, exit 0.
- Diffkontroll `git diff --check`: **PASS** före commit.
- Två ytterligare testsviter, `migration-guard-v2.test.ts` och `schema-security-invariant.test.ts`, har lokala **baslinjefel identiska på oförändrad P1-branch**: Vitest-importen av `check-migrations.mjs` ger SyntaxError trots godkänd `node --check`; en Windows-path-tolkning hittar bara en av två migrationsrötter. Inget av dessa fel får döljas genom att försvaga vakterna. Återstående CI och isolerad PostgreSQL-replay/RLS-verifiering är obligatoriska före migration.

Repo-migrationsgrinden ska förväntat neka en omigrerad produktionsledger; dess kod och driftkonfiguration får inte försvagas.
