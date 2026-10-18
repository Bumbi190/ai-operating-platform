# Atlas testdata: granskat live-steg,18 oktober2026

Status: förberett för separat godkännande. Inga produktionsmigrationer, nya nycklar, behörighetsrader, klassningar eller undanläggningar har körts av detta arbete.

Ändringen finns i [Handlarbörsen#141](https://github.com/Bumbi190/handlarborsen/pull/141) och [Omnira#399](https://github.com/Bumbi190/ai-operating-platform/pull/399). Detta steg publicerar koden och låter Atlas läsa inventeringen. Mutationer förblir avstängda.

## Verifierat underlag

- H: källkod03dfb1cd2adb7c92a05ae603ee089ff2616f7116; huvudgrenec1cdbf oförändrad.
- O: senaste huvudgrenf0a52321361b7f1a03d5336cbd7a5c8c4d769ac5 integrerad i verifierad källkod3dbc9b6150d624b872519a3648fba6dfa127f934. Befintliga nyhetsvyer, Remotion och den nya veckorapporten bevaras.
- O: kanonisk avstämning2d00ab7b95a28f1ed680bc2b372363d31f756d69.
- De nio väntande migrationerna och deras exakta git-blob-hashar finns i [maskinläsbart underlag](../../verification/2026-10-18-atlas-test-data-release-preflight.json).
- H:s37 affärstabeller och74 inkommande beroenden matchar testmiljön. Fingeravtryck45290090ef97d70f787f76bdd73cd6c107088141addba5c01f4d22e21da45cda verifierat med samma tomma search_path som funktionen.
- H live har10 organisationer; båda skyddade UUID:na finns. Dessa uppgifter klassificerar inte de andra åtta som testdata.

## Avstämt parallellt schema

Live O hade en tillämpad sales_strato_inbox som saknades i vår kanoniska migrationsmängd. SQL-filen från [PR386](https://github.com/Bumbi190/ai-operating-platform/pull/386) matchar produktionshistoriken exakt:36094bytes, SHA2561013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1.

Endast denna redan tillämpade fil och de fyra separat kontrollerade SERVER_ONLY-tabellposterna har förts in. Den ska inte appliceras igen. Samma fil finns nu även i huvudgrenen genom PR401; det är ingen ytterligare väntande migration. Inga mejlrutter, worker-anrop eller nya mejlrättigheter har importerats från PR386. Ingen produktions-DDL eller historikreparation utfördes.

Migration guard har nu140 kanoniska/126 enforced, med frysta14 grandfathered/30 legacy-namn oförändrade. Den verkliga historiken har160 rader och saknar exakt våra tre O-migrationer. Samma160 namn plus de tre framtida tillämpningarna passerar som163 unika kända namn i simuleringen. Verklig publicering förblir spärrad tills de faktiskt tillämpats.

## Föreslagen ordning efter uttryckligt klartecken

1. Kontrollera frysta källhashar, aktuell huvudgren och att inget nytt schemadrift tillkommit.
2. Tillämpa H:s sex migrationer i filordning. Ledger62→68 förväntas. Bevara verklig tillämpningshistorik och verifiera alla namn, faktisk version och SQL-hash; fyll aldrig i påhittade poster.
3. Publicera H#141 och verifiera rätt SHA på www.handlarborsen.se, kompatibel API, fortsatt skydd för riktiga bolag och nekat oanmält/osignerat anrop.
4. Tillämpa O:s tre migrationer i filordning. Ledger160→163 förväntas. sales_strato_inbox är redan live och ska inte köras igen.
5. Publicera O#399 och verifiera grönt riktigt migrationsskydd samt rätt SHA/host app.omniraos.se. Ingen override.
6. Kör de två förberedda inventeringsförslagen: [H](../../sql/atlas_test_data_inventory_activation_h_proposed.sql) och [O](../../sql/atlas_test_data_inventory_activation_o_proposed.sql). De binder samma operator till aktuell ägare/projekt, endast inventering och30dagar. Konflikt/återkallning återupplivas aldrig genom en retry.
7. Skapa en ny serverhemlighet för läsning, minst32 slumpbyte. H: ATLAS_TEST_DATA_READ_KEY. O: HANDLARBORSEN_TEST_DATA_READ_KEY. Endast production, aldrig NEXT_PUBLIC, loggar, git eller klient. Verifiera projekt/host innan konfiguration och nytt bygge.
8. Behåll ATLAS_TEST_DATA_MUTATIONS_ENABLED=false på båda servrarna, execute-nycklar unset och allowed_operations tomma. Projektläget förblir observer och metrics-kollektorn v1.
9. Verifiera en signerad read-only inventering. Paket/beslut/utföranden/karantänmarkörer ska fortfarande saknas. Inga mejl, pushar, Stripe-anrop eller betalda röstprov. Mobilens verkliga ljud/mikrofon testas separat av ägaren.

Nya mål klassificeras först efter individuell ägargranskning. Karantän/återställning kräver senare uttryckligt snävt mandat, aktiverade flaggor och eget exakt granskningskort. Detta live-steg lägger inte undan några företag.

## Kontroller

- 520/520 berörda enhetstester i26 filer; inkluderar röst/controller, säkerhetsgrindar, migrationer och den nya projektgränsen.
- 34/34 review/outbox/lifecycle-SQL; tidigare övriga21 fokuserade SQL-fall använder oförändrade egna migrationsblobbar.
- Inventeringsförslagen6/6 lokala kontroller, samtliga transaktioner återställda: tom mutationslista, exakt idempotens, ändrad ägare/återkallad bindning avvisas.
- Slutlig typkontroll är grön och det senaste normala bygget gick igenom på verifierad integrerad källkod. Detaljer anges i [verifieringskvittot](2026-10-17-verification.md). Fullständig O-testsvit och full produktionsreplay påstås inte vara gröna; de tidigare begränsningarna gäller fortfarande.

## Återgång och beslut

Vid fel: stoppa aktivering, håll mutationsflaggor false, återkalla inventeringsbindningen och läsnyckeln. Återställ inte databasen och radera inte revisionsdata. Appåtergång får inte rulla tillbaka andra samtidiga releaser.

Handlarbörsens [AGENTS.md](https://github.com/Bumbi190/handlarborsen/blob/ec1cdbfee9272a7a603c42a5a8cde900702baa0a/AGENTS.md) säger: “Do not merge branches, change paid services, or perform production transactions without explicit approval.” Därför ligger denna konkreta publicering kvar som ett separat produktionsbeslut.
