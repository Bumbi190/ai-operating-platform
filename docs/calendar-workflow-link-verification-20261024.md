# Kalenderns koppling till Atlas-flöden – 24 oktober 2026

Arbetsblock med Atlas som planerat ansvar kan nu kopplas till ett befintligt Familjestunden-flöde i samma projekt. Valet sparas och finns kvar efter omladdning. Även flöden som saknar nästa schemalagda kontroll kan väljas.

Kalenderns färg och text följer det kopplade flödet. Ett granskningssteg visas orange, ett övrigt aktivt planeringsflöde blått och ett avslutat flöde grönt med texten “Flödet avslutat”. En saknad, otillgänglig eller okänd koppling blir orange. En gammal manuell Klart-markering kan inte göra den grön. Det går att ta bort kopplingen även när flödeskällan inte kan läsas. Projektbyte, byte till eget ansvar och konvertering till privat möte rensar kopplingen.

## Viktig funktionsgräns

Den granskade Familjestunden-definitionen är ett planeringsutkast. Den befintliga schemaläggaren utvärderar flöden. Denna koppling startar inte produktion, flyttar inte flödets schematid och godkänner ingen publicering. Detta framgår i kalendern. “Flödet avslutat” är inte ett fristående bevis för att sagan, bilderna eller en publicering är färdiga.

Nästa produktionsdel är att koppla in de faktiska arbetsmomenten och deras resultatkvittens, med ett uttryckligt start- och godkännandeflöde. Tiden för ditt arbete i kalendern behöver fortsatt hållas åtskild från den godkända publiceringstiden.

## Kontroll och skydd

- 79/79 enhetstester av validering, projektscope, flödesläsning, saknade källor, statusprioritet, tider och kalenderlayout.
- 23/23 webbläsartester: koppla, spara, ladda om, följa ändrad status, hantera saknad källa och rensa koppling. Mobilvyn vid 390 pixlar har granskats visuellt. Bilden visar lokal testdata.
- Full lokal återspelning av de 177 registrerade ändringarna med den tidigare dokumenterade testbasens anpassningar. Båda nya lokala kalenderändringarna applicerades därefter.
- Tio nya SQL-kontroller: egen projektkoppling, identiskt återförsök, fel projekt, annan ägare, testflöde, saknad instans, direkt databasuppdatering, borttagning av koppling, hjälpfunktionens behörigheter och oförändrat flödestillstånd/övergångshistorik.
- De tidigare 16 proven för ägarskydd och åtta ansvarstester passerade också. Alla provrader återställdes och den egna testcontainern togs bort.
- TypeScript-kontrollen rapporterar endast de tre tidigare felen i lib/media/lambda-render.ts: saknad @remotion/lambda/client och två region-typfel. Inga nya kalenderfel rapporterades.

Databasskyddet använder en privat, skrivskyddad hjälpfunktion med fixerad sökväg. Den härleder användaren från sessionen och kontrollerar att projektet ägs av användaren, att instansen hör till samma projekt och att definitionen är Familjestundens månadsflöde. Den ger inga rättigheter att starta eller ändra flöden. Läsningen kontrollerar projektscope på nytt. Flödesdefinitionens version och kontrollsumma måste matcha den medföljande definitionen innan ett granskningssteg tolkas.

## Leverans

Allt är sparat lokalt. Ingen push, sammanslagning, driftsättning eller ändring av hosted databaser har utförts. Migrationen 20261024174001_user_calendar_workflow_link.sql ska installeras efter 20261024174000_user_calendar_responsibility.sql och före det nya gränssnittet.

Migrationsfilen skapades med den installerade Supabase CLI:n. Eftersom den tidigare lokala och ännu odriftsatta ansvarsmigrationen hade ett senare versionsnummer än klockslaget flyttades den nya filens version till dess omedelbara efterföljare. Befintliga migrationsfiler och hosted registerposter ändrades inte.

Underlag: docs/validation/calendar-full-ledger-replay-20261024.json, de två SQL-proven och testerna för workflow-link. Den lokala testbasen är fortfarande en avgränsad kandidat, inte verifierad hosted Auth/Storage- eller HTTP-drift.
