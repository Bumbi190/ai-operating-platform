# Förslag till begränsad driftpilot — inte aktiverad

Utvecklingsgrenen kopplar endast Atlas texthjälpuppgifter till den stationära. Den är inte mergad/driftsatt. Befintliga röst-, studio-, kod- och andra Omnira-arbeten fortsätter separat. Granskning, full verifiering och begränsningar finns i `2026-10-17-atlas-integration-verification.md`.

## Konkret första pilot

| Del | Föreslaget värde |
|---|---|
| Webbursprung | https://app.omniraos.se (HEAD200 verifierat; funktion/schema ännu inte driftsatt) |
| Projekt | befintligt **AUDIT 0b — Omnira Selftest**, `4a1d83c9-09dc-4f3b-902e-67284588352b`, slug omnira-selftest; normal ägarinloggning måste först verifiera rätt ägare |
| Lokal enhet | `b846d8e8-c1c0-4838-9ddf-3604c4b505eb` — endast planerad, inte registrerad |
| Nyckel-ID | `68f7fbc5-363c-487b-96cb-3f6080404ee9` — ingen nyckel skapad/enrollerad |
| Modell/uppgift | Qwen3.5 9B, endast klassificering; exakt katalogbevis d1dc7823…b8adb9 |
| Underlag | syntetisk text “Jag behöver hjälp att återställa mitt lösenord.”, etiketter support/annat; exakt inputSHA a6f833ad996f48f0ac1cf3a09c19b58a5ace540152486097e66e49f1f108c339 |
| Granskning | explicit mänsklig ägargranskning; förslag utan affärsåtgärder |
| Betalda anrop | inga. Molnprofilen är okvalificerad och ingen cloud-budgetauktorisering ingår. Administrativa tak USD0.25/jobb och5/projekt/dygn är inte spend-samtycke |
| Pilotlängd | högst24h från faktisk ägaradmission, med kortare payload-/metadataretention om projektet kräver det |
| Maskin | nuvarande RTX3060/12GB VRAM och16GB RAM; inga inköp eller systeminställningar |

## Vad som återstår före start

1. Kontrollera aktuellt main/övriga parallella förändringar och granska båda nya migrationerna mot verklig schema-/ledger-diff och säkerhetsadvisors. Ingen historisk full replay är bevisad av minimal testfixture. Vanliga migrationsgrindar måste passera; inget undantag eller överhopp.
2. Välj och godkänn en exakt release/deployment som innehåller denna isolerade ändring. Produktion är hittills orörd. Verifiera verklig appauth/ägarskap i Selftest innan några liveposter skapas.
3. Skapa current-user icke exporterbar CNG P256-identitet med ovanstående planerade ID, registrera pending på normalt ägar-API, kontrollera fingerprint/version och genomför proof-of-possession+ägarbeslut. Exakt lokalt artefaktavtryck måste fortfarande matcha kvalificeringen. Ingen nyckel kopieras från någon annan miljö.
4. Medge bara ovanstående syntetiska sourcehash och klassificeringsbevis, reviewMode human, rätt projekt och högst24h. Ingen generell godkänd textkanal eller betald fallback aktiveras av detta.
5. Verifiera worker/status/ägargranskning/expiry på vald deployment innan eventuell autostartinstallation. Preview är redan skapad utan task. Installera först vid uttrycklig driftaktivering och planera sedan verkligt inloggnings-/omstartsprov utan att avbryta andra jobb.

## Exakt förhandsvisad autostart

Konfigurationsfilen är förberedd utan hemligheter på:
`C:\Users\Andre\Projects\Omnira\.worktrees\atlas-local-text-integration-20261017\workers\local-text\.local-state\b846d8e8-c1c0-4838-9ddf-3604c4b505eb\config.json`.

Task: `\Omnira\Omnira-Atlas-LocalText-b846d8e8-c1c0-4838-9ddf-3604c4b505eb`. Kommando `C:\Program Files\nodejs\node.exe`, fast supervisor i samma isolerade worktree med `--config` till filen ovan. Nuvarande inloggade Andre-användare, InteractiveToken, LeastPrivilege, AtLogOn, IgnoreNew. Ingen task finns efter Preview. Efter omstart krävs inloggning; det är inte en tjänst före inloggning. Okänt arbete eller gammal stopmarkör pausar ny inferens; råinnehållets expiry-underhåll fortsätter när processen kan köras.

## Återställning

Återkalla först exakt ovanstående enhet på Omniras normala ägar-API med aktuellt projekt/versionsnummer. Det stoppar ej startade jobb och behåller okända utfall. Kör sedan `remove-startup.ps1 -Preview` med exakt samma config och kontrollera ägarskap; `-Apply` får bara inaktivera/stoppa/avregistrera den egna förhandsvisade tasken. Windows Job Object avslutar endast dess egna processer. Varken en saknad PID eller lokal kernel-empty räcker för att släppa serverns okända jobb/skuld; dessa kräver separat verifierad avstämning. Inga generella process-, container- eller filrensningar.

Daglig generell modellväxling är alltså ännu inte aktiverad. En senare betald oberoende gransknings-/fallbackroll behöver faktisk modell-, tokenram-, pris-, kostnads- och projektbudgetkvalificering genom befintlig servergräns innan OpenAI kan användas. Codex-kodjobb ingår inte i denna texthelper.
