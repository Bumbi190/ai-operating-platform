# Omnira Trading System – Execution Provider Adapter

**Nivå:** Level 1 — Read Only
**Version:** Canonical v1.2
**Datum:** 2026-08-30
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** LÅST provider-neutralt kontrakt. Implementation ej påbörjad.
**Föregångare:** Canonical v1.1 (låst 2026-08-29, arkiverad) · Canonical v1.0 (låst 2026-08-28, arkiverad)
**Källa:** Canonical Amendments v1.0, Beslut G

> **Detta dokument är självbärande.** Varje typ som någon av de femton
> Level 1-signaturerna refererar definieras här eller är en explicit aktiv Trading
> Core-primitiv. Ingen arkiverad providerspecifikation behöver läsas för att
> implementera kontraktet.

> **Detta dokument är provider-neutralt.** Det innehåller inga endpoint-namn, inga
> providerspecifika fält och ingen providerspecifik autentisering.

---

## G0. Varför v1.2 finns

Canonical v1.1 stängde vokabulärluckan, men **inte** som ett självbärande dokument.

v1.1 skrevs som ett *amendment* som citerade v1.0:s §1–§9 i stället för att återge dem. Så
länge v1.0 var aktiv canon fungerade det. Vid promotionen ersatte v1.1 v1.0 som enda aktiva
källa — och de citerade sektionerna följde inte med. Sju typer blev därmed refererade av
aktiv canon men definierade endast i en arkiverad fil, samtidigt som `archive/README.md`
säger att arkiverade filer aldrig får användas som implementationsunderlag. Två
governance-regler pekade åt olika håll, och en implementatör kunde inte följa båda.

Detta upptäcktes i Trading Stage 1.8a steg 0, innan någon TypeScript skrevs.

v1.2 gör två saker och inget annat:

1. **Återger** varje fortfarande giltig Level 1-definition i det aktiva dokumentet, så att
   kontraktet är implementerbart utan att läsa arkiverad canon.
2. **Låser portens asynkrona semantik**, som v1.1 aldrig uttalade.

Ingen affärssemantik ändras. Inga metoder tillkommer eller försvinner.

---

## Beslut G

Låst 2026-08-30. Fullständigt ändringsspår i `reviews/Canonical Amendments v1.0.md`.

| # | Beslut |
|---|---|
| G1 | Det aktiva providerkontraktet ska vara **självbärande**. Ingen aktiv providertyp får kräva en arkiverad specifikation för att förstås |
| G2 | De definitioner som av misstag utelämnades vid v1.1-promotionen **återges** i v1.2. Sju stycken, alla oförändrade |
| G3 | Level 1-portens operationer är **asynkrona** |
| G4 | De fjorton metoder som returnerade `Result<T>` returnerar nu `Promise<Result<T>>` |
| G5 | `disconnect()` returnerar `Promise<void>` — **inte** `Promise<Result<void>>` |
| G6 | Providerobservationer och värdeobjekt är **immutabla**; runtime-transkription använder readonly-fält och readonly-samlingar |
| G7 | Asynkroniteten är **portsemantik**. Den implicerar ingen transport, ingen retry-, timeout- eller reconnect-policy |
| G8 | Ingen övrig affärssemantik ändras |

---

# DEL I — ÅTERGIVEN LEVEL 1-GRUND

> Varje sektion i Del I är **UNCHANGED RESTATEMENT FROM CANONICAL v1.0** där inget annat
> uttryckligen anges. Innehållet är återgivet ordagrant i sak, inte omdesignat. Det enda
> undantaget är §6, där Beslut G:s asynkrona portsemantik tillämpas.

## §1. Syfte och avgränsning

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §1.*

Kontraktet definierar den enda gränsytan mellan Omnira och en extern Futures Execution
Provider för **observation**. Det tillåter ingen orderläggning.

Adaptern är den enda komponent som får känna till en specifik providers API, autentisering,
ordermodell och symbolformat. Ingenting ovanför adaptern får innehålla providerspecifik
kunskap.

### §1.1 Vad Level 1 inte innehåller

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §1.1.*

Level 1 deklarerar **inga** execution-metoder. Inte avstängda, inte skyddade — frånvarande:

```
submitOrder     ✗ finns inte
modifyOrder     ✗ finns inte
cancelOrder     ✗ finns inte
preflightOrder  ✗ finns inte
```

Level 2 är utkast och specificeras separat när Fas 6 närmar sig.

---

## §2. Auktoritetsgräns

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §2.*

**Authority is issued, not derived from data.** Fas 1-invarianten gäller oförändrat.

En provider-observation är ett **record**, precis som en `RiskDecision` är ett record. Records
kan inte minta `RiskClearance`, `PropClearance` eller `ApprovalGrant`.

| Adaptern får | Adaptern får inte |
|---|---|
| Observera externt state | Minta någon capability |
| Normalisera till Omnira-typer | Skapa `ExecutionIntent` |
| Rapportera health och capabilities | Anropa `lib/trading/internal` |
| Rapportera UNKNOWN | Tolka UNKNOWN som ALLOW |

`ExecutionIntent` skapas fortfarande enbart av `openExecutionGate`, som kräver tre
oförfalskbara capabilities. En adapter-observation är inte en av dess indata och kan inte
bli det. **Asynkronitet ändrar ingenting av detta.**

---

## §3. Capability-semantik

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §3.*

Providers skiljer sig åt i vad de kan rapportera. Kontraktet måste kunna uttrycka den
skillnaden deterministiskt — annars blir varje providerskillnad en arkitekturfråga.

```
CapabilityState =
  | SUPPORTED      // providern gör detta, verifierat vid connect
  | UNSUPPORTED    // providern kan bevisligen inte
  | CONDITIONAL    // beror på konto, entitlement eller credential
  | UNKNOWN        // ej fastställt — behandlas som osäkert
```

**Säkerhetsregel.** Endast `SUPPORTED` uppfyller ett säkerhetskritiskt capability-krav.
`CONDITIONAL` och `UNKNOWN` **fail closed**, om inte ett explicit definierat villkor har
bevisats.

Dessa states får **aldrig** kollapsas till boolean. `UNKNOWN` och `UNSUPPORTED` är olika
fakta, och endast det ena är meningsfullt att försöka igen.

### §3.1 ProviderCapabilities

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §3.1. Fjorton fält, oförändrade.*

```
ProviderCapabilities {
  readOnlyCredentialMode  : CredentialMode
  accountSnapshots        : CapabilityState
  positions               : CapabilityState
  workingOrders           : CapabilityState
  fills                   : CapabilityState
  fillHistoryWindow       : HistoryWindowCapability
  contractDiscovery       : CapabilityState
  contractTickSize        : CapabilityState
  contractTickValue       : CapabilityState
  contractMultiplier      : CapabilityState
  providerTime            : CapabilityState
  streamingState          : CapabilityState
  reconciliation          : CapabilityState
  observedAt              : Timestamp
}
```

`ProviderCapabilities` är en **observation**. Den beskriver vad providern kan rapportera.
Den skapar aldrig behörighet, och ingenting i Trading Core härleder auktoritet ur den.

`HistoryWindowCapability` definieras i F7 och är den enda del av §3.1 som inte kommer från
v1.0 — den fyllde en lucka i v1.0 §3.1 och låstes genom Beslut F.

---

## §4. Credential-semantik

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §4.*

```
CredentialMode =
  | READ_ONLY_ENFORCED   // providern själv vägrar orders på detta credential
  | READ_WRITE_CAPABLE   // credentialet skulle kunna lägga order
  | UNKNOWN
```

Fas 2 **föredrar** `READ_ONLY_ENFORCED`. Kontraktet får däremot inte anta att varje provider
erbjuder sådana credentials.

Om det resolverade läget är `READ_WRITE_CAPABLE` under Fas 2 ska adaptern rapportera
`SECURITY_DEGRADED` på sin health-yta. Det är en **registrerad försvagning av
least-privilege** — aldrig ett implicit godkännande, och aldrig ett skäl att exponera en
orderväg.

| Credential capability | Omnira authority |
|---|---|
| Vad providern tekniskt tillåter | Vad Omnira faktiskt får göra |
| Kan vara bredare än önskat | Bestäms av auktoritetskedjan |

Även om ett credential tekniskt kan lägga order under Fas 2 finns ingen kodväg som frågar.
Det är defense-in-depth genom frånvaro snarare än genom behörighet.

**Avvisade förslag som förblir frånvarande** (Beslut F): `requestedCredentialMode`,
`requiredCredentialMode`, `preferredCredentialMode`, `credentialPolicy`. Providern
rapporterar det faktiska resolverade läget; det finns inget begärt-läge-protokoll.

---

## §5. Fältillgänglighet

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §5.*

```
Available<T> =
  | { state: PRESENT;     value: T }
  | { state: UNAVAILABLE }   // providern har bevisligen inget värde
  | { state: UNKNOWN }       // ej efterfrågat, eller ej besvarat
```

`PRESENT` **bär sitt värde**. `UNAVAILABLE` och `UNKNOWN` bär inget.

