# Omnira Trading System – Contract Selection Decision Materialisation

**Nivå:** Trading Core — materialiseringssemantik
**Version:** Canonical v1.0
**Datum:** 2026-09-03
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST semantik för C3B.1. Prospektiv verkan.
**Föregångare:** Ingen. Detta är den första materialiseringstexten.
**Moderauktoritet:** Market Data & Contract Lifecycle Canonical v1.0 §9–§10
**Sidoauktoritet:** Contract Selection Reason Code Canonical v1.0 §5–§7
**Ersätter:** Ingenting. Ingen befintlig regel upphävs, inget fält byter innebörd.

> **Detta dokument är provider-neutralt.** Det innehåller inga providernamn, inga
> symbolkonventioner, inga månadskoder, ingen front month-logik och ingen
> volym- eller open interest-rangordning.

---

## §1. Varför detta dokument finns

Canonical v1.0 §9 anger tio fält på ett `ContractSelectionDecision`. Tre av dem
saknade all definition: `evidence`-elementets typ, `policyVersion` och frågan om en
tom bevismängd är giltig. `decisionId` angavs som `string` utan ägarskap.

Konsekvensen var densamma som Beslut J beskrev för vokabulärluckan. GATE-08C-1 lät
bli att materialisera ett beslut. GATE-08C-3A lät bli det igen. GATE-08C-3B.0 stängde
vokabulärluckan men uttalade samtidigt att runtime förblev oimplementerad, eftersom en
implementation hade tvingats **uppfinna** de tre semantikerna i TypeScript.

Att skriva kanon i kod är det fel detta dokument finns för att förhindra.

Detta dokument stänger exakt de materialiseringsluckor som blockerar det **rena
värdeobjektet och dess materializer**. Det stänger ingenting annat.

---

## §2. Vad materialisering är

Materialisering är steget mellan **selektion** och **journal**:

```
resolveContractAt(calendar, root, at)   →  ContractResolution     [selektion]
materialisering                         →  ContractSelectionDecision
journal / store / replay                →  inspelad historik      [ej här]
```

Tre lager, tre ansvar. Materialisering **väljer ingenting** — valet är redan gjort
när den anropas. Den **lagrar ingenting** — inspelning tillhör ett senare lager.

Den gör en enda sak: den gör ett redan fattat kanoniskt val till ett **oföränderligt
historiskt värde** som kan läsas i efterhand.

---

## §3. Indata — endast framgång

Materializern tar emot **endast den lyckade resolutionsvarianten**.

```
ResolvedContractResolution
  = Extract<ContractResolution, { outcome: 'RESOLVED' }>
```

Den tar **inte** emot en allmän `ContractResolution` och grenar **inte** på
`RESOLVED` / `REFUSED`.

Skälet är att vägran sker **före** materialisering. Saknas auktoritativ täckning
gäller Canonical v1.0 §7.2 oförändrat:

```
resolveContractAt(...)  →  REFUSED  →  inget ContractSelectionDecision
```

Därför har materializern:

- **ingen vägransgren**
- **inget felbeslut**
- **ingen fel-`ReasonCode`**
- **ingen andra vägrantaxonomi**

Resolverns lokala `NO_AUTHORITATIVE_COVERAGE` förblir lokal anropskontraktsvalidering
i enlighet med Contract Selection Reason Code Canonical v1.0 §5. Den befordras inte
här.

**Fullständig indatamängd:**

```
{
  resolution:  ResolvedContractResolution
  decisionId:  ContractSelectionDecisionId
  decidedAt:   Timestamp
}
```

Anroparen får **inte** lämna in `root`, `resolvedContract`, `effectiveFrom`,
`effectiveTo`, `calendarVersion`, `policyVersion`, `evidence` eller `reasons`. Varje
sådan parameter vore antingen **dubbel sanning** eller **anroparstyrd kanonisk
metadata**, och båda gör posten opålitlig i efterhand.

---

## §4. Härledningsregler

| Fält | Källa |
|---|---|
| `root` | `resolution.contract.root` |
| `resolvedContract` | `resolution.contract`, i oföränderlig form (§14) |
| `effectiveFrom` | `resolution.effectiveFrom` |
| `effectiveTo` | `resolution.effectiveTo` (§13) |
| `calendarVersion` | `resolution.calendarVersion` (§9) |
| `policyVersion` | materializerns låsta konstant (§7–§8) |
| `evidence` | fryst tom array (§5) |
| `reasons` | fryst exakt kanonisk lista (§12) |
| `decidedAt` | anroparens indata (§11) |
| `decisionId` | anroparens indata (§10) |

