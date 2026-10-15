# Proposed Obsidian note: local omnira-selftest memory pilot

This is a reviewable candidate on the integration branch, not an approved vault note or a publication. The actual Obsidian vault remains unchanged. Its policy §4 reserves status promotion for the owner; §6.1 requires owner/operator classification, and §6.7 reserves status, classification and scope decisions for explicit owner authorization.

## Proposed destination and metadata

Proposed destination: `60 Memory/omnira-selftest-local-memory-pilot.md`.

After owner approval, the intended metadata is:

```yaml
type: project
status: approved
classification: internal
scope: project
project: omnira-selftest
source_of_truth: repository
canonical_path: docs/runbooks/atlas-openviking.md
created: 2026-10-15
updated: 2026-10-15
```

These are proposed values, not assigned metadata. Confirm them with the owner before creating/promoting the actual note on a separate vault branch. Do not relabel existing platform notes. Prepare from the resulting clean vault commit and review the exact publication before local synchronization.

## Candidate note body

# Lokal minnespilot för omnira-selftest

Den här anteckningen beskriver den lokala testinstallationen för projektet `omnira-selftest`. Den ger ingen behörighet att utföra åtgärder. Aktuell kanonisk dokumentation i repositoryt gäller före denna sammanfattning.

Atlas öppnas på den stationära datorn via skrivbordsgenvägen **Atlas minnestest**, eller på `http://127.0.0.1:3015/projects/omnira-selftest` när testpasset är startat. Adressen är lokal för datorn.

Genvägen startar ett bevakat testpass på högst 30 minuter, väntar på tjänsten och värmer upp minnessökningen. Vakten stoppar pilotens modell- och OpenViking-tjänster vid 80 °C GPU-kärntemperatur, 94 procent VRAM-användning, förlorad övervakning eller testpassets slut. Ett nytt pass startas med samma genväg.

Installationen använder OpenViking 0.5.0 och Ollama 0.40.4, med `qwen3-embedding:0.6b` för sökning och `qwen3:4b-instruct` för bearbetning. OpenVikings modellkörningar sker lokalt. Atlas vanliga chatsvar använder applikationens befintliga modellleverantör.

Atlas hämtar godkänd projektkunskap från en versionsbunden publicering. OpenViking väljer dokument; texten i svaret kommer från publiceringens verifierade original. En ändrad Obsidian-fil blir tillgänglig först efter att en ny publicering har förberetts, granskats, synkroniserats och valts av applikationen. Borttagna källor utesluts genom den nya publiceringen även om gamla sökdata ännu finns kvar.

Testa i en ny Atlas-konversation. Börja en ny konversation även när du byter projekt, eftersom tidigare svar kan finnas kvar i den vanliga chatthistoriken.

Den 15 oktober 2026 bekräftade ägaren att Atlas hittade den syntetiska testanteckningen direkt i det lokala gränssnittet. Detta är ett lokalt funktionstest; det visar inte generell förbättring jämfört med tidigare sökning.

Pilotens tillfälliga kontrollkod och testlåda hör till syntetiskt testmaterial och är inte projektfakta. Ingen privat Atlas Memory M4-data ingår. Produktionsaktivering och värdering av träffsäkerhet på verkligt godkänt projektmaterial återstår.

Kanoniska källor: `docs/runbooks/atlas-openviking.md` och `infra/openviking/README.md` på granskningsbranchen `codex/atlas-openviking-integration-20261015`, med startpunkt `0ee3611d71f2cc4eb3adc296cb517ebf603778bb`. Branchmaterialet är ett förslag och ersätter inte nyare kanoniskt innehåll på main.
