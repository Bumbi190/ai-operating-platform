---
type: project
status: approved
classification: internal
scope: project
project: omnira-selftest
source_of_truth: repository
canonical_path: infra/openviking/README.md
created: 2026-10-15
updated: 2026-10-15
---

# Felsök tom återläsning i den lokala piloten

Kontrollera att frågan skickas till den separata lokala Atlas-piloten på den stationära datorn. Dess adress är http://127.0.0.1:3015/projects/omnira-selftest. Den adressen når inte installationen från en annan dator. Den ordinarie hostade applikationen kan inte ansluta till pilotens loopback-adress.

Starta ett bevakat testpass med skrivbordsgenvägen Atlas minnestest. Genvägen väntar på tjänsten och värmer upp den valda publiceringen. Kall uppstart kan ta ungefär en minut.

Vid tidsgräns, temperaturstopp eller förlorad övervakning stoppas pilotens modell- och OpenViking-tjänster. Atlas kan då svara utan den här kunskapen. Ett nytt bevakat pass startas med samma genväg.

Testa i en ny konversation i projektet omnira-selftest. Börja också en ny konversation när du byter projekt, eftersom gamla svar kan finnas kvar i chatthistoriken. Ett uteblivet nytt källblock betyder inte att gamla meddelanden har raderats.

Detta är en felsökningsbeskrivning, inte tillstånd att ändra driftgränser eller aktivera produktion. Aktuell kanonisk dokumentation har företräde.
