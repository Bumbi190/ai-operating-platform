# Canonical Amendments v1.0

**Dokument:** Omnira Trading System – Canonical Amendments
**Version:** v1.0
**Datum:** 2026-08-27
**Föranlett av:** Canonical-beslut som stängde GATE-05 och GATE-10 (Beslut A och B), en
execution safety-invariant från Fas 1-implementationen (Beslut C), en korrigering av
ett felaktigt plattformsantagande i execution-arkitekturen (Beslut D), och valet av första
execution provider med tillhörande adapterkontrakt (Beslut E)
**Status:** Auditerbart ändringsspår

---

## Syfte

Detta dokument listar varje textändring som gjordes när de två sista blockerarna för
Canonical v1.0 stängdes.

Varje post visar **före**, **efter** och **varför**. Inget har ändrats utan att stå här.

**Originaldokumenten (`.docx`) är orörda.** Ändringarna är införda i markdown-versionerna,
som är aktiv text. Det gör det möjligt att se exakt vad som stod före beslutet.

---

## Beslut A — London window-close break-even

**Stänger:** GATE-05, Contradiction Register C-03
**Karaktär:** Disambiguering av ett redan fattat beslut, inte en ny regel

Den tidigare formuleringen "positionen skyddas genom break-even-regeln" tillät två
implementationer: forcerad BE vid 05:00, eller enbart fortsatt swing-baserad BE.

**Canonical betydelse:**

```
London-position fortfarande öppen 05:00 America/New_York
→ SL = entry price
```

Gäller även om den swing-baserade triggern ännu inte har inträffat. Positionen fortsätter
därefter. London behåller ingen fyratimmarsgräns.

### A1 — Strategy Specification §21, nytt avsnitt 21.1

**Före:** §21 definierade endast den swing-baserade triggern.

**Efter:** nytt avsnitt *21.1 Window-close break-even — London* som anger den tidsbaserade
triggern som en andra trigger för samma action, med explicit no-op om swing-triggern redan
har flyttat SL.

**Varför:** BE-regeln måste innehålla båda triggers, annars måste en implementatör
härleda den ena ur sessionsavsnittet.

### A2 — Strategy Specification §31

**Före:**

> Om positionen fortfarande är öppen när entry-window stänger får den fortsätta.
> Strategins instruktion är att positionen då ska skyddas genom break-even-regeln.

**Efter:** explicit `SL → entry price` vid 05:00, med angivelse att det sker även utan
swing-trigger, följt av att positionen får fortsätta och att exitlistan utökats med
emergency-/safety-exit. Avslutas med att regeln är deterministisk och inte discretionary.

**Varför:** detta var källan till tvetydigheten.

### A3 — Strategy Specification §45, ny CLOSED-03

**Före:** §45 dokumenterade CLOSED-01 och CLOSED-02 från v1.0-RC1.

**Efter:** CLOSED-03 tillagd, med den gamla formuleringen citerad så att rationalet bevaras.

**Varför:** dokumentet har redan en mekanism för att registrera disambigueringar utan
versionsbump. CLOSED-03 följer samma mönster.

### A4 — Strategy Specification, Dokumentstatus

**Efter:** revisionsrad tillagd som förklarar att ingen versionsbump sker enligt §44,
eftersom ingen materiell regel ändrats — endast en tvetydig formulering gjorts entydig.

### A5 — Kapitel 3, tre ändringar

- *Entry Window vs Position Management*: tillagd mening om att London har obligatorisk
  window-close BE, så att avsnittet inte läses som att inget händer 05:00.
- *Break-Even*: nytt underavsnitt *Window-close Break-Even — London*.
- *London Trade Management*: samma explicita omskrivning som A2.
- Sammanfattningsraden om break-even utökad med window-close-triggern.

### A6 — Kapitel 11, forward testing

**Efter:** testkriterier tillagda för window-close BE, inklusive fallet där swing-triggern
redan har inträffat, samt att actionen journalförs separat.

**Varför:** en regel som inte testas separat kan tyst gå sönder.

### A7 — Kapitel 13 och Datamodell, `be_trigger_type`

**Efter:** journalen ska skilja `SWING` från `WINDOW_CLOSE`. Fältet
`break_even_trigger_type` tillagt i datamodellens ändringslogg.

**Varför:** utan separationen går det inte att i efterhand mäta vad window-close-regeln
kostar eller sparar. Additivt fält, inget befintligt ändrat.

### A8 — Kapitel 10, backtesting

**Efter:** BE-analysen ska redovisa fördelningen mellan swing-BE och window-close-BE.

---

## Beslut B — Intern daily loss, reserved risk och ingen intern floating force-close

**Stänger:** GATE-10 (RISK-GATE-01), Contradiction Register C-01, samt GATE-11 / C-02
**Karaktär:** korrigering av en logiskt ohållbar regel, plus precisering

### Låst modell

```
MAX INTERNAL DAILY LOSS: $450
CALCULATION BASIS:       REALIZED LOSSES ONLY
RESET:                   00:00 America/New_York
```

**Reserved risk, pre-entry:**

```
realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit
```

**Vid `realized_daily_loss >= $450`:** inga nya trades, state `BLOCKED / DAILY_STOP`,
execution av nya intents blockeras, persistent över restart, blockerad till nästa
canonical reset, audit event skapas.

