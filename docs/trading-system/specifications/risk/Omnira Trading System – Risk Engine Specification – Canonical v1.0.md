# Omnira Trading System – Risk Engine Specification

**Version:** Canonical v1.0
**Datum:** 2026-08-27
**Dokumentspråk:** Svenska
**Föregångare:** Risk Engine Specification v0.1 (Fas 0), via Canonical v1.0 CANDIDATE
**Primär strategi:** Omnira Liquidity Manipulation – Canonical v1.0
**Riskprincip:** Risk Engine har absolut veto över trading

> **Status: Canonical.** Samtliga åtta öppna riskbeslut från v0.1 är stängda.
> Risk Engine får implementeras när Fas 5 nås. Execution och live trading förblir
> förbjudna tills respektive fasgate är stängd.

---

## 0. Promotionshistorik

Detta dokument är resultatet av en auditerbar promotion i tre steg. Historiken bevaras
avsiktligt — den visar vad som var öppet, vem som stängde det och på vilken grund.

| Steg | Version | Datum | Öppna riskbeslut |
|---|---|---|---|
| 1 | v0.1 | Fas 0 | 8 (OPEN-RISK-01 … 08) |
| 2 | Canonical v1.0 CANDIDATE | 2026-08-27 | 1 (RISK-GATE-01) |
| 3 | **Canonical v1.0** | 2026-08-27 | **0** |

**Steg 2 → 3.** RISK-GATE-01 gällde att daily-loss force close saknade nåbar trigger:
en realiserad mätare kombinerad med `max_open_positions = 1` och en regel om att
tvångsstänga öppen position vid gränsbrott gav ett tomt utfallsrum.

Beslutet blev **alternativ B med explicit korrigering**: den interna dagsregeln stänger
inte en öppen position. Se avsnitt 3.7 och 4.

Ingen historik har raderats. v0.1 ligger kvar oförändrad i samma katalog som
historiskt dokument.

---

## 1. Dokumentets förhållande till v0.1

Detta dokument är en **kontrollerad delta** över Risk Engine Specification v0.1.
Det ersätter inte v0.1 som text.

- Samtliga sektioner i v0.1 som inte uttryckligen ändras nedan gäller **oförändrat**
  och normativt.
- v0.1 §84 *Open Decisions Before Canonical v1.0* ersätts i sin helhet av avsnitt 3.
- v0.1 §51 är ersatt av avsnitt 3.7 och avsnitt 4.
- v0.1 §18 *Reserved Risk* preciseras av avsnitt 5.

Deltaformen är avsiktlig: en fullständig omskrivning av 87 sektioner skulle riskera
oavsiktlig regeldrift.

**Källa för resolutionerna:** Kapitel 4 – Riskhantering, samt de canonical beslut som
fattades 2026-08-27 och som är införda i Kapitel 4, Kapitel 11 och Kapitel 16.

---

## 2. Låst riskbaslinje

| Parameter | Värde |
|---|---|
| Max risk per trade | $150 |
| Intern max daily loss | $450, **realized only** |
| Daily reset | 00:00 America/New_York |
| Max öppna positioner | 1 |
| Max attempts per 4H thesis | 3 |
| Teknisk SL flyttad för riskanpassning | Förbjudet |
| Minsta handlingsbara quantity över riskbudget | `DENY` |
| Risk Engine-auktoritet | Veto |
| Beteende vid osäkerhet | Fail closed |
| Normal human override av hard `DENY` | Finns inte |

---

## 3. Stängda riskbeslut

### 3.1 OPEN-RISK-01 → STÄNGD — Intern daily loss-beräkningsmetod

**Ersätter v0.1 §16.**

```
MAX INTERNAL DAILY LOSS: $450
CALCULATION BASIS:       REALIZED LOSSES ONLY
RESET:                   00:00 America/New_York
```

Floating/unrealized P/L räknas **inte** in i Omniras interna $450-mätare.

