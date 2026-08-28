> # ⚠ SUPERSEDED — ARKIVERAD
>
> Detta dokument är **inte** aktiv source of truth.
>
> Det ersattes 2026-08-27 av
> `specifications/risk/Omnira Trading System – Risk Engine Specification – Canonical v1.0.md`
> när RISK-GATE-01 stängdes.
>
> Dokumentet bevaras enbart som revisionsspår över promotionen v0.1 → CANDIDATE → Canonical v1.0.
> Använd det aldrig som underlag för implementation.

---

# Omnira Trading System – Risk Engine Specification

**Version:** Canonical v1.0 **CANDIDATE**
**Datum:** 2026-08-27
**Dokumentspråk:** Svenska
**Föregångare:** Risk Engine Specification v0.1 (Fas 0)
**Primär strategi:** Omnira Liquidity Manipulation – Canonical v1.0
**Riskprincip:** Risk Engine har absolut veto över trading

> **Status: CANDIDATE, inte Canonical.**
> Sju av åtta öppna riskbeslut från v0.1 är lösta. Ett kvarstår — se avsnitt 4.
> Dokumentet får användas som implementationsunderlag för Fas 1 och Fas 2.
> Risk Engine (Fas 5) får inte implementeras innan RISK-GATE-01 är stängd.

---

## 1. Dokumentets förhållande till v0.1

Detta dokument är en **kontrollerad delta** över Risk Engine Specification v0.1.
Det ersätter inte v0.1 som text.

- Samtliga sektioner i v0.1 som inte uttryckligen ändras nedan gäller **oförändrat**
  och normativt.
- v0.1 §84 *Open Decisions Before Canonical v1.0* ersätts i sin helhet av avsnitt 3
  och 4 nedan.
- Ingen riskregel har ändrats i sak av denna review. Varje resolution nedan har en
  namngiven källa i det låsta bokmaterialet.

Deltaformen är avsiktlig: en fullständig omskrivning av 87 sektioner skulle riskera
oavsiktlig regeldrift, vilket bevaranderegeln för denna review förbjuder.

**Källa för samtliga resolutioner:** Kapitel 4 – Riskhantering, i
*Omnira Trading System – Från strategi till autonom exekvering*.

---

## 2. Låst riskbaslinje

Oförändrad från v0.1 §85 och Strategy Specification §28. Ingen av dessa får ändras
utan ny RiskProfile-version.

| Parameter | Värde |
|---|---|
| Max risk per trade | $150 |
| Intern max daily loss | $450 |
| Max öppna positioner | 1 |
| Max attempts per 4H thesis | 3 |
| Teknisk SL flyttad för riskanpassning | Förbjudet |
| Minsta handlingsbara quantity över riskbudget | `DENY` |
| Risk Engine-auktoritet | Veto |
| Beteende vid osäkerhet | Fail closed |
| Normal human override av hard `DENY` | Finns inte |

---

## 3. Lösta öppna riskbeslut

### 3.1 OPEN-RISK-01 → LÖST — Intern daily loss-beräkningsmetod

**Ersätter v0.1 §16.**

Den interna Omnira-daily-loss-mätaren baseras på **realiserad förlust**.

Floating/unrealized P/L används **inte** som den interna mätaren.

Denna modell är uttryckligen skild från en prop firms daily-loss-modell, som kan vara
equity-baserad och därmed inkludera öppna förluster. Prop Firm Rules Engine hanterar
den modellen separat. En trade måste passera båda.

*Källa: Kapitel 4, avsnitt "Daily drawdown".*

> **Kvarvarande koherensfråga:** se avsnitt 4, RISK-GATE-01.

### 3.2 OPEN-RISK-02 → LÖST — Daily reset policy

**Ersätter v0.1 §17.**

Den interna daily risk-budgeten återställs vid **00:00 America/New_York**.

Detta är den canonical tradingdagen för den interna riskmodellen. Serverns lokala
tidszon får aldrig användas som implicit daily reset.

*Källa: Kapitel 4, avsnitt "Daily reset".*

### 3.3 OPEN-RISK-03 → LÖST — Separat max trades per day

**Ersätter v0.1 §25.**

**Ingen separat `max_trades_per_day` är aktiv i v1.0.**

Volymen styrs av strategins övriga begränsningar: max tre attempts per 4H thesis,
max en öppen position, två trading windows.

Risk Engine ska fortsatt **stödja** parametern enligt v0.1 §25 för framtida bruk med
flera sessioner, instrument eller strategier. Stöd i modellen och aktivering i
profilen är olika saker.

*Källa: Kapitel 4, avsnitt "Initial riskmodell".*

### 3.4 OPEN-RISK-04 → LÖST — Intern max total drawdown

**Ersätter v0.1 §26.**

**Ingen separat intern total drawdown-gräns är aktiv i v1.0.**

Risk Engine ska fortsatt stödja `max_total_drawdown` med explicit metodval i
RiskProfile enligt v0.1 §26. Prop firm-drawdown hanteras separat enligt v0.1 §27.

*Källa: Kapitel 4, avsnitt "Initial riskmodell".*

### 3.5 OPEN-RISK-05 → LÖST — Spread threshold

**Ersätter v0.1 §29.**

**Inget spread-filter är aktivt i v1.0.**

Risk Engine ska fortsatt stödja en instrumentspecifik, konfigurerbar och
versionsstyrd spreadregel enligt v0.1 §29. Ingen tröskel är satt för NQ/MNQ.

Notera samspelet med GATE-12: när execution calibration senare låser
slippage- och marginalmodellen bör spreadtröskeln sättas i samma omgång.