**Ingen intern floating force-close.**

### B1 — Kapitel 4, *Daily stop*

**Före:**

> Om en position fortfarande är öppen när daily-loss-gränsen bryts ska positionen stängas direkt.

**Efter:** ersatt av det explicita DAILY_STOP-beteendet ovan, följt av ett nytt avsnitt
*Ingen intern floating force-close* som anger att den interna dagsregeln inte stänger en
öppen position, med den logiska motiveringen och listan över de regler som i stället
hanterar positionen.

**Varför:** den gamla regeln hade ingen nåbar trigger. Med en realiserad mätare och högst
en öppen position kan gränsen bara passeras när positionen redan är stängd. Att i stället
införa floating-baserad tvångsstängning hade motsagt realized-only-modellen.

### B2 — Kapitel 4, nytt avsnitt *Reserved risk*

**Efter:** reserved risk införd som pre-entry-kontroll med formeln och båda
räkneexemplen ($128 passerar, $151 nekas), samt explicit att den inte ändrar den
realiserade mätaren och frisläpps när traden stängs.

**Varför:** utan denna kontroll kunde en trade vars risk överstiger återstående dagsbudget
öppnas, eftersom mätaren är realiserad. Detta stänger även den tidigare vilande GATE-11.

### B3 — Kapitel 4, nytt statusblock

**Efter:** kapitlet har nu ett statusblock som övriga kapitel, med revisionsrad.

**Varför:** Kapitel 4 bär de tyngsta riskbesluten och saknade tidigare statusmarkering
(Contradiction Register C-06). Nu när innehållet ändrats behöver en läsare kunna se att
det är den reviderade versionen.

### B4 — Kapitel 16, *Automated Emergency Protection*

**Före:**

> Canonical riskbeslutet säger att en öppen position ska stängas när intern realized daily loss når $450.

**Efter:** omskrivet till att gränsen blockerar nya trades och sätter `BLOCKED / DAILY_STOP`,
att den interna regeln inte tvångsstänger en öppen position, samt att automatisk stängning
hör till prop-relaterade equity-/floating-/trailinggränser i Prop Firm Rules Engine.

**Varför:** detta var den enda kvarvarande platsen i boken som fortfarande hävdade intern
tvångsstängning. Utan denna ändring hade paketet motsagt sig självt.

### B5 — Kapitel 11, *Daily Stop Test*

**Före:** "öppen position hanteras enligt policy" — neutralt, eftersom policyn saknades.

**Efter:** explicita kriterier: state blir `BLOCKED / DAILY_STOP`, audit event skapas,
öppen position tvångsstängs **inte**, positionen hanteras vidare av sina egna exitregler,
och reserved risk nekar en trade som inte ryms.

### B6 — Risk Engine Specification, promotion

`Canonical v1.0 CANDIDATE` → **`Canonical v1.0`**.

- OPEN-RISK-01…08 markerade STÄNGDA, med promotionshistorik i avsnitt 0
- v0.1 §51 uttryckligen ersatt
- v0.1 §18 preciserad genom nytt avsnitt 5 om reserved risk
- nya reason codes: `DAILY_LOSS_LIMIT`, `DAILY_STOP_ACTIVE`, `RESERVED_RISK_EXCEEDED`
- CANDIDATE-filen flyttad till `archive/` med superseded-banner
- v0.1 försedd med historik-banner så att dess OPEN-RISK-lista inte läses som aktuell

---

## Beslut C — Bounded authority lifetime för ExecutionIntent

**Datum:** 2026-08-27
**Karaktär:** Execution safety-invariant. Inte strategilogik, inte en riskgräns.
**Upptäckt:** Under Fas 1-implementationen av Trading Core.

### Bakgrund

Systemarkitektur v0.1 §24 ger ExecutionIntent ett `expiry`-fält, Datamodell v0.1
§35 och §36 ger Approval och ExecutionIntent var sitt `expires_at`, och
Risk Engine Specification v0.1 §32 slår fast att en gammal approval inte får
användas mot en marknad som redan förändrats.

Vad ingen text sa var hur dessa livstider **förhåller sig till varandra**.

Under implementationen blev det synligt att ett ExecutionIntent utan sådan
koppling kunde skapas redan utgånget, eller ges en livstid som sträcker sig
förbi den proposal och den approval som gav rätten att skapa det. Båda fallen
skulle innebära execution på ett tillstånd som redan upphört att gälla.

Invarianten implementerades konservativt i Fas 1 och flaggades uttryckligen som
**härledd, inte dokumenterad**. Den godkänns nu explicit.

### Beslut

> **En ExecutionIntent får aldrig skapas redan utgången, och får aldrig leva
> längre än något upstream authority-objekt som krävdes för att skapa den.**

Konkret gäller minst:

```
intent.expiresAt > now
intent.expiresAt <= proposal.expiresAt
intent.expiresAt <= approval.expiresAt
```

### Vad detta låser i implementationen

Execution Gateway ska avvisa ett intent-skapande som bryter mot någon av de tre
gränserna, med separata reason codes så att analytics kan skilja fallen åt:

| Villkor | Reason code |
|---|---|
| `intent.expiresAt <= now` | `EXECUTION_INTENT_ALREADY_EXPIRED` |
| `intent.expiresAt > proposal.expiresAt` | `EXECUTION_INTENT_OUTLIVES_PROPOSAL` |
| `intent.expiresAt > approval.expiresAt` | `EXECUTION_INTENT_OUTLIVES_APPROVAL` |

