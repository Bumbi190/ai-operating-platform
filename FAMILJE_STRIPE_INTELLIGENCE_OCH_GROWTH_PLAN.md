# Familje-Stunden — Byggplan: Stripe Intelligence + Growth Engine

_Datum: 2026-06-02. KONKRET PLAN — ingen implementation påbörjad. För godkännande._
_Kontext: Familje-Stunden har redan ~6 betalande prenumeranter (≈ 354 kr MRR vid 59 kr/mån) som Omnira idag inte ser._

---

## DEL 1 — Stripe Intelligence (högst prio, minsta möjliga implementation)

**Princip (din):** Stripe = source of truth. Restricted read-only API-key. Daglig snapshot. Ingen egen billingmotor. Ingen lokal subscriptionslogik om den kan undvikas.

**Lösningen undviker lokal subscriptionslogik** genom att bara lagra dagliga *aggregat* (inte per-prenumeration-rader). MRR/churn/aktiva beräknas genom att *läsa Stripe* en gång per dygn.

### Datamodell — EN liten ny tabell (motiverad)
`revenue_events` (finns) kan uttrycka *cash in* men omöjligt MRR/churn (platta händelser). Därför:

```
revenue_snapshots (daglig aggregat-snapshot — INGA per-prenumeration-rader)
  id, project_id, snapshot_date (unik per projekt/dag), captured_at,
  active_subscribers, new_subscribers, trialing, churned_this_month,
  mrr_sek, revenue_month_sek, currency, raw jsonb
  + RLS (endast service-role)
```
Följer exakt mönstret från `account_snapshots`. Detta är den enda nya modellen.

### Komponenter (mestadels återbruk)
1. **Revenue ingestion (realtid):** ny route `app/api/webhooks/stripe/route.ts` — verifierar Stripe-signatur, på `invoice.paid` → anropar befintlig `logRevenue({ project_slug:'familje-stunden', amount_sek, source:'stripe', occurred_at })`. **Återbrukar `/api/business/revenue`-logiken.** Kräver `STRIPE_WEBHOOK_SECRET` i env.
2. **Stripe BI daily snapshot (KPI:erna):**
   - ny `lib/stripe/metrics.ts` — med restricted key: lista aktiva subs → antal + MRR (summa månadsnormaliserade belopp) + trialing; skapade denna månad → nya; avslutade denna månad → churn; betalda fakturor denna månad → revenue_month.
   - ny cron-route `app/api/business/cron/stripe-snapshot/route.ts` (CRON_SECRET) → beräkna → upsert `revenue_snapshots`. Schemaläggs dagligen via pg_cron (samma mönster som `omnira_account_snapshot`).
   - **Backfill direkt:** första körningen läser Stripe-historik → de 6 befintliga prenumeranterna + MRR blir synliga omedelbart (webhooken fångar bara framtida fakturor).
3. **Beroende:** lägg till `stripe`-paketet (standard, hanterar signatur-verifiering + typad API). Det ÄR den minimala vägen.

### Atlas-integration (Del 3 i din lista)
- ny `lib/atlas/revenue.ts` — `revenueIntel(db, projectId?)` läser senaste `revenue_snapshots` (+ föregående för trend) → `{ active, new, mrr, trialing, churnRate, revenueMonth, deltas }`.
- Wire in i **befintliga** ytor (inga nya dashboards):
  - `gatherAtlasContext` → MRR/aktiva per verksamhet i den enade snapshoten.
  - `executive.ts` (briefing) → "MRR 354 kr, 1 ny prenumerant, churn 0%".
  - chat `buildLiveContext` → Atlas svarar i chat/röst.
  - befintliga `/revenue`-sidan kan visa det.
- **Resultat — exakt dina exempel blir sanna:** "Familje-Stunden har 6 aktiva prenumeranter." · "MRR är 354 kr." · "1 ny prenumerant denna månad." · "Churn 0%."

### Du behöver tillhandahålla
- Stripe **restricted read-only key** (scope: subscriptions, invoices, customers — read) → `STRIPE_RESTRICTED_KEY` i Omniras env.
- En webhook-endpoint i Stripe-dashboarden → Omniras `/api/webhooks/stripe` + `STRIPE_WEBHOOK_SECRET`.
- (Webhooks att aktivera: `invoice.paid`. Övrigt täcks av den dagliga pullen.)

### Insats
Liten: 1 webhook-route + 1 metrics-lib + 1 cron-route + 1 liten tabell + 1 atlas-lib + wiring. ~80% återbruk. **Detta gör de 6 befintliga prenumeranterna + MRR synliga för Atlas direkt vid första snapshot.**

