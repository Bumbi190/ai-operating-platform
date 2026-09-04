# Omnira Trading System – Contract Selection Decision Recording & Replay

**Nivå:** Trading Core — inspelnings- och replaysemantik
**Version:** Canonical v1.0
**Datum:** 2026-09-04
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST semantik för C3B.2 v1. Prospektiv verkan.
**Föregångare:** Ingen. Detta är den första inspelningstexten.
**Moderauktoritet:** Market Data & Contract Lifecycle Canonical v1.0 §10, §26
**Sidoauktoritet:** Contract Selection Decision Materialisation Canonical v1.0 (Beslut K)
**Sidoauktoritet:** Contract Selection Reason Code Canonical v1.0 (Beslut J)
**Ersätter:** Ingenting. Ingen befintlig regel upphävs, inget fält byter innebörd.

> **Detta dokument är provider-neutralt.** Det innehåller inga providernamn, inga
> symbolkonventioner och ingen front month-logik. Det föreskriver heller ingen
> databas, inget schema och ingen lagringsteknik.

---

## §1. Varför detta dokument finns

Canonical v1.0 §10 kräver att ett inspelat beslut **läses, aldrig räknas om**.
Beslut K gjorde beslutet till ett oföränderligt runtime-värde. Men §10 säger
aldrig **hur en anropare hittar** det inspelade beslutet, och `decisionId` är
enligt Beslut K §10 anroparmyntad och ogenomskinlig — den kan inte rekonstrueras
ur en replaykontext.

Följden är konkret: ett lager som bara kan slå upp på `decisionId` uppfyller inte
§10, eftersom anroparen aldrig får tag i identiteten. Utan en kanonisk
uppslagning skulle C3B.2 tvingas uppfinna den i TypeScript — samma fel som
Beslut K fanns till för att förhindra.

Detta dokument stänger exakt de frågor som blockerar inspelningsgränsen, och
ingenting annat.

---

## §2. L1 — Replayens sanningskälla

Det **lagrade `ContractSelectionDecision` självt** är replayens kanoniska
sanningskälla.

Canonical v1.0 §10 gäller oförändrat:

```
inspelat beslut finns
→ LÄS DET BESLUTET
→ RÄKNA ALDRIG OM
```

Sanningskällan är **inte**:

```
TradingEvent.payload
ReplayEvent
providerstatus
dagens ContractCalendar
en policyuppslagning vid körning
```

**Inget hölje blir mer auktoritativt än beslutet självt.** Ett beslut som läses
tillbaka genom ett kuvert är ett beslut vars auktoritet flyttat till kuvertet;
§10 säger *läs det*, inte *läs något som innehåller det*.

---

## §3. L2 — Journalfrågan besvarad nekande

Att spela in ett `ContractSelectionDecision` tillför **noll**:

```
EVENT_TYPES
EVENT_ENTITY_TYPES
```

Ingen `CONTRACT_SELECTION_RECORDED`, ingen `CONTRACT_SELECTED`, ingen
`CONTRACT_SELECTION` och ingen motsvarighet införs i Core-vokabulären.
**`EVENT_TYPES` förblir oförändrad.**

**Skälet är semantiskt, inte praktiskt.** `TradingEvent` kräver fakta som ett
`ContractSelectionDecision` kanoniskt inte äger, bland dem icke-nullbara:

```
environment
correlationId
```

samt `eventId`, `entityType`, `entityId`, en `occurredAt`-mappning, `recordedAt`,
`causationId`, `sourceComponent`, `severity` och `payloadVersion`.

Två av dem är inte bara frånvarande utan **motsägelsefulla**:

- **`environment`.** Canonical v1.0 §26 gör upplösning till en ren funktion av
  (`calendarVersion`, tidpunkt) — avsiktligt miljöoberoende, så att en omstart
  räknar fram exakt samma svar. Ett journalkuvert skulle tvinga varje beslut att
  påstå en miljö det inte har, och samma kanoniska faktum inspelat i två miljöer
  skulle bli två skilda rader.