**Adaptern gissar aldrig ett saknat fält.** Om ett värde krävs för en säkerhetskritisk
beräkning och kommer tillbaka `UNAVAILABLE` eller `UNKNOWN` ska beräkningen fail closed —
inte substituera ett default.

Förbjudna substitutioner, oavsett bekvämlighet:

```
UNKNOWN      → 0        UNKNOWN      → null      UNKNOWN     → ""
UNAVAILABLE  → 0        UNAVAILABLE  → null      UNAVAILABLE → []
UNKNOWN      → false    saknad post  → []
```

`Available<T>` ägs av providerkontraktet och är **skild** från replay-lagrets
`ObservedValue<T>` — se F14.1.

---

## §6. Level 1-gränssnittet — ASYNKRONT

**BESLUT G3–G5. Detta är den enda semantiska ändringen i v1.2.**

Porten representerar provider-I/O vars slutförande kan ske senare. En nätverksansluten
provider kan inte ärligt uppfylla ett synkront kontrakt, och v1.0/v1.1 uttalade aldrig
frågan — signaturerna skrevs i en notation som implicit läste synkront.

Den fullständiga signaturen finns i F15. Ansvar, metodnamn och metodantal är oförändrade
från v1.0 §6; endast returtyperna wrappas.

```
Result<T>  →  Promise<Result<T>>      för de fjorton metoder som returnerade Result<T>
void       →  Promise<void>           endast disconnect
```

`disconnect()` blir **inte** `Promise<Result<void>>`. Det skulle införa ny felsemantik i
stället för enbart asynkron slutförandesemantik, och v1.0 gav `disconnect` inget felutfall.

### §6.1 Vad asynkroniteten inte betyder

Asynkronitet är **portsemantik**. Den implicerar ingenting om implementationen:

```
Rithmic          ✗ implicerar inte      retries          ✗ implicerar inte
WebSocket        ✗ implicerar inte      timeout-policy   ✗ implicerar inte
HTTP             ✗ implicerar inte      reconnect-policy ✗ implicerar inte
trådar           ✗ implicerar inte      transportval     ✗ implicerar inte
bakgrundsarbetare ✗ implicerar inte
```

Felsemantiken är oförändrad: ett misslyckande uttrycks som `Result` med `ok: false` och en
`ProviderError`, aldrig som ett kastat fel och aldrig som ett tomt värde.

`getEnvironment()` returnerar aldrig ett default. Ett okänt environment är `UNKNOWN` och
fail closed, i enlighet med Trading Cores befintliga regel att `live` aldrig är fallback.

---

## §7. Datamodell

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §7.*

Adaptern återanvänder Trading Cores primitiv. Den får inte införa ett parallellt vokabulär.

| Typ | Grund | Not |
|---|---|---|
| `ProviderId` | ny branded id | Identifierar adaptern, inte kontot |
| `Environment` | `TradingEnvironment` | Aldrig defaultad |
| `AccountId`, `OrderId`, `FillId`, `PositionId` | Core branded ids | Provider-ids mappas in, ersätter dem aldrig |
| `ContractId` | ny branded id | Kontraktsnivå, skild från instrumentidentitet |
| `ProviderTimestamp` / `ProviderClock` | `Timestamp` + mätt skew | Providerklocka bärs skild från lokal. Se F6 |
| Priser, pengar, kvantiteter | `Decimal` | Exakt skalad bigint. **Aldrig float** |
| `ProviderHealth` | `Verdict` | ALLOW / DENY / UNKNOWN. Strukturerad yta, se F3 |
| `ProviderError` | `ReasonCode` | Providerfel översätts till Core-koder. Se F2 |

**Observationer är immutabla. En snapshot beskriver ett ögonblick och ändras aldrig i
efterhand.** Se §10 för vad detta betyder i runtime-transkriptionen.

### §7.0 Providerkontraktets egna branded ids

*Explicit deklaration av det tabellen ovan redan säger. Ingen semantisk ändring.*

```
ProviderId        = branded string      // ägs av providerkontraktet
ContractId        = branded string      // ägs av providerkontraktet
ProviderTimestamp = branded Timestamp   // ägs av providerkontraktet
```

**Ägarskapet är providerkontraktets, inte Trading Cores.** Core bidrar med
*brandingmekanismen* — samma nominella mönster som `AccountId` och `Timestamp` använder — men
inte med dessa tre typers semantik. Det finns ingen aktiv Core-canon som definierar
`ProviderId`, `ContractId` eller `ProviderTimestamp`, och ingen får införas som gör det utan
ett eget beslut.

Skillnaden spelar roll vid transitiv closure: `AccountId` är en **extern** aktiv
Core-primitiv, medan `ContractId` är **intern** för detta dokument. Att klassificera
`ContractId` som Core-primitiv vore att påstå ett Core-beslut som inte finns.

| Typ | Ägare | Brandingmekanism |
|---|---|---|
| `ProviderId` | Provider Contract | Core `Branded<string, B>` |
| `ContractId` | Provider Contract | Core `Branded<string, B>` |
| `ProviderTimestamp` | Provider Contract | Core `Branded<string, B>`, nominellt skild från `Timestamp` |

### §7.1 ContractSnapshot

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §7.1. Elva fält, oförändrade.*

```
ContractSnapshot {
  providerContractId : string              // providerns egen id, opak
  contractId         : ContractId          // Omnira branded
  rootSymbol         : Available<string>
  canonicalSymbol    : Available<string>
  exchange           : Available<string>
  expiration         : Available<Timestamp>
  tickSize           : Available<Decimal>
  tickValue          : Available<Decimal>  // ofta frånvarande
  multiplier         : Available<Decimal>  // ofta frånvarande
  observedAt         : Timestamp
  source             : PROVIDER | CANONICAL_SPEC
}
```

`source` håller **provider observation** skild från en framtida **canonical contract
specification**. De två får aldrig tyst slås ihop. Om tick value eller multiplier senare
hämtas från en separat canonical källa ska det framgå vilken källa som gav värdet.

Detta interagerar med **GATE-08 men stänger den inte.** Datashape är inte resolutionspolicy:
ingen front month-algoritm, ingen continuous contract-mappning, ingen symbolprefix-heuristik
och ingen rollover-kalender finns i detta kontrakt.

### §7.2 HistoryRequest och FillHistory

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §7.2.*

```
HistoryRequest { from: Timestamp; to: Timestamp; cursor?: string }

FillHistory {
  fills        : readonly FillSnapshot[]
  requested    : { from: Timestamp; to: Timestamp }
  actual       : Available<{ from: Timestamp; to: Timestamp }>
  completeness : COMPLETE | TRUNCATED | UNKNOWN
  nextCursor   : string | null
}
```

Inget antagande om obegränsad historik finns någonstans. `TRUNCATED` och `UNKNOWN` är båda
acceptabla Fas 2-utfall, så länge de rapporteras ärligt i stället för att presenteras som
`COMPLETE`.

Fas 2 behöver endast tillräcklig **recent history** för att bevisa observation och
reconciliation. Ingen transportpaginering utöver `cursor` / `nextCursor` införs.

---

## §8. Felsemantik

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §8.*

Providerfel översätts till Omniras strukturerade `ReasonCode`. Adaptern får inte läcka
providerspecifika felsträngar som beslutsunderlag; rå providerresponse får bevaras för
journalen där det är säkert.

Minst följande situationer ska kunna uttryckas:

| Situation | Utfall |
|---|---|
| Ej ansluten | `PROVIDER_DISCONNECTED` |
| Stale state | `STALE_ACCOUNT_DATA` / `STALE_MARKET_DATA` |
| Okänt environment | `ENVIRONMENT_UNKNOWN` |
| Kontomatchning misslyckas | `ACCOUNT_MISMATCH` |
| Instrument ej resolvbart | `INVALID_INSTRUMENT_STATE` |
| Capability ej `SUPPORTED` | `VERDICT_UNKNOWN` |
| Credential bredare än begärt | `SECURITY_DEGRADED` (warning, ej block i Fas 2) |

`PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED` är låsta i providervokabulären genom Beslut
F. Transkriptionen till Trading Cores register skedde i Stage 1.8a. Ytterligare reason codes
tillkommer inte genom *detta* dokument; providerkonnektivitetens koder låses separat i
*Provider Connectivity Reason Codes Canonical v1.0* (Beslut H).

`SECURITY_DEGRADED` betyder credential bredare än begärt. Den betyder inte nekad
autentisering — det är `PROVIDER_AUTHENTICATION_FAILED` i Beslut H:s vokabulär.

---

## §9. Multi-provider-krav

*UNCHANGED RESTATEMENT FROM CANONICAL v1.0 §9.*

Kontraktet är stängt som canonical endast därför att det uppfyller följande test:

> En `RithmicProtocolAdapter` och en `TradovateAdapter` kan implementera samma Level 1
> utan att kontraktets semantik ändras.

Providerskillnader uttrycks uteslutande genom `ProviderCapabilities`, `CapabilityState`,
`Available<T>`, `FillHistory.completeness`, `CredentialMode` och normaliserade fel.

