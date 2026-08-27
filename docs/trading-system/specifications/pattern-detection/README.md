# Pattern Detection Specification

**Status:** Ej påbörjad. Blockerar Fas 3.

Här ska de deterministiska detection rules för entrykritiska patterns ligga:

- **iFVG** — GATE-01
- **CISD** — GATE-02
- **equal-high / equal-low-tolerans** — GATE-03
- **SMT correspondence och timing** — GATE-04

## Krav

Varje regel ska vara machine-readable och ge **identiskt utfall** i backtest,
market replay och live. Ingen AI-modell får tolka vad som "ser ut som" ett pattern.

Om ett pattern definieras på ett sätt i backtest och ett annat live har systemet i
praktiken två olika strategier, och all historisk validering förlorar sitt bevisvärde.

Källa: Strategy Specification §14, Kapitel 2, Kapitel 3, Kapitel 17, Kapitel 20.

**Strategy Engine får inte implementeras innan detta är på plats.**
