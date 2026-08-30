# SOURCE OF TRUTH – Omnira Trading System

**Version:** v1.4 · **Datum:** 2026-08-28 · **Paketstatus:** **Canonical v1.2**

> Maskinläsbart index över vilket dokument som gäller för vilken fråga, och vilken
> källa som vinner när två dokument säger olika saker.
>
> **Framtida agenter får inte avgöra precedens själva.** Reglerna står här.

---

## 1. Register

| Domän | Canonical källa | Version | Status |
|---|---|---|---|
| Strategi | `specifications/strategy/Omnira Liquidity Manipulation – Trading Strategy Specification – Canonical v1.0.md` | **Canonical v1.0** | Låst. Rev. 2026-08-27, CLOSED-03 |
| Risk | `specifications/risk/Omnira Trading System – Risk Engine Specification – Canonical v1.0.md` | **Canonical v1.0** | Låst. 0 öppna riskbeslut |
| Bok | `book/chapters/*.md` och `book/final/…Canonical v1.0.pdf` | **Canonical v1.0** | Låst |
| Arkitektur | `specifications/architecture/Omnira Trading System – Systemarkitektur v0.3.md` | **v0.3** | Fas 0-baseline. Canonical för auktoritetskedjan (P5), execution safety-invarianten §24.1, vald första provider §22.2 och adapterkontraktet §22.3 |
| Execution Provider Adapter | `specifications/execution-provider/…Level 1 Read Only – Canonical v1.2.md` | **Canonical v1.2** | Låst, **självbärande** provider-neutralt Level 1-kontrakt. Exakt 15 asynkrona metoder, noll order-metoder (Beslut G) |
| Datamodell | `specifications/data-model/Omnira Trading System – Datamodell v0.1.md` | v0.1 | Fas 0-baseline. Rev. 2026-08-27, additivt fält |
| Öppna gates | `reviews/Open Implementation Gates v1.0.md` | v1.0 | Aktiv, 11 öppna |
| Ändringsspår | `reviews/Canonical Amendments v1.0.md` | v1.0 | Aktiv |
| Motsägelser | `reviews/Contradiction Register v1.0.md` | v1.0 | Aktiv |
| Review | `reviews/Canonical Review v1.0.md` | v1.0 | Aktiv |
| Prop firm-profiler | `specifications/prop-firm/` | — | Tom, GATE-09 |
| Pattern detection | `specifications/pattern-detection/` | — | Tom, GATE-01, GATE-02 |

### Historiska och arkiverade — aldrig implementationsunderlag

| Dokument | Varför |
|---|---|
| `specifications/risk/…v0.1.md` | Föregångare. Normativ endast för det som Canonical v1.0 inte ändrar. Dess OPEN-RISK-lista är **stängd**, inte aktuell |
| `archive/…Canonical v1.0 CANDIDATE.md` | Superseded 2026-08-27 |
| `archive/…Execution Provider Adapter – Level 1 Read Only – Canonical v1.0.md` | **Superseded 2026-08-29 av Canonical v1.1 (Beslut F).** Historisk canonical version — giltig som revisionsspår, inte som implementationsunderlag. Bevarad oförändrad; hash `11cd194e…` fortsatt verifierbar |
| `archive/…Execution Provider Adapter – Level 1 Read Only – Canonical v1.1.md` | **Superseded 2026-08-30 av Canonical v1.2 (Beslut G).** Historisk canonical version — giltig som revisionsspår, inte som implementationsunderlag. Bevarad oförändrad; hash `11d9077a…` fortsatt verifierbar. Den var inte självbärande: sju definitioner låg kvar i v1.0 |
| `archive/…Canonical Candidate v1.0.pdf` | Superseded av Canonical v1.0-PDF:en |
| `book/source/*.docx`, `specifications/**/*.docx` | Historiska original. Kan avvika från `.md` |
| `book/source/09 - MetaTrader 5-integration.docx` | **v1.0-källmaterial.** Behåller sitt ursprungliga namn. Aktiv kapitelkälla är `book/chapters/09 - Futures Execution Integration.md` |

### Filformatsprecedens

`.md` slår `.docx`. Alltid. Utan undantag.

