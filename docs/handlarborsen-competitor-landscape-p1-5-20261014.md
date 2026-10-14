# Handlarbörsen Konkurrentspanaren – bredare officiella källor (P1.5)

**Status:** Kodkandidat för skyddad Preview, 2026-10-14. Inte automatiserad produktion, inte en löpande prisjämförelse.

## Källdossier (daterad, redaktionellt kontrollerad)

| Aktör | Officiell offentlig källa | Belagt vid redaktionell kontroll 2026-10-14 |
|---|---|---|
| Handlarbudet | Tre daterade nyheter: `handlarbudet.se/nyheter/...` | Historiska annonserade funktioner. **Ej bevis på dagens erbjudande.** |
| AutoProff | https://www.autoproff.se/b2b-marketplace | B2B-marknadsplats med förhandling, verifierad handel och stöd för internationella transaktioner. |
| BCA Sverige | https://www.bca.com/sv/se/Professional-Buyer/ | Auktioner för yrkesköpare, dokumenterade/inspekterade fordon och köpstöd. |
| AUTO1.com | https://www.auto1.com/sv/home | B2B-grossistplattform med auktioner, direktköp och stöd kring logistik och dokument. |

Dessa källor är självbeskrivningar. **Jämförbarhet, aktuella avgifter, lagersaldo och nya produktlanseringar är inte verifierade.** Källorna finns för spårbara pilotfrågor, inte för ogrundade konkurrenspoäng eller automatiska affärsbeslut.

## Säker manuell kontroll
- Vyn visar en fast lista med 4 aktörer (Handlarbudet + tre nya). Ingen extern HTTP-hämtning vid vanlig sidvisning.
- Den behörighetskontrollerade `?scan=1`-vägen kör redan existerande Handlarbudet-dossier (max 4 GET), samt separata tre officiella konkurrentkällor (max 6 GET) – 10 GET totalt. Allt är read-only.
- Varje domäns `robots.txt` kontrolleras före dokumentet. Vid nekad/ogiltig policy **hämtas inte sidan**.
- Inga redirects, cookies, authorization headers, fria användar-URL:er eller retries. Enskild begäran har 8 s timeout. Robots-dokument måste rymmas inom 200 KB. För HTML kan ett större dokument accepteras om en giltig titel hittas inom en begränsad prefixläsning på högst 200 KB; då avbryts resten av strömmen direkt. Om titeln inte kan verifieras inom gränsen nekas hämtningen. Bara kort, normaliserad titelmetadata returneras.
- En misslyckad källa visas som misslyckad, inte "ingen förändring"; en lyckad titel visar endast att titelmetadata kunde kontrolleras.
- Inga DB-skrivningar, LLM-anrop, cron-jobb, externa kundkontakter eller producentåtgärder.

## Planeringsstöd
- Tre föreslagna pilotintervjufrågor från de nya källorna, tydligt märkta som **ej beslutade**.
- Redan existerande tre Handlarbudet-frågor bevaras.
- Atlas-chatten är ännu **inte** kopplad till en promptberoende konkurrentkällas API; en självständig aktuell analys kräver en separat verifierad källa och permissionsgate.

## Nästa grind (P2)
1. Spara snapshots först efter isolerad migrations-/RLS-/grants-replay och separat godkännande av databasschema. PR #306 innehåller tidigare prototyp, ej aktiverad.
2. Jämför endast lyckade, tidsstämplade observationer av **samma källa**; avbrott eller nekade källor får aldrig presenteras som en förändring.
3. Lägg till diagram över verifierade titel-/produktändringar först när jämförbar historik finns.
4. Låt Atlas föreslå granskningsbara projektplaner med käll-URL, datum, osäkerhet och mänskligt beslut.
5. Schemalagd bevakning först efter bevisad Cost Governance (budget per sökning, intervall, stopp, projekträttighet och audit). Ingen autonom exekvering eller publicering ingår här.

Omniras automatiska GitHub Actions för PR/main är inte avstängda globalt. För kostnadsskydd publiceras denna kandidat initialt som en gren/Preview **utan PR eller merge**.
