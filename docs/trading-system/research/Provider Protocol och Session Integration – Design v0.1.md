# Provider Protocol & Session Integration — Design v0.1

**Datum:** 2026-09-01
**Status:** Designunderlag. **Inte canonical arkitektur.** Inget här är låst.
**Bygger på:** R1A (provider session runtime), R1A.1 (konnektivitetskoder), Execution Provider
Adapter Canonical v1.2
**Dokumentspråk:** Svenska (kod och identifierare på engelska)

> Detta dokument beskriver **hur** en framtida providerspecifik protokollimplementation ska
> kunna kopplas in på R1A utan att Trading Core, adaptern, Risk, Prop, Strategy eller UI får
> veta något om protokollet. Det är inte normativt. Den provider-neutrala gränsytan ligger i
> `specifications/execution-provider/`.

> **Ingen providerspecifik SDK har öppnats för detta dokument.** Licensfrågan är öppen. Varje
> fakta som endast kan hämtas ur proprietärt material och som inte redan finns i repo-ägd
> research är märkt **UNKNOWN** i stället för att gissas.
>
> Licensfrågan blockerar den **providerspecifika** implementationen. Den blockerar inte det
> provider-neutrala arbete som §14 A listar — se §14 för gränsdragningen.

---

## §1. Vad R1A redan äger

Detta är utgångspunkten. Ingenting nedan får dupliceras av ett protokollager.

| Ansvar | Ägare | Var |
|---|---|---|
| connect/disconnect-livscykel | R1A | `runtime.ts` |
| Tillståndsmaskin (8 states) | R1A | `session-state.ts` |
| Generation / race-skydd | R1A | `session-state.ts`, `runtime.ts` |
| Återanslutningspolicy och budget | R1A | `reconnect.ts` |
| Heartbeat- och livenesspolicy | R1A | `heartbeat.ts`, `runtime.ts` |
| Schemaläggning / klockinjektion | R1A | `scheduler.ts` |
| Close-klassificering (intent) | R1A | `classifyClose` |
| Autentiseringsutfall (typat) | R1A | `failure.ts`, `runtime.ts` |
| Secret-borrow och redaction | R1A | `runtime.ts`, `redaction.ts` |
| Transportevent-vokabulär | R1A | `transport.ts` |
| Felklassificering (`SessionFailure`) | R1A | `failure.ts` |
| Översättning till canonical `ReasonCode` | R1A.1 | `failure.ts` → `reason-codes.ts` |

**R1A äger inte, och har i dag inget begrepp för:** protokollramar, meddelandetyper,
request/response-korrelation, providerspecifik autentisering, providertid, eller flera
samtidiga sessioner. Det är precis det utrymme R1B ska fylla — och inget annat.

---

## §2. Lagerindelning

Fem lager. Färre går inte utan att blanda ansvar; fler är abstraktion utan bevisat behov.

```
ExecutionProviderAdapter        ← Level 1-kontraktet (15 metoder, oförändrat)
        ↓
Provider integration            ← normalisering till Omnira-observationer
        ↓
Protocol session                ← providerns protokolltillstånd, korrelation
        ↓
Protocol codec                  ← bytes ⇄ typade protokollmeddelanden
        ↓
ProviderTransport (R1A)         ← opaka bytes, ingen tolkning
```

R1A:s `ProviderSessionRuntime` **omsluter** de två nedersta: den håller transporten vid liv
och vet ingenting om vad som färdas i den.

### Per lager

**ExecutionProviderAdapter**
ÄGER: de 15 Level 1-metoderna, `Result<T>`, `ProviderError`, capability-semantik.
ÄGER INTE: sessioner, protokoll, bytes.
IN: Omnira-typer. UT: `Result<T>` med Omnira-observationer.
FELGRÄNS: översätter aldrig — tar emot redan normaliserade fel.
SECRET: ingen åtkomst. Ser bara `credentialSecretRef` som namn.
PROVIDERDATA: **nej**.