En livstid som är **kortare** än upstream är alltid tillåten. Gränsen är ett tak,
inte ett krav på exakt matchning.

### Framtida upstream authority

Om ytterligare upstream authority-objekt senare får egen expiry — exempelvis en
framtida RiskDecision-giltighet eller en PropDecision-giltighet — ska samma
konservativa bounded-authority-princip **utvärderas genom governance**, inte
antas automatiskt. Att en princip är rimlig gör den inte canonical.

### Avgränsning

Detta är en execution safety-invariant. Den påverkar inte entry, SL, TP,
break-even, sessioner, news-regler, re-entry, riskgränser eller setup grades.
Ingen strategiregel och ingen riskgräns ändras av Beslut C.

### C1 — Systemarkitektur v0.1, nytt avsnitt 24.1

**Efter:** nytt avsnitt *24.1 Bounded Authority Lifetime* direkt efter §24, med
de tre gränserna, motivet, governance-kravet för framtida upstream authority och
avgränsningen mot strategilogik. Revisionsrad tillagd i dokumentstatus.

**Inget befintligt avsnitt ändrat.** Additivt.

---

## Beslut D — Futures-native, provider-neutral execution-arkitektur

**Datum:** 2026-08-28
**Karaktär:** Arkitekturkorrigering av execution- och connectivity-lagret.
**Inte** en strategiändring och **inte** en riskändring.
**Källa:** korrigering från strategiägaren.

### Bakgrund

Omnira Trading System handlar **NQ och MNQ**. Det är futures.

Dokumentationen byggde ändå execution- och connectivity-lagret runt **MetaTrader 5**.
MT5 är en plattform vars ekosystem i huvudsak riktar sig mot Forex och CFD. Att låsa en
futures-strategi till den plattformen var ett felaktigt implementation-specifikt
antagande.

Antagandet syntes i 232 referenser över 24 dokument, koncentrerade till
execution-, connectivity- och deploymentavsnitten.

Värt att notera: **själva tradinginnehållet var aldrig Forex-kontaminerat.** Granskningen
fann noll förekomster av `forex`, `CFD`, `pip` eller `lot size`, medan futures-vokabulären
redan var på plats — `tick value`, `tick size`, `contract specification`, `NQ`, `MNQ`,
`rollover`. Felet satt i plattformsvalet, inte i marknadsförståelsen.

### Beslut

Execution-arkitekturen ska vara **futures-native och provider-neutral**.

Ingen provider är vald. Tradovate, TradeSea och andra kompatibla futures-providers är
kandidater som ska utvärderas separat. Se GATE-15.

