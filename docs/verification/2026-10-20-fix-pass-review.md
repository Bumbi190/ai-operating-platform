# Oberoende granskning av rättningsomgången `b3b86f2..7c16110`

Datum: 2026-10-20. Godkänd av André 07:21 som separat granskningssteg utöver planens enda granskning.
Omfattning: `b3b86f2`, `065d5e3`, `7c16110` samt säkerhetsrelevanta ändringar efter `7c16110` till `48034ba` (endast verifieringsrapport och evidens-JSON).
Granskare: ny, endast läsande agent utan tidigare kontext; läste en fryst kopia (diff, fullständiga filer, plan, rapport och evidens), körde ingenting.

## Utfall: APPROVE WITH MINORS

Inga materiella fynd. De tre påstådda rättningarna finns i koden: grace-kill vid varje stopp med hård gräns, omkontroll av miljön i klass V och commitoberoende nativebyggen. Inga hemligheter eller token i dokumentationen. Evidensen stämmer med koden och tabellerna (binärhashar, utfall A–D, 374/374 i 18 filer, 13 commits). Två formuleringar i rapporten var starkare än underlaget; de är rättade (fynd 4 och 5).

## Fynd och åtgärd

| # | Fynd | Risk | Åtgärd |
| --- | --- | --- | --- |
| 1 | Ett checkpointsvar som kommer efter att hjälparen avslutats kan arma en ny 35 s-timer och ändra stoppskälet efter att bryggan beslutat. | Låg (kill på avslutad process är en no-op) | `finished`-flagga i bryggan; tas med i guard-planen (steg 0) med RED-test |
| 2 | Ett stopp som startaren skickar vid protokollbrott sätter inte `stopReason`; ett senare guardavbrott ger `lease_lost` i stället för `control_lost`. | Låg | `stopped:()=>{stopReason??='control_lost';armGrace()}` med test; steg 0 |
| 3 | Klass V jämför imagen mot en konstant i beviset, inte mot nuvarande miljö, och kontrollerar inte image för C/D. Backend-identiteten är medvetet undantagen. | Låg | Låt frånvaroobservationen returnera aktuell image och jämför; för in undantaget i kvarstående fynd |
| 4 | Daemon-identiteten överlevde en full ominstallation av Docker Desktop. Klass V upptäcker alltså inte en utbytt installation med samma motor-ID och data. | Låg | Rapporttexten rättad; överväg att binda HostProfile-hasharna i bevisen |
| 5 | "B och D gröna på den rättade koden" är bara ett regressionsbevis; de nya vägarna (grace-kill efter startarens stopp, 185 s-gränsen) har bara bevis med fakes. | Information | Rapporttexten rättad |
| 6 | Bytena är oberoende av commit men inte av sökväg (PDB-sökvägar); en annan klon ger andra hashar och därmed inaktuella bevis (felar stängt). Kontrollens steg 1 är inkrementellt. | Låg | `ContinuousIntegrationBuild`/`PathMap` i en egen granskad ändring; `--no-incremental` i kontrollens steg 1 |
| 7 | De två csproj-filerna släpps in i allow-listan på namn; innehållet är inte pinnat, och MSBuild kan köra byggsteg. | Låg–medel | Pinna exakt csproj-innehåll i boundary-testet |
| 8 | Yttre gräns 185 s + 35 s = 220 s från start, och inget begränsar väntan på `close` efter kill. `workspace-helper.ts` ingår inte i bevisbindningarna. | Låg–medel | Begränsad väntan efter kill med `unknown`-utfall; bind `workspace-helper.ts`; steg 0 |

Granskaren kunde inte verifiera: vad `daemonIdentityHash` och `toolchainProfileHash` beräknas från (C#-källan ingick inte), faktiska binärbytes, nativesidans 185 s-gräns, Job Object-beteendet efter kill och att körningarna faktiskt skedde (evidensloggen togs som given).

## Notion

Ingen Notion-integration är ansluten i sessionen, och den inbyggda webbläsaren är inte inloggad på Notion. Avsnittet "Arbetsspår – Atlas kodarbete och oberoende granskning" har därför inte uppdaterats av agenten. Texten att klistra in finns i slutrapporten till André. Detta blockerar inget annat arbete.
