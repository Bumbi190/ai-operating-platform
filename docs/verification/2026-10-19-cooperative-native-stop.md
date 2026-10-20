# Atlas – kooperativt nativestopp bakom körunderlaget

Datum: 2026-10-19–20. Godkänd plan: `docs/superpowers/plans/2026-10-19-cooperative-native-stop.md` (André 2026-10-19 16:33, med senare godkännanden 20:45, 20:53, 21:02 och 2026-10-20 06:52).
Migrationsplan: `docs/superpowers/plans/2026-10-19-docker-desktop-all-users-migration.md`.
Kodintervall: `53683a4fec176446153391451c3a5976d9497262..7c161105c590fdb1d6da1e81b4250a49711527d3` (13 commits). Gren: `codex/atlas-code-worker-design-20261018`.
Maskinunderlag: `docs/verification/2026-10-19-cooperative-native-stop-evidence.json`.

## Resultat och gräns

Nativehjälparens `materialize-fixture` styrs nu av en kontrollkanal (`sdf.native_control.v1`). Hjälparen meddelar sex ordnade kontrollpunkter och fortsätter först efter ett uttryckligt `continue`. Brokern skickar `continue` endast efter en färsk, levande läsning av körunderlaget (`ExecutionLeaseGuard`) för exakt samma jobbindning. Stopp, avbrott, EOF, felaktiga ramar eller utebliven svarsrad leder till kooperativt stopp och identitetskontrollerad städning.

- Ingen reservation eller start sker utan levande körunderlag för samma jobb (`binding_mismatch`, `lease_not_live`).
- En rapport som kommer efter stopp eller utgånget körunderlag kan aldrig bli `observed`; resultatunionen saknar fixture-, ready- och publiceringsfält.
- Varje stopp, oavsett källa (körunderlaget, upptäckt protokollbrott, hård tidsgräns 185 000 ms), startar exakt en 35 000 ms grace-period som slutar i tvångsavslut, följt av högst en identitetskontrollerad `cleanup-materialization`.
- Hjälparen startas frånkopplad från Nodes kill-on-close-jobb, så att brokerns död blir EOF och hjälparen städar själv.

Detta är fortsatt en intern konstruktion utan operativ konsument. Den startar inga modelljobb, skriver ingen projektkod, publicerar inget och ger ingen produktionsbehörighet. Ingen push, merge, driftsättning eller liveflagga har gjorts.

## Docker Desktop för alla användare

Värdkvalificeringen blockerades av en skrivbar ACE (capability-SID) på den per-användarinstallerade Docker Desktop under AppData. Ingen ACL, betrodd SID eller policy ändrades. I stället migrerades Docker Desktop 4.95.0.242831 till `C:/Program Files/Docker/Docker` enligt migrationsplanen (Gate 0–3): verifierade säkerhetskopior, bekräftad återställning av samma datadisk före första start, oförändrad motor-ID och daemon-identitet `097b0409…`, identiska containrar/images/volymer (40/46/48) och tre avsiktligt stoppade containrar återstartade per ID. `HostProfile.cs` pinnar nu `docker.exe` (`6c699720…`) och `com.docker.backend.exe` (`37deeeae…`) under Program Files. Fyra kvalificeringar med 65 s mellanrum med Codex-tjänsten igång gav identiska identiteter.

## PostgreSQL-testfixturen (klass P)

Fixturen kräver full värdkvalificering (docker- och backend-mål godkända, daemon pinnad) före varje Docker-anrop. Första lyckade kvalificering låser backend-processens identitet för fixturens livstid och skrivs i kvittot. En ändrad identitet eller misslyckad kontroll blir aldrig ny baslinje: fixturen förseglas, inga fler Docker-anrop görs (inte heller städning) och kvittot redovisar att resursen kan finnas kvar.

Godkänt undantag (21:02), endast i fixturen och endast för de två namngivna tidskänsliga SQL-testerna: uttryckligt avgränsade fönster (högst 15 000 ms, ej nästlade, nya anrop nekas efter utgång) med full kvalificering omedelbart före och efter. Efterkontrollen körs även om testet kastar, efter att alla startade parallella anrop och lås hanterats. Nativehjälparens egna identitetskontroller är oförändrade. Inga assertionsgränser ändrades (`>2500/<7000 ms` och `<2900 ms`); endast testtimeouts höjdes eftersom varje Docker-anrop nu kostar cirka 1 s kvalificering.

RED (6/6 mot gamla fixturen) → GREEN (6/6). Varje fullständig SQL-körning: 37/37, 342 identitetskontroller, alla godkända och med en enda backend-identitet; båda fönstren stängda inom gräns (cirka 3,4 s respektive 1,9 s); container borttagen med bekräftad frånvaro. Sex fixturkataloger finns; fem har kvitton `removed`. Den sjätte (`pg-4ac5eae6…`, 2026-10-19 16:41) avbröts före containerskapande när värden ännu inte var kvalificerad; ingen Docker-resurs finns.