**Ny canonical auktoritetskedja:**

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Execution Provider Adapter → Futures Execution Provider → Journal & Analytics
```

Auktoritetsordningen och veto-lagren är **oförändrade**. Endast den externa
execution-noden har blivit provider-neutral.

**Logiskt obligatoriskt:** Execution Gateway och Execution Provider Adapter.

**Deployment-beroende:** ett separat Execution Runtime. När det behövs placeras det
mellan Gateway och Adapter. Det är inte längre modellerat som obligatorisk arkitektur,
och ingen executionplattform — Windows eller annan — är låst.

Extern faktisk account-, order-, position- och fill-state förblir source of truth för
faktisk exponering.

### Vad som uttryckligen INTE ändras

- **Tradingstrategin.** Entry, SL, TP, break-even, manipulation, sessions, setup grades,
  re-entry, news-regler och R:R är oförändrade. Strategy Canonical **v1.0** består.
- **Riskreglerna.** $150, $450 realized-only, daily reset, reserved risk, max en position,
  max tre attempts, veto, fail closed. Risk Canonical **v1.0** består.
- **Datamodellens struktur.** Inga entiteter, relationer eller states omdesignade.

### D1 — Systemarkitektur v0.1 → **v0.2**

Materiell arkitekturändring. Ändrade avsnitt: §2 (kedjan), nytt §2.1
(deployment-beroende noder), §18 (runtime, ej längre Windows-bundet), §19–20
(deployment/host), §22 (Execution Provider Adapter), nytt §22.1 (contract resolution),
§23 (Read-Only First). Filen är omdöpt till `…Systemarkitektur v0.2.md`.

### D2 — Kapitel 9 omskrivet och omdöpt

`09 - MetaTrader 5-integration.md` → `09 - Futures Execution Integration.md` via `git mv`,
så historiken förblir granskningsbar.

Strukturen är **bevarad** där resonemanget fortfarande gäller: connection lifecycle,
read-only mode, expected vs observed state, contract resolution, idempotens,
reconciliation, extern provider som source of truth, och separationen mellan Trading Core
och execution-infrastruktur. MT5-specifika antaganden är borttagna.

### D3 — Datamodell v0.1

Providerspecifika **exempelvärden** gjorda provider-neutrala. `MT5_status` →
`provider_status`. Ingen modellomdesign, ingen versionshöjning.

### D4 — Strategy Canonical v1.0

Endast §35:s referens till den externa execution-noden. Revisionsnotering tillagd.
**Ingen strategiregel ändrad**, ingen versionshöjning.

### D5 — Risk Canonical v1.0, nytt §7.1

Risk v0.1 lämnas **oredigerad**. I stället är en provider-neutral tolkningsregel införd i
det aktiva canonical-lagret: där v0.1 skriver `MT5` eller `broker/MT5` ska det läsas som
ett implementation-specifikt exempel på den externa providermiljön. Den normativa
innebörden är provider-neutral.

Att skriva om ett historiskt dokument för att dölja ett tidigare antagande skulle förstöra
revisionsspåret. **Ingen riskregel ändras**, ingen versionshöjning.

### D6 — Fas 2 omdefinierad

`Fas 2 – MT5 Read Only` → **`Fas 2 – Futures Connectivity (Read Only)`**.

Fasen handlar om säkert read-only proof of connectivity och observation av externt state
innan någon order-kapabilitet tillåts. Den är provider-neutral.

**Konsekvens:** Fas 2 var tidigare ogrindad. Dess **implementation** är nu grindad av
GATE-15 och GATE-16 — read-only-connectivity kan inte bevisas mot en provider som inte är
vald. Gaterna blockerar däremot **inte** capability review, security review, API- och
auth-granskning, providerjämförelse eller design av adapterkontraktet; det arbetet är
vägen till att stänga dem och skulle annars bli cirkulärt. Ingen ny subfas har införts.
Fas 1 påverkas inte och är redan genomförd.

### D7 — Gates, med deduplicering

Tre nya gates. Två befintliga fick förtydligat scope i stället för duplikat:

| Gate | Åtgärd |
|---|---|
| GATE-15 | **Ny.** Val av futures execution provider. BLOCKS FAS 2 IMPLEMENTATION |
| GATE-16 | **Ny.** Execution Provider Adapter-kontrakt. BLOCKS FAS 2 IMPLEMENTATION |
| GATE-17 | **Ny.** Execution runtime- och deploymenttopologi. BLOCKS EXECUTION |
| GATE-08 | **Scope förtydligat** att omfatta contract rollover och kontraktsserie. Ingen separat rollover-gate skapad |
| GATE-09 | **Scope förtydligat** att omfatta provider/prop firm-kompatibilitet. Ingen separat kompatibilitets-gate skapad |

Ingen befintlig gate har tappats eller bytt blockeringsfas, med ett undantag som är
avsiktligt och dokumenterat: Fas 2 går från ogrindad till grindad.

### D8 — Reviewdokument bevarade

`Canonical Review v1.0` och `Contradiction Register v1.0` citerar den gamla kedjan som
granskningsprotokoll. De är **inte** omskrivna. Båda har fått en daterad framåtpekande
not, så att en läsare ser att kedjan är ersatt utan att fyndprotokollet förfalskas.

---

## Beslut E — Första execution provider och Level 1-adapterkontrakt

**Datum:** 2026-08-28
**Karaktär:** Providerval och arkitekturkontrakt. **Inte** en strategiändring, **inte** en
riskändring.
**Stänger:** GATE-15 och GATE-16.

### Beslut

**Första Execution Provider Adapter: Rithmic R|Protocol API**, utvecklad mot Rithmic Test.

**Planerad andra adapter: Tradovate.**

**TradeSea är inte ett execution provider-mål.** Det är en front-end ovanpå Rithmic eller
motsvarande infrastruktur och ligger arkitektoniskt på samma nivå som Omnira själv.

Rithmic är **första implementationsmål, inte permanent exklusiv provider**. Omniras
execution-arkitektur förblir **multi-provider capable**, och Rithmic får inte hårdkodas i
Trading Core eller någonstans ovanför adaptergränsen.

### Rationale

Omnira är futures-native, och långsiktigt prop firm-stöd är fortsatt ett huvudmål. Rithmic
är direkt relevant i det funded-futures-ekosystem Omnira siktar mot — det är vad
infrastrukturen under stora delar av prop-världen faktiskt kör, inklusive TradeSea.

R|Protocol är ett infrastruktur-API snarare än en front-end. Det använder WebSockets och
Google Protocol Buffers, fungerar från valfritt språk och operativsystem, och passar en
cloud- och backendarkitektur. Rithmic Test tillåter utveckling före conformance, vilket gör
Fas 2 möjlig utan att först passera en certifieringsprocess. Server-side bracket-, OCO- och
riskkapabiliteter är strategiskt värdefulla i senare faser, och providerns state kan
fungera som authoritative extern execution state.

Avgörande för valet: risken att den första adaptern blir **disposable** är lägre här än på
alternativa vägar. Fas 2 är inte ett engångsbevis av kontraktet — det är första tekniska
steget mot den långsiktiga futures- och prop firm-vägen.

Tradovate förblir viktig som andra adapter: broker-diversifiering, en enklare REST- och
JSON-integrationsväg, och en möjlig väg via personligt konto.

### Vad Beslut E INTE innebär

Provider-valet innebär inte att produktionscredentials finns, att en broker- eller
FCM-relation finns, att prop firm-kompatibilitet är löst, att market data-licensiering är
löst eller att conformance är passerad. Dessa hör till senare implementations-, kommersiella
och deploymentbeslut.

### E1 — Level 1 Read Only-kontraktet låst

Nytt canonical dokument:

```
specifications/execution-provider/
  Omnira Trading System – Execution Provider Adapter
  – Level 1 Read Only – Canonical v1.0.md
