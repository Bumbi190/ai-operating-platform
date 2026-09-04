# Omnira Trading System – Recorded-First Contract Selection Orchestration

**Nivå:** Trading Core — orkestreringssemantik
**Version:** Canonical v1.0
**Datum:** 2026-09-04
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST semantik för C3B.3. Prospektiv verkan.
**Föregångare:** Ingen. Detta är den första orkestreringstexten.
**Moderauktoritet:** Market Data & Contract Lifecycle Canonical v1.0 §10, §24, §26
**Sidoauktoritet:** Contract Selection Decision Materialisation Canonical v1.0 (Beslut K)
**Sidoauktoritet:** Contract Selection Decision Recording & Replay Canonical v1.0 (Beslut L)
**Sidoauktoritet:** Contract Selection Reason Code Canonical v1.0 (Beslut J)
**Ersätter:** Ingenting. Ingen befintlig regel upphävs, inget fält byter innebörd.

> **Detta dokument är provider-neutralt.** Det innehåller inga providernamn, ingen
> front month-logik, ingen databas, inget schema och ingen lagringsteknik.

---

## §1. Varför detta dokument finns

Beslut K §10 sköt uttryckligen upp frågan om vem som myntar `decisionId`: *"Vem som
till slut myntar identiteten i orkestreringslagret avgörs inte här."* Beslut L §9
sköt uttryckligen upp återfallet: *"C3B.2 utför inte återfallet självt. Det tillhör
orkestreringen."*

Båda uppskjutningarna landar i samma lager. En stängningsrevision inför C3B.3 fann
att **tre av orkestrerarens indata saknar kanonisk ägare** — den pinnade kalendern,
`decisionId` och `decidedAt` — att returvärdet efter inspelning är odefinierat, och
att ett fönster ingen tidigare text beskriver är öppet: vad som gäller om processen
dör **mellan** materialisering och inspelning.

Detta dokument stänger exakt de frågorna. Det gör ingenting annat.

---

## §2. L1 — Endast historik och replay

C3B.3 äger **historisk/replay recorded-first-orkestrering och ingenting annat**.

Det definierar **inte** live-kontraktsval. Canonical v1.0 §24 gäller oförändrat:
historik och live är **skilda kontrakt**, och ett symmetriskt gemensamt gränssnitt är
förbjudet. §10:s krav på pinnad kalenderversion är formulerat kring backtestens
reproducerbarhet och utvidgas **inte** till live-handel av denna text.

```
LIVE CONTRACT SELECTION ORCHESTRATION — SEPARAT FRAMTIDA GRÄNS
```

---

## §3. Den recorded-first-ordningen

Varje anrop börjar med uppslagningen:

```
store.find(root, at)

HITTAT (FOUND)
→ returnera det inspelade beslutet
→ gör ingenting annat

INVARIANT_VIOLATION
→ FAIL CLOSED
→ gör ingenting annat

INTE HITTAT (NOT_FOUND)
→ återfallshantering får börja
```

Först **efter** NOT_FOUND får C3B.3 befatta sig med den pinnade `ContractCalendar`,
`decisionId` eller `decidedAt`.

Före uppslagningens resultat är känt utförs **noll**:

```
upplösning      kalenderläsning     identitetsskapande
klockläsning    policyuppslagning   provideranrop
```

---

## §4. Återfallet är valfritt indata

En anropare ska **inte** behöva konstruera återfallsdata enbart för att göra en
recorded-first-uppslagning.

Den kanoniska indataformen är:

```
{
  store
  root
  at
  fallback?: HistoricalContractSelectionFallback
}

HistoricalContractSelectionFallback = {
  calendar:   ContractCalendar
  decisionId: ContractSelectionDecisionId
  decidedAt:  Timestamp
}
```

Återfallet är ett **inert värdeobjekt**. Det är **inte** en callback, en thunk, en
factory, en supplier, en asynkron leverantör, en klocka eller en ID-generator.

---

## §5. HITTAT ignorerar återfallet

Returnerar `store.find(root, at)` **FOUND** får ett medskickat återfall **inte**
påverka svaret.

C3B.3 ska då **inte**:

```
inspektera fallback.calendar.calendarVersion
jämföra policyVersion
jämföra decisionId
jämföra decidedAt
lösa upp något
```

Det exakta lagrade beslutet returneras. **Inspelad historik rangordnas över dagens
återfallsdata** — att jämföra dem vore att låta dagens kalender omtolka historien,
vilket §9 i Beslut L förbjuder.