**Provider integration**
ÄGER: normalisering från providerobservationer till `AccountRef`, `ContractRef`,
`PositionSnapshot` m.fl.; `Available<T>`-beslut; completeness-bedömning.
ÄGER INTE: protokollramar, sessionslivscykel.
IN: typade protokollmeddelanden. UT: Omnira-observationer.
FELGRÄNS: här blir ett protokollfaktum en `ProviderError` med canonical `ReasonCode`.
SECRET: ingen.
PROVIDERDATA: **ja, men bara som indata** — får aldrig läcka vidare uppåt.

**Protocol session**
ÄGER: providerns protokolltillstånd ovanför transporten — sekvensering, korrelation om
protokollet kräver det, och översättning av protokollhändelser till fakta R1A förstår.
ÄGER INTE: återanslutning, timeout, retry, close-intent. Allt det är R1A:s.
IN: avkodade meddelanden. UT: fakta till R1A (`ACTIVITY`, autentiseringsutfall) och typade
meddelanden uppåt.
FELGRÄNS: rapporterar `PROTOCOL_ERROR` som **fakta**, väljer aldrig policy.
SECRET: endast inom `withCredential`-scope, aldrig lagrad.
PROVIDERDATA: **ja**.

**Protocol codec**
ÄGER: `encode(message) → bytes`, `decode(bytes) → message | refusal`, strukturvalidering.
ÄGER INTE: allt annat. En codec är en ren funktion över bytes.
IN/UT: bytes ⇄ typade meddelanden.
FELGRÄNS: returnerar en **avvisning som värde**, kastar inte. En codec som kastar tvingar
lagret ovanför att gissa vad som gick fel.
SECRET: får ta emot ett secret som argument vid inloggningskodning, får aldrig behålla det.
PROVIDERDATA: **ja**.

**ProviderTransport (R1A, oförändrad)**
ÄGER: öppna, skicka, stänga, rapportera.
ÄGER INTE: **allt annat, och särskilt inte om en stängning var väntad.**
PROVIDERDATA: **nej** — bytes är inte providerdata förrän någon tolkar dem.

---

## §3. Transport-/codec-gränsen

`TransportFrame = Uint8Array` behålls oförändrad. Skälen:

- Det är vad en byte-transport faktiskt bär.
- Det finns redan, är testat, och har inga metoder som kan börja tolka innehåll.
- En wrapper-klass skulle bjuda in till att lägga `frame.type` på den, och då är gränsen
  bruten utan att någon behövde besluta det.

Repot har `Decimal`, `PriceText` och `Timestamp` som domänprimitiver, men ingen wire-primitiv,
och det behövs ingen. **Runtime tolkar aldrig en ram.** Den enda kod som får läsa bytes är
codec:en.

---

## §4. Autentisering

R1A:s `AuthenticationStep` är redan rätt form:

```ts
type AuthenticationStep = (context: AuthenticationContext) => Promise<AuthenticationResult>
```

En providerimplementation blir en funktion som stängs över sin codec:

```ts
// SKISS. Inte ett kontrakt.
function createAuthenticationStep(codec: ProtocolCodec, session: ProtocolSession): AuthenticationStep {
  return async ({ send, signal, withCredential }) => {
    const frame = await withCredential((secret) => codec.encodeLogin(secret))
    send(frame)
    const outcome = await session.awaitLoginOutcome(signal)   // typat, ingen prosa
    return outcome
  }
}
```

Fyra egenskaper som måste överleva:

1. **`AuthenticationFailure` förblir fyrdelad** — `AUTH_FAILED`, `REMOTE_REJECTED`,
   `PROTOCOL_ERROR`, `CANCELLED`. Sessionslagret väljer *vilken*, från protokollets egna
   maskinläsbara fält. Aldrig från prosa.
2. **Secret existerar bara inom `withCredential`.** Den går in i `encodeLogin`, blir bytes,
   och referensen släpps. Ingenting ovanför ser värdet.
3. **Kastade fel blir `AUTH_FAILED`** — R1A:s befintliga regel. Ett kastat värde är per
   definition oklassificerat.
4. Autentiseringsframgång betyder **endast** att providern accepterade inloggningen.