Detta är skilt från Prop Firm Rules Engine, som kan använda equity-, floating-,
trailing- eller andra modeller. En trade måste passera båda lagren.

### 3.2 OPEN-RISK-02 → STÄNGD — Daily reset policy

**Ersätter v0.1 §17.**

Återställning sker **00:00 America/New_York**. Serverns lokala tidszon får aldrig
användas som implicit reset.

### 3.3 OPEN-RISK-03 → STÄNGD — Separat max trades per day

**Ersätter v0.1 §25.** Ingen separat `max_trades_per_day` är aktiv i v1.0. Risk Engine
ska fortsatt **stödja** parametern för framtida bruk.

### 3.4 OPEN-RISK-04 → STÄNGD — Intern max total drawdown

**Ersätter v0.1 §26.** Ingen separat intern total drawdown-gräns är aktiv i v1.0.
Stöd för `max_total_drawdown` med explicit metodval kvarstår i modellen.

### 3.5 OPEN-RISK-05 → STÄNGD — Spread threshold

**Ersätter v0.1 §29.** Inget spread-filter är aktivt i v1.0. Stöd för instrumentspecifik,
versionsstyrd spreadregel kvarstår. Sätts lämpligen samtidigt som GATE-12.

### 3.6 OPEN-RISK-06 → STÄNGD — Losing-streak protection

**Ersätter v0.1 §37.** Ingen extra losing-streak-regel utöver daily stop är aktiv i v1.0.
`consecutive_losses` ska fortsatt kunna mätas, och safety cooldown vid systemincident
enligt v0.1 §36 gäller oförändrat.

### 3.7 OPEN-RISK-07 → STÄNGD — Öppen position vid daily breach

**Ersätter v0.1 §51 i sin helhet.**

Den interna dagsregeln tvångsstänger **inte** en redan öppen position.

Motiveringen är logisk, inte preferensbaserad: mätaren räknar endast realiserade
förluster, och `max_open_positions = 1` gör att mätaren inte kan passera gränsen medan en
position fortfarande är öppen. En intern tvångsstängning baserad på floating P/L skulle
motsäga realized-only-modellen.

En öppen position hanteras vidare av sina egna regler. Se avsnitt 4.

### 3.8 OPEN-RISK-08 → STÄNGD — Margin utilization limits

**Ersätter v0.1 §57.** Ingen separat margin utilization-gräns är aktiv i v1.0. Stöd för
`minimum free margin` och `maximum margin utilization` kvarstår, och Broker Tradeability
Gate enligt v0.1 §56 gäller oförändrat.

---

## 4. Daily stop — canonical beteende

När:

```
realized_daily_loss >= $450
```

gäller:

- inga nya trades tillåts
- risk state blir `BLOCKED / DAILY_STOP`
- execution av nya intents blockeras
- state är **persistent över restart**
- trading förblir blockerad till nästa canonical reset
- ett **audit event** skapas

En daily stop får inte kunna återställas genom att ladda om UI:t.

### 4.1 Ingen intern floating force-close

En redan öppen position tvångsstängs **inte** enbart på grund av floating eller
unrealized P/L i Omniras interna dagsregel.

Positionen hanteras vidare genom sina övriga giltiga regler:

- teknisk stop loss
- take profit
- canonical break-even
- **London window-close break-even 05:00 America/New_York**
- news exit
- New York time exit
- emergency- och safety-kontroller
- Prop Firm Rules

### 4.2 Prop firm-lagret kan vara striktare

Om ett aktivt `PropFirmProfile` använder equity-, floating- eller trailingbaserade
gränser och kräver en tidigare skyddsåtgärd, gäller den striktare prop-regeln.

Intern risk och prop firm-risk hålls fortsatt separata. Båda måste passera.
Konservativ regelupplösning enligt v0.1 §76 gäller oförändrat.

### 4.3 Kill switch är inte emergency close

Att stoppa nya trades och att tvångsstänga befintlig exponering är två olika actions
med olika auktoritet. v0.1 §71 gäller oförändrat.

