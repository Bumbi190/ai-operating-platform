# Omnira Trading System – Execution Provider Adapter

**Nivå:** Level 1 — Read Only
**Version:** Canonical v1.0
**Datum:** 2026-08-28
**Dokumentspråk:** Svenska (kod och identifierare på engelska)
**Status:** Låst provider-neutralt kontrakt. Implementation ej påbörjad.
**Källa:** Canonical Amendments v1.0, Beslut E

> **Detta dokument är provider-neutralt.** Det innehåller inga endpoint-namn, inga
> providerspecifika fält och ingen providerspecifik autentisering. Rithmic är vald som
> **första implementationsmål**, inte som permanent exklusiv provider.

---

## 1. Syfte och avgränsning

Kontraktet definierar den enda gränsytan mellan Omnira och en extern Futures Execution
Provider för **observation**. Det tillåter ingen orderläggning.

Kedjan (Systemarkitektur v0.3 §2):

```
Execution Gateway → [Execution Runtime] → Execution Provider Adapter
→ Futures Execution Provider
```

Adaptern är den enda komponent som får känna till en specifik providers API, autentisering,
ordermodell och symbolformat. Ingenting ovanför adaptern får innehålla providerspecifik
kunskap.

### 1.1 Vad Level 1 inte innehåller

Level 1 deklarerar **inga** execution-metoder. Inte avstängda, inte skyddade — frånvarande:

```
submitOrder     ✗ finns inte
modifyOrder     ✗ finns inte
cancelOrder     ✗ finns inte
preflightOrder  ✗ finns inte
```

Level 2 är utkast och specificeras separat när Fas 6 närmar sig.

---

## 2. Auktoritetsgräns

**Authority is issued, not derived from data.** Fas 1-invarianten gäller oförändrat.

En provider-observation är ett **record**, precis som en `RiskDecision` är ett record. Fas 1
bevisade att records inte kan minta `RiskClearance`, `PropClearance` eller `ApprovalGrant`.

Därför gäller:

| Adaptern får | Adaptern får inte |
|---|---|
| Observera externt state | Minta någon capability |
| Normalisera till Omnira-typer | Skapa `ExecutionIntent` |
| Rapportera health och capabilities | Anropa `lib/trading/internal` |
| Rapportera UNKNOWN | Tolka UNKNOWN som ALLOW |

`ExecutionIntent` skapas fortfarande enbart av `openExecutionGate`, som kräver tre
oförfalskbara capabilities. En adapter-observation är inte en av dess indata och kan inte
bli det.

---

## 3. Capability-semantik

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

### 3.1 ProviderCapabilities

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

---

## 4. Credential-semantik

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

Skilj därför på:

| Credential capability | Omnira authority |
|---|---|
| Vad providern tekniskt tillåter | Vad Omnira faktiskt får göra |
| Kan vara bredare än önskat | Bestäms av auktoritetskedjan |

Även om ett credential tekniskt kan lägga order under Fas 2 finns ingen kodväg som frågar.
Det är defense-in-depth genom frånvaro snarare än genom behörighet.

---

## 5. Fältillgänglighet

```
Available<T> =
  | { state: PRESENT;     value: T }
  | { state: UNAVAILABLE }   // providern har bevisligen inget värde
  | { state: UNKNOWN }       // ej efterfrågat, eller ej besvarat
```

**Adaptern gissar aldrig ett saknat fält.** Om ett värde krävs för en säkerhetskritisk
beräkning och kommer tillbaka `UNAVAILABLE` eller `UNKNOWN` ska beräkningen fail closed —
inte substituera ett default.

---

## 6. Level 1-gränssnittet

```
interface ExecutionProviderAdapter {

  // — session ———————————————————————————————
  connect(config: ProviderConfig)      : Result<ProviderSession>
  disconnect()                         : void

  // — identitet, bevisas innan något state litas på ——
  getProviderIdentity()                : Result<ProviderIdentity>
  getEnvironment()                     : Result<TradingEnvironment>
  getCapabilities()                    : Result<ProviderCapabilities>
  getHealth()                          : Result<ProviderHealth>
  getProviderTime()                    : Result<ProviderClock>

  // — konton ——————————————————————————————
  getAccounts()                        : Result<readonly AccountRef[]>
  getAccountSnapshot(a: AccountId)     : Result<AccountSnapshot>

  // — kontrakt: futuresidentitet är kontraktsnivå ——
  resolveContract(spec: ContractSpec)  : Result<ContractRef>
  getContractSnapshot(c: ContractId)   : Result<ContractSnapshot>

  // — observerat state ————————————————————————
  getPositions(a: AccountId)           : Result<readonly PositionSnapshot[]>
  getWorkingOrders(a: AccountId)       : Result<readonly OrderSnapshot[]>
  getRecentFills(a: AccountId,
                 window: HistoryRequest): Result<FillHistory>

  // — reconciliation ——————————————————————————
  reconcileReadOnlyState(a: AccountId) : Result<ReadOnlyReconciliation>
}
```

`getEnvironment()` returnerar aldrig ett default. Ett okänt environment är `UNKNOWN` och
fail closed, i enlighet med Trading Cores befintliga regel att `live` aldrig är fallback.

---

## 7. Datamodell

Adaptern återanvänder Trading Cores primitiv. Den får inte införa ett parallellt
vokabulär.

| Typ | Grund | Not |
|---|---|---|
| `ProviderId` | ny branded id | Identifierar adaptern, inte kontot |
| `Environment` | `TradingEnvironment` | Aldrig defaultad |
| `AccountId`, `OrderId`, `FillId`, `PositionId` | Core branded ids | Provider-ids mappas in, ersätter dem aldrig |
| `ContractId` | ny branded id | Kontraktsnivå, skild från instrumentidentitet |
| `ProviderTimestamp` / `ProviderClock` | `Timestamp` + mätt skew | Providerklocka bärs skild från lokal |
| Priser, pengar, kvantiteter | `Decimal` | Exakt skalad bigint. **Aldrig float** |
| `ProviderHealth` | `Verdict` | ALLOW / DENY / UNKNOWN |
| `ProviderError` | `ReasonCode` | Providerfel översätts till Core-koder |

Observationer är immutabla. En snapshot beskriver ett ögonblick och ändras aldrig i
efterhand.

### 7.1 ContractSnapshot

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

Detta interagerar med GATE-08 men stänger den inte.

### 7.2 FillHistory

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
reconciliation.

---

## 8. Felsemantik

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

---

## 9. Multi-provider-krav

Kontraktet är stängt som canonical endast därför att det uppfyller följande test:

> En `RithmicProtocolAdapter` och en `TradovateAdapter` kan implementera samma Level 1
> utan att kontraktets semantik ändras.

Providerskillnader uttrycks uteslutande genom `ProviderCapabilities`, `CapabilityState`,
`Available<T>`, `FillHistory.completeness`, `CredentialMode` och normaliserade fel.

**Inga providerspecifika endpoint-namn hör hemma i detta dokument.** Providerspecifik
research bevaras separat som implementationsunderlag, inte som universell arkitektur.

---

**Dokumentstatus**

| Fält | Värde |
|---|---|
| Version | Canonical v1.0 |
| Nivå | Level 1 — Read Only |
| Level 2 | Utkast, ej specificerat |
| Order-metoder i Level 1 | Noll |
| Första implementationsmål | Rithmic R\|Protocol mot Rithmic Test |
| Andra planerade adapter | Tradovate |
| Implementation | Ej påbörjad |
| Execution | Förbjuden |
