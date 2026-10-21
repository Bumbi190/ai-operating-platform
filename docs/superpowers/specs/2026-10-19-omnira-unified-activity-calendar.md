# Omnira – gemensam aktivitets- och beslutskalender (förslag v0.1)

Status: arkitekturförslag, ingen runtime-implementation eller produktionsändring.
Utgångspunkt: calendar-time-recurrence-20261019. Behåll privata kalenderposter och återkommande serier separat.

## Syfte
Kalendern är en läsbar veckovy över vad som planeras och faktiskt sker i samtliga Omnira-projekt. Användaren ska kunna öppna varje post och se sammanhang, ansvarig, beslut, resultat, status och källhänvisning. Atlas kan senare återfinna historiska beslut och uppmätta utfall.

## Viktig regel: källa framför kopia
En *kalenderprojektion* är inte samma sak som en utförd händelse. Källsystemen är fortfarande system of record. Social publiceringskö, faktisk leverans, trading exekveringsbekräftelse, workflow-resultat och Atlas beslutsledger har olika semantik och måste inte sammanblandas.
Visa utförandestatus endast från bekräftad källpost; använd utkast/planerat/föreslaget när detta är allt som finns.

## Föreslagen händelsemodell
- immutable sourceKey = (sourceSystem, sourceId, eventType, optionalVersion)
- occurredAt vs scheduledFor, projects[] / owner scope, title, short summary
- status planned | proposed | waiting_review | approved | executing | completed | failed | cancelled | unknown
- actor, kind, severity, humanDecisionRequired, decisionId, correlationId
- detailLink till behörighetskontrollerad originallogg
- sourceSnapshotHash och eventOccurredAt, importedAt, eventVersion
- blandade projektfärger och filtrering; aldrig visa andras privata data
- idempotent ingestion och explicit rättelse/uppföljning, inte tyst omskrivning av utfall

## Initiala källor
1. Social: planerad postning, granskning, publiceringsförsök och verifierat utfall separat. Inga kalenderklick får publicera.
2. Atlas/workflow: planerade jobb, beslut som kräver godkännande, utförandesteg, resultat och incidenter.
3. Trading: separat planerad setup, paper-/backtestsignal och *verifierad* liveorder/fill; inga låtsasaffärer markerade live.
4. Produktlansering: plan, beslutsgrind, release, production READY och efterkontroll som separata statusövergångar.
5. Privata återkommande möten och arbetsblock enligt den befintliga kalenderfunktionen.

## Detaljpanel
När en post öppnas: titel, projekt, källa, schemalagd/faktisk tid, status, ansvarig, konkret uppgift/utförd handling, beslut/motivering, beviskällor, före/efter, utfall och nästa steg. Behörighetskontroll på serversidan; ingen hemlighet/API-nyckel i kalender- eller ZIP-payload.

## Viktiga beslut
Tidsstämplade beslut med decisionId, alternativen, beslutsfattare/Atlas-roll, motivering, kunskapsunderlag, mänskligt godkännande när det krävs, berört projekt, förväntat utfall, observerat utfall och uppföljningsdatum. De ska kunna hittas även om användaren aldrig öppnar kalendern.

## Årsarkiv
Årlig, verifierbar export först *efter* årsskiftet, för föregående kalenderår i Europe/Stockholm. ZIP med:
- manifest.json (schemaVersion, year, generatedAt, source watermarks, counts, checksums)
- events.jsonl / decisions.jsonl / outcomes.jsonl med stabila ID:n och originallänkar, endast behörig åtkomst
- readme.md, ev. CSV för människoläsbar översikt
- checksumma och testad restore-/import-/sökprocedur
- kryptering/åtkomstkontroll och retention enligt beslutade krav, lagring av arkiv i privat lagringsyta
Arkivering är **icke-destruktiv**: historiken ska vara fortsatt sökbar för Atlas via index/databas, inte enbart som förseglad ZIP. Automatisk export och pålitlig verifikation; aldrig automatisk radering utan separat explicit policy och godkännande.

## Produktionsgrind
Implementera först read-only källadapters och detaljpanelen bakom feature flag. Sen historisk beslutsfråga och exportjobb. Varje adapter behöver oberoende säkerhetstester, idempotens, projektisolering, korrekt statussemantik och maskning av sekretess. Inga nya handels- eller publiceringsbehörigheter. Separat PR från kalenderns återkommande-seriegren för att minimera konflikt och risk.

## Kvar att avgöra innan implementation
- Faktiska källtabeller per domän och stabila korrelationsnycklar.
- Behörighet för privat vs projektgemensam kalender.
- Arkivets retention, dataklasser och krypteringsnyckel.
- Vilka detaljer som ska vara klickbara i mobil och hur omfattande loggar sammanfattas.