```

Closure-grund för GATE-16: en `TradovateAdapter` och en `RithmicProtocolAdapter` kan
implementera samma Level 1-semantik utan att kontraktet ändras.

Providerskillnader uttrycks deterministiskt:

| Mekanism | States |
|---|---|
| `CapabilityState` | SUPPORTED · UNSUPPORTED · CONDITIONAL · UNKNOWN |
| `Available<T>` | PRESENT · UNAVAILABLE · UNKNOWN |
| `FillHistory.completeness` | COMPLETE · TRUNCATED · UNKNOWN |
| `CredentialMode` | READ_ONLY_ENFORCED · READ_WRITE_CAPABLE · UNKNOWN |

**Säkerhetsregel:** endast `SUPPORTED` uppfyller ett säkerhetskritiskt capability-krav.
`CONDITIONAL` och `UNKNOWN` fail closed. Dessa states får aldrig kollapsas till boolean,
eftersom UNKNOWN och UNSUPPORTED är olika fakta.

**Credential-semantik:** om Fas 2-credentials är bredare än nödvändigt rapporteras
`SECURITY_DEGRADED`. Det skapar ingen execution authority. Level 1 exponerar inga
order-metoder överhuvudtaget, så defense-in-depth uppnås genom frånvaro snarare än genom
behörighet.

**Kontraktsmetadata:** saknade providerfält gissas aldrig. Provider observation hålls skild
från canonical contract specification via ett `source`-fält. Detta interagerar med GATE-08
men stänger den inte.

**Fill history:** inget antagande om obegränsad eller komplett historik. Fas 2 behöver
endast tillräcklig recent history för att bevisa observation och reconciliation.

### E2 — Auktoritetsgränsen oförändrad

Fas 1-invarianten **authority is issued, not derived from data** gäller oförändrat. En
provider-observation är ett record och kan aldrig minta `RiskClearance`, `PropClearance`,
`ApprovalGrant` eller `ExecutionIntent`. Trading Cores auktoritetsimplementation är **inte
ändrad** i denna dokumentationsuppgift.

### E3 — Systemarkitektur v0.2 → v0.3

Nya avsnitt 22.2 (vald första provider) och 22.3 (provider-neutralt adapterkontrakt).
Evidens om runtime-topologi tillagd i avsnitt 18. Inget befintligt avsnitt omskrivet i sak.

### E4 — Gatepåverkan

| Gate | Utfall |
|---|---|
| GATE-15 | **STÄNGD** — Rithmic R\|Protocol som första provider |
| GATE-16 | **STÄNGD** — Level 1-kontraktet låst |
| GATE-17 | **ÖPPEN** — evidens tillagd att lokalt runner inte förväntas; topologin är fortfarande ett deploymentbeslut |
| GATE-08 | **ÖPPEN** — execution provider behöver inte vara market data-provider; ingen CME-avgift canonicaliseras |
| GATE-09 | **ÖPPEN** — Rithmic förbättrar anpassningen men bevisar ingen prop firm-access |

Fas 2 är därmed ogrindad. Kvarvarande arbete är implementationsförberedelse, inte gates.

### E5 — Providerresearch bevarad separat

Providerspecifik research ligger i `research/Provider Evaluation – Futures Execution –
2026-08-28.md` som **implementationsunderlag, inte canonical arkitektur**. Providerfakta
åldras; arkitekturen gör det inte. Inga providerspecifika endpoint-namn finns i det
canonical adapterkontraktet.

### Avgränsning

Ingen strategiregel och ingen riskregel ändras av Beslut E. Strategy förblir Canonical
v1.0, Risk förblir Canonical v1.0, och Trading Core-koden är orörd.

---

## Beslut F — Level-1 Provider Runtime Data Model Completion

**Datum:** 2026-08-29
**Föranlett av:** Trading Stage 1.8a steg 0. Inför runtime-transkriptionen av Level 1-kontraktet
konstaterades att kontraktet **inte var slutet under sin egen typvokabulär**.

### F1 — Den upptäckta luckan

`Result<T>` refereras i fjorton av femton metodsignaturer i Canonical v1.0 §6 och definieras
aldrig. Ytterligare femton typer namnges utan att definieras — i något av dokumenten under
`docs/trading-system`. En implementatör kunde därför inte transkribera §6 utan att **uppfinna**
semantik, och den första uppfinningen hade blivit de facto canon utan granskning.

Ansvarsfördelningen var låst. Vokabulären var det inte.

### F2 — Canonical v1.0 → v1.1

Ny canonical version:

```
specifications/execution-provider/
  Omnira Trading System – Execution Provider Adapter – Level 1 Read Only – Canonical v1.1.md