Kapitel 3, 4, 10, 11, 13 och 16 samt strategi- och datamodellspecifikationerna ändrades
2026-08-27 i `.md`. Deras `.docx`-original lämnades orörda som revisionsspår.

---

## 2. Precedensregler

Tillämpas i ordning. Första regel som träffar avgör.

### P0 — Arkiverat och historiskt är aldrig källa

Dokument i `archive/`, `.docx`-original, och `Risk Engine Specification v0.1` får aldrig
användas som implementationsunderlag. De finns för revision. Om ett sådant dokument
motsäger en aktiv canonical källa vinner alltid den aktiva.

### P1 — Öppen gate slår allt

Om frågan är listad som öppen gate: **ingen källa vinner.** Implementera inte.
Eskalera till människa. Detta gäller även om ett dokument verkar ge ett svar.

### P2 — Domänägaren vinner inom sin domän

| Fråga | Avgörs av |
|---|---|
| Entry, SL, TP, BE, grades, sessioner, re-entry, news-timing, R:R | Strategy Specification |
| Riskgränser, position sizing, daily loss, veto, fail closed | Risk Engine Specification (kandidat före v0.1) |
| Auktoritetskedja, lagerindelning, komponentansvar | Systemarkitektur v0.3 |
| Entiteter, fält, states, persistens | Datamodell v0.1 |
| Prop firm-regelmodell | Kapitel 12, tills en faktisk PropFirmProfile finns |

### P3 — Specifikation slår bok inom specifikationens domän

Vid konflikt om en strategiregel vinner Strategy Specification över kapiteltexten.

**Undantag:** där boken *löser* något som specifikationen uttryckligen lämnat öppet,
vinner boken. Detta är fallet för samtliga åtta OPEN-RISK-poster, som löses av
Kapitel 4 och är införda i riskkandidaten.

### P4 — Senare explicit låsning slår tidigare öppen formulering

En fråga som var öppen i v0.1 och sedan uttryckligen låsts i ett senare dokument är
låst. Den öppna formuleringen är historik.

Tillämpat på OPEN-RISK-01 till 08, som samtliga är stängda i Risk Engine Specification
Canonical v1.0.

### P5 — Fullständig återgivning slår förkortad

Där ett dokument återger en kedja eller lista förkortat, vinner den fullständiga
återgivningen.

**Tillämpat:** Systemarkitektur v0.3 §2 är canonical för auktoritetskedjan.
Strategy Specification §35 är en delvy och utelämnar Execution Gateway. Se C-04.

### P6 — Striktaste gräns vinner

Där två giltiga risklager anger olika tillåtna gränser gäller den striktaste
praktiskt tillämpliga. Om minsta handlingsbara quantity inte ryms inom den: `DENY`.

### P7 — Fail closed

Om precedens inte kan avgöras med P1–P6, och frågan påverkar execution: behandla som
öppen gate. Blockera. Fråga.

---