*Källa: Kapitel 4, avsnitt "Initial riskmodell".*

### 3.6 OPEN-RISK-06 → LÖST — Losing-streak protection

**Ersätter v0.1 §37.**

**Ingen extra losing-streak-regel utöver daily stop är aktiv i v1.0.**

Risk Engine ska fortsatt kunna mäta `consecutive_losses` enligt v0.1 §37, och ska
fortsatt kunna framtvinga safety cooldown vid system- eller riskincident enligt
v0.1 §36. Ingen sådan regel är canonical som normal trading-regel.

*Källa: Kapitel 4, avsnitt "Initial riskmodell".*

### 3.7 OPEN-RISK-07 → LÖST I ORDALYDELSE — Öppen position vid daily breach

**Ersätter v0.1 §51.**

Om en position fortfarande är öppen när daily-loss-gränsen bryts ska positionen
**stängas direkt**.

Detta är en explicit riskregel, inte en rekommendation.

*Källa: Kapitel 4, avsnitt "Daily stop".*

> **Denna resolution är ordagrant entydig men logiskt ofullständig.**
> Se avsnitt 4, RISK-GATE-01. Detta är det enda som hindrar promotion.

### 3.8 OPEN-RISK-08 → LÖST — Margin utilization limits

**Ersätter v0.1 §57.**

**Ingen separat margin utilization-gräns är aktiv i v1.0.**

Risk Engine ska fortsatt stödja `minimum free margin` och
`maximum margin utilization` enligt v0.1 §57, och Broker Tradeability Gate enligt
v0.1 §56 gäller oförändrat — inklusive kontrollen av tillräcklig margin före
execution.

*Källa: Kapitel 4, avsnitt "Initial riskmodell".*

---

## 4. Kvarvarande blockerare

### RISK-GATE-01 — Daily-loss force close saknar nåbar trigger

**Klass:** BLOCKS EXECUTION
**Motsvarar:** Contradiction Register C-01, Open Implementation Gates GATE-10

Tre låsta regler ger tillsammans ett tomt utfallsrum:

1. Den interna daily-loss-mätaren är **realiserad** (avsnitt 3.1).
2. En öppen position ska **tvångsstängas** om dagsgränsen bryts (avsnitt 3.7).
3. `max_open_positions = 1`, och ingen ny position får öppnas medan en är öppen
   (v0.1 §20, Strategy §25).

Med en realiserad mätare och högst en position kan mätaren bara passera $450 i det
ögonblick positionen stängs och förlusten realiseras. Då finns ingen öppen position
kvar att stänga. Regeln i avsnitt 3.7 har därmed ingen nåbar trigger.

**Vad som måste beslutas — av en människa, inte i kod:**

| Alternativ | Innebörd |
|---|---|
| A | Gränsbrottsdetektion för force close sker på equity-/unrealized-basis, medan den journalförda mätaren förblir realiserad. Regeln blir aktiv och meningsfull. |
| B | Regeln erkänns som redundant i v1.0 och omformuleras som framtidsregel för `max_open_positions > 1`. |

Tills valet är gjort får implementationen **inte** anta någondera tolkningen.

**Relaterad, vilande fråga:** v0.1 §18 *Reserved Risk* kräver att en öppen positions
återstående möjliga förlust reserveras mot dagsbudgeten. Det är förenligt med en
realiserad mätare om man skiljer admission control från utfallsmätning, men det står
ingenstans uttryckt. Frågan är praktiskt vilande vid `max_open_positions = 1` och
blir aktiv först vid flera positioner. Se GATE-11.

---

## 5. Villkor för promotion till Canonical v1.0

Detta dokument promoveras till `Risk Engine Specification – Canonical v1.0` när:

1. RISK-GATE-01 är stängd genom explicit beslut (alternativ A eller B), och
2. beslutet är infört i detta dokument med källhänvisning, och
3. promotion registreras som ett explicit event enligt Kapitel 20
   *Promotion Record*.

Ingen ytterligare granskning krävs. Övriga sju resolutioner är rena.

---

## 6. Oförändrat i kraft

Samtliga övriga sektioner i Risk Engine Specification v0.1 gäller oförändrat, i
synnerhet:

determinism (§3); fail closed (§4); reason codes (§6); RiskProfile-struktur (§7);
position sizing med avrundning nedåt (§10); technical stop integrity (§11); minimum
tradable quantity (§12); reserved risk (§18); break-even risk (§19); max open
positions (§20); unknown positions (§21); manuella externa positioner (§22); attempts
(§23–24); prop firm-separation (§27); slippage guard (§30); revalidation före
execution (§31); proposal expiry (§32); session- och news-filter (§33–35); kill
switches (§48–50); account-, market data-, clock-, execution- och tradeability gates
(§52–56); RiskDecision (§59); warning kontra failure (§61); restart safety (§72);
network failure (§73); broker-native protection (§74); prop firm-interaktion (§75);
conservative rule resolution (§76); autonomy boundary (§77); no martingale (§45);
no revenge logic (§46); positiv P/L utvidgar inte hard limits (§47); human override
finns inte (§70); numeric precision (§82); risk audit (§83); och den
konstitutionella regeln (§87).

---

**Dokumentstatus**

| Fält | Värde |
|---|---|
| Version | Canonical v1.0 CANDIDATE |
| Öppna riskbeslut | 1 av ursprungliga 8 |
| Blockerare | RISK-GATE-01 |
| Implementation | Ej påbörjad |
| Execution | Förbjuden |
| Live trading | Förbjuden |