```

v1.0 arkiveras **oförändrad** till `archive/`. Dess låsta hash
`11cd194ebd82c83265002613558faa69d1c71cff7a1f37bfa0a906f38882172d` är därmed fortsatt
direkt verifierbar mot filen. Ingen superseded-banner har lagts till, eftersom en sådan
hade ändrat bytes och därmed förstört just den hash som ska gå att verifiera.

### F3 — Substantiella ändringar i v1.1

| Område | Ändring |
|---|---|
| Provider runtime-vokabulär | Komplett. Alla 16 tidigare odefinierade symboler definierade, plus åtta följdvokabulärer som uppstod under arbetet |
| `Result<T>` / `ProviderError` | Definierade. `Result<T>` är **domänlokal** för provider-kontraktet, inte en repo-global utility. `ProviderError.message` är operatörs- och felsökningstext och aldrig beslutsunderlag |
| `ProviderHealth` | Strukturerad yta — `verdict` + `reasonCodes` + `observedAt` — inte en naken `Verdict`. Löser motsättningen mellan v1.0 §7 och §4. `SECURITY_DEGRADED` skapar aldrig execution authority; huruvida en enskild nedströms policy måste fail closed är ett separat policybeslut som v1.1 inte föregriper |
| `ProviderAccountSnapshot` | Provider-observationen särskild från persistensmodellens `AccountSnapshot` (Datamodell §65). Enda ändrade v1.0-signatur. Inget alias tillåts |
| `PositionSnapshot` | Definierad som **provider-observation**, oberoende av persistensmodellens `Position` (Datamodell §40). Inget `originating_trade_id` — det kan en provider inte veta |
| `ProviderTimestamp` / `ProviderClock` | `ProviderTimestamp` är en egen branded provider-domäntyp. Brandingen uttrycker **härkomst**, inte förtroende, färskhet eller klocksynk. Ingen implicit konvertering från lokal `Timestamp`, ingen wall-clock-fallback |
| `Available<T>` | Förblir **skild** från replay-lagrets `ObservedValue<T>`. Identisk form betyder inte identiskt ägarskap |
| Känt flat | Representeras som ett lyckat resultat med noll positioner — aldrig som `PositionSide.FLAT`. Två representationer av samma verklighet ger två sätt att räkna fel |
| Marknadsdata | `quotes`, `bars` och `ticks` ligger **utanför** ExecutionProviderAdapter Level 1. "Read Adapter" i Systemarkitektur §22 är en bredare arkitektonisk kategori än Level 1-porten |
| Reason codes | `PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED` låsta i provider-vokabulären. Exakt två, inga andra |

### F4 — Vad som är oförändrat

| Oförändrat |
|---|
| **Exakt 15 Level 1-metoder** — namn, antal och ansvar |
| **Noll order-metoder.** `submitOrder` / `modifyOrder` / `cancelOrder` / `preflightOrder` är frånvarande, inte avstängda |
| Auktoritetsgränsen (Beslut E2). Authority is issued, not derived from data |
| `CapabilityState`, `Available<T>`, `CredentialMode`, `FillHistory.completeness` |
| `ContractSnapshot` och `HistoryRequest` |
| Provider-neutralitet — inga endpoint-namn, ingen providerspecifik autentisering |

### F5 — Avvisat vid granskning

Tre förslag i kandidaten avslogs eftersom de inte var tvingade av låst canon:
`requestedCredentialMode` på `ProviderConfig`, `maxPageSize` på `HistoryWindowCapability`,
och `FLAT` som `PositionSide`-värde. Skälen står i v1.1 F4, F7 och F10.

### F6 — Gatepåverkan

**GATE-08 förblir ÖPPEN.** v1.1 definierar kontraktsresolutions*typer*, inte
resolutions*policy*. Front month, continuous contract, symbolprefix-heuristik och
rolloverkalender är uttryckligen förbjudna i implementationer av `resolveContract`, som i
stället failar closed med `INVALID_INSTRUMENT_STATE` vid tvetydighet.

**GATE-16 förblir STÄNGD.** Dess closure-grund var multi-provider-semantisk neutralitet —
att en `TradovateAdapter` och en `RithmicProtocolAdapter` kan implementera samma Level 1 utan
att kontraktet ändras. Den grunden är oförändrad. Att kontraktet var semantiskt neutralt och
att det var implementerbart utan uppfinning är två olika egenskaper; gaten stängdes på den
första, och Beslut F levererar den andra.

### F7 — Vad Beslut F inte innebär

Promotionen stänger **specifikationsluckan**. Den påstår ingenting om kod.

Runtime-implementation är **ej påbörjad**. Provider-implementation är **ej påbörjad**.
Rithmic-integration är **ej påbörjad**. De två nya reason codes är låsta i canon men **inte
transkriberade** till Trading Cores register — det hör till Stage 1.8a. Execution och live
trading är fortsatt förbjudna.

### F8 — Ändrade filer

| Fil | Not |
|---|---|
| `specifications/execution-provider/…Canonical v1.1.md` | F2 — ny, aktiv source of truth |
| `archive/…Canonical v1.0.md` | F2 — flyttad via `git mv`, **bytes oförändrade**, historisk hash intakt |
| `archive/README.md` | F2 — rad tillagd |
| `SOURCE_OF_TRUTH.md` | F2 — provider-kontraktet pekar på v1.1 |
| `CHECKSUMS.md` | F2 — v1.1 tillagd, v1.0 flyttad till arkivsektionen med oförändrad hash |
| `reviews/Canonical Amendments v1.0.md` | F — detta avsnitt |

---

## Beslut G — Self-Contained Contract and Asynchronous Port Semantics

**Datum:** 2026-08-30
**Föranlett av:** Trading Stage 1.8a steg 0, andra försöket. Runtime-transkriptionen stoppades
igen — den här gången av två luckor som uppstod i själva v1.1-promotionen.

### G1 — Det aktiva kontraktet ska vara självbärande

v1.1 skrevs som ett amendment som *citerade* v1.0:s §1–§9 i stället för att återge dem. Vid
promotionen ersatte v1.1 v1.0 som enda aktiva källa, och de citerade sektionerna följde inte
med. Resultatet var att aktiv canon krävde en arkiverad fil för att kunna implementeras,
medan `archive/README.md` förbjuder arkiverade filer som implementationsunderlag.

Regeln låses: **ingen aktiv providertyp får kräva en arkiverad specifikation för att förstås.**

### G2 — Sju definitioner återges oförändrade

`CapabilityState` (§3) · `ProviderCapabilities` (§3.1, fjorton fält) · `CredentialMode` (§4) ·
`Available<T>` (§5) · `ContractSnapshot` (§7.1, elva fält) · `HistoryRequest` och
`FillHistory` (§7.2).

Varje sektion bär märkningen **UNCHANGED RESTATEMENT FROM CANONICAL v1.0**. Ingen definition
är omdesignad. Arkiverad v1.0 lästes enbart som historiskt källmaterial.

Ägarskapet gjordes samtidigt maskinellt kontrollerbart: §7.0 deklarerar `ProviderId`,
`ContractId` och `ProviderTimestamp` explicit som **providerkontraktets** branded ids. Core
bidrar med brandingmekanismen, inte med dessa typers semantik.

### G3–G5 — Porten är asynkron

v1.0 och v1.1 uttalade aldrig frågan; signaturerna lästes implicit synkront. En
nätverksansluten provider kan inte ärligt uppfylla ett synkront kontrakt.

```
Result<T>  →  Promise<Result<T>>     fjorton metoder
void       →  Promise<void>          endast disconnect
```

`disconnect` blir **inte** `Promise<Result<void>>`. Det skulle införa ny felsemantik i stället
för enbart asynkron slutförandesemantik, och v1.0 gav `disconnect` inget felutfall.

`getRecentFills` behåller **båda** sina parametrar — `(accountId: AccountId, window:
HistoryRequest)`. Att slå ihop dem till en enda `HistoryRequest` skulle ta bort informationen
om vems fills som efterfrågas, vilket vore en ändring av affärssemantik och inte av
portsemantik.

### G6 — Observationer är readonly

v1.0 §7 sade att observationer är immutabla; ingen sade vad det betyder i TypeScript. §10
låser det: providerobservationer och värdeobjekt transkriberas med readonly-fält och
readonly-samlingar. Adapterinstansen själv är inte immutabel, och ingen mutationsmetod införs.

### G7 — Asynkronitet implicerar ingen transport

Portsemantik, ingenting annat. Den implicerar inte Rithmic, WebSocket, HTTP, trådar,
bakgrundsarbetare, retry-, timeout- eller reconnect-policy. Felsemantiken är oförändrad: ett
misslyckande är `Result` med `ok: false`, aldrig ett kastat fel och aldrig ett tomt värde.

### G8 — Ingen övrig affärssemantik ändrad

Femton metoder, samma namn, samma ansvar, samma parametrar. Noll order-metoder. Noll nya
typer. Auktoritetsgränsen oförändrad — en Promise kan inte minta en capability. GATE-08
förblir öppen, GATE-16 förblir stängd. De två reason codes från Beslut F är fortfarande inte
transkriberade till Trading Core; det hör till Stage 1.8a.

### G9 — Ändrade filer

| Fil | Not |
|---|---|
| `specifications/execution-provider/…Canonical v1.2.md` | G1–G8 — ny, aktiv source of truth |
| `archive/…Canonical v1.1.md` | Flyttad via `git mv`, **bytes oförändrade**, hash `11d9077a…` intakt |
| `archive/…Canonical v1.0.md` | Orörd |
| `archive/README.md` | Rad tillagd för v1.1 |
| `SOURCE_OF_TRUTH.md` | Provider-kontraktet pekar på v1.2 |
| `CHECKSUMS.md` | v1.2 tillagd, v1.1 flyttad till arkivsektionen med oförändrad hash |
| `reviews/Canonical Amendments v1.0.md` | G — detta avsnitt |

---

## Dokument som medvetet **inte** ändrades

| Dokument | Varför |
|---|---|
| Kapitel 1 | Skiljer redan korrekt mellan kill switch och emergency close |
| Kapitel 12 | Skiljer redan korrekt intern realiserad modell från prop equity-modeller |
| Kapitel 2, 5–9, 14, 15, 17–20 | Ingen formulering i konflikt med de nya reglerna |
| Systemarkitektur v0.1 | Auktoritetskedjan berörs inte av dessa beslut |
| Samtliga `.docx` | Bevaras som oförändrade original |

---

## Beslut H — Kanoniska reason codes för providerkonnektivitet

**Stänger:** Vokabulärluckan som R1A dokumenterade som OPEN
**Karaktär:** Additiv utökning av reason code-registret, plus upphävandet av en enda mening

R1A (provider session runtime) kan skilja på nio sätt som en providersession kan sluta på.
Registret kunde inte uttrycka skillnaden: sju kollapsade till `PROVIDER_DISCONNECTED`, och
nekad autentisering rapporterades tillfälligt som `SECURITY_DEGRADED` — en kod som enligt
v1.2 §8 betyder *credential bredare än begärt* och alltså beskrev fel sak.

R1A märkte den mappningen som tillfällig när den skrevs. Beslut H tar bort den.

**Canonical betydelse:**

```
SessionFailure → ReasonCode är 1:1, total och injektiv
Ingen konnektivitetsfailure rapporteras längre som
  PROVIDER_DISCONNECTED eller SECURITY_DEGRADED