---

## §5. Bootstrap och flera anslutningar — **JA, utan ändring i R1A**

Frågan: kan R1A i dag hantera *tillfällig bootstrap-transport → stängning → autentiserad
session*, utan att misstolka den avsiktliga stängningen som ett sessionsfel?

**Ja.** Inte inom *en* runtime-instans, men genom komposition — och det är rätt svar, inte en
kringgång.

Bevisen finns i koden:

- `options.endpoint` läses på **exakt ett ställe**: `transport.open(...)`. En runtime är
  därmed bunden till en endpoint, vilket är en egenskap, inte en begränsning.
- `classifyClose(model)` returnerar `EXPECTED` när `disconnectRequested` är satt. En
  `disconnect()` följs därför **aldrig** av återanslutning — verifierat av R1A:s test
  *"operator disconnect reaches DISCONNECTED with zero reconnects"*, som dessutom hävdar
  `lastFailure === null`.
- `CONNECT_REQUESTED` accepteras från `DISCONNECTED` och `FAILED`, så en runtime är
  återanvändbar.

Sekvensen blir:

```
runtimeBootstrap = createProviderSessionRuntime({ endpoint: känd, authenticate: ingen })
  → connect()
  → codec/session utför upptäckten
  → disconnect()        ← disconnectRequested ⇒ EXPECTED ⇒ ingen reconnect
runtimeSession   = createProviderSessionRuntime({ endpoint: upptäckt, authenticate: riktig })
  → connect()
```

Det som gör detta säkert är just den R1A-regel som ser ut som en försvagning: att
`DISCONNECT_REQUESTED` **inte** avancerar generationen. Runtime måste kunna ta emot och
klassificera den stängning den själv orsakade. Hade generationen avancerat först hade
bootstrap-stängningen blivit en stale event som ingen klassificerade.

**Vad som saknas är inte funktionalitet utan en samordnare** — någon som äger ordningen
"bootstrap, sedan session". Det hör hemma i integrationslagret, inte i R1A.

Det enda som **inte** kan uttryckas i dag: att byta endpoint på en *befintlig* runtime. Det
behövs inte, och att lägga till det vore sämre — en muterbar endpoint gör en runtime till
något vars identitet ändras under fötterna på generationslogiken.

---

## §6. Flera sessionsroller

Samma mekanism. En roll = en `ProviderSessionRuntime`-instans.

```ts
// SKISS.
type SessionRole = string & { readonly __brand: 'SessionRole' }   // opak, inte uppräknad
interface SupervisedSession {
  readonly role: SessionRole
  readonly runtime: ProviderSessionRuntime
}
```

Rollidentitet hör hemma i **integrationslagret**, inte i R1A och inte i codec:en:

- R1A ska inte veta att roller finns — den superviserar en session, punkt.
- Codec:en kodar meddelanden; vilken socket de går på är inte dess sak.
- Integrationslagret är det enda som vet vilken roll som kan svara på vilken fråga.

`SessionRole` hålls **opak och icke-uppräknad**. Att skriva `type SessionRole = 'TICKER' | ...`
vore att kanonisera en providers topologi i provider-neutral kod.

**N sessioner tillåts, N krävs inte.** En provider som klarar sig med en enda instans
konfigurerar en enda instans. Ingen tom supervisor, ingen roll som måste finnas.

---

## §7. Korrelation — **inte R1A:s ansvar**

Uttryckligt: den generiska runtimen ska **inte** äga request/response-korrelation. Den har i
dag inget sådant begrepp alls (verifierat: noll träffar på `correlat|requestId|inflight` i
`provider-runtime/`), och att lägga dit ett vore att anta att alla protokoll är
request/response. Vissa är rena strömmar.

Korrelation hör till **protokollsessionen**, och bara om protokollet kräver den. Krav om så:

- **Deterministisk.** Ingen `Date.now()`, ingen `Math.random()`, ingen `randomUUID` — samma
  regel som R1A redan lyder under. En monoton räknare per session räcker.