Materialisering utför **ingen** omresolution, **ingen** kalenderuppslagning och
**ingen** provideruppslagning.

---

## §5. `evidence` — tom och fullständig

För C3B.1-materialisering gäller:

```
evidence: []
```

Den tomma oföränderliga arrayen är **giltig och fullständig** för ett kalenderbaserat
kanoniskt val.

Detta följer av Contract Selection Reason Code Canonical v1.0 §4. Ett kanoniskt val är
redan motiverat av **auktoritativ `ContractCalendar` plus valpolicy**. Providerbevis är

```
VALFRI FÖRKLARANDE OBSERVATION
ALDRIG UTLÖSARE
```

Därför gäller uttryckligen:

- Ingen providerobservation **krävs**.
- Ingen provideruppslagning får utföras **enbart** för att fylla `evidence`.
- Saknat bevis får **aldrig** orsaka vägran.
- Ingen providerobservation får bli **förutsättning** för ett beslut.

Att anropa en provider för att fylla arrayen vore att göra bevis till utlösare, alltså
en direkt inversion av Beslut J §4.

**För C3B.1 är icke-tom `evidence` förbjuden.**

---

## §6. `ContractEvidence` — reserverad utvidgningspunkt

Canonical v1.0 §9 namnger `ContractEvidence` och ger tre **exempel**: providerns front
month-etikett, observerad volym, open interest.

**Exempel är inte ett datakontrakt.** Detta dokument gör dem därför inte till
`ContractEvidenceKind`, inte till postformer och inte till någon vokabulär.

Den kanoniska representationen för C3B.1 är:

```
ContractEvidence = never
```

Följden är strukturell och avsiktlig: `readonly ContractEvidence[]` kan kanoniskt
innehålla **noll medlemmar och inget annat**. Icke-tomt bevis blir omöjligt att
konstruera — inte förbjudet av en kontroll som kan glömmas bort, utan omöjligt genom
typen själv.

En framtida kanonisk text får **vidga** `ContractEvidence` prospektivt. Den vidgningen
måste då definiera:

- bevisarter
- proveniens
- källreferenser
- observationsidentitet
- värderepresentation
- validering
- ägarskap

Historiska beslut med `evidence: []` förblir **giltiga för alltid**. En senare
vidgning omtolkar dem aldrig.

```
GATE-08C-3B NONEMPTY-EVIDENCE VOCABULARY GAP — ÖPPEN / UPPSKJUTEN
```

Den luckan blockerar **inte** C3B.1.

---

## §7. `policyVersion` — exakt litteral

Kontraktsvalets policyversion är exakt:

```
market-data-contract-lifecycle-v1.0
```

Exakt stavning. Låst.

Den identifierar den **valpolicy** som ägs av Market Data & Contract Lifecycle
Canonical v1.0 — särskilt kalender- och resolutionssemantiken som producerar en lyckad
`ContractResolution`.

Den är **inte**:

```
calendarVersion
strategyVersion
providerversion
applikationsversion
Git SHA
```

Litteralen uppfyller den befintliga `isVersionLabel()`-regeln i `versions.ts`, som
avvisar rörliga alias.

---

## §8. `policyVersion` — ägarskap

**Materializern äger konstanten. Anroparen får inte lämna in den.**

Runtime exponerar den som ett låst värde och materialiserar det direkt:

```
CONTRACT_SELECTION_POLICY_VERSION = 'market-data-contract-lifecycle-v1.0'

policyVersion: CONTRACT_SELECTION_POLICY_VERSION
```

Skälet är att materializern **vet vilken valpolicyimplementation den representerar**.
Läte man anroparen lämna en godtycklig sträng uppstår en ny oenighetsyta, där posten
kan påstå policy X medan policy Y faktiskt kördes. En sådan post är värdelös i
efterhand, och värre än ingen post alls, eftersom den ser sann ut.

Uttryckligen förbjudet:

- rörliga alias — `latest`, `current`, `head`, `stable`
- dynamisk aliasuppslagning
- policyuppslagning vid körning
- miljöuppslagning

En framtida ändring av valpolicyn kräver **ny kanonisk version och ny ruling**, inte en
ny sträng vid ett anropsställe.

---

## §9. `calendarVersion` är ett annat faktum

`calendarVersion` förblir **den exakta `ContractCalendar`-version som
`resolveContractAt` faktiskt använde**.

