# Windowsidentitet för Atlas kodarbetare
Datum: 2026-10-18
Status: Implementerad, lokalt verifierad och oberoende granskad. Inte produktionsaktiverad.

## Vad leveransen gör

Brokern väljer Windows CNG på Windows och behåller den befintliga Macsigneraren på Mac. Windowsnyckeln är beständig, användarbunden, P-256 och saknar exporträtt för privata nyckeln. Den markeras som windows_cng; inget TPM- eller Secure Enclave-bevis påstås.

Den befintliga kommandoytan generate/enroll/diagnostic används. Windowsadaptern använder en fast .NET-runtime och en paketrelativ nativehelper utan shell, PATH-sökning eller miljöstyrd helper. Publik nyckel, identitet och thumbprint kontrolleras innan signering/registreringsunderlag godtas. Den lokala signaturen verifieras mot samma nyckel innan den returneras.

Registrering och diagnostik tillåter HTTPS och uttrycklig lokal HTTP-utveckling; de följer inga omdirigeringar. Serverns signeringsformat, register, godkännanden och sex broker-rutter har inte utökats.

## Verifierad källa

Bas: e2316f1eb2a018ce968122eb4d6095b433c0e43c
Granskad produktkod: 807da5a8f40dba45707330f4bace99e3b42b21f5
Slutligt verifierad kod inklusive kompletterat test: 41c5baa9efa3d19c7e7a1e2af6e1083cb394be99
Gren: codex/atlas-code-worker-design-20261018

Spec: ../superpowers/specs/2026-10-18-atlas-first-code-job-design.md
Plan: ../superpowers/plans/2026-10-18-windows-broker-identity.md

## Resultat

| Kontroll | Observerat resultat |
|---|---|
| .NET-helper och native testharness | Byggda med installerad SDK 8.0.204, noll varningar och fel; inga externa paketkällor |
| CNG smoke | 15/15 kontroller: återöppning, ingen rotation vid duplicate generate, privat export nekad, DER-signering, ändrat innehåll nekat, saknad nyckel skapas inte, felaktig UUID/payload nekas, testnyckeln borttagen |
| Fokuserad Vitest-körning | 116/116 i fem filer; inga överhoppade tester |
| Verkliga Windowsprov inom dessa 116 | 5/5, riktiga separata helperprocesser och serverns riktiga verifyEs256; ändrat innehåll och främmande nyckel nekas |
| Broker TypeScript | tsc -p apps/code-broker/tsconfig.json --noEmit, exit 0 |
| Webb TypeScript | tsc -p apps/web/tsconfig.json --noEmit --incremental false, exit 0 |
| Git whitespace-kontroll | git diff --check godkänd |

SHA-256 för den publika, tillfälliga nativeprov-identiteten i den samlade körningen:
1eaaef124a3f841c72c8870ee03985b44e3920c08ffab4c50ab9081036247576
Detta är ett testkvitto, inte identiteten för någon registrerad produktionsbroker. Testharnessen bekräftade att nyckeln togs bort.

Testfiler:
- apps/web/lib/qa/sdf-windows-identity.test.ts — 33
- apps/web/lib/qa/sdf-windows-identity-native.test.ts — 5
- apps/web/lib/qa/sdf1c-broker-identity-id.test.ts — 13
- apps/web/lib/qa/sdf1c-trusted-broker.test.ts — 16
- apps/web/lib/qa/sdf1c2-broker-control-channel.test.ts — 49

## Kommandon för att återskapa kontrollerna

Kör från repots rot i PowerShell.

```powershell
npm --prefix apps/code-broker run native:build:windows
dotnet build apps/code-broker/native/windows/smoke/Smoke.csproj --configfile apps/code-broker/native/windows/NuGet.Config -c Release
dotnet apps/code-broker/native/windows/smoke/bin/Release/net8.0-windows/Smoke.dll
node node_modules/typescript/bin/tsc -p apps/code-broker/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false
```

Den riktiga Windowskontrollen kräver SDF_WINDOWS_IDENTITY_REQUIRED=1 under testkommandot. Återställ processens tidigare värde efteråt.

```powershell
npm exec --workspace=apps/web -- vitest run lib/qa/sdf-windows-identity.test.ts lib/qa/sdf-windows-identity-native.test.ts lib/qa/sdf1c-broker-identity-id.test.ts lib/qa/sdf1c-trusted-broker.test.ts lib/qa/sdf1c2-broker-control-channel.test.ts --maxWorkers=2 --minWorkers=2
```