## 3. Auktoritetskedja

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Execution Provider Adapter → Futures Execution Provider → Journal & Analytics
```

Canonical källa: Systemarkitektur v0.3 §2 och §2.1.

---

## 4. Låsta värden

Får inte härledas, avrundas eller ändras i kod.

| Parameter | Värde | Källa |
|---|---|---|
| Max risk per trade | $150 | Strategy §28, Risk §85, Kapitel 4 |
| Intern max daily loss | $450 realiserad | Kapitel 4 |
| Daily reset | 00:00 America/New_York | Kapitel 4 |
| Max öppna positioner | 1 | Strategy §25, Risk §20 |
| Max attempts per 4H thesis | 3 | Strategy §27 |
| London entry window | 02:00–05:00 America/New_York | Strategy §6 |
| New York entry window | 10:00–12:00 America/New_York | Strategy §6 |
| Minimum R:R | 2.0 | Strategy §19–20 |
| News blackout, nya entries | T-1h → T+4h | Strategy §30 |
| News exit, befintlig position | T-15m | Strategy §30 |
| New York max trade duration | 4h från entry | Strategy §32 |
| London max trade duration | Ingen | Strategy §31 |
| Partial profits | Nej | Strategy §22 |
| Kontinuerlig trailing | Nej | Strategy §23 |
| Tidszon | America/New_York, aldrig fast UTC-4 | Strategy §5 |
| London window-close BE | Öppen 05:00 → SL = entry price | Strategy §21.1, §31, CLOSED-03 |
| Break-even trigger-typer | SWING och WINDOW_CLOSE | Strategy §21, §21.1 |
| Daily loss beräkningsbas | Realized only | Risk Canonical v1.0 §3.1 |
| Reserved risk | Pre-entry, ändrar ej mätaren | Risk Canonical v1.0 §5 |
| Daily stop state | BLOCKED / DAILY_STOP, persistent | Risk Canonical v1.0 §4 |
| Intern floating force-close | Finns inte | Risk Canonical v1.0 §4.1 |
| ExecutionIntent-livstid | `now < expiresAt <= min(proposal, approval)` | Systemarkitektur §24.1, Beslut C |
| Första execution provider | Rithmic R\|Protocol (ej exklusiv) | Systemarkitektur §22.2, Beslut E |
| Andra planerade adapter | Tradovate | Beslut E |
| Level 1 order-metoder | Noll | Execution Provider Adapter Canonical v1.2 §1.1 |
| Level 1 metodantal | Exakt 15 | Adapter Canonical v1.2 §6, F15 |
| Level 1 portsemantik | Asynkron — 14 `Promise<Result<T>>`, 1 `Promise<void>` | Adapter Canonical v1.2 §6 |
| Provider-observation grantar authority | Aldrig | Adapter Canonical v1.2 §2 |
| Capability-semantik | Endast SUPPORTED uppfyller säkerhetskrav | Adapter Canonical v1.2 §3 |
| Känt flat | Lyckat resultat med noll positioner — aldrig `PositionSide.FLAT` | Adapter Canonical v1.2 F10 |
| `Available<T>` vs `ObservedValue<T>` | Skilda typer, inget alias | Adapter Canonical v1.2 F14.1 |
| `ContractId` / `ProviderId` / `ProviderTimestamp` | Ägs av providerkontraktet, inte av Core | Adapter Canonical v1.2 §7.0 |

---

## 5. Öppna gates

Fullständig lista och klassificering: `reviews/Open Implementation Gates v1.0.md`.

| Gate | Blockerar |
|---|---|
| GATE-01 iFVG-detektion | Strategy Engine |
| GATE-02 CISD-detektion | Strategy Engine |
| GATE-03 equal-high/low-tolerans | Strategy Engine |
| GATE-04 SMT correspondence | Strategy Engine |
| GATE-06 news-provider | Execution |
| GATE-07 high-impact-klassificering | Execution |
| GATE-08 marknadsdataprovider | Strategy Engine |
| GATE-09 första PropFirmProfile | Prop Mode |
| GATE-12 execution margin/slippage | Execution |
| GATE-13 promotion thresholds | Live |
| GATE-14 live safety policies | Live |
| GATE-17 execution runtime/deploymenttopologi | Execution |

**Fas 1 är ogrindad** och genomförd (PR #96). **Fas 2 – Futures Connectivity (Read Only)
är ogrindad** sedan GATE-15 och GATE-16 stängdes 2026-08-28. Första implementationsmål:
Rithmic R|Protocol mot Rithmic Test.

**Stängda 2026-08-27:** GATE-05 (London window-close BE), GATE-10 (daily-loss force
close), GATE-11 (reserved risk).

**Tillkomna 2026-08-28:** GATE-15, GATE-16, GATE-17 efter Beslut D. GATE-08 och GATE-09
fick förtydligat scope i stället för nya duplicerande gates.

**Stängda 2026-08-28:** GATE-15 (Rithmic R|Protocol som första provider) och GATE-16
(Level 1-adapterkontraktet) genom Beslut E. GATE-17, GATE-08 och GATE-09 kvarstår öppna.
Se `reviews/Canonical Amendments v1.0.md`.

---

## 6. Ändring av detta index

`SOURCE_OF_TRUTH.md` uppdateras när ett dokument promoveras, en gate stängs eller en
ny canonical källa tillkommer.

Uppdatering ska ske i samma commit som den ändring den beskriver, och aldrig av en
agent på eget initiativ.