**Inga providerspecifika endpoint-namn hör hemma i detta dokument.** Providerspecifik
research bevaras separat som implementationsunderlag, inte som universell arkitektur.

---

## §10. Immutabilitet i runtime-transkriptionen

**BESLUT G6.**

§7 låser att observationer är immutabla. Det som v1.1 inte sade är vad det betyder när
kontraktet blir TypeScript. Det låses här:

Providerobservationer och värdeobjekt transkriberas med **readonly-fält och
readonly-samlingar**. Det gäller varje data- och värdeform i kontraktet:

```
Result-payload · ProviderError · ProviderConfig · ProviderSession
ProviderIdentity · ProviderHealth · ProviderClock · ProviderCapabilities
HistoryWindowCapability · AccountRef · ProviderAccountSnapshot
ContractSpec · ContractRef · ContractSnapshot
PositionSnapshot · OrderSnapshot · FillSnapshot · FillHistory
ReadOnlyReconciliation · ReconciliationDiscrepancy
```

Detta betyder **inte** att `ExecutionProviderAdapter`-instansen själv är immutabel. En
adapter håller en session och kan anslutas och kopplas ned. Ingen mutationsmetod införs, och
inget i kontraktet ger en konsument möjlighet att ändra en observation efter att den
returnerats.

---

# DEL II — RUNTIME-VOKABULÄR (BESLUT F)

## F0. Varför denna kandidat finns

Canonical v1.0 låste **ansvarsfördelningen** för Level 1: femton read-only-metoder, noll
order-metoder, och en deterministisk vokabulär för providerskillnader
(`CapabilityState`, `Available<T>`, `CredentialMode`, `FillHistory.completeness`).

Vid förberedelsen av runtime-transkriptionen (Trading Stage 1.8a, steg 0) konstaterades att
kontraktet **inte är slutet under sin egen typvokabulär**. Fjorton av femton metodsignaturer
refererar `Result<T>`, som aldrig definieras. Ytterligare femton typer namnges i §6, §3.1 och
§7.2 utan att någonstans definieras — i något av de 40 dokumenten under `docs/trading-system`.

Konsekvens: en implementatör kan inte transkribera §6 utan att **uppfinna** semantik.
Att uppfinna semantik i implementationslager är precis vad provider-neutraliteten ska
förhindra, eftersom den första uppfinningen då blir de facto canon utan granskning.

v1.1 stänger den luckan. Den ändrar **inte** ansvarsfördelningen, lägger **inte** till någon
metod, och tar **inte** bort någon.

### F0.1 Vad varken v1.1 eller v1.2 ändrar

Samtliga poster nedan är oförändrade sedan v1.0. De som var enbart *refererade* i v1.1 är nu
**återgivna i Del I** och behöver ingen arkiverad källa.

| Oförändrat från v1.0 | Var det står nu |
|---|---|
| De femton Level 1-metoderna — namn, antal och ansvar | §6, F15 |
| Noll order-metoder. `submitOrder` / `modifyOrder` / `cancelOrder` / `preflightOrder` är frånvarande | §1.1 |
| Auktoritetsgränsen. Authority is issued, not derived from data | §2 |
| `CapabilityState` — SUPPORTED · UNSUPPORTED · CONDITIONAL · UNKNOWN | §3 |
| `ProviderCapabilities` — fjorton fält | §3.1 |
| `CredentialMode` — READ_ONLY_ENFORCED · READ_WRITE_CAPABLE · UNKNOWN | §4 |
| `Available<T>` — PRESENT(value) · UNAVAILABLE · UNKNOWN | §5 |
| `ContractSnapshot` — elva fält | §7.1 |
| `HistoryRequest` och `FillHistory`, inkl. `completeness` COMPLETE · TRUNCATED · UNKNOWN | §7.2 |
| Provider-neutralitet | §9 |
| GATE-08 förblir **ÖPPEN** | §7.1, F16 |

---

## F1. Klassificeringsregel: REQUIRED kontra Available&lt;T&gt;

v1.0 §5 säger att adaptern aldrig gissar ett saknat fält. v1.1 gör den regeln
granskningsbar genom att klassificera **varje** fält i exakt en av två kategorier.

**REQUIRED PROVIDER INVARIANT**
Ett värde utan vilket posten inte kan identifieras eller attribueras. Om providern inte kan
leverera det får posten **inte returneras**; anropet failar i stället med en `ProviderError`.
Ett REQUIRED-fält är aldrig `Available<T>`, eftersom "posten finns men vi vet inte vem den
tillhör" inte är en post.

**AVAILABLE PROVIDER OBSERVATION**
En avläsning som providers legitimt skiljer sig åt om. Bärs som `Available<T>`.

### F1.1 Slutna vokabulärer bär UNKNOWN in-band

Ett fält vars värdemängd är en sluten uppräkning (`PositionSide`, `OrderStatus`, …) bär
`UNKNOWN` **inuti** uppräkningen och wrappas inte i `Available<T>`. Ett fält med öppen
värdemängd (pris, kvantitet, tidpunkt, symbol) använder `Available<T>`.

Aldrig båda. `Available<PositionSide>` med `UNKNOWN` i uppräkningen ger fyra sätt att säga
"vet inte" och noll sätt att veta vilket som gällde.

### F1.2 Förbjudna substitutioner

Följande är förbjudet i varje normalisering, oavsett bekvämlighet:

```
UNKNOWN      → 0
UNAVAILABLE  → 0
UNKNOWN      → null
UNAVAILABLE  → null
UNKNOWN      → ""
UNKNOWN      → false
saknad post  → []
```

Den sista är den farligaste: en tom lista är påståendet *"providern rapporterade ingenting"*,
inte *"vi kunde inte fråga"*.

---

## F2. Result&lt;T&gt; och ProviderError

`Result<T>` **tillhör provider-kontraktets domän**. Den är inte en repo-global
generisk utility och får inte exporteras som sådan; ingen annan del av Trading Core
uttrycker sina utfall genom den idag, och att göra den global vore en arkitekturändring
som ingen låst canon begär.

```
Result<T> =
  | { ok: true;  value: T }
  | { ok: false; error: ProviderError }

ProviderError {
  reasonCode : ReasonCode      REQUIRED
  message    : string          REQUIRED
}
```

**Kanonisk regel.** `ProviderError.message` är **enbart** operatörs- och felsökningstext.
Den får aldrig vara beslutsunderlag. Allt som ett beslut vilar på bärs av `reasonCode`.
Detta är v1.0 §8 ordagrant: *"Adaptern får inte läcka providerspecifika felsträngar som
beslutsunderlag."*

**Medvetet uteslutet** ur `ProviderError`, eftersom ingen låst canon kräver det:

| Uteslutet | Skäl |
|---|---|
| `retryable` | Retry-policy är en konsumentfråga; en flagga här flyttar policyn in i porten |
| HTTP-status / transportstatus | Transportdetaljer hör inte hemma ovanför adaptern (§9) |
| exception-klasser | `Result<T>` är utfallet; ett parallellt kastvägnät ger två felmodeller |
| provider-native felkoder | §8 förbjuder providerspecifika koder som beslutsunderlag |

Rå providerrespons får bevaras för journalen där det är säkert (v1.0 §8), men inte i
`ProviderError`.

---

## F3. ProviderHealth

v1.0 är motstridig här: §7 anger `ProviderHealth | Verdict | ALLOW / DENY / UNKNOWN`, medan
§4 kräver att adaptern *"ska rapportera `SECURITY_DEGRADED` på sin health-yta"*. En naken
treställig `Verdict` kan inte bära en reason code.

v1.1 löser det som en **strukturerad health-yta som innehåller en Verdict**:

```
ProviderHealth {
  verdict     : Verdict                    REQUIRED   ALLOW | DENY | UNKNOWN
  reasonCodes : readonly ReasonCode[]      REQUIRED   får vara tom
  observedAt  : Timestamp                  REQUIRED
}
```

`SECURITY_DEGRADED` rapporteras i `reasonCodes`.

**Låst invariant:** `SECURITY_DEGRADED` skapar **aldrig** execution authority. Det är hela
dess innebörd — en registrerad försvagning av least-privilege (v1.0 §4).

**Vad v1.1 avsiktligt inte avgör:** huruvida en specifik nedströms säkerhetspolicy ska
fail closed på grund av försvagningen. Health-ytan *rapporterar* degraderingen; om en given
policy måste blockera på den är ett separat policybeslut, fattat i auktoritetskedjan. En
datamodell ska inte föregripa ett universellt blockerande eller icke-blockerande beteende, och
denna gör det inte i någon riktning.

En tom `reasonCodes` tillsammans med `verdict: ALLOW` är ett positivt friskbesked. Den är
inte samma sak som `verdict: UNKNOWN`, som betyder att hälsan inte kunde fastställas.

**Medvetet uteslutet:** heartbeat-intervall, latensmått och uptime. GATE-16:s text nämner
*"health- och heartbeat-semantik"*, men den formuleringen spänner över både Level 1 och det
ospecificerade Level 2. Level 1 behöver dem inte för någon av sina femton metoder.