---

## 5. Reserved risk — pre-entry-kontroll

**Preciserar v0.1 §18.**

Att dagsmätaren är realiserad betyder inte att en ny trade får ta hela den återstående
budgeten i anspråk utan kontroll.

Innan en ny trade tillåts ska dess möjliga initiala risk reserveras mot återstående
dagsbudget:

```
realized_daily_loss + reserved_risk_for_new_trade <= daily_loss_limit
```

Exempel:

```
realized_daily_loss = $300
daily_loss_limit    = $450
daily_remaining     = $150

ny trade risk = $128  → passerar denna regel
ny trade risk = $151  → DENY   (reason: DAILY_LOSS_LIMIT)
```

### 5.1 Vad reserved risk inte är

Reserved risk **ändrar inte** definitionen av realiserad daily loss och skriver inte in
något i dagsmätaren. Den är uteslutande en pre-entry admission control.

Reservationen frisläpps när traden stängs. Det faktiska utfallet bokförs då mot den
realiserade mätaren.

### 5.2 Förhållandet till max_open_positions

Med `max_open_positions = 1` kan endast en reservation vara aktiv åt gången, och ingen ny
riskutvärdering sker medan en position är öppen. Regeln är ändå normativ nu, så att
modellen är korrekt den dag fler positioner tillåts.

Detta stänger även den tidigare vilande frågan GATE-11.

---

## 6. Reason codes

Utöver v0.1 §6 ska minst följande finnas:

```
DAILY_LOSS_LIMIT            daily stop nådd, eller reserved risk överskrider budget
DAILY_STOP_ACTIVE           risk state är BLOCKED / DAILY_STOP
RESERVED_RISK_EXCEEDED      ny trade ryms inte inom återstående dagsbudget
```

Reason codes ska vara stabila och versionsstyrda.

---

## 7. Oförändrat i kraft

Samtliga övriga sektioner i v0.1 gäller oförändrat, i synnerhet:

determinism (§3); fail closed (§4); reason codes (§6); RiskProfile-struktur (§7);
position sizing med avrundning nedåt (§10); technical stop integrity (§11); minimum
tradable quantity (§12); break-even risk (§19); max open positions (§20); unknown
positions (§21); manuella externa positioner (§22); attempts (§23–24); prop
firm-separation (§27); slippage guard (§30); revalidation före execution (§31); proposal
expiry (§32); session- och news-filter (§33–35); kill switches (§48–50); account-,
market data-, clock-, execution- och tradeability gates (§52–56); RiskDecision (§59);
warning kontra failure (§61); restart safety (§72); network failure (§73); broker-native
protection (§74); prop firm-interaktion (§75); conservative rule resolution (§76);
autonomy boundary (§77); no martingale (§45); no revenge logic (§46); positiv P/L
utvidgar inte hard limits (§47); human override finns inte (§70); numeric precision
(§82); risk audit (§83); och den konstitutionella regeln (§87).

---

## 8. Kvarvarande gates som berör Risk Engine

Dessa blockerar **inte** canonical status för detta dokument. De blockerar senare faser
och är listade i *Open Implementation Gates v1.0*.

| Gate | Fråga | Blockerar |
|---|---|---|
| GATE-12 | Execution safety margin- och slippagemodell | Execution |
| GATE-09 | Första faktiska PropFirmProfile | Prop Mode |
| GATE-13/14 | Promotion thresholds och live safety policies | Live |

---

**Dokumentstatus**

| Fält | Värde |
|---|---|
| Version | **Canonical v1.0** |
| Öppna riskbeslut | 0 |
| Föregångare | v0.1, Canonical v1.0 CANDIDATE |
| Implementation | Ej påbörjad, tillåten från Fas 5 |
| Execution | Förbjuden tills GATE-12 stängd |
| Live trading | Förbjuden tills GATE-13 och GATE-14 stängda |