---

## §6. NOT_FOUND utan återfall

Saknas ett inspelat beslut **och** inget återfall lämnades, får C3B.3 **inte**:

```
välja en standardkalender     använda dagens kalender
mynta en identitet            läsa en klocka
anropa en provider            gissa metadata
```

Utfallet är ett normalt lokalt orkestreringssvar:

```
HISTORICAL_FALLBACK_REQUIRED
```

Detta är **lokal orkestreringsvokabulär**. Det är inte en `ReasonCode`, inte en
`EventType`, inte en incident, inte ett risk- eller prop-avslag, inte en
resolvervägran och inte en lagervägran.

Anroparen får därefter förbereda explicita återfallsvärden och anropa igen.

---

## §7. Andra anropet upprepar uppslagningen

Att lämna ett återfall **kringgår inte** recorded-first.

Varje anrop börjar om med `store.find(root, at)`. Det gör kapplöpningen ofarlig:

```
anrop 1        → NOT_FOUND
en annan skrivare spelar in ett beslut
anroparen förbereder återfall
anrop 2        → FOUND
```

Det inspelade beslutet vinner. Återfallet ignoreras. Ingen överskrivning och ingen
dubbel orkestrering försöks.

---

## §8. M1 — `decisionId` ägs av anroparen

**C3B.3 myntar aldrig ett `ContractSelectionDecisionId`.** Det anropar inte:

```
newId()        randomUUID()          crypto.randomUUID()
hashhärledd    namnhärledd           tidsstämpelhärledd
kontraktshärledd identitet
```

`decisionId` är anroparägd **återfallsmetadata** och lämnas som en redan formad
`ContractSelectionDecisionId`, uteslutande för ett NOT_FOUND-återfallsförsök.

Detta följer trädets etablerade mönster: beslutsidentiteter är anroparlämnade, eller
härledda där kanon uttryckligen äger härledningen. **Det finns ingen kanonisk
härledning för `ContractSelectionDecisionId`**, och därför uppfinner C3B.3 ingen.

---

## §9. HITTAT kräver inget `decisionId`

En lyckad inspelad uppslagning kräver **inget nytt `decisionId`**. Gränssnittet
måste tillåta `store` + `root` + `at` **utan** återfall.

En replay som läser ett lagrat beslut förbrukar därmed:

```
noll slumpmässighet     noll ny identitet     noll oanvänd anroparskapad ID
```

---

## §10. `decisionId` vid omförsök

Inom **ett** pågående återfallsförsök är det lämnade `decisionId` stabilt; omförsök
av samma operation återanvänder det.

Dör processen **innan något beslut spelats in** finns däremot ingen kanonisk lagrad
post vars ogenomskinliga identitet måste bevaras. Efter omstart, om
`store.find(root, at)` åter ger NOT_FOUND, **får** ett nytt återfallsförsök lämna ett
annat `decisionId`.

Detta bryter **inte** mot kontraktsvalsdeterminismen. Skälet är att `decisionId` är
**ogenomskinlig postidentitet, inte ett indata till kontraktsvalet**.

---

## §11. Ingen ID-härledning för att laga kraschfönstret

Kraschfönstret i §10 löses **inte** genom att härleda `decisionId` ur:

```
root        at             calendarVersion     policyVersion
effectiveFrom              kontrakt            tidsstämpel
mänskligt läsbara namn
```

Beslut K lämnade medvetet `decisionId` anroparägd och ogenomskinlig. Beslut M bevarar
den gränsen. **Ingen deterministisk ID-formel införs.**

---

## §12. M2 — `decidedAt` betydelse

`decidedAt` är den **historiska/replaymässiga beslutsattributionsinstansen**: den
instans i scenariot eller replayen då anroparen tillskriver kontraktsvalet att ha
fattats.

Den är **inte**:

```
lagringstid     recordedAt              systemets väggklocka
processtid      providerns mottagningstid   databasens insättningstid
```

Den förblir anroparlämnad återfallsmetadata.

---

## §13. C3B.3 är klockfri

C3B.3 får aldrig härleda `decidedAt` ur `Date.now()`, `new Date()`,
`wallClockEpochMs()`, providertid eller systemklocka. **Anroparen lämnar
`Timestamp`.**

Detta bevarar den befintliga regeln i `replay/clock.ts`: väggklockan får inte driva
in i en deterministisk beräkning av handelstillstånd. En replay som inte kan
reproducera sitt eget resultat är ingen replay.

