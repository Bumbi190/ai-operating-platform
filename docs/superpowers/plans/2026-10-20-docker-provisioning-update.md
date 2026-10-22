# Plan: provisioneringsskripten efter Docker Desktop-migrationen

Datum: 2026-10-20. Status: endast dokumentation. Inga skript, ingen Dockermiljö och inga images ändras eller körs utan separat godkännande.

## Nuläge (observerat skrivskyddat)

- Docker Desktop 4.95.0.242831 är installerat för alla användare under `C:/Program Files/Docker/Docker`. `resources/bin/docker.exe` har samma SHA-256 som tidigare (`6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896`). `resources/cli-plugins/docker-buildx.exe` har samma SHA-256 som tidigare (`e97f22ffc483857ec876055c0c1f52290ffd3d881e60a4a08e658bd6d39692bb`).
- Under `C:/Users/Andre/AppData/Local/Programs/DockerDesktop` finns endast avinstallationsrester (`tmp-delete`, 4 filer). `docker.exe` och `docker-buildx.exe` finns inte längre där.
- Tre skript pekar fortfarande på AppData-sökvägarna:
  - `apps/code-broker/scripts/provision-windows-toolchain.mjs` (`TOOLS.docker`)
  - `apps/code-broker/scripts/recover-windows-fixture.mjs` (`TOOLS.docker`, `PLUGIN`)
  - `apps/code-broker/scripts/resume-windows-toolchain-build.mjs` (`TOOLS.docker`, `PLUGIN`)
- Alla tre är engångsskript för en avslutad plan. De är bundna till den raderade scratch-katalogen `.superpowers/sdd/2026-10-19-windows-source-materialization` och dess kvitton (`toolchain-setup-attempt.json`, `recovery-diagnosis.json` m.fl.). De felar stängt i dag: verktygskontrollen `lstat` kastar på den saknade AppData-filen innan något Docker-anrop görs.
- `sdf-windows-materialization.test.ts` importerar valideringsfunktionerna (`validateLock`, `verifyDescriptor`, `validateRecipe`, `validateContextPaths`, `authorizeUnstartedBuildResume`) men kör inga Docker-kommandon.

Risk: medel för framtida imagebyggen, ingen för nuvarande körningar. Skripten kan inte av misstag bygga mot en annan Docker, men de kan inte heller användas för nästa imagebygge.

## Rekommendation

Redigera **inte** de historiska engångsskripten på plats. De är bevis för en avslutad, granskad körning, och deras kvittokedja kan inte återskapas. Vid nästa godkända imagebygge eller fixture-återställning:

1. Skapa en ny plan med egen scratch, egen engångsreservation och egna kvitton.
2. Flytta de gemensamma, rena valideringsfunktionerna och verktygspinnarna till en delad modul, t.ex. `apps/code-broker/scripts/windows-toolchain-pins.mjs`, med:
   - `docker: ['C:/Program Files/Docker/Docker/resources/bin/docker.exe','6c699720bb9523dedb9eb5d22a49951ea9210dbdb1314a3554029eee9be76896']`
   - `buildx: ['C:/Program Files/Docker/Docker/resources/cli-plugins/docker-buildx.exe','e97f22ffc483857ec876055c0c1f52290ffd3d881e60a4a08e658bd6d39692bb']`
   - `dotnet` oförändrad.
3. Pinnarna ska vara samma källa som `HostProfile.cs`. Ett test jämför dem, så att värdkvalificering och provisionering aldrig kan peka på olika Docker-installationer.
4. Behåll befintliga skydd: kontroll av symboliska länkar och reparse points längs hela sökvägen, SHA-256 före varje körning, fast `DOCKER_CONFIG` i egen katalog, `--pull=never` där det gäller, engångsreservation och kvitto före första mutation.
5. Kör kvalificering före varje bygge och kräv daemon `097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601`. Backend-identiteten loggas men pinnas inte, eftersom den byts vid varje omstart.
6. RED-test först: ett test som visar att AppData-sökvägen nekas och att Program Files-sökvägen med rätt hash accepteras. Därefter GREEN.

## Godkännanden som behövs innan något körs

- Godkännande av den nya planen, inklusive vilken image som byggs och varför.
- Separat godkännande för varje nätverksåtkomst (pull eller registry) och varje imagebygge.
- Ingen Docker prune, reset eller borttagning av befintliga images eller volymer.