## Riktiga nativeförsök (klass N)

Körda en gång vardera på `7c16110` med kvalificering före varje försök, ny avsiktsfil (`sourceCommit` och binärpinnar kontrollerade före dispatch) och oförändrad backend-process `fc3ae1f4…`:

| Försök | Scenario | Utfall |
| --- | --- | --- |
| A | Körunderlaget nekar vid `before_volume_create` | `stopped/lease_lost`, ingen volym/container skapad, 0 städanrop |
| B | Nekande medan containern kör efter `before_start` | stopp skickat vid 22,5 s, hjälparens egen städning, `stopped/confirmed` |
| C | Brokerns föräldraprocess dödas under containerväntan | hjälparen levde vidare, såg EOF, städade själv och avslutade 4,0 s senare |
| D | Hjälparen tvångsavslutas under containerväntan | brott upptäckt, exakt en identitetskontrollerad städning, `stopped/control_lost/confirmed` |

Alla fyra: containrar 40/40 och volymer 48/48 före/efter, frånvaro bekräftad och omkontrollerad i slutkontrollen. Gravstenar i `attempts/` ökade 15 → 27 → 39; inga togs bort. Första omgången (`0fb66f3`) blev inaktuell och arkiverades i plan-scratch (`superseded/run1-0fb66f3`); den återanvänds aldrig.

## Reproducerbarhet och spårbarhet

Nativebyggena stämplade tidigare commit-SHA:n i versionssträngen och via SourceLink, vilket gjorde varje commit till ett nytt binärt. Efter rättningen (`IncludeSourceRevisionInInformationalVersion=false`, `EnableSourceControlManagerQueries=false`) är versionen `1.0.0` och varken DLL eller PDB innehåller commit-SHA. Tre tvingade offlineombyggen på `7c16110` gav identiska byte, samma som bygget kvällen innan och samma som slutkontrollens ombygge:

| Fil | SHA-256 |
| --- | --- |
| OmniraBrokerWorkspace.dll | `b018302fbccb526911a51116f4395092cf4371b103c37b25be019afdfa81f5bc` |
| OmniraBrokerWorkspace.deps.json | `7e04cee2425e17bad27451bb3ac1f05f5533061e3f7dcb1c944b2af187ff288c` |
| OmniraBrokerWorkspace.runtimeconfig.json | `28329cf08f6505e73806b17558b187c02f0c1c516fe47ebfb7a013d082aaa306` |
| OmniraBrokerHost.dll (hjälparens kopia) | `f703110916c28b6f14c76d78311064bd1938edd602da20ca9b287a0cf2ddefb9` |

Varje bevis binder dessa binärer, normaliserade SHA-256 för nio native- och brokerkällor samt den bevarade förfrågan. Klass V kräver dessutom daemon `097b0409…` och samma verktygskedjeprofil som i beviset (`d7c99370…`), och att bevisets image för A/B är `sha256:354e46f6…`. Imagen jämförs inte mot nuvarande miljö, och daemon-identiteten överlevde en full ominstallation av Docker Desktop; en utbytt installation med samma motor upptäcks därför inte. Backend-identiteten binds inte eftersom den byts vid varje Docker-omstart. Se `2026-10-20-fix-pass-review.md`.

## Slutkontroll

Exakt enligt planen vid `7c16110` (enda avvikelse: `--outputFile` anges med absolut sökväg till plan-scratch, eftersom planens relativa sökväg skrev under `apps/web/`):

| Steg | Resultat |
| --- | --- |
| Offlinebygge hjälpare och smoke | 0 varningar, 0 fel; hashar = bevisens |
| Fake-Docker-smoke | control-channel 34, materialization 62, materialization-spec 25, attempt-journal 7, toolchain 8; stderr tom |
| Vitest, exakt 18 filer | 374/374; 0 fel, 0 överhoppade, 0 todo; varje fil har tester |
| Typkontroll broker och webb, `git diff --check` | exit 0 |
| Evidens | inga `omnira.plan=cooperative-native-stop`-containrar kvar; föregångarens scratch frånvarande; bevisworktree `c435e423` ren på `d3f9fcc`; gravstenar bevarade |

Tidigare körningar redovisas i maskinunderlaget: körning 1 (`0fb66f3`) 367/369, körning 2 (`b3b86f2`) 365/369 med A–D inaktuella, körning 3 (`065d5e3`) 370/374 med A–D inaktuella som väntat. Vites CJS-varning och Dockers `no such object` från frånvarokontrollen syns i loggen och är inga fel. Hela produktens testsvit har inte körts.

## Oberoende granskning och rättningsomgång

En oberoende, endast läsande granskare granskade `53683a4..0fb66f3` med båda specifikationerna, planen, reglerna och de fem granskningsfallen. Utfall: CHANGES REQUIRED. Fall 1, 2, 3 och 5 godkända; fall 4 delvis underkänt.

Materiella fynd, åtgärdade och verifierade:

1. Boundary-listan saknade godkända `HostProfile.cs` → `b3b86f2` (även `controlled-helper.ts` som sjätte tillåtna `child_process`-import); grön i slutkontrollen.
2. Ett stopp som startaren själv skickade vid protokollbrott startade ingen tvångsavslutning, och en tyst hjälpare saknade yttre gräns → `065d5e3`: grace-kill vid varje stopp och hård gräns 185 000 ms. RED 4/4 → GREEN med fakes. De riktiga försöken A–D är gröna på den rättade koden som regressionsbevis; de nya vägarna (grace-kill efter startarens eget stopp och 185 s-gränsen) har ännu inget riktigt prov.
3. Klass V kontrollerade inte om miljön → `065d5e3`: daemon, verktygskedjeprofil och image. RED → GREEN; används i slutkontrollen.
4. Eget fynd från slutkontrollen: commitberoende nativebinärer → `065d5e3` och `7c16110`; verifierat enligt ovan.

Rättningsomgången (`b3b86f2..7c16110`) har inte granskats av en ny oberoende granskare, eftersom planen tillät exakt en granskning. Den är verifierad med RED→GREEN, riktiga försök och slutkontrollen.

## Kvarstående fynd

| # | Fynd | Risk | Rekommenderad åtgärd |
| --- | --- | --- | --- |
| 1 | Bryggan förbrukar inte guarden: samma guard kan starta ett andra försök (bekräftat med RED 8/8, även samtidigt och via en annan bryggninstans). | Medel–hög inför första konsument | Gör guarden förbrukad vid varje icke-`observed`-resultat och testa att en andra körning ger `not_started`, före första operativa konsument. |
| 2 | Händelsen `'error'` i startaren kan lösa `done` medan processen fortfarande lever, så städningen kan överlappa. | Låg (journal-låset ger `unknown`, felar stängt) | Vänta på `close` eller tvångsavsluta med begränsad väntan före städning. |
| 3 | Nativefixturen rapporterar båda borttagningsflaggor som sanna vid stopp när `!volumeMayExist`, utan observation. | Låg–medel (falskt frånvaropåstående endast vid kapplöpning med `resource_conflict`; inget raderas) | Rapportera `null` eller observera faktisk frånvaro. |
| 4 | PG-fixturens kvittostatus är alltid `cleanup_withheld_backend_changed`, även vid andra förseglingsorsaker eller efter bekräftad frånvaro. | Låg (felar stängt) | Särskild status per orsak; `containerMayRemain:false` när frånvaron redan bekräftats. |
| 5 | `parallel()` kvalificerar en gång per sats, inte per `exec`. | Låg (alla anrop startas synkront direkt efter kontrollen) | Dokumenterat; ändra endast om satser blir asynkrona. |
| 6 | Försök B observerar inte direkt att containern körde vid nekandet. | Låg | Spara `docker inspect`-tillstånd vid nekandet i framtida bevis. |
| 7 | `sdf-windows-materialization-native.test.ts` (utanför slutkontrollen) flyttar en avsikt till `dispatched-once` före kontrollen som kastar. | Låg | Kontrollera före tillståndsbytet. |
| 8 | Allow-listan kontrollerar bara filnamn, och två smoke-filer utanför planens filkarta är med. | Låg (diffen är endast `ContinueAll`) | Innehållspinnar för dessa filer. |
| 9 | `not_started` innehåller `binding_mismatch` och `helper_unavailable` utöver planens kontrakt. | Information | Uppdatera specifikationen. |
| 10 | Planens radgräns 8192 stämmer inte med rapportgränsen 262144; skrivaren nekar de sista cirka 24 byten. | Låg | Rätta plantexten. |
| 11 | Planens `--outputFile` är relativ till `apps/web`. | Låg | Rätta plantexten (absolut sökväg). |
| 12 | Verktygskedjans provisioneringsskript (`provision-windows-toolchain.mjs`, `recover-…`, `resume-…`) pekar fortfarande på AppData-Docker. | Medel för framtida imagebyggen; körs inte i detta inkrement | Uppdatera sökvägar och hashar under separat godkännande innan nästa imagebygge. |
| 13 | Rättningsomgången saknade ny oberoende granskning. | Åtgärdat 2026-10-20 | Granskad: APPROVE WITH MINORS, se `2026-10-20-fix-pass-review.md`. |
| 14 | Granskarens svar på tillägget om `b3b86f2` hade inte kommit in när rapporten skrevs. | Information | Redovisas separat om det kommer. |
| 15 | Huvudcheckouten har nio befintliga ändringar som fanns före detta arbete. | Information | Orörda; ägaren avgör. |

## Städning

Endast denna plans identitetskontrollerade scratch (`.superpowers/sdd/2026-10-19-cooperative-native-stop`) tas bort efter commit. Worktrees, bevisworktree `c435e423`, äldre verifieringsunderlag, gravstenar, Docker-säkerhetskopior och huvudcheckouten lämnas orörda.