---

## §14. `at` och `decidedAt` är skilda begrepp

`decidedAt = at` kanoniseras **inte** som automatisk regel.

```
at          → marknads-/frågeinstansen som avgör vilket kontraktsintervall som gäller
decidedAt   → den historiska beslutsattributionsinstans anroparen lämnar
```

En anropare **får** avsiktligt lämna `decidedAt === at` när scenariots semantik säger
att beslutet fattades vid samma instans. **C3B.3 antar eller härleder aldrig den
likheten själv.**

---

## §15. `decidedAt` är stabil vid omförsök

För **samma** historiska orkestreringsavsikt ska `decidedAt` vara deterministisk och
stabil över omförsök. En anropare får **inte** ersätta den med "nu" efter en krasch
eller ett omförsök; rekonstrueras samma historiska scenario ska samma
attributionsinstans återges.

`Timestamp`-stavningen bevaras exakt. **C3B.3 normaliserar den aldrig.**

---

## §16. M3 — Den explicita kalendern **är** pinningen

För C3B.3 v1 gäller: en explicit lämnad, oföränderlig `ContractCalendar` inuti
`HistoricalContractSelectionFallback` **är** Canonical v1.0 §10:s historiska
kalenderpinning.

Ingen ytterligare `HistoricalCalendarPin`, `CalendarPin`, `CalendarRepository`,
`CalendarStore` eller versionsladdare krävs i v1.

Skälet: `ContractCalendar` är oföränderlig, bär `calendarVersion`, och **det finns
ingen ambient, aktuell eller standardkalender i runtime** att av misstag falla
tillbaka på. Anroparen gör det explicita historiska versionsvalet genom att lämna
värdet.

---

## §17. Ingen ambient kalender

C3B.3 får **inte** hämta eller härleda:

```
senaste kalendern     aktuell kalender      dagens kalender
standardkalender      providerns front month
miljövald kalender
```

Den **enda** kalender som är tillåten i NOT_FOUND-återfallsvägen är
`fallback.calendar`.

---

## §18. `calendarVersion` flödar genom resolutionen

Anroparen lämnar **ingen** separat `calendarVersion`. Den auktoritativa versionen
flödar:

```
fallback.calendar.calendarVersion
→ resolveContractAt
→ ContractResolution.calendarVersion
→ materializern
→ ContractSelectionDecision.calendarVersion
```

Ingen dubblerad `calendarVersion`-parameter. Ingen versionsuppslagning vid körning.

---

## §19. M4 — Determinismens omfång

Canonical v1.0 §26 förtydligas.

Kontraktsvalsdeterminismen omfattar **valets innehåll**, framställt ur den explicita
historiska kalendern och marknadsinstansen:

```
root                resolvedContract      effectiveFrom
effectiveTo         calendarVersion       policyVersion
evidence            reasons
```

för samma kanoniska indata.

Den **kräver inte** att en ogenomskinlig `decisionId` som ännu inte spelats in
överlever en processkrasch när **inget beslut någonsin lyckats spelas in**.

---

## §20. Före och efter inspelning

```
FÖRE lyckad inspelning
→ det finns ännu inget kanoniskt inspelat beslut

EFTER lyckad inspelning
→ den lagrade tiofältsposten är den oföränderliga replaysanningskällan
```

Därför får en krasch före lyckad inspelning leda till ett senare återfallsförsök med
ett nytt `decisionId` — men **omstarten måste först anropa `store.find(root, at)`**.
Lyckades den tidigare inspelningen i själva verket ger uppslagningen FOUND, beslutet
returneras och all ny återfallsmetadata ignoreras.

---

## §21. Fönstret för okänt kvittningsutfall

Betrakta: `record(decision)` lyckas fysiskt, men processen dör innan anroparen tar
emot `RECORDED`.

Vid omstart börjar orkestreringen med `store.find(root, at)`. Innehåller lagret
beslutet ges **FOUND**, och den lagrade posten returneras. Inget `decisionId` behöver
återanvändas eller rekonstrueras, ingen dubbelskrivning sker och inget omförsök med
ny identitet görs före uppslagningen.

**Det är detta som gör att recorded-first stänger fönstret för förlorad kvittens.**

---

## §22. Resolverns vägran

Ger `resolveContractAt(...)` **REFUSED** propagerar C3B.3 resolverns egen vägran utan
befordran. `NO_AUTHORITATIVE_COVERAGE` förblir lokal resolver- och
anropskontraktsvokabulär, aldrig `ReasonCode`, `EventType` eller incident.