---

## F4. ProviderConfig och ProviderSession

Båda hålls abstrakta. Datamodell §8 är styrande: credentials lagras aldrig tillsammans med
vanlig metadata, endast **en referens till secret storage**.

```
ProviderConfig {
  providerId          : ProviderId           REQUIRED
  environment         : TradingEnvironment   REQUIRED   aldrig defaultad
  credentialSecretRef : string               REQUIRED   opak referens, ALDRIG en hemlighet
}
```

| Fält | Motivering |
|---|---|
| `providerId` | §7 kräver en branded id som identifierar adaptern, inte kontot |
| `environment` | §6: `getEnvironment()` returnerar aldrig ett default; konfigurationen måste därför säga vilket som begärs |
| `credentialSecretRef` | Datamodell §8-mönstret `credential_secret_ref`. Aldrig hostname, lösenord, API-nyckel, token eller URL |

**Avvisat vid granskning inför Beslut F:** ett `requestedCredentialMode`-fält. Det var härlett ur ordvalet
*"det resolverade läget"* i §4 och inte tvingat av någon låst canon. Det finns inget
begärt-läge-protokoll i Level 1, och v1.1 inför inget — varken under det namnet eller
som `requiredCredentialMode`, `preferredCredentialMode` eller `credentialPolicy`.

Providern rapporterar det **faktiska** resolverade läget. Om det läget är bredare än least
privilege rapporteras `SECURITY_DEGRADED` på health-ytan. Det är hela mekanismen.

```
ProviderSession {
  providerId             : ProviderId           REQUIRED
  sessionRef             : string               REQUIRED   opak, provider-native
  environment            : TradingEnvironment   REQUIRED
  resolvedCredentialMode : CredentialMode       REQUIRED
  establishedAt          : Timestamp            REQUIRED
}
```

`ProviderSession` är ett **frozen record**, inte ett handtag. Den har inga metoder, bär ingen
token och kan inte anropas. Att inneha en session är inte auktoritet: `ExecutionIntent` skapas
fortfarande enbart av `openExecutionGate` (v1.0 §2), och en session är inte en av dess indata.

`resolvedCredentialMode` är det faktiska läge providern försåg sessionen med. Är det bredare
än least privilege rapporteras `SECURITY_DEGRADED` på health-ytan (§4). Jämförelsen görs mot
least privilege, inte mot ett begärt läge — Level 1 har inget sådant.

---

## F5. ProviderIdentity

Identifierare och etiketter hålls isär. Datamodell §4: identifierare får inte baseras enbart
på namn.

```
ProviderIdentity {
  providerId      : ProviderId            REQUIRED   stabil identitet
  displayLabel    : string                REQUIRED   människoläsbar — ALDRIG en identifierare
  environment     : TradingEnvironment    REQUIRED
  providerVersion : Available<string>     providerns egen API-/protokollversion, om rapporterad
  observedAt      : Timestamp             REQUIRED
}
```

Session- och credential-identitet ingår **inte**. De hör till `ProviderSession` respektive
`ProviderConfig`, och en identitet som bar dem skulle göra provideridentitet beroende av vem
som var inloggad.

---

## F6. ProviderClock och ProviderTimestamp

v1.0 §7: *"`ProviderTimestamp` / `ProviderClock` | `Timestamp` + mätt skew | Providerklocka
bärs skild från lokal."*

```
ProviderTimestamp = branded Timestamp
```

**Låst semantik.** `ProviderTimestamp` är en timestamp vars **källa är providerns rapporterade
klocka**. Brandingen uttrycker härkomst — ingenting annat.

`ProviderTimestamp` är **inte**:

| Inte | Varför det är värt att säga |
|---|---|
| ett annat wire-format | `Timestamp` och `ProviderTimestamp` får dela samma canonical serialiseringsformat |
| ett färskhetsbevis | Att providern rapporterade en tid säger ingenting om hur aktuell den är |
| ett förtroendebevis | Kontraktet bär avläsningen, inte ett påstående om att den är korrekt |
| ett clock-sync-bevis | Skew mäts separat och kan vara UNKNOWN |

De är **separata nominella typer**, inte alias. Regler:

```
lokal Timestamp blir implicit ProviderTimestamp     ✗ förbjudet
wall-clock-fallback till ProviderTimestamp          ✗ förbjudet
```

`ProviderClock` bär provider-tidsobservationer. Färskhet härleds **nedströms**, från en
explicit timestamp plus en referenstidpunkt som anroparen tillhandahåller — aldrig här, och
aldrig från en wall clock.

```
ProviderClock {
  providerTime : ProviderTimestamp     REQUIRED   vad providern säger att klockan är
  observedAt   : Timestamp             REQUIRED   Omniras egen inspelningstidpunkt för avläsningen
  skewMs       : Available<Decimal>    uppmätt providerTime − observedAt, i millisekunder
}
```

**Kanoniska regler.**

- Skew är **uppmätt**, aldrig antagen. `UNKNOWN` skew blir aldrig 0.
- Ingen wall-clock-fallback. `getProviderTime()` returnerar vad providern rapporterade; om den
  inte rapporterar något failar anropet med `ProviderError`.
- Att providern rapporterar en tid är inte ett påstående om att tiden är korrekt. Kontraktet
  bär avläsningen, inte ett förtroende.

---

## F7. HistoryWindowCapability

Kompletterar `ProviderCapabilities` (v1.0 §3.1), som är det enda fältet där v1.0 refererar en
odefinierad typ.

```
HistoryWindowCapability {
  state          : CapabilityState        REQUIRED
  maxLookbackMs  : Available<Decimal>     längsta fönster providern betjänar
  supportsCursor : CapabilityState        REQUIRED   om HistoryRequest.cursor hedras
}
```

| Fält | Motivering |
|---|---|
| `state` | Alla övriga capability-fält i §3.1 är `CapabilityState`; detta måste kunna säga UNSUPPORTED |
| `maxLookbackMs` | §7.2: *"Inget antagande om obegränsad historik finns någonstans"* |
| `supportsCursor` | §7.2 definierar `HistoryRequest.cursor` och `FillHistory.nextCursor`; om providern hedrar dem är en capability-fråga |

**Avvisat vid granskning inför Beslut F:** `maxPageSize`. Det var en följdfråga till paginering, inte ett krav
i v1.0. Sidstorleksgränser införs först när ett faktiskt providerkrav gör dem nödvändiga.

Säkerhetsregeln från §3 gäller oförändrat: endast `SUPPORTED` uppfyller ett
säkerhetskritiskt krav. `CONDITIONAL` och `UNKNOWN` fail closed.

---

## F8. AccountRef och ProviderAccountSnapshot

### F8.1 Namnkollision — förslag som kräver beslut

v1.0 §6 skriver `getAccountSnapshot(a: AccountId) : Result<AccountSnapshot>`.

**Datamodell v0.1 §65 definierar redan en `AccountSnapshot`** — Omniras egen
persistensentitet med fälten `account_id`, `timestamp`, `balance`, `equity`, `realized_pnl`,
`unrealized_pnl`, `daily_pnl`, `drawdown`, `margin`, `free_margin`, `open_positions`.

De två är inte samma sak:

| | Datamodell §65 | Provider-observation |
|---|---|---|
| Ägare | Persistensmodellen | Provider-kontraktet |
| Fälten | Bara värden | `Available<T>` där providers skiljer sig |
| `daily_pnl`, `drawdown` | Omnira-härledda (jfr §66) | Får inte förekomma — se F8.3 |
| Ändamål | Vad Omnira lagrar | Vad providern rapporterade vid ett ögonblick |

**BESLUTAT — returtypen heter `ProviderAccountSnapshot`.**

Godkänt vid granskning av Beslut F. Klassning: **INTENTIONAL v1.1 CHANGE**. Det är
v1.1:s enda ändring av en låst v1.0-signatur, och den genomförs uttryckligen, inte tyst.

**Kanonisk regel — de två typerna är skilda och får aldrig alias:as.**

```
AccountSnapshot            Persistence Datamodel §65 — vad Omnira lagrar
ProviderAccountSnapshot    Provider Contract        — vad providern rapporterade

type ProviderAccountSnapshot = AccountSnapshot     ✗ förbjudet
type AccountSnapshot = ProviderAccountSnapshot     ✗ förbjudet
den ena re-exporteras som den andra                ✗ förbjudet
```

Samma ägarskapsregel som gäller `Available<T>` kontra `ObservedValue<T>` (F14.1): identisk
eller liknande form betyder inte identiskt ägarskap. En provider-observation och en
persistensrad är olika påståenden om världen.

### F8.2 AccountRef

```
AccountRef {
  accountId          : AccountId             REQUIRED   Omnira branded, providerns id mappas in
  providerAccountRef : string                REQUIRED   opak provider-native referens
  environment        : TradingEnvironment    REQUIRED
  displayLabel       : Available<string>     människoläsbar kontoetikett, om rapporterad
}
```

`providerAccountRef` motsvarar Datamodell §7:s `external_account_reference`. Den är opak och
får inte tolkas ovanför adaptern.