Den **kopieras från den lyckade resolutionen**. Anroparen lämnar **ingen** andra
`calendarVersion`-parameter — annars kan de två avvika, och posten skulle registrera en
kalender som aldrig lästes.

`policyVersion` och `calendarVersion` är **två skilda fakta** och slås aldrig ihop:
policyversionen säger *under vilken regel* valet gjordes, kalenderversionen *ur vilket
underlag*. Ingen får härledas ur den andra.

Detta dokument inför **ingen** ny valideringsregel för `ContractCalendar`. Den
befintliga `isNonBlank`-valideringen av `calendarVersion` är oförändrad och ligger
utanför denna text.

---

## §10. `decisionId`

Canonical v1.0 §9 anger `decisionId: string`. Runtime-representationen låses till en
**ny brandad identitet** enligt trädets befintliga identitetskonvention i `ids.ts`:

```
ContractSelectionDecisionId
```

Semantiskt förblir den en sträng och uppfyller därmed §9 oförändrat. Brandningen är
kompileringstidsnominell och försvinner vid körning.

Den ska läggas till den centrala `TradingId`-vokabulären när C3B.1 skrivs.

**Materializern myntar den inte.** Anroparen lämnar in den:

```
decisionId: ContractSelectionDecisionId
```

Uttryckligen förbjudet **inuti materializern**:

```
newId()
randomUUID()
namnhärledd identitet
tidsstämpelhärledd identitet
```

Detta följer den etablerade konventionen: ingen produktionsmodul i trading-trädet
myntar sin egen identitet inuti en byggare. `approval()` fryser ett färdigt värde och
myntar ingenting.

**Vem som till slut myntar identiteten i orkestreringslagret avgörs inte här.**

---

## §11. `decidedAt`

`decidedAt` är en **anroparlämnad `Timestamp`**.

Materializern läser **ingen väggklocka**. Uttryckligen förbjudet inuti materializern:

```
Date.now()
new Date()
timestampFrom(new Date())
performance.now()
```

Detta följer `Approval`-konventionen, där `decidedAt` är ett gränssnittsfält och
`isApprovalExpired(value, now)` tar instansen som **parameter**.

Resolvern förblir klockfri i enlighet med Canonical v1.0 §26.

---

## §12. `reasons` — exakt lista

Ett nymyntat C3B.1-beslut bär exakt:

```
[ reason('CONTRACT_SELECTED_BY_CANONICAL_CALENDAR') ]
```

**Anroparen lämnar inte in `reasons`.** Listan är en följd av att materialisering
överhuvudtaget sker, inte ett val vid anropsstället.

I enlighet med Contract Selection Reason Code Canonical v1.0 §6 gäller:

- listan är **icke-tom**
- **ingen** ytterligare orsak
- **ingen** providerobservationsorsak
- `detail` krävs inte
- `calendarVersion` och `policyVersion` kodas **aldrig** in i orsakstexten som en andra
  maskinsanning — de har egna fält

---

## §13. `effectiveTo` — ändlig

Canonical v1.0 §9 tillåter `effectiveTo: Timestamp | null`.

`ContractResolution` returnerar i dag alltid en **ändlig** `Timestamp`, eftersom
auktoritativ täckning enligt §7.2 är ändlig i båda ändar.

För C3B.1 gäller därför:

```
effectiveTo  ←  resolution.effectiveTo        (alltid ändlig)
```

**C3B.1 får aldrig uppfinna `null`.** Att fältet *tillåter* null är inte tillstånd att
konstruera ett öppet intervall.

Den allmänna framtida innebörden av `effectiveTo === null` förblir **RESERVERAD /
ODEFINIERAD**. Detta dokument definierar inte öppna valintervall.

---

## §14. Oföränderlighet

Ett materialiserat beslut är ett **historiskt värde**. Canonical v1.0 §9 kräver att
historiska beslut är oföränderliga.

Krav:

- beslutsobjektet fryses
- `reasons` skapas nytt, kopieras och fryses
- varje `Reason` är redan fryst av `reason()`
- `evidence` skapas nytt och fryses
- `resolvedContract` får **inte** förbli nåbart genom ett muterbart anroparobjekt
- **ingen anropar-ägd array fryses på plats**
- inget anroparobjekt får senare mutera beslutet

Den nyare `kopiera → frys`-formen ska användas, inte äldre former som fryser
anroparens egna arrayer direkt.

---

## §15. Resolvern förblir ren