- **Maskinläsbar.** Nyckeln kommer från protokollets egna fält, aldrig ur prosa.
- **Begränsad livslängd.** Varje väntande begäran har ett tak; en oavslutad begäran blir ett
  fakta (`PROTOCOL_ERROR` eller timeout-fakta), aldrig en läcka.
- **Generationsisolerad.** Ett svar som hör till en äldre session får **aldrig** uppfylla en
  begäran i en nyare. Sessionsobjektets livslängd är dess isolering: en ny generation får en
  ny korrelationstabell, och den gamla kastas med sitt sessionsobjekt.
- **Mintar ingen auktoritet.** Att ett svar kom betyder att ett svar kom.

Vad providerimplementationen måste tillhandahålla om protokollet kräver korrelation: en
funktion som ur ett avkodat meddelande utvinner dess korrelationsnyckel, eller `null` om
meddelandet är oombett. Inget mer.

---

## §8. Heartbeat och liveness

Gränsen är redan rätt dragen och ska inte flyttas.

**Protokollagret rapporterar fakta.** Två räcker: *inkommande aktivitet observerad* och
*heartbeat kvitterad*. Båda finns redan som R1A-handlingar (`ACTIVITY_OBSERVED`,
`HEARTBEAT_ACKED`).

**Runtime beslutar policy** — intervall, timeout, hur många missar som fäller sessionen.

`HeartbeatPolicy` fylls av providern eftersom intervallet är ett providerfakta. Det finns
avsiktligt ingen `DEFAULT_HEARTBEAT_POLICY`, och det ska inte införas: ett gissat intervall
ser auktoritativt ut i koden och är fel första gången providern säger något annat.

Om providern annonserar sitt intervall vid inloggning kan sessionslagret returnera det
tillsammans med autentiseringsutfallet, så att runtimen konfigureras med ett *observerat*
värde. **Om providern inte annonserar något: UNKNOWN, och policyn måste komma från
konfiguration — inte från en gissning.**

---

## §9. Providertid

`ProviderClock` är redan definierad:

```ts
interface ProviderClock {
  readonly providerTime: ProviderTimestamp
  readonly observedAt: Timestamp
  readonly skewMs: Available<Decimal>
}
```

Regeln: `ProviderTimestamp` får **endast** komma från ett fält providern faktiskt skickar och
faktiskt beskriver som tid.

Förbjudet, utan undantag:

- `Date.now()` → `ProviderTimestamp`
- schemaläggarens monotona klocka → `ProviderTimestamp`
- mottagningstid för ett meddelande → `ProviderTimestamp`

Den sista är den farliga, för den ser rimlig ut. Mottagningstid är *vår* klocka som mäter när
*vi* såg något; att kalla den providertid är att uppfinna ett faktum som inte observerats.

Om ingen providertid finns: `getProviderTime()` är **UNKNOWN** enligt befintlig
contract-semantik. `observedAt` är däremot vår lokala tid och får vara det — det är ju vad
fältet betyder.

---

## §10. Fel och observerbarhet

`ProviderError` förblir exakt `{ reasonCode, message }`. Inget `providerCode`, ingen
`retryable`, ingen rå payload, inget exception-objekt.

Vägen ett protokollfel tar:

```
codec avvisar ram
  → sessionslagret rapporterar PROTOCOL_ERROR som fakta (SessionFailure)
  → R1A avgör policy (retry eller inte) via isRetriable
  → R1A.1 översätter till canonical ReasonCode
  → ProviderError { reasonCode, message }
```

Codec:en väljer **aldrig** en canonical `ReasonCode` själv. Den vet inte tillräckligt, och två
lager som båda får välja kod kommer förr eller senare att välja olika.

**Providerdiagnostik** — närmare beskrivning, protokollets egen felkod — kan vara värdefull i
en journal. Om den någon gång bevaras gäller: separat fält, aldrig i `message`, aldrig
beslutsunderlag, och **alltid genom `redactText`/`redactValue` först**. v1.2 §8 tillåter att
rå providerresponse bevaras för journalen *där det är säkert*; "där det är säkert" betyder
efter redaction. Detta är i dag **inte** implementerat och föreslås inte i R1B-B.