### F8.3 ProviderAccountSnapshot

```
ProviderAccountSnapshot {
  accountId          : AccountId                      REQUIRED
  providerAccountRef : string                         REQUIRED   opak
  environment        : TradingEnvironment             REQUIRED   aldrig defaultad
  currency           : Available<string>
  balance            : Available<Decimal>
  equity             : Available<Decimal>
  realizedPnl        : Available<Decimal>
  unrealizedPnl      : Available<Decimal>
  margin             : Available<Decimal>
  freeMargin         : Available<Decimal>
  observedAt         : Timestamp                      REQUIRED
  providerTime       : Available<ProviderTimestamp>
}
```

**Medvetet uteslutna fält ur Datamodell §65**, med skäl:

| Uteslutet | Skäl |
|---|---|
| `daily_pnl` | Omnira-härlett. Datamodell §66 håller daily risk state separat just för att prop firms räknar annorlunda. En provider-siffra här skulle bli ett dolt beräkningsantagande |
| `drawdown` | Samma. Beräkningsmetod är en riskfråga, inte en provider-observation |
| `open_positions` | Besvaras av `getPositions()`. Att duplicera den här skapar två källor som kan säga olika saker |

**Kanonisk regel.** Ingen provider-snapshot får innehålla ett Omnira-härlett värde förklätt
till providerfaktum.

---

## F9. ContractSpec och ContractRef

```
ContractSpec {
  instrumentId    : InstrumentId          REQUIRED   Omniras canonical instrument
  canonicalSymbol : string                REQUIRED   Datamodell §10 canonical_symbol
  expiration      : Available<Timestamp>  explicit serieval, när det är känt
  providerSymbol  : Available<string>     explicit mappning, Datamodell §11
}

ContractRef {
  contractId         : ContractId    REQUIRED   Omnira branded, kontraktsnivå
  instrumentId       : InstrumentId  REQUIRED
  providerContractId : string        REQUIRED   opak provider-native
  resolvedAt         : Timestamp     REQUIRED
}
```

**Kanonisk regel — fail closed vid tvetydighet.** `resolveContract` löser ett kontrakt genom
**explicit mappning**, aldrig genom heuristik. Om `ContractSpec` inte entydigt identifierar
exakt ett kontrakt — varken `expiration` eller `providerSymbol` är PRESENT och ingen låst
seriepolicy finns — failar anropet med `INVALID_INSTRUMENT_STATE`. Det gissar aldrig.

Förbjudet i varje implementation av denna metod:

```
front month-algoritm            ✗
continuous contract-mappning    ✗
symbolprefix-heuristik          ✗   t.ex. startsWith("NQ") → NQ
rollover-kalender               ✗
```

Dessa hör till **GATE-08**, vars scope förtydligades 2026-08-28 till att omfatta contract
rollover. v1.1 definierar resolutions*typerna*, inte resolutions*policyn*.
**GATE-08 förblir öppen.**

---

## F10. PositionSnapshot

Den mest konsekvensrika typen i v1.1, eftersom den är den enda providerobservation som
Fas 2 faktiskt behöver först.

**Den definieras oberoende av Datamodell §40 `Position`.** §40 beskriver Omniras lagrade
brokerposition och innehåller `originating_trade_id` — ett fält ingen provider kan känna till.
En provider-snapshot som krävde det vore omöjlig att uppfylla ärligt.

```
PositionSide  = LONG | SHORT | UNKNOWN
PositionState = OPEN | CLOSED | UNKNOWN

PositionSnapshot {
  positionId          : PositionId                    REQUIRED   Omnira branded, providerns id mappas in
  providerPositionRef : string                        REQUIRED   opak provider-native
  accountId           : AccountId                     REQUIRED
  contractId          : ContractId                    REQUIRED   futuresidentitet är kontraktsnivå
  instrumentId        : Available<InstrumentId>       canonical instrument, när resolution lyckats
  side                : PositionSide                  REQUIRED   sluten vokabulär, UNKNOWN in-band
  state               : PositionState                 REQUIRED   sluten vokabulär, UNKNOWN in-band
  quantity            : Available<Decimal>
  averageEntry        : Available<Decimal>
  lastPrice           : Available<Decimal>
  unrealizedPnl       : Available<Decimal>
  stopLoss            : Available<Decimal>
  takeProfit          : Available<Decimal>
  openedAt            : Available<Timestamp>
  observedAt          : Timestamp                     REQUIRED
  providerTime        : Available<ProviderTimestamp>
}
```

### F10.1 Motivering per fält

| Fält | Klass | Motivering |
|---|---|---|
| `positionId` | REQUIRED | Datamodell §4: stabila identifierare. En position utan identitet kan inte reconcilas |
| `providerPositionRef` | REQUIRED | §7: provider-ids mappas in, ersätter aldrig Omniras. Opak ovanför adaptern |
| `accountId` | REQUIRED | Utan konto kan exponeringen inte attribueras. Attribution är inte valfri |
| `contractId` | REQUIRED | v1.0 §6: *"futuresidentitet är kontraktsnivå"* |
| `instrumentId` | Available | Kontraktet kan vara observerat innan det resolverats mot ett canonical instrument. Att kräva det skulle göra GATE-08 blockerande för observation |
| `side` / `state` | REQUIRED, UNKNOWN in-band | Slutna vokabulärer, F1.1 |
| `quantity` … `openedAt` | Available | Providers skiljer sig legitimt. Stage 1.7 visar redan fallet: en provider som inte rapporterar orealiserad P/L eller target |
| `observedAt` | REQUIRED | En observation utan tidpunkt kan inte bedömas för färskhet |
| `providerTime` | Available | §7: providerklocka bärs skild från lokal, och alla providers rapporterar inte sin egen |

**Avvisat vid granskning inför Beslut F: `FLAT` som `PositionSide`-värde.**

`PositionSide` uttrycker riktningen hos en **faktisk position**, ingenting annat. Känt flat är
inte en positionsriktning — det är ett utfall av observationen som helhet:

```
KÄNT FLAT   =  observationen lyckades  +  noll positioner
            =  Result ok: true, value: []
```

Att också tillåta `PositionSnapshot(side = FLAT)` skulle ge **två representationer av samma
verklighet**, och därmed två sätt för konsumenter att räkna fel. Stage 1.7 låste redan
distinktionen i replay-lagret: *känt flat är inte samma sak som otillgängligt*. Provider-lagret
uttrycker den på exakt ett sätt — en tom lista i ett lyckat `Result`, aldrig en post med
riktning FLAT, och aldrig en tom lista i ett misslyckat `Result`.

### F10.2 Medvetet uteslutna fält

| Uteslutet | Skäl |
|---|---|
| `originating_trade_id` (Datamodell §40) | En provider kan inte känna till vilken Omnira-trade som orsakade positionen |
| `unattributed` (Stage 1.7 `ObservedPosition`) | Det är en **replay-lagerbedömning**: resultatet av att jämföra providersanning mot Omniras planer. Som providerfält vore det ett Omnira-omdöme förklätt till observation |
| `freshness` (Stage 1.7 `ObservedPosition`) | Färskhet är inte ett providerfält — se F10.3 |
| `note` (Stage 1.7 `ObservedPosition`) | Presentationstext. Hör till replay-lagret |

**Kanonisk regel.** Provider-snapshot och replay-observation är skilda lager. Ett fält får
inte läggas till i `PositionSnapshot` enbart därför att `ObservedPosition` har det.

### F10.3 Färskhet härleds, den observeras inte

`PositionSnapshot` bär **ingen** `freshness`. Färskhet är en funktion av `observedAt` och en
referenstidpunkt som konsumenten tillhandahåller:

```
freshness = f(observedAt, referensinstant)
```

Referensinstanten skickas in. Den läses aldrig från en wall clock inuti normaliseringen,
eftersom en normalisering som läser `Date.now()` ger olika resultat vid varje körning och
därmed inte kan reproduceras i en journal.

---

## F11. OrderSnapshot och FillSnapshot

Rena observationstyper. **En `OrderSnapshot` är inte ett orderkommando och en `FillSnapshot`
är inte en exekveringsbegäran.** Ingen av dem har anropbara medlemmar, och ingen av dem kan
skickas någonstans.

```
OrderSide   = BUY | SELL | UNKNOWN
OrderType   = MARKET | LIMIT | STOP | STOP_LIMIT | OTHER | UNKNOWN
OrderStatus = WORKING | PARTIALLY_FILLED | FILLED | CANCELLED | REJECTED | UNKNOWN

OrderSnapshot {
  orderId          : OrderId                        REQUIRED   Omnira branded
  providerOrderRef : string                         REQUIRED   opak
  accountId        : AccountId                      REQUIRED
  contractId       : ContractId                     REQUIRED
  side             : OrderSide                      REQUIRED
  orderType        : OrderType                      REQUIRED
  status           : OrderStatus                    REQUIRED
  quantity         : Available<Decimal>
  filledQuantity   : Available<Decimal>
  limitPrice       : Available<Decimal>
  stopPrice        : Available<Decimal>
  submittedAt      : Available<Timestamp>
  observedAt       : Timestamp                      REQUIRED
  providerTime     : Available<ProviderTimestamp>
}
```

