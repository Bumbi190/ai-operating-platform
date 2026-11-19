
#  Trading-Pling: rörelse och blockerande kollision installerad 19 november

Ägarens sockelfigur matchades exakt till **Pling | Trading / SkeletalMeshActor_6** vid Trading-arbetsstationens fotstöd och entréväxt. Det var en äldre SkeletalMeshActor utan Character/AI-styrning, med QueryOnly och Pawn Overlap. Familje-Plings okända workflowstatus är ett separat kvarstående anslutningsproblem.

En ny **Resident | Trading-Pling / BP_Pling_FreeLife_C_3** använder befintlig fritidsstyrning och startar på gångbar mark bredvid skrivbordet. Den gamla figuren döljs vid spelstart. Fyra egna kopp-/racketobjekt har tillkommit; inga rekvisita stjäls från tidigare boende. Alla 1 727 tidigare aktörers scensignaturer bevarades; scenen har nu 1 732 aktörer. Kompletta navvägar verifierades till korridor, kaffe, pingis och film. Trading är en lokal fritidsfigur utan påstådd verifierad arbetsstatus; han är inte nyregistrerad deltagare i den befintliga tvåspelar-pingiskoordinatorn.

I både provscenen och den riktiga sparade workflowkartan gick figuren naturligt cirka 17,3 meter med AIController. Ett verkligt sweep med spelarens kapsel stoppades av just Trading-Plings CollisionCylinder: kombinerad kapselradie 78 cm, observerat stopp cirka 83 cm från figurens mitt. Båda fysikproven godkända, inga testfel. Den gamla modellen doldes i spelet.

Den redan accepterade installationen och dess ursprungliga kartor/proofset säkerhetskopierades med verifierade hashar. Uppdateringen använder en journalförd transaktion för den befintliga särskilda workflowkartan, med säkerhetskopia för alla fyra ägda installationsfiler. Den oförändrade installationsspärren kräver fortfarande samtliga native-, bindnings-, ack-, paus- och rörelseprov.

Nya oberoende processer: bygg 29904, audit 16092, runtime 24936 och finalisering 49936. Färskt workflowprov godkänt med 192 rörelseobservationer; samtliga elva kontrollpunkter passerade. Separat riktigt spelfönster verifierade native prepared/applied-ack, busy → idle, avslut via hållen process och återställd projektion. Ägar-/TLS-/databasdelarna i dessa tester är syntetiska och räknas inte som verklig ägaranslutning. Befintliga guard-/transaktionsprov: 17/17 godkända.

Installerat run-id: 58c3376ca8504715ad674d8de60596cd.
Kanonisk karta: c10db7b05f1b537fa2d3cdf8673f3a0fcfd80edd274f6e644851700822068068.
Granskningskälla: e4ad30182c77364befb405986ad571536f64df452d754e04340609f312c5cff0.
Separat Trading-prov: ff6de09df5164592ad79ca8209bf3fa17221f785e239d6dc8e8b75419615791e.
Den frysta workflowbundlen bb68099898a945429097abde08c113f21fdde168ef46687cea4a9bdffd2b10a7 och mottagar-Blueprinten är oförändrade.

Installationskontrollen passerade efter finalisering. Den uppdaterade världen öppnades som spelprocess 29296. Ingen syntetisk status lämnades kvar och ingen ny browser-companion startades.

Reproducerbar kod och bevis finns på den återanvända Office-grenen under docs/verification/office/2026-11-19-trading-pling.md samt evidence/2026-11-19-trading-pling. Ingen ny gren, native-workflowspärr, databasändring, betald körning eller produktionsdriftsättning behövdes för denna fysiska rättning.

Säkerhetskopia: Omnira_Trading_Pling_Fix_2026-11-19.zip, 1 680 751 byte, SHA-256 25df1ce6ae57994064ca6c14dd5ead99c7bb8cd033a1099fc48dfe9267db8111. Innehåller före-/efterkartor, bevis och kontrollsummor.

**Kvar:** verklig ägaranslutning från den ursprungliga Brave-kontexten är ännu inte verifierad. Familje-Pling med ”Arbetsstatus okänd” hålls därför fortsatt hemma. Denna punkt löses genom den riktiga anslutningen, aldrig genom påhittad idle-status.
