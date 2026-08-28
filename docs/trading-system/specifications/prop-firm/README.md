# Prop Firm Profiles

**Status:** Ej påbörjad. Blockerar Fas 9.

Här ska faktiska `PropFirmProfile`-definitioner ligga. Ingen är vald ännu — GATE-09.

## Regler

- Kapitel 12 innehåller referensexempel från namngivna firmor. Dessa är
  **referens, aldrig implementationskälla.** Se Contradiction Register C-07.
- Tredjepartsvillkor ändras utan förvarning. Varje profil ska byggas mot firmans då
  gällande regelbok.
- Varje profil ska verifieras mot firmans egna officiella räkneexempel innan den
  aktiveras.
- Varje `TradingAccount` ska kopplas till exakt relevant profilversion.
- Profiler är versionsstyrda på samma sätt som RiskProfile.

Prop Firm Rules Engine kan byggas mot en **virtuell** profil före detta — Kapitel 11
förutser uttryckligen virtuella profiler i forward test. Endast aktivering mot skarpt
konto är gated.