- **`correlationId`.** Det trädar **en** livscykel. Ett kontraktsval föregår och
  överlever varje enskild affärsmöjlighet — samma val är auktoritativt för varje
  setup i rollintervallet. Att tvinga fram en korrelation gör posten smalare än
  fakta.

Inget av detta krävs för att uppfylla §10. Därför är `TradingEvent` **inte**
lagringskuvertet för C3B.2.

En framtida kanonisk text **får** definiera en informationshändelse som refererar
ett `decisionId`. En sådan händelse vore

```
ENDAST REVISIONSPROJEKTION
```

aldrig replayens sanningskälla. Detta dokument **namnger den inte**, definierar
ingen `payloadVersion`, inget `eventId`-ägarskap och ingen korrelationssemantik.
De frågorna tillhör ett framtida journallager om en projektion någonsin behövs.

Detta stänger `GATE-08C-3B DECISION-JOURNAL VOCABULARY GAP` **nekande**.

---

## §4. L3 — Inspelningskontextens omfattning

En `ContractSelectionDecisionStore`-instans representerar **en** inspelnings- och
replaykontext:

```
en historisk körning / replaykontext
→ en beslutslagerkontext
```

**Inspelningskontexten är extern till beslutet.** Följande läggs **inte** till
`ContractSelectionDecision`:

```
runId        scenarioId        correlationId        environment
```

Beslut K:s tiofältsform är oförändrad.

C3B.2 v1 definierar **inget globalt beslutsregister över körningar**. Olika
inspelningskontexter får legitimt innehålla olika beslut för samma
`root` + marknadsinstans — till exempel därför att körningarna skapades under
olika explicit pinnade `ContractCalendar`-versioner, vilket §10 uttryckligen
tillåter.

Därför är **global unikhet på `root` + instans förbjuden.**

---

## §5. Kör-identitet uppfinns inte

`RunId` finns som reserverad brandad typ men har inget etablerat ägarskap i
Trading. Detta dokument ger den **ingen** ny innebörd.

Inspelningskontexten representeras av **lagrets instans- och kontextgräns**, inte
av ett `runId`-fält på beslutet och inte av ett uppfunnet lagringshölje.

Framtida beständighet över körningar kan behöva en extern kör-identitet. Det
ligger utanför C3B.2 v1.

`GATE-08C-3B RUN-ASSOCIATION GAP` är därmed **STÄNGD FÖR C3B.2 v1** genom
kontextlokalt lagerscope. Global beständig körassociation förblir **UPPSKJUTEN**.

---

## §6. L4 — Den kanoniska uppslagningen

Replayuppslagningen tar exakt:

```
{
  root: MarketInstrument
  at:   Timestamp
}
```

och ingenting mer.

Anroparen **måste inte** lämna:

```
decisionId        effectiveFrom        effectiveTo
calendarVersion   policyVersion        providerdata
```

för att avgöra om ett inspelat beslut redan finns.

`decisionId` förblir **postens oföränderliga identitet**, men är **inte**
replayens upptäcktsnyckel. Anroparen ska aldrig behöva gissa eller rekonstruera
den.

---

## §7. Varför den avvisade nyckeln avvisades

En tidigare kandidat var:

```
(root, effectiveFrom, calendarVersion, policyVersion)
```

Den **avvisas**, av två skilda skäl:

- **`effectiveFrom` är cirkulär.** Att känna beslutets `effectiveFrom` kräver
  normalt att man löser upp kalendern först — alltså att man räknar om precis det
  §10 förbjuder. Nyckeln skulle lyda "behöver beslutet → lär dig `effectiveFrom`
  → hitta beslutet".
- **`calendarVersion` och `policyVersion` är fakta posten *berättar*.** De är
  historisk metadata som det inspelade beslutet bevarar och avslöjar, inte
  förkunskaper anroparen måste ha innan posten kan läsas. Att kräva dem vore att
  kräva att man rekonstruerar tillräckligt mycket av det gamla beslutet för att
  upptäcka dess nyckel.

Den kanoniska uppslagningen är i stället **kontextlokal + `root` + `at` +
intervallinneslutning**.

---

## §8. Intervallmatchning

Inom **en** inspelningskontext matchar `find(root, at)` ett beslut när:

```
decision.root === root
                                            (exakt likhet)
decision.effectiveFrom  <=  at
at  <  decision.effectiveTo
                                            (halvöppet [from, to))
```

för **ändlig** `effectiveTo`.

Jämförelsen sker med Tradings befintliga instanssemantik för `Timestamp` — samma
`toEpochMs`-baserade ordning som resten av trädet — **aldrig** genom lexikografisk
strängjämförelse. `Timestamp` tillåter valfria millisekunder, så `…00:00:00Z` och
`…00:00:00.500Z` ordnas fel som text.

Frågeinstansen används **enbart** för att pröva intervallinneslutning. Den
`Timestamp`-stavning som posten lagrar **normaliseras aldrig och skrivs aldrig
om**.

---

## §9. Inspelat först betyder ingen upplösning

En uppslagning efter ett redan inspelat beslut utför **noll**:

```
resolveContractAt        ContractCalendar-uppslagning
kalenderpinuppslagning   provideranrop
policyuppslagning        kontraktshärledning
```

Ordningen är kanoniskt:

```
inspelningskontext
→ find(root, at)

HITTAT:
→ RETURNERA det inspelade oföränderliga beslutet

ENDAST OM INTE HITTAT:
→ ett senare lager tillämpar §10:s krav på pinnad historisk kalenderversion
→ löser upp
→ materialiserar
→ spelar in
```

**C3B.2 utför inte återfallet självt.** Det tillhör orkestreringen.

---

## §10. `calendarVersion` och `policyVersion` är utdatafakta

Ett funnet inspelat beslut **berättar** för replay vilken `calendarVersion` och
vilken `policyVersion` som användes.

De är historisk metadata **inuti posten**. De får **inte** användas som
förutsättningar för att lokalisera posten i C3B.2 v1.

Detta är avsiktligt. Det säkerställer

```
inspelat beslut först
```

i stället för

```
rekonstruera tillräckligt av det gamla beslutet för att upptäcka dess nyckel.
```

---

## §11. L5 — Unikhetsomfång

Inom **en** inspelningskontext gäller: för ett givet `root` + `at` finns **högst
ett** matchande `ContractSelectionDecision`.

Ekvivalent intervallinvariant:

> Två olika inspelade beslut för samma `root` får **inte** ha överlappande
> effektiva intervall.

- Icke-överlappande intervall för samma root är giltiga.
- Olika roots är oberoende.
- **Olika inspelningskontexter är oberoende.**

Därför får två historiska körningar legitimt innehålla olika beslut för samma
`root` + `at`.

Detta stänger `GATE-08C-3B DECISION-UNIQUENESS SCOPE GAP` för C3B.2.

---

## §12. Per root

Canonical v1.0 §22 gäller oförändrat. NQ, MNQ och ES behåller **var sitt** inspelat
val.

Inget `ContractSelectionDecision` omfattar flera roots. Ingen uppslagning får
returnera ett NQ-beslut för MNQ eller ES enbart därför att cyklerna sammanfaller.
**Rootmatchning är exakt.**

---

## §13. L6 — Append-only inspelning

Lagret spelar in det kanoniska `ContractSelectionDecision` **direkt**.

Inspelning är **append-only**. Aldrig:

```
överskrivning     mutation     omskrivning
radering          "rättelse på plats"
```

En historisk kalenderrättelse skapar beslut i **nya** inspelningskontexter; den
muterar aldrig ett redan inspelat beslut. Detta är Canonical v1.0 §16:s regel
oförändrad: en sen korrigering får aldrig retroaktivt ändra ett inspelat beslut.

---

## §14. Idempotent ominspelning

Samma `decisionId` **och** fält-för-fält identiskt `ContractSelectionDecision`:

```
→ IDEMPOTENT FRAMGÅNG
```

Ingen andra lagrad kopia skapas. Ingen mutation sker.

Detta följer Tradings befintliga dubblettkonvention: identisk dubblett
de-dupliceras, oenig dubblett vägrar.

Likhet avgörs med **explicit typad fältjämförelse**, i linje med `sameCandle`.
JSON-text är **inte** den kanoniska identitetsregeln, och **Beslut L inför ingen
hash**.

---