Inget `ContractSelectionDecision` materialiseras. Ingenting spelas in.

---

## §23. Lagrets vägran efter NOT_FOUND

Lyckas materialiseringen men `store.record` vägrar, propagerar C3B.3 lagrets fel och
**failar closed**.

Det får **inte**:

```
göra om med ett annat decisionId     överskriva
lösa upp på nytt                     välja ett annat kontrakt
behandla överlapp som FOUND          emittera en händelse
```

Anroparen får återinträda i orkestreringen senare — och det anropet börjar åter med
`store.find(root, at)`.

---

## §24. Uppslagningens invariantbrott

Ger den **inledande** `store.find(root, at)` **INVARIANT_VIOLATION** avslutar C3B.3
fail-closed. Den konsulterar **inte** återfallet, löser inte upp, materialiserar inte
och spelar inte in.

---

## §25. M5 — Återläsning efter inspelning

Efter `materialize` → `store.record` → **RECORDED** ska C3B.3 **läsa om**
`store.find(root, at)` och returnera det **lagrade** `ContractSelectionDecision`.

Det pre-lagrade materialiserade objektet returneras **inte** som auktoritativt
resultat.

Skälet: Beslut L gör det **lagrade** beslutet till replayens sanningskälla. Det håller
båda framgångsvägarna enhetliga:

```
befintlig post   → returnera lagrat beslut
nyss inspelad    → läs om → returnera lagrat beslut
```

---

## §26. Omöjliga tillstånd efter inspelning

Efter att `store.record` gett RECORDED förväntas `store.find(root, at)` ge FOUND.

Ger den i stället **NOT_FOUND** eller **INVARIANT_VIOLATION** ska C3B.3 **faila
closed**. Det får inte returnera det materialiserade värdet, inte spela in på nytt,
inte lösa upp på nytt, inte reparera lagertillståndet och inte välja en träff.

Exakt runtime-namngivning av detta lokala utfall får bestämmas senare; det semantiska
felet är kanoniskt.

---

## §27. Inget återfall som callback

En lat callback- eller thunk-design **avvisas** för C3B.3 v1. Ingen
`fallback: () => …` definieras.

Skälet är konkret: en callback kan dölja `Date.now()`, `randomUUID()`, provideranrop
eller kalenderuppslagning **utanför** det bevakade orkestreringspaketet. Källvakterna
skulle bevisa att C3B.3 är klockfri medan orenheten satt ett anrop bort.

Beslut M väljer i stället ett inert värdeobjekt. Latheten uppnås operativt genom
tvåanropsmönstret:

```
1. anropa utan återfall
2. vid HISTORICAL_FALLBACK_REQUIRED — förbered explicita värden och anropa igen
```

Varje anrop börjar fortfarande recorded-first.

---

## §28. Resultatens härkomst

Beslut M låser inte alla slutliga TypeScript-namn, utöver det semantiska lokala
utfallet `HISTORICAL_FALLBACK_REQUIRED`.

Men en senare runtime-resultattyp **måste bevara härkomsten** mellan:

```
resolverns vägran            lagrets inspelningsvägran
uppslagningens invariantbrott   invariantbrott efter inspelning
```

**Självständigt ägda vägransvokabulärer slås inte samman till ett tvetydigt
strängnamnrum.** Normala domänvägranden är resultatvarianter; ett tekniskt avvisat
löfte förblir ett undantag.

---

## §29. Ingen befintlig-kontra-ny-observerbarhet

Anroparen ska **inte** behöva skilja på att posten redan fanns och att den nyss
skapades. Båda lyckade vägar ger **det lagrade `ContractSelectionDecision`**.

Ingen `FOUND_EXISTING`, `NEWLY_RECORDED`, `CREATED` eller `REUSED` krävs enbart för
observerbarhet.

---

## §30. `Timestamp`-regeln förs vidare

C3B.2:s dubbla regel gäller oförändrat, och **C3B.3 ska inte utföra någon egen
intervalljämförelse**:

```
intervallinneslutning        → store.find
resolutionens intervall      → resolveContractAt
lagringens intervallvalidering → store.record
```

C3B.3 duplicerar inte dessa jämförelser och normaliserar ingen `Timestamp`.

---

## §31. Beslutsinnehållets brandvägg

Anroparen får lämna **endast** anroparägd återfallsmetadata: `calendar`,
`decisionId`, `decidedAt`.