```

### H1 — Ny specifikation

`specifications/execution-provider/…Provider Connectivity Reason Codes – Canonical v1.0.md`
skapad. Låser nio koder, deras semantik, förhållandet till de två befintliga
providerkoderna, samt att retry-policy och auktoritet inte ingår.

Execution Provider Adapter Canonical v1.2 skrivs **inte** om. Beslut H rör en mening i dess
§8 och ingenting annat.

### H2 — Execution Provider Adapter Canonical v1.2 §8, sista stycket

**Före:**

> `PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED` är låsta i providervokabulären genom
> Beslut F och är ännu **inte** transkriberade till Trading Cores register. Det hör till
> Stage 1.8a. Inga ytterligare reason codes tillkommer.

**Efter:**

> `PROVIDER_DISCONNECTED` och `SECURITY_DEGRADED` är låsta i providervokabulären genom
> Beslut F. Transkriptionen till Trading Cores register skedde i Stage 1.8a. Ytterligare
> reason codes tillkommer inte genom *detta* dokument; providerkonnektivitetens koder låses
> separat i *Provider Connectivity Reason Codes Canonical v1.0* (Beslut H).

**Varför:** meningen skrevs innan någon runtime existerade som kunde observera
skillnaderna. Den beskrev korrekt att Level 1-kontraktet inte behövde fler koder, men kunde
inte förutse att en sessionsruntime skulle göra det. Endast den meningen ändras; §8:s
tabell, förbudet mot providerspecifika felsträngar som beslutsunderlag och rätten att
bevara rå providerresponse för journalen står oförändrade.

### H3 — `apps/web/lib/trading/reason-codes.ts`

Nio koder tillagda i gruppen för providerobservationer. Inget befintligt värde ändrat,
omdöpt, flyttat eller borttaget. Källkommentaren pekar nu även på H1.

### H4 — `apps/web/lib/trading/provider-runtime/failure.ts`

`reasonCodeOf` är nu 1:1. Den förlustgivande mappningen beskrivs endast som historik och är
märkt SUPERSEDED.

### H5 — Prospektiv verkan

Historiska rader migreras inte och omtolkas inte. En historisk `PROVIDER_DISCONNECTED`
betyder vad den betydde när den skrevs.

---

## Ändrade filer

| Fil | Ändring |
|---|---|
| `specifications/strategy/…Canonical v1.0.md` | A1–A4, A7 |
| `book/chapters/03 - Strategispecifikation.md` | A5 |
| `book/chapters/04 - Riskhantering.md` | B1–B3 |
| `book/chapters/10 - Backtesting.md` | A8 |
| `book/chapters/11 - Forward testing.md` | A6, B5 |
| `book/chapters/13 - Tradingjournal.md` | A7 |
| `book/chapters/16 - Säkerhet och kill switches.md` | B4 |
| `specifications/data-model/…v0.1.md` | A7 |
| `specifications/risk/…v0.1.md` | Historik-banner |
| `specifications/risk/…Canonical v1.0.md` | Ny, B6 |
| `archive/…CANDIDATE.md` | Flyttad, superseded-banner |
| `specifications/architecture/…v0.1.md → v0.2.md` | C1 — §24.1. D1 — futures-native, omdöpt |
| `SOURCE_OF_TRUTH.md` | C — låst värde. D — kedja, gates, versioner |
| `book/chapters/09 …` | D2 — omskrivet och omdöpt via `git mv` |
| `book/chapters/01, 03, 04, 05, 06, 08, 11, 13, 15, 16, 17, 18, 20` | D — provider-neutral terminologi |
| `specifications/data-model/…v0.1.md` | A7 — fält. D3 — provider-neutrala exempel |
| `specifications/risk/…Canonical v1.0.md` | B6 — promotion. D5 — nytt §7.1 |
| `specifications/strategy/…Canonical v1.0.md` | A1–A4, A7. D4 — §35-referens |
| `reviews/Open Implementation Gates v1.0.md` | D7 — GATE-15/16/17, scope, fastabell |
| `reviews/Canonical Review v1.0.md` | D8 — framåtpekande not |
| `reviews/Contradiction Register v1.0.md` | D8 — framåtpekande not |
| `README.md` | D — kedja, roadmap, gates. E — provider, roadmap |
| `specifications/execution-provider/…Level 1 Read Only – Canonical v1.0.md` | E1 — ny, provider-neutralt kontrakt |
| `research/Provider Evaluation – Futures Execution – 2026-08-28.md` | E5 — ny, implementationsunderlag |
| `specifications/architecture/…v0.2.md → v0.3.md` | E3 — §22.2, §22.3, §18 |
| `specifications/execution-provider/…Provider Connectivity Reason Codes – Canonical v1.0.md` | H1 — ny, nio konnektivitetskoder |
| `specifications/execution-provider/…Level 1 Read Only – Canonical v1.2.md` | H2 — §8, sista stycket |
| `specifications/README.md` | H1 — indexrad |