## §15. Samma `decisionId`, annat innehåll

Samma `decisionId` men **något** kanoniskt fält som skiljer:

```
→ VÄGRA
```

Ingen överskrivning. Ingen "last write wins". Ingen tyst ersättning. **Inget
`decisionId` får identifiera två skilda poster.**

Föredragen exakt lokal kod:

```
DECISION_ID_DISAGREEMENT
```

Vägran tillhör **lagrets lokala kontrakt**. Den är inte en `ReasonCode`, inte en
`EventType`, inte en riskavslag, inte ett prop-avslag och inte en incident.

---

## §16. Överlappande intervall för samma root

Om en ny inspelning skulle skapa två **olika** beslut för samma root vars ändliga
effektiva intervall överlappar inom samma inspelningskontext:

```
→ VÄGRA
```

Skälet är att `find(root, at)` annars blir tvetydig och §10 inte längre har **ett**
inspelat svar att läsa.

Föredragen exakt lokal kod:

```
OVERLAPPING_SELECTION_INTERVAL
```

Ingen kanonisk `ReasonCode`. Ingen händelse emitteras.

---

## §17. `effectiveTo === null` — fail-closed i v1

Beslutets historiska form tillåter `effectiveTo: Timestamp | null`, men den
allmänna innebörden av `null` förblir **RESERVERAD** (Beslut K §13). C3B.1
emitterar endast ändlig `effectiveTo`.

Därför får C3B.2 v1 **inte** tolka `null` som:

```
oändlighet        öppet slut        till nästa beslut
till idag         till nästa kalenderpost
```

**C3B.2 v1 stöder endast ändliga intervall.** Ett beslut med
`effectiveTo === null` vägras av v1-lagret.

Föredragen exakt lokal kod:

```
OPEN_ENDED_DECISION_UNSUPPORTED
```

Detta definierar **inte** den framtida innebörden av `null`. Det vägrar att gissa
den.

---

## §18. Ogiltigt ändligt intervall

Ett ändligt beslut vars intervall inte uppfyller

```
effectiveFrom < effectiveTo
```

failar closed vid inspelningsgränsen. Inget tomt och inget bakvänt inspelat
intervall.

Föredragen exakt lokal kod:

```
INVALID_SELECTION_INTERVAL
```

Detta är defensiv lagringsvalidering. Det ändrar **inte** C3B.1:s
materialiseringssemantik.

---

## §19. Uppslagningens resultat

```
exakt en träff      → det inspelade ContractSelectionDecision
noll träffar        → INTE FUNNEN
mer än en träff     → brott mot lagrets invariant, fail closed
```

Implementationen ska förhindra det tredje tillståndet **vid inspelning**.

Uppslagningen får **inte** returnera en godtycklig första träff och **inte** sortera
överlappande träffar och välja en. Att välja tyst vore att uppfinna en
prioritetsordning som ingen kanonisk text äger.

Ett läst beslut returneras **oföränderligt**.

---

## §20. Uppslagning på `decisionId`

C3B.2 **får** dessutom erbjuda `getByDecisionId(decisionId)` för direkt
identitetshämtning och test.

Men `getByDecisionId` är **inte tillräcklig** för att uppfylla Canonical v1.0 §10,
eftersom anroparen inte kan rekonstruera identiteten. Den kanoniska
replayuppslagningen förblir `find(root, at)` inom en inspelningskontext, och
`decisionId`-uppslagning får aldrig ersätta den.

---

## §21. `recordedAt` — uppskjuten

Beslut L lägger **inte** till `recordedAt` till `ContractSelectionDecision`, till
uppslagningsidentiteten eller till den direkt lagrade posten. C3B.2 v1 behöver
inget lagringstidsfält för att uppfylla replaysanning.

En framtida beständig adapter **får** behöva operativ persistensmetadata. Om sådan
tillkommer:

- ligger den **utanför** `ContractSelectionDecision`
- får den **inte** påverka validentitet
- får den **inte** påverka replayuppslagning
- får den **inte** ändra beslutslikhet
- får den **inte** ge auktoritet