`OTHER` i `OrderType` är avsiktligt. En provider kan rapportera en ordertyp Omnira inte
modellerar; att tvinga in den i `MARKET` vore en tyst felöversättning, och `UNKNOWN` betyder
något annat — att typen inte rapporterades alls.

`getWorkingOrders` returnerar de ordrar providern anser levande. Statusvokabulären är bredare
än så, vilket gör att en snapshot tagen i samma ögonblick som en fyllning aldrig behöver ljuga.

```
FillSnapshot {
  fillId          : FillId                          REQUIRED   Omnira branded
  providerFillRef : string                          REQUIRED   opak
  accountId       : AccountId                       REQUIRED
  contractId      : ContractId                      REQUIRED
  orderId         : Available<OrderId>              providern korrelerar inte alltid fill mot order
  side            : OrderSide                       REQUIRED
  quantity        : Available<Decimal>
  price           : Available<Decimal>
  commission      : Available<Decimal>
  fee             : Available<Decimal>
  filledAt        : Available<Timestamp>
  observedAt      : Timestamp                       REQUIRED
  providerTime    : Available<ProviderTimestamp>
}
```

**Medvetet uteslutet ur Datamodell §39:** `spread_cost` och `slippage`. Båda är
Omnira-härledda analysmått som kräver en referens providern inte har. De hör till
execution-quality-analysen, inte till observationen.

---

## F12. ReadOnlyReconciliation

I Level 1 betyder *reconcile* **jämför och rapportera**. Ingenting annat.

```
ReconciliationStatus = AGREED | DISCREPANCY | INDETERMINATE

DiscrepancyKind =
  | POSITION_MISSING_AT_PROVIDER
  | POSITION_MISSING_IN_OMNIRA
  | POSITION_QUANTITY_MISMATCH
  | POSITION_SIDE_MISMATCH
  | ORDER_MISSING_AT_PROVIDER
  | ORDER_MISSING_IN_OMNIRA
  | UNKNOWN

ReconciliationDiscrepancy {
  kind       : DiscrepancyKind          REQUIRED
  reasonCode : ReasonCode               REQUIRED
  contractId : Available<ContractId>
  positionId : Available<PositionId>
  orderId    : Available<OrderId>
  detail     : string                   REQUIRED   operatörstext — ALDRIG beslutsunderlag
}

ReadOnlyReconciliation {
  accountId     : AccountId                                REQUIRED
  status        : ReconciliationStatus                     REQUIRED
  discrepancies : readonly ReconciliationDiscrepancy[]     REQUIRED   får vara tom
  startedAt     : Timestamp                                REQUIRED
  completedAt   : Timestamp                                REQUIRED
  observedAt    : Timestamp                                REQUIRED
}
```

**Kanonisk regel — AGREED är inte samma sak som INDETERMINATE.**

```
status: AGREED,        discrepancies: []   =  jämförelsen gjordes och allt stämde
status: INDETERMINATE, discrepancies: []   =  jämförelsen kunde inte genomföras
```

En tom avvikelselista betyder ingenting utan sin status. Detta är samma invariant som
Stage 1.7 låste för positionsobservation: *tomt är inte okänt*.

**Level 1-reconciliation får inte:**

```
reparera state           ✗
mutera providerstate     ✗
avbryta ordrar           ✗
stänga positioner        ✗
skapa ExecutionIntent    ✗
```

Datamodell §68 säger att ny execution blockeras om kritisk discrepancy kvarstår. Det är ett
beslut i auktoritetskedjan, fattat **ovanför** adaptern på grundval av denna rapport. Adaptern
rapporterar; den blockerar inte, och den åtgärdar inte.

---

## F13. Reason codes

v1.0 §8 kräver att minst följande situationer kan uttryckas. Kolumnen längst till höger visar
status i Trading Cores befintliga register (`lib/trading/reason-codes.ts`) per 2026-08-29.

| Situation | Kod | Finns i Core |
|---|---|---|
| Ej ansluten | `PROVIDER_DISCONNECTED` | **NEJ — måste tillkomma** |
| Stale state | `STALE_ACCOUNT_DATA` / `STALE_MARKET_DATA` | Ja |
| Okänt environment | `ENVIRONMENT_UNKNOWN` | Ja |
| Kontomatchning misslyckas | `ACCOUNT_MISMATCH` | Ja |
| Instrument ej resolvbart | `INVALID_INSTRUMENT_STATE` | Ja |
| Capability ej `SUPPORTED` | `VERDICT_UNKNOWN` | Ja |
| Credential bredare än begärt | `SECURITY_DEGRADED` | **NEJ — måste tillkomma** |

**Föreslagen ändring av Trading Core vid promotion:** exakt två koder läggs till i
`CORE_REASON_CODES` — `PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED`. Inga andra.

v1.1 har genomsökts för utfall som skulle kräva ytterligare koder. Inga hittades:
tvetydig kontraktsresolution uttrycks med `INVALID_INSTRUMENT_STATE`, och
`INDETERMINATE` reconciliation med `VERDICT_UNKNOWN` respektive `STALE_ACCOUNT_DATA`.

Core får **inte** ändras förrän denna kandidat är låst.

---

## F14. Typägarskap

Varje typ har exakt en ägare. Tabellen finns för att förhindra att lager av misstag börjar
alias:a varandra.

| Typ | Ägare | Status i v1.1 |
|---|---|---|
| `AccountId` | Trading Core primitive | REUSED |
| `InstrumentId` | Trading Core primitive | REUSED |
| `PositionId` | Trading Core primitive | REUSED |
| `OrderId` | Trading Core primitive | REUSED |
| `FillId` | Trading Core primitive | REUSED |
| `Decimal` | Trading Core primitive | REUSED |
| `Timestamp` | Trading Core primitive | REUSED |
| `TradingEnvironment` | Trading Core primitive | REUSED |
| `Verdict` | Trading Core primitive | REUSED |
| `ReasonCode` | Trading Core primitive | REUSED — **utökas med två koder** (F13) |
| `ProviderId` | Provider Contract | NEW branded id |
| `ContractId` | Provider Contract | NEW branded id |
| `ProviderTimestamp` | Provider Contract | NEW branded Timestamp |
| `Available<T>` | Provider Contract | **Återgiven i §5** — oförändrad från v1.0 |
| `CapabilityState` | Provider Contract | **Återgiven i §3** — oförändrad från v1.0 |
| `CredentialMode` | Provider Contract | **Återgiven i §4** — oförändrad från v1.0 |
| `Result<T>` | Provider Contract | NEW (Beslut F) — **domänlokal, ej repo-global**. Portens metoder returnerar `Promise<Result<T>>` (§6) |
| `ProviderError` | Provider Contract | NEW |
| `ProviderConfig` · `ProviderSession` · `ProviderIdentity` · `ProviderHealth` · `ProviderClock` | Provider Contract | NEW |
| `HistoryWindowCapability` | Provider Contract | NEW |
| `AccountRef` · `ProviderAccountSnapshot` | Provider Contract | NEW |
| `ContractSpec` · `ContractRef` | Provider Contract | NEW |
| `ContractSnapshot` · `HistoryRequest` · `FillHistory` | Provider Contract | **Återgivna i §7.1 / §7.2** — oförändrade från v1.0 |
| `ProviderCapabilities` | Provider Contract | **Återgiven i §3.1** — oförändrad från v1.0 |
| `PositionSnapshot` · `OrderSnapshot` · `FillSnapshot` | Provider Contract | NEW |
| `ReadOnlyReconciliation` · `ReconciliationDiscrepancy` | Provider Contract | NEW |
| `PositionSide` · `PositionState` · `OrderSide` · `OrderType` · `OrderStatus` · `ReconciliationStatus` · `DiscrepancyKind` | Provider Contract | NEW slutna vokabulärer |
| `AccountSnapshot` (§65) | Persistence Datamodel | REUSED — **ej** provider-typen. Se F8.1 |
| `Position` (§40) | Persistence Datamodel | REUSED — **ej** `PositionSnapshot` |
| `Order` (§38) · `Fill` (§39) | Persistence Datamodel | REUSED — **ej** `OrderSnapshot` / `FillSnapshot` |
| `Reconciliation Record` (§68) | Persistence Datamodel | REUSED — **ej** `ReadOnlyReconciliation` |
| `ObservedValue<T>` | Replay Observation | REUSED — **separat från `Available<T>`** |
| `ObservedPosition` | Replay Observation | REUSED — **separat från `PositionSnapshot`** |

### F14.1 Available&lt;T&gt; och ObservedValue&lt;T&gt; förblir skilda

Båda har idag tre lägen med samma namn. **Identisk form betyder inte identiskt ägarskap.**

```
Available<T>       provider-/adaptervokabulär   — vad providern rapporterade
ObservedValue<T>   replay-/operatörsvokabulär   — vad Omnira observerade i sin egen tidslinje
```

Förbjudet:

```
type ObservedValue<T> = Available<T>              ✗
ObservedValue flyttas in i provider-kontraktet     ✗
replay importerar provideradaptervokabulär         ✗
den ena re-exporteras som den andra                ✗
```

En explicit förlustfri mappning `Available<T> → ObservedValue<T>` hör hemma i
normaliseringslagret och specificeras när det lagret byggs. v1.1 definierar gränsen,
inte mappningen.

---

## F15. Level 1-gränssnittet, med sluten vokabulär

Identiskt med v1.0 §6 i **namn, antal och ansvar**. Två skillnader, båda beslutade:

1. Varje refererad typ har nu en definition i detta dokument (Beslut F, och Beslut G1–G2 för
   de sju som återges i Del I).
2. Returtyperna är asynkrona (Beslut G3–G5, §6).

`AccountSnapshot` visas som `ProviderAccountSnapshot` enligt det godkända beslutet i F8.1,
och är den **enda** ändringen av en parameter- eller resultattyp utöver Promise-wrappningen.

```
interface ExecutionProviderAdapter {

  // — session ———————————————————————————————
  connect(config: ProviderConfig)      : Promise<Result<ProviderSession>>
  disconnect()                         : Promise<void>

  // — identitet, bevisas innan något state litas på ——
  getProviderIdentity()                : Promise<Result<ProviderIdentity>>
  getEnvironment()                     : Promise<Result<TradingEnvironment>>
  getCapabilities()                    : Promise<Result<ProviderCapabilities>>
  getHealth()                          : Promise<Result<ProviderHealth>>
  getProviderTime()                    : Promise<Result<ProviderClock>>

  // — konton ——————————————————————————————
  getAccounts()                        : Promise<Result<readonly AccountRef[]>>
  getAccountSnapshot(a: AccountId)     : Promise<Result<ProviderAccountSnapshot>>

  // — kontrakt: futuresidentitet är kontraktsnivå ——
  resolveContract(spec: ContractSpec)  : Promise<Result<ContractRef>>
  getContractSnapshot(c: ContractId)   : Promise<Result<ContractSnapshot>>

  // — observerat state ————————————————————————
  getPositions(a: AccountId)           : Promise<Result<readonly PositionSnapshot[]>>
  getWorkingOrders(a: AccountId)       : Promise<Result<readonly OrderSnapshot[]>>
  getRecentFills(a: AccountId,
                 window: HistoryRequest): Promise<Result<FillHistory>>

  // — reconciliation ——————————————————————————
  reconcileReadOnlyState(a: AccountId) : Promise<Result<ReadOnlyReconciliation>>
}
```

**Parameterlistan är oförändrad från v1.0 §6.** `getRecentFills` behåller båda sina
parametrar — `accountId` och `window`. Att slå ihop dem till enbart en `HistoryRequest`
skulle ta bort informationen om *vems* fills som efterfrågas, vilket vore en ändring av
affärssemantik och inte av portsemantik.

Noll order-metoder. `submitOrder`, `modifyOrder`, `cancelOrder`, `preflightOrder`,
`replaceOrder`, `flatten` och `closePosition` är **frånvarande** — inte avstängda, inte
skyddade.

Exakt **fjorton** metoder returnerar `Promise<Result<...>>`. Exakt **en** returnerar
`Promise<void>`: `disconnect`. **Noll** metoder är synkrona.

### F15.1 Closure-tabell

Varje metod, varje beroende, och den sektion som definierar det.

| # | Metod | Returtyp | Beroenden → definierande sektion |
|---|---|---|---|
| 1 | `connect` | `Promise<Result<ProviderSession>>` | `Result` F2 · `ProviderError` F2 · `ProviderConfig` F4 · `ProviderSession` F4 · `ProviderId` F14 · `TradingEnvironment` Core · `CredentialMode` §4 · `Timestamp` Core |
| 2 | `disconnect` | `Promise<void>` | — |
| 3 | `getProviderIdentity` | `Promise<Result<ProviderIdentity>>` | `Result` F2 · `ProviderIdentity` F5 · `ProviderId` F14 · `TradingEnvironment` Core · `Available` §5 · `Timestamp` Core |
| 4 | `getEnvironment` | `Promise<Result<TradingEnvironment>>` | `Result` F2 · `TradingEnvironment` Core |
| 5 | `getCapabilities` | `Promise<Result<ProviderCapabilities>>` | `Result` F2 · `ProviderCapabilities` §3.1 · `CapabilityState` §3 · `CredentialMode` §4 · `HistoryWindowCapability` **F7** · `Available` §5 · `Decimal` Core · `Timestamp` Core |
| 6 | `getHealth` | `Promise<Result<ProviderHealth>>` | `Result` F2 · `ProviderHealth` **F3** · `Verdict` Core · `ReasonCode` Core · `Timestamp` Core |
| 7 | `getProviderTime` | `Promise<Result<ProviderClock>>` | `Result` F2 · `ProviderClock` **F6** · `ProviderTimestamp` F6 · `Available` §5 · `Decimal` Core · `Timestamp` Core |
| 8 | `getAccounts` | `Promise<Result<readonly AccountRef[]>>` | `Result` F2 · `AccountRef` **F8.2** · `AccountId` Core · `TradingEnvironment` Core · `Available` §5 |
| 9 | `getAccountSnapshot` | `Promise<Result<ProviderAccountSnapshot>>` | `Result` F2 · `ProviderAccountSnapshot` **F8.3** · `AccountId` Core · `TradingEnvironment` Core · `Available` §5 · `Decimal` Core · `Timestamp` Core · `ProviderTimestamp` F6 |
| 10 | `resolveContract` | `Promise<Result<ContractRef>>` | `Result` F2 · `ContractSpec` **F9** · `ContractRef` **F9** · `InstrumentId` Core · `ContractId` F14 · `Available` §5 · `Timestamp` Core |
| 11 | `getContractSnapshot` | `Promise<Result<ContractSnapshot>>` | `Result` F2 · `ContractSnapshot` §7.1 · `ContractId` F14 · `Available` §5 · `Decimal` Core · `Timestamp` Core |
| 12 | `getPositions` | `Promise<Result<readonly PositionSnapshot[]>>` | `Result` F2 · `PositionSnapshot` **F10** · `PositionSide` F10 · `PositionState` F10 · `PositionId` Core · `AccountId` Core · `ContractId` F14 · `InstrumentId` Core · `Available` §5 · `Decimal` Core · `Timestamp` Core · `ProviderTimestamp` F6 |
| 13 | `getWorkingOrders` | `Promise<Result<readonly OrderSnapshot[]>>` | `Result` F2 · `OrderSnapshot` **F11** · `OrderSide` F11 · `OrderType` F11 · `OrderStatus` F11 · `OrderId` Core · `AccountId` Core · `ContractId` F14 · `Available` §5 · `Decimal` Core · `Timestamp` Core · `ProviderTimestamp` F6 |
| 14 | `getRecentFills` | `Promise<Result<FillHistory>>` | `Result` F2 · `HistoryRequest` §7.2 · `FillHistory` §7.2 · `FillSnapshot` **F11** · `OrderSide` F11 · `FillId` Core · `OrderId` Core · `AccountId` Core · `ContractId` F14 · `Available` §5 · `Decimal` Core · `Timestamp` Core · `ProviderTimestamp` F6 |
| 15 | `reconcileReadOnlyState` | `Promise<Result<ReadOnlyReconciliation>>` | `Result` F2 · `ReadOnlyReconciliation` **F12** · `ReconciliationStatus` F12 · `ReconciliationDiscrepancy` F12 · `DiscrepancyKind` F12 · `ReasonCode` Core · `AccountId` Core · `ContractId` F14 · `PositionId` Core · `OrderId` Core · `Available` §5 · `Timestamp` Core |

**Closure-påstående.** Varje symbol i tabellen har exakt en definition, antingen i Trading
Cores befintliga primitiv, i Canonical v1.0, eller i denna kandidat. Ingen odefinierad symbol
återstår. Ingen signatur kräver ett osagt semantiskt beslut. Noll order-metoder existerar.

---

## F16. Konfliktkontroll

v1.1 är jämförd mot Canonical Level 1 v1.0, Canonical Amendments v1.0 / Beslut E,
Datamodell v0.1, Systemarkitektur v0.3, Risk Engine Specification Canonical v1.0 och
Open Implementation Gates v1.0.

