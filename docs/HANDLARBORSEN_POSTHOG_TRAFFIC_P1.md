# Handlarbörsen – PostHog-webbtrafik i Omnira (P1, draft)

**Mål:** Visa verkliga mottagna sidvisningar på Omniras Handlarbörsen-projektsida,
separat från Handlarbörsens marknadsplats- och affärsstatistik.

- Branch: feat/omnira-hb-posthog-traffic-p1
- Bas: Omnira UI-PR #304, commit d502e94
- Endast läsning. Ingen ändring i PostHog, Handlarbörsen, Supabase eller Vercel.
- Allt fungerar utan PostHog-nyckel: då visas ett uttryckligt ej anslutet-läge.
  Ingen graf, siffra eller trend hittas på.

## Åtkomst och datakvalitet

Samma befintliga RLS-skärmade projektupplösning och Handlarbörsen-marketplace
rapportgrind avgör om tillägget alls monteras. Backend-läsaren har en separat,
fail-closed projekt-id, slug och allowlist-kontroll innan nätverksanrop.

Omnira server gör en enkel, namngiven, read-only HogQLQuery till PostHogs
fasta EU API-adress: https://eu.posthog.com. Den hämtar endast antal
$PAGEVIEW (PostHog eventnamn $pageview) aggregerat per UTC-dag de senaste
sju UTC-kalenderdagarna. Datum skapas server-side. Svaret avvisas om typ,
datum, antal, storlek eller dubbletter är fel. Bara 7 dagliga totaler når UI.
Ingen rådata, besökaridentitet, e-post, VIN, session, organisation eller
enhetsidentifierare exponeras. Inga data lagras permanent i Omnira.

**Besökare och sessioner lämnas som okända**, eftersom Handlarbörsens initiala
cookieless-spårning och sessionsgränser ännu inte är verifierade med verkliga
PostHog-events. De är inte samma sak som sidvisningar, och inte "online nu".
När riktiga events visas måste en separat källa/definition godkännas innan
dessa två tal aktiveras.

## Aktiveringsgrind (inget görs av denna PR)

1. Slutför Handlarbörsens PostHog-samtyckes- och GDPR-granskning, verifiera
   EU och konfiguration, låt PR #134 granskas färdigt. Separat godkännande
   krävs för merge och produktionsaktivering av insamling.
2. Kontrollera att PostHog faktiskt tar emot $pageview och att sparade
   egenskaper inte innehåller identitet eller känslig data.
3. Skapa en separat projektavgränsad läsnyckel i PostHog, endast med
   tillräcklig READ-behörighet för query/analytics; den skall stanna i
   Omniras SERVER-ONLY secret store, aldrig i NEXT_PUBLIC_, Git eller klientkod.
4. När operatören uttryckligen godkänt det kan **endast Omniras servermiljö**
   konfigureras med:
   - HANDLARBORSEN_POSTHOG_PROJECT_ID (numeriskt ID i PostHog-projektets URL)
   - HANDLARBORSEN_POSTHOG_READ_TOKEN (personlig/scopad phx_ läsnyckel)
5. Kontrollera EU API-data och att 7-dagars sammanräkning och tidszon stämmer.
   Testa API-fel, rate limiting, saknade dagar, inga events och token rotation.
6. PR-granskning, GitHub CI och vanlig exakt merge-/produktionsgrind före
   publicering. Denna draft-PR skapar ingen scheduler, databastabell eller
   automatiskt beteende.

Källreferens: PostHogs API för server-side HogQLQuery:
https://posthog.com/docs/data-warehouse/query

## Rollout och rollback

Detta är ett fristående, återkallbart UI-tillägg på projektsidan.
Utan båda servermiljövariablerna görs **inga** PostHog-anrop, och sidan visar
'Inväntar anslutning'. Återkalla nyckeln eller ta bort variablerna för att
omedelbart stoppa nya läsningar (efter normal serverkonfigurations-rollout).
Handlarbörsens befintliga KPI, owner brief, charts och Atlas ändras inte.
