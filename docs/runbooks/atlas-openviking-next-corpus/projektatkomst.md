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

# Projektåtkomst och avstängd återläsning

Att ett pilotprojekt är konfigurerat ger ingen användare åtkomst. Servern måste kontrollera den aktuella användarens tillåtna projekt innan minne eller kunskap hämtas. Om ett annat projekt är aktivt undertrycks pilotens återläsning.

OpenViking-läget off bidrar inte med någon kunskap. Läget shadow får söka men injicerar ingen kunskapstext i chatten. Läget on får injicera text från den valda godkända publiceringen inom den kontrollerade projektåtkomsten.

Kunskapssökningen har en tidsgräns på 1,2 sekunder. Nätverksfel, trasiga svar eller saknad konfiguration ger inget extra kunskapsunderlag och ska inte göra att chatten misslyckas. M4-bidraget har en separat väntetidsbudget på 750 millisekunder.

Driftlägena och den här anteckningen är inte beslut om produktionsaktivering. Produktion för piloten är fortfarande avstängd. Aktuella kanoniska repositorykällor har företräde.
