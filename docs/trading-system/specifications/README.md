# specifications — läsordning

Varje specifikation finns som `.docx` (originalet) och `.md` (aktiv text).

**`.md` är aktiv source of truth. `.docx` är historiskt original.**

| Domän | Aktiv fil | Status |
|---|---|---|
| Strategi | `strategy/…Canonical v1.0.md` | Canonical v1.0, rev. 2026-08-27 (CLOSED-03) |
| Risk | `risk/…Canonical v1.0.md` | **Canonical v1.0**, 0 öppna riskbeslut |
| Risk (historik) | `risk/…v0.1.md` | Historiskt, superseded |
| Arkitektur | `architecture/…v0.3.md` | **v0.3**, rev. 2026-08-28 (Beslut E) |
| Execution Provider Adapter | `execution-provider/…Level 1 Read Only – Canonical v1.2.md` | **Canonical v1.2**. Provider-neutralt, noll order-metoder |
| Provider Connectivity Reason Codes | `execution-provider/…Provider Connectivity Reason Codes – Canonical v1.0.md` | **Canonical v1.0**, rev. 2026-09-01 (Beslut H). Nio konnektivitetskoder, prospektiv verkan |
| Market Data & Contract Lifecycle | `market-data/…Market Data & Contract Lifecycle – Canonical v1.0.md` | **Canonical v1.0**, rev. 2026-09-02 (Beslut I). Provider-neutralt, GATE-08 delvis stängd |
| Contract Selection Reason Code | `market-data/…Contract Selection Reason Code – Canonical v1.0.md` | **Canonical v1.0**, rev. 2026-09-03 (Beslut J). En positiv kontraktsvalskod, prospektiv verkan |
| Contract Selection Decision Materialisation | `market-data/…Contract Selection Decision Materialisation – Canonical v1.0.md` | **Canonical v1.0**, rev. 2026-09-03 (Beslut K). Materialiseringssemantik för C3B.1, prospektiv verkan |
| Contract Selection Decision Recording & Replay | `market-data/…Contract Selection Decision Recording & Replay – Canonical v1.0.md` | **Canonical v1.0**, rev. 2026-09-04 (Beslut L). Inspelnings- och replaysemantik för C3B.2, prospektiv verkan |
| Datamodell | `data-model/…v0.1.md` | v0.1, rev. 2026-08-27 (additivt fält) |
| Prop firm | `prop-firm/` | Tom, GATE-09 |
| Pattern detection | `pattern-detection/` | Tom, GATE-01/02 |

Strategi- och datamodell-`.md` har ändrats sedan sina `.docx`-original. Ändringarna är
listade i `../reviews/Canonical Amendments v1.0.md`.

Vid konflikt mellan `.docx` och `.md` vinner alltid `.md`.