---

## §11. Exekverings-, auktoritets- och capability-brandvägg

**Ingen skrivyta.** Ingen `submitOrder`, `modifyOrder`, `cancelOrder`, `placeOrder`,
`preflightOrder` — inte ens avstängd. Frånvaron *är* gränsen; en avstängd metod är en metod
någon kan slå på.

**Ingen auktoritet ur providerdata.** Ingen protokollframgång kan prägla `RiskClearance`,
`PropClearance`, `ApprovalGrant` eller `ExecutionIntent`. Autentiserad session betyder att
providern accepterade en inloggning — inte att Omnira får handla.

**Ingen capability-befordran.** `UNKNOWN → SUPPORTED` kräver den bevisning kontraktet redan
definierar. Att ett anrop lyckades en gång är inte den bevisningen.

R1A:s guard-tester upprätthåller redan detta för `provider-runtime/`. R1B-B bör ärva samma
mönster i sina egna paket, med samma teknik: identifierare sammansatta ur fragment så att
testfilen aldrig innehåller den literal den förbjuder.

---

## §12. Kompatibilitetsmatris

| Fråga | R1A i dag | Gap? | Ägare | Minsta ändring | Licens? | Supportsvar? |
|---|---|---|---|---|---|---|
| Wire-bytes | `Uint8Array` finns | Nej | R1A | ingen | nej | nej |
| Codec | saknas | Ja | R1B-B | nytt paket | **ja** | nej |
| Autentisering | typad step finns | Nej | R1A + R1B-B | provider-impl | **ja** | nej |
| Bootstrap → session | stöds via komposition | Nej | integration | samordnare | nej | **ja** (krävs omkoppling?) |
| Flera sessioner | N runtimes stöds | Nej | integration | supervisor | nej | **ja** (topologi) |
| Korrelation | saknas medvetet | Nej* | protokollsession | i R1B-B | **ja** | nej |
| Heartbeat-fakta | handlingar finns | Nej | R1A | ingen | nej | **ja** (intervall) |
| Providertid | `ProviderClock` finns | Nej | R1B-B | endast om fält finns | **ja** | **ja** |
| Redaction | finns | Nej | R1A | ingen | nej | nej |
| Protokollfel | `PROTOCOL_ERROR` finns | Nej | R1A | ingen | nej | nej |
| Reconnect | finns | Nej | R1A | ingen | nej | **ja** (förväntningar) |
| Generationsisolering | finns | Nej | R1A | ingen | nej | nej |
| Close-klassificering | finns | Nej | R1A | ingen | nej | nej |

\* Inget gap i R1A. Korrelation ska inte finnas där.

**Slutsats: R1A behöver inga ändringar för R1B-B.** Det är designens viktigaste resultat.

---

## §13. Två designalternativ

### Alternativ A — Protokollet inuti runtimen

Utöka `ProviderSessionRuntimeOptions` med codec och meddelandehantering; runtime får
`request()`/`subscribe()` och äger korrelation.

Koppling: hög — runtime får protokollbegrepp. Testbarhet: sämre, allt går genom en klass.
Race-säkerhet: bevarad. Multi-session: kräver ny mekanism. Codec-isolering: bruten.
Credential: oförändrad. Portabilitet: sämre — antar request/response. Komplexitet: medel,
men **kräver ändring i R1A**, vilket kostar en omprövning av dess låsta beslut.

### Alternativ B — Protokollet ovanpå runtimen *(rekommenderas)*

Runtime är oförändrad. Ett protokollpaket äger codec och session; ett integrationspaket äger
roller, bootstrap-ordning och normalisering. Kopplingen till R1A sker genom de tre krokar som
redan finns: `authenticate`, `sendHeartbeat` och transportens frame-ström.

