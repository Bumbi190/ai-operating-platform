# Omnira – Handlarbörsen, visuell projektöversikt v2 (design draft)

## Mål
Förädla projektöversikten så att den matchar den godkända mörka, cyan/teal
premiumriktningen från mockupen, utan att hitta på siffror, tidsperioder,
trender, historik eller exekveringsstatus.

## Avgränsning
- Detta är en separat, stacked Omnira-branch ovanpå PostHog-traffic PR #308.
- Generella projekt får sina befintliga layoutregler. Premium-hero och
  KPI-layout är avgränsade till Handlarbörsens ägarprojektvisning
  (data-owner-brief och KpiOverview.prominent).
- Befintliga 6 marketplace KPI, 5 24h-mått, 3 diagram och marknadspuls
  använder oförändrad verifierad datamodell och samma rapportläsning.
- KPI-korten har identifierbara, dekorativa ikoner, **inga fake sparklines**.
  Saknade värden fortsätter visa Okänt och motivet till detta.
- Tre minikort i Marknadspuls visar faktiskt observerade värden. Ursprunglig
  klickbar fördjupning med sex mått och regelbaserade förslag finns kvar.
- PostHog-kort får samma premiumstil, men visar fortfarande
  "Inväntar anslutning" tills riktig trafik är verifierad. Inga tokens,
  nya tjänster eller betalningar skapas.
- Diagram ritar endast verkliga sparade datum: inga simulerade datapunkter,
  rullande 30-dagarsperioder eller inaktiva filterknappar från mockupen.
- Responsiv layout med 6→3→2 KPI-kort och 2→1 marknadspuls-kolumner,
  tillräckliga touchmål, starkare kontrast och reduced-motion-fallback.

## QA och release
Testa 7 relevanta Vitest-filer (KPI, visual pulse, trends, PostHog,
owner brief, owner workspace/visibilitet och prestanda).
Kör typecheck. Granska riktiga bred- och smalskärmsvyer i Vercel-preview.
Exakt HEAD och CI granskas före merge, ingen production deploy eller DB-change.
Detta är en design-PR, inte ett produktionsgodkännande.