| # | Iakttagelse | Klassning |
|---|---|---|
| 1 | De 15 metoderna, deras namn och ansvar | NO CONFLICT — oförändrade |
| 2 | Noll order-metoder | NO CONFLICT — förstärkt, `replaceOrder`/`flatten`/`closePosition` uttryckligen namngivna som frånvarande |
| 3 | Auktoritetsgränsen (v1.0 §2, Beslut E2) | NO CONFLICT — `ProviderSession` kan inte minta capability |
| 4 | `CapabilityState`, `Available<T>`, `CredentialMode`, `FillHistory.completeness` | NO CONFLICT — ordagrant bevarade från v1.0 och Beslut E1 |
| 5 | `ProviderHealth`: v1.0 §7 antyder `Verdict`, §4 kräver `SECURITY_DEGRADED` på health-ytan | **CLARIFICATION** — löst som strukturerad yta som *innehåller* en Verdict. Ingen av sektionerna motsägs |
| 6 | `ProviderTimestamp` som egen branded typ | **CLARIFICATION** — v1.0 §7 säger "bärs skild från lokal"; branding är den mekanism som gör påståendet kontrollerbart |
| 7 | Returtypen `AccountSnapshot` → `ProviderAccountSnapshot` | **INTENTIONAL v1.1 CHANGE** — enda signaturändringen. **Godkänd vid granskning.** Namnkollision med Datamodell §65 undanröjd; inget alias tillåts (F8.1) |
| 8 | `PositionSnapshot` utesluter `originating_trade_id` (Datamodell §40) | NO CONFLICT — §40 är persistensentitet, inte provider-observation. Ägarskapet är nu explicit i F14 |
| 9 | `ProviderAccountSnapshot` utesluter `daily_pnl` och `drawdown` (Datamodell §65) | **CLARIFICATION** — Datamodell §66 håller redan daily risk state separat eftersom beräkningsmetoden skiljer sig; v1.1 följer den befintliga separationen |
| 10 | `FillSnapshot` utesluter `spread_cost` och `slippage` (Datamodell §39) | **CLARIFICATION** — härledda analysmått, inte providerfakta |
| 11 | Två nya reason codes i Trading Core | **INTENTIONAL v1.1 CHANGE** — direkt krävda av v1.0 §8; ändringen sker först vid promotion |
| 12 | `Result<T>` domänlokal, inte repo-global | NO CONFLICT — ingen låst canon begär en global utility |
| 13 | `resolveContract` failar closed vid tvetydighet; ingen rollover-policy | NO CONFLICT — GATE-08 förblir öppen och stängs inte av v1.1 |
| 14 | Systemarkitektur v0.3 §22 Read Adapter-ansvar (account, symbols, quotes, bars, ticks, orders, positions, history) | **CLARIFICATION — LÖST.** "Read Adapter" i §22 är en bredare arkitektonisk kategori än Level 1-porten. Quotes, bars och ticks tillhör marknadsdatagränsen, inte execution-provider-porten. Se F16.1 |
| 15 | GATE-16 stängdes 2026-08-28 på grundval av multi-provider-neutralitet | NO CONFLICT — se F17 |
| 16 | Risk Engine Canonical v1.0 | NO CONFLICT — v1.1 inför ingen riskberäkning och ingen daily-loss-tolkning |

| 17 | Aktiv canon krävde arkiverad canon för sju definitioner, medan `archive/README.md` förbjuder arkiverade filer som implementationsunderlag | **INTENTIONAL v1.2 CHANGE** — löst genom återgivning i Del I (Beslut G1–G2). Ingen definition ändrad |
| 18 | v1.0/v1.1 uttalade aldrig synkron eller asynkron port | **INTENTIONAL v1.2 CHANGE** — låst asynkron (Beslut G3–G5). Metodantal, ansvar, parametrar och felsemantik oförändrade |
| 19 | v1.0 §7 säger att observationer är immutabla; v1.1 bar inte över satsen, och ingen sade vad den betyder i TypeScript | **CLARIFICATION** — §7 återgiven, §10 låser readonly-transkription (Beslut G6) |
| 20 | Asynkronitet kontra auktoritetsgränsen | NO CONFLICT — §2 gäller oförändrat. En Promise kan inte minta en capability |
| 21 | Asynkronitet kontra transportval | NO CONFLICT — §6.1 slår fast att portsemantik inte implicerar transport, retry, timeout eller reconnect |

**Summering:** 21 punkter granskade — NO CONFLICT ×11 · CLARIFICATION ×6 ·
INTENTIONAL v1.1 CHANGE ×2 · INTENTIONAL v1.2 CHANGE ×2 · **UNRESOLVED CONFLICT ×0**.
Inga öppna frågor återstår.

### F16.1 Marknadsdatagränsen — löst

Systemarkitektur v0.3 §22 listar `quotes`, `bars` och `ticks` bland "Read Adapter"-ansvaret.
Level 1 Canonical v1.0 har ingen metod för någon av dem. Frågan lyftes i granskningen av
denna kandidat och **är nu avgjord.**

**Kanonisk klargöring.** "Read Adapter" i §22 är en **bredare arkitektonisk kategori** än
Level 1-porten. `ExecutionProviderAdapter` Level 1 äger providersidans read-only
*operationella state*:

```
identitet · environment · capabilities · health · providertid
konton · kontostate
kontraktsresolution · kontraktssnapshot
positioner
arbetande ordrar
nyliga fills
read-only reconciliation
```

Marknadsobservationer — `quotes`, `bars`, `ticks` — tillhör den **separata
marknadsdatagränsen**. De är inte nya metoder på den femtonmetoders execution-provider-porten,
och de läggs inte till.

Konsekvenser:

- **Metodantalet förblir femton.** v1.1 utökar inte porten.
- Omnira har redan en egen gräns för marknadsobservation (`MarketViewDataSource`), som är
  låst till att vara marknads-only och inte äga konton, positioner, ordrar eller fills.
- **GATE-08 stängs inte.** Valet av realtids-marknadsdataprovider, futureskontraktsserie och
  rolloverpolicy ligger kvar där, oförändrat.

Detta är en klargöring av var gränsen går, inte en ändring av vare sig §22 eller Level 1.

---

## F17. Gate-status

| Gate | Status | v1.1:s påverkan |
|---|---|---|
| **GATE-08** — realtids-marknadsdataprovider och kontraktsserie | **ÖPPEN** | Ingen. v1.1 definierar resolutions*typer*, inte resolutions*policy*. Front month, continuous contract, symbolprefix-heuristik och rollover-kalender förblir odefinierade |
| GATE-09 — första faktiska PropFirmProfile | ÖPPEN | Ingen |
| ~~GATE-16~~ — Execution Provider Adapter-kontrakt | STÄNGD 2026-08-28 | **Ingen återöppning föreslås.** Closure-grunden var multi-provider-semantisk neutralitet: en `TradovateAdapter` och en `RithmicProtocolAdapter` kan implementera samma Level 1 utan att kontraktet ändras. Den grunden är oförändrad och stärkt — v1.1 uttrycker fortfarande varje providerskillnad genom `ProviderCapabilities`, `CapabilityState`, `Available<T>`, `FillHistory.completeness` och normaliserade fel |

Att kontraktet var semantiskt neutralt och att det var **implementerbart utan uppfinning** är
två olika egenskaper. GATE-16 stängdes på den första. v1.1 levererar den andra.

---

## F18. Vad som återstår vid promotion

Följande sker **inte** i denna kandidat och kräver ett godkänt Beslut F:

1. Promovera dokumentet till `Canonical v1.1` och ersätta v1.0 som source of truth
2. Uppdatera `CHECKSUMS.md` med den nya filens sha256
3. Uppdatera `SOURCE_OF_TRUTH.md` raden för Execution Provider Adapter
4. Lägga in **Beslut F** i `Canonical Amendments v1.0` som auditerbart ändringsspår
5. Arkivera v1.0 enligt befintlig praxis för superseded canon
6. Först därefter: Trading Stage 1.8a runtime-transkription, inklusive de två reason codes

---

**Dokumentstatus**

| Fält | Värde |
|---|---|
| Version | Canonical v1.2 |
| Status | **LÅST / CANONICAL** — aktiv source of truth för provider-kontraktet |
| Nivå | Level 1 — Read Only |
| Föregångare | Canonical v1.1 (arkiverad, oförändrad) · Canonical v1.0 (arkiverad, oförändrad) |
| Beslut | Beslut G — Self-Contained Contract and Asynchronous Port Semantics |
| Självbärande | **Ja** — noll beroenden till arkiverad providerspecifikation |
| Återgivna definitioner | 7, oförändrade (§3, §3.1, §4, §5, §7.1, §7.2) |
| Level 1-metoder | Exakt 15 |
| `Promise<Result<T>>`-metoder | 14 |
| `Promise<void>`-metoder | 1 (`disconnect`) |
| Synkrona metoder | 0 |
| Order-metoder i Level 1 | Noll |
| Ändrad affärssemantik | Ingen |
| Reason codes | 2, oförändrade sedan Beslut F |
| Olösta konflikter | 0 |
| Öppna frågor | 0 |
| GATE-08 | **Öppen** |
| GATE-16 | Stängd 2026-08-28 |

**Vad denna version gör och inte gör**

Den stänger specifikations- och portsemantikluckan. Den påstår ingenting om kod.

| | Status |
|---|---|
| Runtime-implementation (TypeScript) | **Ej påbörjad** |
| Provider-implementation | **Ej påbörjad** |
| Rithmic-integration | **Ej påbörjad** |
| Reason codes i Trading Core | Ej transkriberade — hör till Stage 1.8a |
| Transportval / retry / timeout / reconnect | Inte specificerat, inte implicerat |
| Execution | Förbjuden |
| Live trading | Förbjuden |
