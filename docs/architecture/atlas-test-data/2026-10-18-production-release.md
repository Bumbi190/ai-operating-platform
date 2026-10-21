# Atlas inventering: produktionsaktivering 18 oktober 2026

André godkände publicering av H#141/O#399, nio migrationer och enbart läsanslutningen i denna chatt. Godkännandet gäller publiceringen; ingen ytterligare bekräftelse krävs för samma steg.

## Faktiskt utfört och verifierat

- Samtliga nio granskade SQL-blobbar är applicerade. Lagrad SQL SHA256 matchar källan för alla nio. [Versionskvittot](../../verification/2026-10-18-atlas-test-data-applied.json) skiljer filversion från verklig ledgerversion.
- H#141 mergad som ba0daf6c11984ea5dcec3f3d0a0ce1c1118afd47. Produktion READY, deployment dpl_2CCGk1n8t3ZCvKviiwsw5pnPDLFd, alias www.handlarborsen.se verifierat.
- H:s affärsschemafingeravtryck är fortsatt 45290090ef97d70f787f76bdd73cd6c107088141addba5c01f4d22e21da45cda. Organisationsantal10, båda skyddade kvar.
- O:s verkliga ledger168 passerar den strikta policyn145 kanoniska/131 enforced/14 grandfathered/30 legacy, noll okända eller dubbla namn. Ingen override.
- Inventeringsbindning bf1f981c-2beb-48ef-9003-6ff8d410b4eb finns på båda sidor för verifierad ägare/projekt; allow_inventory=true, allowed_operations tomma. H löper ut2026-11-17T09:12:46.291586Z.
- O:s riktiga authority-RPC med en befintlig ägd Handlarbörsen-konversation returnerar observer och tom allowedOperations.
- Bara de nya läsnycklarna (sensitive, production) och explicit ATLAS_TEST_DATA_MUTATIONS_ENABLED=false finns på båda projekten. Execute-nycklar saknas. Inga nyckelvärden finns i git eller rapporten.
- Signerat live-HTTP-prov2026-10-18T09:15:54.888Z: inventering200 och validerad av Omniras faktiska decodeInventoryView.10 organisationer:2 real/8 unknown. Familje-Stunden och Bromölla kylteknik är real. Osignerat401; samma signerade anrop igen409. Total tid2485ms inklusive replay.
- Efter provet: paket0, godkännanden0, kvitton0, karantänmarkörer0. Klassningsregistret innehåller enbart de två obligatoriska skyddade real-identiteterna; inga verified_test. Inga bolag har lagts undan.
- H:s första felaktiga läsfråga använde organisations i stället för faktisk organizations; korrigerades utan skrivning. En transportbegäran för H:s fjärde migration löpte ut; verklig ledger kontrollerades innan den ännu ej applicerade filen kördes.

## Samordning och återhämtning

Ruling62: exakt redan-live sales_reply_preparation från PR386 jämfördes med ledgers lagrade SQL: SHA2567516d8566ae7776086452ff8fdd51058ce34a10ab70973bcdbf4ee14f655a3cc. Bara källfil och tre separat observerade SERVER_ONLY-poster fördes in, ingen mejl-runtime eller SQL-replay. Saknad-källa-testet observerades RED, sedan GREEN. Risk om fel: felaktig källavstämning kan stoppa bygget.

Ruling63: under utrullningen publicerade en parallell chatt main8d91af9 via PR402 med fyra sociala migrationer och samma sales-reply-källa. Main integrerades i21adb2e; de tre konflikterna löstes genom union av båda historieset och båda testgränser,145/131 och verklig168. Mail-SQL räknas en gång. Risk om fel: schema-/byggbokföring, ingen ny social aktivitet har aktiverats av denna chatt.

Ruling64: sista O-migrationen COMMIT:ade SQL innan MCP:s efterföljande ledger-INSERT fick samma-sekunds-PK-krock med föregående migration20261018090827. Den kördes INTE igen. Samtliga sju funktioners prosrc jämfördes exakt med originalet, postgres-ägande, SECURITY DEFINER och nekat klient-EXECUTE verifierades. Därefter registrerades den faktiskt applicerade original-SQL:n under dess kanoniska filversion20261017193411, med guarded source assertion i samma transaktion. Recovery registrerad2026-10-18T09:10:42.809236Z; lagrad hashb71a8deed4b8467f2ee5b995dd6e4329f31ccf8b69dccf4f340c79910846806c. Detta är reparation av verkligt applicerad SQL, ingen påhittad tillämpning eller ny DDL. Risk om fel: osann release-evidens; därför verifierades varje exakt kropp innan registrering.

## Verifiering vid källkod21adb2e

- 560/560 tester i38 filer GREEN, inklusive hela tidigare26-filers Atlas-gränsen, nya källavstämningar och tillgängliga upstream sociala enhetstester.
- Utökad44-filers körning:560 pass, sex fixture-beroende sviter kunde inte starta eftersom WEBSITE_BUILD_TEST_DATABASE_NAME saknades för deras separat ägda website_test-databas.44 fall skippades vid setupfelet. Ingen främmande lokal databas startades eller återställdes för att dölja begränsningen.
- Slutlig nonincremental TypeScript exit0. Helperns ärvda konsoltext säger plus SQL PASS; denna fortsättningskörning körde ingen SQL-fixture. Tidigare34+21 SQL-fall gäller oförändrade egna migrationsblobbar.
- Normalt produktionsbygge exit0,63 sidor,107.24s. Lokala publika Supabase-placeholdervärden användes för auth-sidornas prerender; första försöket utan dessa stoppade på saknad publik konfiguration. Detta ersätter inte Vercels riktiga produktionskontroll.
- H runtime error/fatal-loggskanning vid ny deployment, senaste20min: inga grupper returnerade. Kort observationsfönster, inget långtidspåstående.
- Den tidigare fulla O-svitens baselinefel är fortfarande dokumenterade; den påstås inte vara grön. Ingen ny oberoende kodgranskning har beställts; ursprunglig granskning/fixpass och64 kronologiska avgöranden finns i [verifieringskvittot](2026-10-17-verification.md) och detta tillägg.

O#399:s slutliga merge, riktiga Vercel-production READY/SHA/alias och omedelbara loggkontroll bekräftas efter denna payloads publicering i slutöverlämningen. Att underlaget är färdigt betyder inte att den återstående deploymenten redan är verifierad.

## Aktiv gräns

Atlas kan inventera. Undanläggning och återställning förblir avstängda med tom operationslista och utan execute-hemlighet. Ingen hard delete, Auth-/Storage-rensning, mejl/push/Stripe eller betalt röstprov utfördes. Åtta unknown får inte antas vara testbolag. Senare klassning och konkret åtgärd kräver separat snävt mandat och exakt granskningskort.