```
resolveContractAt(calendar, root, at)
```

är och förblir den **enda** kontraktsvalsresolvern, och den förblir ren.

Detta dokument ändrar den inte. Följande får **inte** förekomma i
`contract-calendar/`:

```
decisionId      decidedAt       Reason        ReasonCode
journal         newId           klocka        provider
policyVersion-konstant
```

---

## §16. Modullagring

Materialisering är ett **eget lager**, skilt från resolution och skilt igen från
journal/store/replay.

Materializern får **inte** placeras i `contract-calendar/`. Det paketets
import-disciplin hindrar avsiktligt paketet från att äga `ContractSelectionDecision`
eller nå orsaksregistret, och den gränsen är en del av varför resolvern är bevisbart
ren.

Föredragen framtida gräns:

```
apps/web/lib/trading/contract-selection/
```

Exakta filer tillhör C3B.1, inte denna text.

---

## §17. Provider- och auktoritetsbrandvägg

**Providerbrandvägg.** Eftersom `evidence` är tom-endast finns ingen anledning för
C3B.1 att importera provider-lager, providerkontraktsidentiteter, front month, volym-
eller open interest-rangordning. Ingen provider får **välja, ändra, rangordna,
åsidosätta eller mynta** ett beslut.

**Auktoritetsbrandvägg.** Ett `ContractSelectionDecision` skapar **noll**:

```
RiskClearance    PropClearance    ApprovalGrant    ExecutionIntent
```

Det svarar endast på:

> **VILKET KONTRAKT, VARFÖR, UNDER VILKEN POLICY, UR VILKEN KALENDER**

Det svarar inte på huruvida en order får skickas.

**Proveniensgräns.** Ett beslut förklarar varför ett `ContractCandleSegment`-hölje bär
sitt kontrakt. Det bevisar **inte** providerursprung för någon enskild `MarketCandle`.
Ingen proveniensutfästelse stärks här.

---

## §18. Vad detta dokument stänger — och inte

**Stänger för C3B.1:**

```
GATE-08C-3B CONTRACT-EVIDENCE SHAPE GAP    — STÄNGD (tom-endast, ContractEvidence = never)
GATE-08C-3B EVIDENCE-EMPTY SEMANTICS GAP   — STÄNGD
GATE-08C-3B POLICY-VERSION GAP             — STÄNGD
GATE-08C-3B DECISION-ID OWNERSHIP GAP      — STÄNGD för materializern (anroparlämnad)
```

**Stänger inte:**

- `GATE-08C-3B NONEMPTY-EVIDENCE VOCABULARY GAP` — **ÖPPEN / UPPSKJUTEN.** Blockerar
  inte C3B.1.
- `GATE-08C-3B DECISION-JOURNAL VOCABULARY GAP` — **ÖPPEN.** `EVENT_TYPES` är en
  avsiktligt sluten vokabulär utan medlem för kontraktsval. Detta dokument lägger inte
  till någon. Luckan blockerar **C3B.2**, inte C3B.1.
- **Replaymekanismen.** Den kanoniska invarianten är oförändrad — inspelat beslut läses,
  räknas aldrig om, får aldrig sina `reasons` omyntade eller omskrivna; utan inspelat
  beslut krävs explicit pinnad historisk kalenderversion; utan pinning: `REFUSE`. Detta
  dokument **implementerar och definierar inte** lagringsmekanismen. C3B.2 och C3B.3
  äger den.
- `GATE-08C-3A SOURCE-RESULT-SHAPE GAP` — **ÖPPEN.** Detta dokument säger ingenting om
  paginering, uttömning, prenumerationslivscykel eller backpressure.
- `GATE-08C-2A DST-BOUNDARY GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B UNEXPECTED-MINUTE GAP` — **ÖPPEN / FAIL-CLOSED.**
- `GATE-08C-2B VOLUME POLICY` — **HÄRLEDD**, inte kanoniserad här.
- **Orkestrering.** Vilket lager som till slut myntar `decisionId`, och ordningen
  "inspelat beslut först, annars pinnad kalender", tillhör C3B.3.

**C3B.1-runtime är INTE implementerad.** Detta dokument beskriver semantiken; ingen
TypeScript-fil ändras av det.

```
GATE-08 — FORTSATT DELVIS STÄNGD
```

Detta dokument utvidgar inte GATE-08:s stängning. Det låser materialiseringssemantik så
att ett kommande rent värdeobjekt kan transkriberas mekaniskt i stället för att uppfinna
kanon i kod.
