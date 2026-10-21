# Handlarbörsen — Konkurrentspanaren P1 (observation only)

Status: draft, bakom autentiserad Handlarbörsen-vy. **Ingen autonom körning aktiverad.**

## Uppdrag och gräns

En projektbunden läs- och analysyta för offentligt, källbelagt konkurrentunderlag. Första profilen är Handlarbudet. Atlas kan använda beslutsunderlag och föreslagna pilotfrågor, men får inte behandla idéer som operatorbeslut, roadmap-punkter eller instruktioner om implementation.

- `/projects/handlarborsen/competitors`: daterad källdossier och tre pilotinriktade granskningshypoteser.
- `?scan=1`: explicit manuell kontroll av titelmetadata för exakt tre tillåtna officiella nyhets-URL:er. Ingen automatisk hämtning vid normal sidladdning, ingen persistent insamling eller historik.
- Sidan skyddas av befintlig `getProjectBySlug` (RLS) och exakt Handlarbörsen-identitet (id, slug, namn) innan någon extern förfrågan. Övriga projekt får 404.
- Den här P1-kontrollen verifierar endast att titelmetadata gick att läsa vid just det tillfället; den verifierar **inte** innehåll, aktuellt erbjudande eller en förändring över tid.
- Daterade observationer i källdossiern är tidigare publicerad information, inte en färsk analys från den manuella kontrollen. Ändringar i konkurrentens nuvarande erbjudande får aldrig antas av äldre publiceringar.

## Säker insamling

- Ingen inloggning hos konkurrenten, inga privata/medlemslåsta sidor, inga cookies, personuppgifter, konkurrentspecifika API-nycklar, formulärinlägg eller användarinteraktioner.
- `robots.txt` hämtas och kontrolleras **före** dokumenthämtning; nekad, oläslig eller tvetydig policy stoppar hela kontrollen. Handlarbudets publika startsida leder till `/m/`, som robots förbjuder; den finns **inte** i tillåtna URL:er.
- Fasta, kodgranskade URL:er under `/nyheter/` är den enda nätverkskällan. Omdirigeringar nekas; inga användarsupplerade URL:er accepteras.
- Högst ett robots-anrop och tre dokumentanrop, med timeout, svarsstorleksgräns, HTML-kontroll och försiktiga felstatusar. Läser inte eller lagrar inte rå HTML.
- Källtext och sidmetadata är ostrukturerad/opålitlig data: ingen extern instruktion får styra Atlas eller kringgå åtkomstpolicy.
- Inga nya paket, cron-regler, DB-migreringar, miljövariabler, betaltjänster eller agent-workflows ingår.

## Källor

1. [Nya varudeklarationen, batteritester och servicehistorik](https://handlarbudet.se/nyheter/nya-varudeklarationen-batteritester-och-servicehistorik/) — publicerad 2025-10-21.
2. [Handlarbudet inför garanterat bud](https://handlarbudet.se/nyheter/handlarbudet-infor-garanterat-bud-bindande-pris-inom-30-minuter/) — publicerad 2022-05-27. Historiskt påstående, inte verifierat som aktuellt erbjudande.
3. [Handlarbudet Trading & Support](https://handlarbudet.se/nyheter/vi-lanserar-handlarbudet-trading-support/) — publicerad 2022-02-04. Historiskt påstående, inte verifierat som aktuell organisation.

Alla förbättringsidéer är **hypoteser** för pilotintervjuer. De får inte automatiskt bli uppgifter, aktiverade funktioner eller produktbeslut.

## Roadmap och nästa godkännande

Styrande `ATLAS_ROADMAP_SV.md` kräver Reliability → Governance → Memory → Intelligence → UX → Autonomy. P1 är observation och manuell läsning, **inte** en aktiv specialistagent eller autonomt schemalagt jobb.

Följande behöver en **separat design-/godkännandegrind**, efter verifierad Cost Governance i preview och produktion:
- Säker projektbunden beständig lagring av tidigare kontroller med ägande, RLS, idempotens och bevislänkar.
- Verifierbar upptäckt av ändringar mellan verkliga snapshots (ingen fabricerad historik).
- Respektfull veckovis schemaläggning med frekvens- och kostnadstak, global och projektspecifik kill switch, avbrott och audit.
- Eventuellt kontrollerad AI-sammanfattning med maxbudget, faktakontroll, godkännande och policy för externa verktyg.
- Presentation för Atlas som **underlag för beslut**, inte självständiga arbetsorder eller publicerade påståenden.

Review krävs innan P1 merge eller exekvering i produktion. Den här branchen bygger på draft-PR #304 och ersätter inte dess visuella review.