Anroparen får **inte** åsidosätta `decision.root`, `resolvedContract`,
`effectiveFrom`, `effectiveTo`, `policyVersion`, `calendarVersion`, `evidence` eller
`reasons`. De förblir resolver- och materializerägda.

---

## §32. `policyVersion`

Vid FOUND används den lagrade `policyVersion` exakt; den jämförs **inte** med dagens
konstant före retur. Vid NOT_FOUND kommer `policyVersion` uteslutande från
materializerns kanoniska låsta konstant. Ingen policyuppslagning, ingen anroparlämnad
`policyVersion`.

---

## §33. Provider-, auktoritets-, journal- och databasbrandvägg

**Provider.** Beslut M är provider-neutralt: ingen Rithmic, Tradovate, ProjectX,
front month, providerkontrakts-ID, providersymbol, volym- eller open
interest-rangordning och inget nätverk. Providerbevis förblir valfritt,
icke-auktoritativt och för närvarande tomt.

**Auktoritet.** C3B.3 skapar **noll** `RiskClearance`, `PropClearance`,
`ApprovalGrant`, `ExecutionIntent`, `TradeProposal`, order, fill eller
positionsmutation. Kontraktsval förblir data.

**Journal.** Beslut L är fortsatt auktoritativ. Ingen `EVENT_TYPES`-medlem, ingen
`TradingEvent`, ingen `ReplayEvent`-projektion och ingen revisionshändelse tillkommer.
Lagret är replayens sanningskälla; Beslut M öppnar inte journalfrågan igen.

**Databas.** C3B.3 talar enbart med `ContractSelectionDecisionStore`. Ingen Supabase,
Postgres, SQL, filsystem, Redis, migration eller schema — beständiga adaptrar förblir
bakom lagerporten.

---

## §34. Samtidighet och tekniska fel

Ingen transaktion, lås, CAS eller distribuerad mutex kanoniseras för C3B.3 v1;
lagrets fail-closed-semantik räcker. Beständiga adaptrar kan behöva starkare
atomicitet senare — **UPPSKJUTET**.

Ingen kanonisk teknisk felvokabulär införs. Semantiska domänutfall förblir
resultatvarianter; ett avvisat löfte eller infrastrukturfel förblir ett tekniskt
undantag.

---

## §35. Vad detta dokument stänger — och inte

**Stänger:**

```
GATE-08C-3B.3 DECISION-ID MINTING GAP            — STÄNGD
GATE-08C-3B.3 DECIDED-AT OWNERSHIP GAP           — STÄNGD
GATE-08C-3B.3 HISTORICAL-CALENDAR-PIN INPUT GAP  — STÄNGD för C3B.3 v1
GATE-08C-3B.3 POST-RECORD RETURN GAP             — STÄNGD
GATE-08C-3B.3 RECORD-DETERMINISM WINDOW GAP      — STÄNGD
```

**Stänger inte:**

- `GATE-08C-3B DECISION-RECORDED-AT GAP` — **UPPSKJUTEN / ICKE-BLOCKERANDE.**
- `GATE-08C-3B DECISION-STORE ORDERING GAP` — **UPPSKJUTEN / ICKE-BLOCKERANDE.**
- `GATE-08C-3B NONEMPTY-EVIDENCE VOCABULARY GAP` — **ÖPPEN / UPPSKJUTEN.**
- `GATE-08C-3A SOURCE-RESULT-SHAPE GAP` — **ÖPPEN.** Detta dokument definierar ingen
  `HistoricalContractCandleSource`, ingen paginering, ingen markör, ingen uttömning,
  ingen live-prenumeration och ingen backpressure. C3C berörs inte.
- **`EFFECTIVE-TO NULL GENERAL SEMANTICS`** — **RESERVERAD.**
- `GATE-08C-2A DST-BOUNDARY GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B UNEXPECTED-MINUTE GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B VOLUME POLICY` — **HÄRLEDD.**
- **`LIVE CONTRACT SELECTION ORCHESTRATION`** — **SEPARAT FRAMTIDA GRÄNS.**

**C3B.3-runtime är INTE implementerad.** Detta dokument beskriver semantiken; ingen
TypeScript-fil ändras av det. Ingen orkestrerare existerar i kod.

```
GATE-08 — FORTSATT DELVIS STÄNGD
```

Detta dokument utvidgar inte GATE-08:s stängning. Det låser orkestreringssemantik så
att ett kommande lager kan transkriberas mekaniskt i stället för att uppfinna kanon i
kod.
