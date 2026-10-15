---
type: project
status: approved
classification: internal
scope: project
project: omnira-selftest
source_of_truth: repository
canonical_path: docs/runbooks/atlas-openviking.md
created: 2026-10-15
updated: 2026-10-15
---

# Publicera och återkalla projektkunskap

En ändrad Obsidian-anteckning blir inte automatiskt tillgänglig för Atlas. Operatören förbereder en ny publicering från en ren Git-version av valvet, granskar innehåll och metadata, synkroniserar dokumenten och väntar tills indexeringen är slutförd. Därefter väljer applikationen den nya publiceringen.

Att en uppladdning har accepterats eller lagts i kö betyder inte att sökningen är redo. Beredskapskvittot måste ange ready=true för samma snapshot som applikationen använder.

Om en källa tas bort ur nästa publicering kan dess text inte återläsas därifrån, även om det gamla fjärrindexet finns kvar. En giltig tom publicering återkallar all sådan projektkunskap. Rensning av ett äldre snapshot görs separat och får bara avse det uttryckligen angivna tidigare snapshotet för samma projekt.

Detta beskriver pilotens publiceringsflöde. Anteckningen ger ingen behörighet att publicera eller radera. Aktuell kanonisk dokumentation i repositoryt har företräde.
