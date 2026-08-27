# Omnira Trading System – Documentation

**Status:** Canonical Candidate v1.0 · 2026-08-27
**Språk:** Svenska (dokumentation), engelska (kod och identifierare)

> **Läs detta först.** Detta träd är auktoritativ kontext för allt arbete med Omnira
> Trading System. Det gäller Claude, Codex, Atlas och mänskliga utvecklare lika.
> Ingen implementation får påbörjas utan att relevanta delar av detta träd är lästa.

---

## 1. Vad detta är

Den kompletta, versionsstyrda beslutsgrunden för Omnira Trading System: en bok i
tjugo kapitel, fyra Fas 0-specifikationer, och den canonical review som knyter ihop
dem.

Detta är **inte** bakgrundsläsning. Det är den enda giltiga källan för tradingregler,
riskgränser och auktoritetsordning. Kod som avviker från detta träd är fel, även om
den fungerar.

## 2. Vad som är canonical

| Dokument | Status |
|---|---|
| `specifications/strategy/…Canonical v1.0` | **Canonical.** Låst baseline |
| `specifications/architecture/…v0.1` | Canonical för auktoritetskedjan |
| `specifications/data-model/…v0.1` | Gällande Fas 0-baseline |
| `book/` Kapitel 1–20 | **Canonical Candidate v1.0** |

## 3. Vad som är kandidat

| Dokument | Varför |
|---|---|
| `specifications/risk/…Canonical v1.0 CANDIDATE` | Sju av åtta öppna riskbeslut lösta. Ett kvarstår: RISK-GATE-01 |
| Boken som helhet | Två regeldefekter kvarstår: GATE-05 och GATE-10 |

Kandidatstatus betyder: **använd som underlag, men lita inte på den punkt som är
öppen.** Den öppna punkten står alltid namngiven i dokumentet.

## 4. Regler som aldrig får gissas

Om svaret inte står uttryckligen i detta träd — **fråga, implementera inte.**

- exakt iFVG- och CISD-detektion (GATE-01, GATE-02)
- equal-high / equal-low-tolerans (GATE-03)
- SMT correspondence och timing (GATE-04)
- London window-close och break-even (GATE-05)
- news-provider och high-impact USD-klassificering (GATE-06, GATE-07)
- marknadsdataprovider (GATE-08)
- PropFirmProfile-parametrar (GATE-09)
- daily-loss force close-semantik (GATE-10)
- execution safety margin och slippagetröskel (GATE-12)
- promotion thresholds och live safety policies (GATE-13, GATE-14)

Riskgränser, sessioner, entry, SL, TP, break-even, re-entry och news-regler får
**aldrig** härledas, avrundas eller "förbättras" i kod. De ändras bara genom en ny
versionsidentifierare.

## 5. Auktoritetsordning

```
Market Data → Strategy Engine → AI Analysis → Risk Engine → Prop Firm Rules Engine
→ Trade Proposal → Approval / Automation Policy → Execution Gateway
→ Execution Runner → MetaTrader 5 → Broker / Prop Firm → Journal & Analytics
```

Ingen komponent får kringgå ett efterföljande säkerhetslager.

En Strategy Signal är inte en order. En AI-rekommendation är inte ett risktillstånd.
Ett Risk PASS är inte execution approval. Ett Trade Proposal är inte en skickad order.

Broker state är source of truth för faktisk exponering. UI är aldrig source of truth.

## 6. Risk och Prop kan inte kringgås

Risk Engine och Prop Firm Rules Engine har **veto**. Båda måste passera. Vid olika
gränser vinner den striktaste.

Det finns **ingen** normal human override av ett hard risk `DENY`. Ingen
"Trade anyway"-knapp får byggas. Vill man ändra en riskregel ändrar man RiskProfile
genom versionsstyrd governance.

Vid osäkerhet: **fail closed.** Avsaknad av information är aldrig grund för att
tillåta trading.

## 7. AI får inte ändra produktionsregler

Atlas får observera, mäta, upptäcka mönster, skapa hypoteser och **föreslå**
kandidatversioner.

Atlas får inte ändra canonical strategi, aktiv RiskProfile, prop firm-regler eller
exekveringsregler. Atlas får inte ge sig själv approval, promovera sig själv till
live, eller höja risk automatiskt.

```
Observe → Measure → Detect Pattern → Create Hypothesis → Candidate Version
→ Backtest → Out-of-Sample → Forward Test → Review / Approval → Ny Canonical Version
```

*Self-Improvement är inte Self-Modification.*

## 8. Backtest/replay/live-paritet

Samma regeldefinition ska ge samma utfall i backtest, market replay och live.

Detta är hela skälet till att iFVG och CISD måste ha deterministiska detection rules
före implementation: om ett pattern definieras på ett sätt i backtest och ett annat
live har systemet i praktiken två olika strategier, och all historisk validering
förlorar sitt bevisvärde.

Ingen AI-modell får tolka vad som "ser ut som" ett entrykritiskt pattern.

## 9. Kontrollera gates före varje fas

Läs `reviews/Open Implementation Gates v1.0.md` innan en ny fas påbörjas. Varje gate
är klassificerad efter exakt vilken fas den blockerar.

**Ingen gate blockerar Fas 1 eller Fas 2.** Fas 3 kräver att GATE-01 till 05 och 08
är stängda.

Canonical fasordning enligt Kapitel 20:

```
Fas 0 Specs → Fas 1 Trading Core → Fas 2 MT5 Read Only → Fas 3 Strategy Engine
→ Fas 4 AI Analysis → Fas 5 Risk Engine → Fas 6 Manual Approval
→ Fas 7 Demo Automation → Fas 8 Backtest + Forward → Fas 9 Prop Firm Mode
→ Fas 10 Controlled Live
```

**Nästa fas: Fas 1 – Trading Core.**

## 10. Versionering av dokumentationen

Varje materiell ändring av entry, confirmation, SL, TP, setup grades, sessioner,
news-regler, break-even, re-entry, trade duration eller strategifilter kräver en **ny
versionsidentifierare**. Gamla resultat får aldrig automatiskt räknas som resultat
för en ny version.

Detsamma gäller RiskProfile och PropFirmProfile.

Promotion från CANDIDATE till Canonical ska vara ett explicit event med
Promotion Record: gammal version, ny version, tester, approval, aktiveringsdatum och
rollback-plan.

Ändra aldrig ett canonical dokument på plats utan versionsändring.

---

## Träd

```
docs/trading-system/
├── README.md                    ← du är här
├── SOURCE_OF_TRUTH.md           ← precedensregler vid konflikt
├── CHECKSUMS.md                 ← SHA-256 för alla artefakter
├── CHECKSUMS.sha256             ← maskinverifierbar manifest
├── book/
│   ├── source/                  20 kapitel, original .docx
│   ├── chapters/                20 kapitel, extraherad markdown
│   └── final/                   assemblerad PDF
├── specifications/
│   ├── strategy/                Canonical v1.0
│   ├── architecture/            v0.1
│   ├── data-model/              v0.1
│   ├── risk/                    v0.1 + Canonical v1.0 CANDIDATE
│   ├── prop-firm/               tom, gated av GATE-09
│   └── pattern-detection/       tom, gated av GATE-01/02
└── reviews/
    ├── Canonical Review v1.0.md
    ├── Open Implementation Gates v1.0.md
    └── Contradiction Register v1.0.md
```

**Vid tveksamhet:** läs `SOURCE_OF_TRUTH.md`. Avgör aldrig precedens själv.
