# Kalender: planerat ansvar – verifiering 2026-10-24

Arbetsblock kan nu sparas med **Du** eller **Atlas – planerat**. Valet visas i kalendern och redigeraren och finns kvar efter omladdning. Gamla arbetsblock räknas som egna. Privata möten saknar ansvarsvalet. Byte till privat tar bort fältet. Återkommande bokningar ändras som en hel serie, vilket anges i redigeraren.

Atlas-valet är en planering. Det startar inget flöde, godkänner ingen publicering och innebär inte att jobbet utförts. Befintliga verkliga arbetsflöden visas separat som Atlas-flöde. Arbetsstatus ändras inte när ansvar ändras.

## Verifiering

- 68/68 tester av validering, status, återkommande bokningar, tider och kalenderlayout.
- 22/22 webbläsartester, inklusive skapa/spara/ladda om, ändra ansvar och konvertera till privat; ny kontroll vid 1280 och 390 pixlar.
- Riktig isolerad PostgreSQL: gamla formatet avvisar nya fältet före migrationen; ny validering accepterar båda värdena; beständig lagring, läsning och uppdatering fungerar. Ogiltiga värden, privata tilldelningar, extra exekveringsfält och ogiltig direkt databasuppdatering avvisas. Olika användare hålls åtskilda; versionskonflikt och upprepade identiska anrop kontrollerade.
- Testdatabasen använde redan installerad PostgreSQL, nätverk avstängt, inga portar eller monterade filer. Egen testcontainer borttagen.
- Mobilbild granskad visuellt. Bilderna visar lokal testdata och testkontroller, inte produktion.
- Full TypeScript-kontroll har samma tre tidigare fel i lib/media/lambda-render.ts: saknad @remotion/lambda/client och två region-typfel. Inga kalenderfel rapporterades.

## Leverans och återstående arbete

Ändringarna är sparade lokalt på grenen codex/calendar-provenance-owner-regression-20261023. Inget har pushats, slagits ihop eller driftsatts. Migrationen 20261024174000_user_calendar_responsibility.sql måste läggas in före det nya gränssnittet.

Den tidigare dokumenterade skillnaden i databasens migrationshistorik blockerar fortfarande en tillförlitlig hosted staging-repetition. Den måste redas ut innan vi verifierar och driftsätter mot den miljön. Därefter återstår bland annat koppling från planerade arbetsblock till körbara Atlas-flöden, verifierad mottagarkvittens för verklig publicering och beständiga notiser utanför den nuvarande veckovyn. Kalenderns färgprickar och veckans uppmärksamhetslista finns redan lokalt.

## Körning

Från apps/web:

    node ../../node_modules/vitest/vitest.mjs run lib/calendar/validate.test.ts lib/calendar/progress.test.ts lib/calendar/progress-ui.test.tsx lib/calendar/repeat.test.ts lib/calendar/repeat-end.test.ts lib/calendar/time.test.ts lib/calendar/layout.test.ts
    node ../../node_modules/@playwright/test/cli.js test --config playwright.calendar.config.ts

Från repots rot, med lokal Docker tillgänglig:

    node apps/web/scripts/verify-calendar-responsibility-local.mjs