Utan den explicita flaggan markeras nativeproven överhoppade; det är inte ett godkänt Windowsbevis. Saknad helper eller fel operativsystem ger fel när flaggan kräver provet.

## Avvikelser och beslut under arbetet

1. Superpowers shellscript fanns inte på Windowsvärden. Motsvarande BASE/RED/GREEN/commit-historik fördes i en separat ledger. Risken är manuell bokföring; kommitthistorik och verkliga testkvitton finns.
2. Två befintliga strukturtester föll på Windows sökvägsseparatorer redan före ändring. Separatorerna normaliserades, de exakta listorna behölls och endast den nya Windowsidentitetsmodulen lades till som tillåten child_process-importör. Risken är en svagare scan; de exakta listorna testas fortfarande.
3. Native bin/obj uteslöts redan i första kodsteget för att kompilerade filer inte skulle hamna i git. Källorna är versionshanterade.
4. Brokerpaketet är inte ett npm-workspace. Den planerade workspace-typkontrollen ersattes med explicit tsc -p mot brokerkonfigurationen.
5. Den godkända planen begränsar testerna och utesluter hela repots svit. Den breda sviten har kända tidigare fel; de är inte påstått lösta här. Risken är otestade beroenden utanför de berörda gränserna.
6. De befintliga POSIX-specifika isolationssviterna kördes inte: Ubuntu/WSL saknar node även genom login-skalet. Ingen ny installation gjordes. Risk: den lokala POSIX-regressionskontrollen återstår.
7. En tidig multiline-ändring missade CRLF-formatet i transportfilen. Testerna låg kvar rött, felet identifierades och rättades innan slutverifieringen. En för tidig ledgerstatus korrigerades; ingen release hade skett.

## Gränser för denna leverans

Ingen produktionsnyckel, registrering, grant, modellkörning, betalt API-prov, migration, merge eller deploy har utförts.

Full Windowskontroll av ACL:er/verktygsförtroende och reparse-säkra reposökvägar återstår. Docker/WSL2 måste få ett eget verifierat värdbevis innan någon kodexekvering tillåts. Den nuvarande identitetsadaptern bevisar inte sandboxisolering eller att en lokal DLL är hårdvaruattesterad.

Workspace, dependency-image, patch/test-exekvering, signerade runtimekvitton, modelladapter och koppling till samtalet ligger i nästa delar av den godkända designen. Atlas kan därför ännu inte genomföra autonoma kodjobb genom denna leverans.

## Oberoende granskning

En separat granskare granskade hela skillnaden från basen till 807da5a i en ny kontext. Resultat: 0 kritiska, 0 större och 3 mindre fynd. Ingen produktkod ändrades efter granskningen. Ett saknat explicit bevis mot främmande publik nyckel lades till i nativeprovet; därefter passerade 116/116 tester igen. Ingen andra granskningsrunda beställdes.

Mindre fynd som lämnas till senare:
- CLI:n skapar OS-signeraren före sin generella felhanterare. På operativsystem som inte stöds ger det en stacktrace; inget jobb eller nyckel skapas.
- Timeout och utmatningstak är konfigurerade och kontrollerade som processalternativ, men separata verkliga timeout/overflow-fall, nekad CNG-åtkomst och fullständig reparse-hantering har inte bevisats.
- Nativeprovets teardown kan missa en close-händelse om processen redan stängts efter ett onormalt fel. Den bevisade normala rensningen passerade.

Granskarens avgränsningar och beslut:
- Kontroll av JWK/thumbprint och signatur bevisar intern konsistens, inte oberoende proveniens för en illvilligt utbytt helper. Ingen sådan hårdvaru-/programattestering påstås. Den bredare lokala kontrollen hör till värdkvalificeringen. Risk: en manipulerad lokal helper kan presentera annan identitet före registrering.
- Registrering läser publik nyckel innan signeringen återläser den. Inget nytt atomärt lokalt pin införs här; servern verifierar registreringssignaturen mot inskickad JWK och en ändrad nyckel nekas. Risk: registreringen misslyckas vid ett externt nyckelbyte.
- Ett explicit främmande-nyckelprov lades till som komplettering av den godkända planen. Det verifierar redan existerande serverbeteende och ändrar inte produktkod.
- Ingen faktisk Mac-körning, POSIX-isolationskörning, helt grön reposvit, produktionsregistrering/återkallelse, full reparse- eller ACL-kvalificering påstås. Körning av kod, modeller och underagenter förblir avstängd.

Kod och dokument bevaras på separat lokal gren inför nästa del. Ingen begäran om merge eller produktionspublicering har genomförts.