Koppling: låg. Testbarhet: hög — codec är rena funktioner, sessionen testas med R1A:s
`FakeTransport` och `ManualScheduler`. Race-säkerhet: ärvs oförändrad. Multi-session: faller
ut gratis. Codec-isolering: fullständig. Credential: oförändrad. Portabilitet: hög — en
provider utan korrelation implementerar bara ingen. Komplexitet: **lägst av de två**, och
**noll ändring i R1A**.

**Rekommendation: B.** Inte bara för att den kopplar löst, utan för att den inte kräver att vi
öppnar R1A:s låsta beslut igen. Varje sådan omprövning är en chans att av misstag "förenkla"
close-klassificeringen eller generationsregeln — de två saker som redan visat sig kosta mest
när de går sönder.

---

## §14. Öppna frågor — fyra klasser, inte två

Den viktiga gränsen går **inte** mellan "R1B-B" och "blockerat". Den går mellan *provider-neutralt
arbete*, som kan börja nu, och *providerspecifik implementation*, som inte kan det.

**A. R1B-B PROVIDER-NEUTRALT — kan påbörjas nu.** Ingenting här kräver licens, supportsvar eller
GATE-08. Allt härleds ur Omniras egen arkitektur:

`ProtocolCodec`- och `ProtocolSession`-kontrakt · opak `SessionRole` · sessionens livscykel ·
korrelationsabstraktion och deterministiskt korrelationstillstånd · generationsisolering ·
aktivitets- och heartbeat-fakta · `FakeCodec` och `FakeProtocolSession` ·
integrationslagrets supervisor/koordinator · secret-, auktoritets- och exekveringsbrandväggar
som guard-tester · provider-neutrala tester.

Hårda villkor för allt ovan: inga providernamn, inga providerkonstanter, inga
providermeddelandestrukturer, ingen `.proto`, ingen kodgenerering, inget SDK- eller
sample-material, inga verkliga fångade ramar, inga credentials, ingen endpoint, inget nät.

**B. PROVIDERSPECIFIK IMPLEMENTATION — blockerad av licens.** Codec-implementation för en
verklig provider · providerns meddelandenamn i källkod om de är licensskyddade · `.proto` ·
genererade bindningar · testfixturer med verkliga ramar · SDK- eller sample-härledd kod · själva
provideradaptern och dess session.

*Licensen blockerar första raden av den **providerspecifika** implementationen — inte första
raden av R1B-B.*

**C. PROVIDERSPECIFIKT BETEENDE — blockerat av supportsvar.** Kräver bootstrap en ny anslutning
eller kan discovery och inloggning dela en; vilket heartbeat-intervall gäller och annonseras det;
finns en auktoritativ providertid; hur många samtidiga sessioner per credential; vad orsakar en
serverinitierad utloggning.

Dessa svar behövs för att *konfigurera* implementationen. De behövs inte för att definiera
kontrakten — kontrakten uttrycker att svaret ska levereras, inte vad det är.

**D. MARKNADSDATA-ROLLER — blockerat av GATE-08.** Vilka marknadsdatasessioner som behövs och
vilken roll som äger instrumentreferensdata. Påverkar inte den provider-neutrala designen.

---

## §15. Föreslaget R1B-B-scope (inte auktoriserat)

Stegen 1–4 är provider-neutrala och **kräver ingen licens**. Steg 5 gör det.

1. `protocol/` — `ProtocolCodec`- och `ProtocolSession`-kontrakt, provider-neutrala, ingen
   provider.
2. Guard-tester som ärver R1A:s mönster (ingen skrivyta, ingen auktoritet, ingen capability,
   inga providernamn) — med identifierare sammansatta ur fragment, som i R1A.
3. `FakeCodec` + `FakeProtocolSession`, byggda ur Omniras egna krav och inte ur någon
   providers ramformat.
4. Integrationslagrets supervisor: roller, bootstrap-ordning, livscykel.
5. **Först därefter, och först när licensfrågan är löst:** en providerspecifik implementation
   i eget paket, bakom samma brandväggar.

**Ingen ändring i `provider-runtime/` föreslås.** Om R1B-B ändå visar sig behöva en, ska den
tas som ett eget beslut med samma bevisbörda som R1A:s egna låsningar — inte som en
följdändring.