---

## DEL 2 — Familje-Stunden Growth Engine (inventering + separat plan)

Mål: automatiserad tillväxt (FB, IG, Pinterest) som driver prenumeranter — *och* Atlas som förstår hela tratten content → räckvidd → sajt → trial → betalande → MRR.

**Viktig distinktion:** Familje har redan en *produkt*-pipeline (månadspaket-PDF/ebok/MP3 — fulfillment). Growth Engine är något annat: *social* tillväxtcontent mot föräldrar.

### Återbruksmatris från The Prompt-pipelinen

| Komponent | Status för Familje | Notering |
|---|---|---|
| pg_cron-schemaläggning | ♻️ Som det är | Samma mönster |
| token-store (per plattform) | ♻️ Återbruk | Behöver Familjes EGNA IG/FB-tokens tillagda |
| Publicering IG/FB (Graph) | ♻️ Som det är | Scope:as till Familje-konton |
| media_scripts / media_insights / media_news_items / account_snapshots | ♻️ Återbruk | Projekt-scope:ade — använd `familje-stunden`-projektet |
| content-score / opportunities / insights-cron / account-snapshot-cron / reply-comments | ♻️ Som det är | Redan projekt-medvetna |
| Generering: runStep, gpt-image-1, ideogram, ElevenLabs, render | ♻️ Motor återbrukas | Nya prompts/brand (Nova & Pling, föräldraton) |
| Kostnadsspårning | ♻️ Som det är | Per projekt |
| **Innehållsstrategi/-källa** | 🔧 Anpassas | The Prompt = nyhetsjägare. Familje = INTE nyheter → temadriven kalender |
| **Content planning** | 🔧 Anpassas | Återanvänd månadspaketens teman som social-källa (stark synergi) |
| **Pinterest** | 🆕 Nytt | Ingen Pinterest-integration finns. Pinterest API (boards/pins) — nytt |
| Familjes sociala konton + tokens | 🆕 Nytt | Egna IG/FB (+ Pinterest), separat från The Prompt |

### Per spår

- **Content planning:** temadriven kalender. **Återanvänd månadspaketens teman** (april = labb, december = vinter, osv.) som källa för social-teasers → ingen ny "nyhetsjägare" behövs. Minimal: `media_scripts` med planerad status + `scheduled_at`.
- **Content generation:** återbruka genereringsmotorn; nya prompts för Familjes brand. Format: korta reels (aktivitet/sagostund), karuseller (pyssel), och **Pinterest-pins av printables** (färgläggning/aktiviteter) som länkar till familje-stunden.se.
- **Facebook + Instagram:** återbruka publish-pipelinen rakt av (Familje-tokens). Föräldrar-content + CTA till prenumeration.
- **Pinterest (nytt):** akvisitionskanalen — pins (printables/aktiviteter) → sajt → trial → prenumerant. Högrelevant för målgruppen. Kräver ny Pinterest API-klient + publiceringsväg + (begränsad) analytics.
- **Analytics:** återbruka `media_insights` + `account_snapshots` + `content-score`, scope:at till Familje per kanal.
- **Atlas Insights:** återbruka opportunities/executive — nu över HELA tratten: när Stripe BI (Del 1) + Growth Engine finns kan Atlas koppla *content → räckvidd → sajtbesök → trial → betalande → MRR*. Det är "förstå verksamheten".

### Föreslagen sekvens (Growth Engine — efter Del 1)
- **G1:** Koppla Familjes IG/FB-konton + tokens; aktivera account-snapshot + insights för Familje → börja mäta nuvarande publik. (Lågt — rent återbruk.)
- **G2:** Familje content-planner + generering (anpassa kedjan, källa = månadsteman) → publicera IG/FB.
- **G3:** Pinterest-integration (nytt) — pins → sajt (akvisition).
- **G4:** Atlas Insights över tratten (content → prenumeranter → MRR).

---

## Rekommenderad ordning

1. **Del 1 (Stripe Intelligence) först** — minst arbete, högst omedelbart värde: gör de 6 befintliga prenumeranterna + MRR + churn synliga för Atlas. Detta uppfyller "Atlas förstår hur Familje-Stunden presterar" redan innan en enda ny growth-post.
2. **Del 2 (Growth Engine) sekventiellt G1→G4** — bygger på samma data och stänger tratten.

**Inget byggs förrän du godkänt.** För Del 1 behöver jag bara: Stripe restricted read-only key + att en webhook pekas mot Omnira. Säg kör så börjar jag med Del 1.