`GATE-08C-3B DECISION-RECORDED-AT GAP` förblir **UPPSKJUTEN / ICKE-BLOCKERANDE**.
Den stängs inte genom att uppfinna en tidsstämpel.

---

## §22. Ordning — uppskjuten

C3B.2 v1 behöver `record` och `find(root, at)`, och valfritt `getByDecisionId`.

Den behöver **inte** `listAll`, paginering, global iteration eller kronologisk
uppräkning. Därför krävs ingen kanon om insättningsordning eller total ordning.

`GATE-08C-3B DECISION-STORE ORDERING GAP` förblir **UPPSKJUTEN /
ICKE-BLOCKERANDE**.

---

## §23. Lagringsbackend

Beslut L föreskriver **ingen** Supabase, ingen Postgres, inget filsystem, ingen
journaltabell och inget schema.

Den första C3B.2-implementationen bör vara ett **provider-neutralt lagergränssnitt
plus en deterministisk in-memory-implementation**, så att semantiken bevisas innan
infrastruktur byggs. En beständig adapter är senare arbete bakom samma gräns.

Detta är implementationsvägledning, inte ny identitetskanon.

---

## §24. Inget hölje i C3B.2 v1

Inget kanoniskt `RecordedContractSelectionDecisionEnvelope` med uppfunna fält
införs.

Den direkt lagrade kanoniska posten **är** `ContractSelectionDecision`.
**Lagerinstansen** äger inspelningskontextens omfattning. Posten själv förblir
exakt Beslut K:s tio fält.

---

## §25. Ingen händelseprojektion nu

Beslut L tillåter en framtida informationshändelse **endast prospektivt**. Den
namnges inte här.

Ingen `EVENT_TYPES`-medlem, ingen `EVENT_ENTITY_TYPES`-medlem, ingen
`payloadVersion`, inget `eventId`-ägarskap och ingen korrelationssemantik
definieras nu.

---

## §26. Vad detta dokument stänger — och inte

**Stänger:**

```
GATE-08C-3B DECISION-JOURNAL VOCABULARY GAP   — STÄNGD NEKANDE
GATE-08C-3B DECISION-LOOKUP KEY GAP           — STÄNGD för C3B.2
GATE-08C-3B DECISION-UNIQUENESS SCOPE GAP     — STÄNGD för C3B.2
GATE-08C-3B RUN-ASSOCIATION GAP               — STÄNGD för C3B.2 v1
```

**Stänger inte:**

- `GATE-08C-3B DECISION-RECORDED-AT GAP` — **UPPSKJUTEN / ICKE-BLOCKERANDE.**
- `GATE-08C-3B DECISION-STORE ORDERING GAP` — **UPPSKJUTEN / ICKE-BLOCKERANDE.**
- `GATE-08C-3B NONEMPTY-EVIDENCE VOCABULARY GAP` — **ÖPPEN / UPPSKJUTEN.**
- `GATE-08C-3A SOURCE-RESULT-SHAPE GAP` — **ÖPPEN.** Detta dokument säger
  ingenting om paginering, uttömning, prenumerationslivscykel eller backpressure.
  En beslutsuppslagning är nycklad och enkelpost; den har ingen sida och ingen
  ström.
- **`EFFECTIVE-TO NULL GENERAL SEMANTICS`** — **RESERVERAD.** §17 vägrar `null` i
  v1 utan att definiera vad `null` betyder.
- `GATE-08C-2A DST-BOUNDARY GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B UNEXPECTED-MINUTE GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B VOLUME POLICY` — **HÄRLEDD.**
- **Orkestrering.** Att leta inspelat beslut först, annars kräva pinnad
  kalenderversion, lösa upp, materialisera och spela in tillhör C3B.3.

**C3B.2-runtime är INTE implementerad.** Detta dokument beskriver semantiken;
ingen TypeScript-fil ändras av det. Inget beslutslager, ingen uppslagning och
ingen inspelning existerar i kod.

```
GATE-08 — FORTSATT DELVIS STÄNGD
```

Detta dokument utvidgar inte GATE-08:s stängning. Det låser inspelnings- och
replaysemantik så att ett kommande lager kan transkriberas mekaniskt i stället för
att uppfinna kanon i kod.
