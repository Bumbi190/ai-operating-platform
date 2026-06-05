# Familje-Stunden Marketing Engine — Design v1

**Status:** Designförslag. Ingen implementation. Bygger ENBART på Familje-Stundens egen kunskapsbas
(Brand Rules, Character Bible v2, Theme Bible v1, Content Bible v1, KB-inventeringen) + live Stripe-data.
⛔ The Prompt / AI News / andra projekt används ALDRIG som referens eller källa. Total isolering.

---

## Princip: en separat, KB-driven motor
Marketing Engine delar **infrastruktur** med resten av Omnira (durable workflow-engine, runs/retry/heartbeat,
Operations Center, Stripe-intel) men är **datamässigt helt åtskild**: eget `project_id`
(`familje-stunden`), egna kanal-tokens (multi-tenant token-lagret G1), egen KB som **enda sanningskälla**.
Varje genererat innehåll läser KB först och valideras mot den innan publicering.

---

## 1. Kanaler vi bör stödja
**v1 (kärna):**
- **Instagram** — primär: föräldrar, visuellt (Reels, karuseller, Stories).
- **Facebook** — föräldragrupper/communities, delningsbart, längre berättande, event.
- **E-post (MailerLite)** — finns redan i materialet ("FlödesSchema för mailerlite"); nurture, trial→betald, retention.
- **Pinterest** — perfekt matchning: färgläggningssidor, pyssel, printables, en board per månadstema.

**v2:** TikTok, YouTube (ljudsagor → video).
**v3:** Blogg/SEO (föräldra-/pysseltermer), **Förskole-B2B** ("Samarbetsblad_Forskolor" finns), ev. Shopify-on-site.

## 2. Innehållstyper per kanal (källa: Content Bible-tillgångar)
- **Instagram:** Reels (saga-teaser, pyssel-demo, Nova & Pling), karuseller ("månadens tema", "3 saker att göra i <månad>"), Stories (nedräkning, polls, bakom kulisserna), statiska karaktärsinlägg.
- **Facebook:** temalansering, community-frågor, delningsbar printable/pysseltips, event, längre berättelse.
- **Pinterest:** pins av färgläggning/pyssel-printables; tema-boards; "månadsäventyr".
- **E-post:** månadens temalansering, trial-nurture-sekvens, "vad ingår denna månad", win-back.
- **(v2) TikTok/YouTube:** sagoklipp, Nova & Pling, pyssel-how-to.

## 3. Hur Atlas använder Knowledge Base
Före all generering läser agenten: `_meta/brand-rules.md` → aktivt tema (`themes/index.json` per månad) →
`characters/nova-v2.md` + `pling-v2.md` → relevant `content-bible/*` → asset-register (`index.json`).
KB:n styr ton, karaktärsroller, temats syfte/ton/"vad som inte hör hemma", och vilka kanoniska tillgångar
som får återanvändas. Inget hittas på — `[LUCKA]`-fält genereras inte.

## 4. Hur månadsteman styr marknadsföringen
Aktiv månad → tema (Theme Bible) sätter **kampanjvinkeln**: känsla, nyckelbild/omslag, vilka aktiviteter
som tease:as, sensmoral. Kampanjbeats per månad: **förlansering (teaser)** → **lansering** →
**mitt-i-månaden (engagemang/pyssel)** → **slut + bro till nästa tema** (samma "Nästa gång ses vi i…"-mönster
som sagorna). Säsong följer den fasta 12-månaders-strukturen.

## 5. Hur Nova & Pling används i marknadsföring
- Endast **kanoniska bilder** (Character Bible v2); aldrig nya utseenden/karaktärer.
- Rollkonsekvens: **Nova** = relaterbar, kännande, nyfiken (känslohook mot barn/förälder); **Pling** = lekfull,
  förklarande, gadget-glad (wow/lärande). Båda i varm svensk ton.
- De är "värdparet" som bjuder in till månadens äventyr — samma relation till barnet som i sagorna.

## 6. Säsongs-/temaplanering (automatisk)
En **Campaign Planner** läser månad → tema och genererar en **innehållskalender** (per kanal, per beat)
för månaden, synkad med paketlansering. Planen föreslås; operatör godkänner. Planeraren känner till hela
12-månaders-cykeln och kan ligga 1–2 månader före (förlansering).

## 7. Återanvändning av innehåll
**Content atoms → kanalformat.** En tillgång ur månadspaketet (t.ex. en färgläggningssida, en sagoscen,
en Nova/Pling-pose, månadens nyckelbild) blir källa som återanvänds: Pinterest-pin, IG-karusellslide,
FB-inlägg, e-postblock. En **derivations-/återbrukskarta** kopplar atom → kanal-cuts, så samma kärninnehåll
återanvänds konsekvent utan dubbelarbete.

## 8. Mätning av resultat (KPI)
**Norra stjärnan (affär, via Stripe/revenueIntel):** betalande prenumeranter, **MRR**, **trial→betald-konvertering**, **churn**.
**Funnel:** räckvidd → engagemang (saves/shares) → webbklick → trial-start → betald → retention.
**Per kanal:** följartillväxt, sparningar/delningar (hög intent för föräldrar), CTR; e-post: öppning/klick/konvertering;
Pinterest: saves/utgående klick. Allt yttas i **Operations Center** (Familje-panelen) bredvid Stripe-siffrorna.

## 9. Hur det skiljer sig från The Prompt
| | The Prompt | Familje-Stunden Marketing Engine |
|---|---|---|
| Innehåll | AI-nyhetsvideor (dagligt) | Månadsäventyr (Nova & Pling, 12 teman) |
| Publik | AI-intresserade | Föräldrar till små barn |
| Mål | Räckvidd | **Prenumeranter / MRR / konvertering** |
| Ton | Nyhet/hook | Varm, trygg, magisk, svensk |
| Kanaler | IG/FB/YouTube auto | IG/FB/**Pinterest**/**e-post** (+ B2B v3) |
| Kadens | Daglig | Månadsvis (temacykel) |
| Sanningskälla | — | **Familje-KB (bibles)** |
Delar bara infrastruktur (durable engine, Operations, Stripe). **Aldrig delad data, KB, tokens eller karaktärer.**

## 10. Hur allt känns konsekvent Familje-Stunden
- **KB som enda sanningskälla** + en **Brand/Canon-Guard** som validerar varje utkast mot brand-rules,
  character- och theme-bible INNAN publicering (avvisar off-brand/off-tema/fel karaktär).
- **Kanonisk asset-återanvändning** (Nova & Pling-lås, temats nyckelbild/palett).
- **Människa-i-loopen-godkännande** (Action Center/approvals) före publik publicering — extra viktigt eftersom
  varumärket är levande och har betalande kunder.

---

## Architecture v1
```
KB (content/familje-stunden: brand/characters/themes/content-bible + index.json)
  + Stripe/revenueIntel (live affärssignaler)
        │
        ▼
[Campaign Planner] → månadskalender (per kanal, per beat)
        │
        ▼
[Channel Drafters] (IG/FB/Pinterest/E-post) → utkast (text + valda kanoniska assets)
        │
        ▼
[Brand/Canon Guard] → validerar mot brand/character/theme-rules  ──fail──▶ tillbaka till Drafter
        │ pass
        ▼
[Operatörsgodkännande] (Action Center / approvals)
        │
        ▼
[Scheduler/Publisher] (per kanal, egna tokens)  → publicerar
        │
        ▼
[Insights] → metrics → Operations Center (Familje-panel) + tillbaka till Planner (lärande, → Hermes v3)
```
Allt körs via **durable workflow-engine** (pending → drain → retry), scoped till `project_id=familje-stunden`.

## Agent-design
- **Campaign Planner** — månad→tema→kalender + beats; ligger före i cykeln.
- **Channel Drafter** (en per kanal eller en parametriserad) — KB-driven copy + asset-val per kanalformat.
- **Brand/Canon Guard** — regelvalidering mot KB (ton, karaktär, tema, "vad som inte hör hemma").
- **Asset Selector** — väljer kanoniska tillgångar ur KB-index (återbrukskartan).
- **Scheduler/Publisher** — kö + publicering per kanal med projektets egna tokens; idempotent (samma mönster som media-pipelinen).
- **Insights** — hämtar kanalmetrics + Stripe-funnel; matar Operations Center.

## Dataflöde
KB + temamånad + Stripe-signaler → Planner → Drafter → Guard → Approval → Publisher → Insights → (Operations + Planner-loop).

## Content-flöde
Månadspaket (Content Bible-assets) → content atoms → kanal-cuts (IG/FB/Pinterest/e-post) → schemaläggning → publicering → mätning → återbruk.

## Kanalstrategi
- **v1:** Instagram + Facebook + E-post (MailerLite) + Pinterest. Tema-driven månadskampanj, människa-i-loopen.
- **v2:** TikTok + YouTube; automatiserad schemaläggning; trial-nurture-automation; A/B-test.
- **v3:** Blogg/SEO; Förskole-B2B; full sluten loop (Insights→Planner via Hermes Reflection).

## KPI-förslag
- **Affär:** betalande prenumeranter, MRR, trial→betald-%, churn-%, intäkt/månad (Stripe).
- **Funnel:** räckvidd → saves/shares → webbklick → trial → betald → retention.
- **Kanal:** följartillväxt, engagemangsgrad, CTR; e-post öppning/klick/konvertering; Pinterest saves/klick.

## Roadmap
- **v1 (denna design):** KB-driven planering + utkast + Brand-Guard + operatörsgodkännande + assisterad publicering till IG/FB/E-post/Pinterest; KPI:er i Operations Center. Återanvänder durable engine + Stripe + Operations. Ingen storskalig auto-postning (varumärkessäkerhet).
- **v2:** automatiserad schemaläggning/publicering via kanal-connectors; återbruksmotor; TikTok/YouTube; trial-nurture-flöden; A/B-test.
- **v3:** Hermes Reflection (lär vad som konverterar) → prediktiv tema-/säsongsoptimering; Förskole-B2B; blogg/SEO; sluten insikts→planerings-loop.

---

## Isolerings-skydd (kritiskt)
- Eget `project_id=familje-stunden`; egna `platform_tokens` (eget IG/FB/Pinterest/MailerLite-konto).
- Egen KB; Brand-Guard hindrar The Prompt-element. Ingen agent läser The Prompts KB/assets/röst.
- Återanvänder bara *neutral infrastruktur* (motor, kö, Operations, Stripe) — aldrig innehåll/kanon.

## Beslutad v1-omfattning (låst 2026-06-03)
1. **Kanaler v1: Instagram + Facebook** (Pinterest + e-post skjuts till v2).
2. **Automation v1: utkast + operatörsgodkännande** — Atlas genererar och föreslår, du godkänner i Action Center, ingen auto-postning.
3. **Tokens:** Familje-Stunden har **egna konton** för IG/FB → kopplas i det projekt-medvetna token-lagret (G1) under `project_id=familje-stunden`.
4. **Funnel-mål: egen landningssida** — kampanjklick → landningssida → trial/köp; konvertering mäts mot Stripe (revenueIntel).

### Vad detta konkret innebär för v1-bygget
- Endast två Channel Drafters (IG, FB). Brand/Canon-Guard + Campaign Planner som planerat.
- Ingen Scheduler/Publisher med auto-postning ännu — utkast hamnar för godkännande (Action Center/approvals);
  publicering sker assisterat efter godkännande (manuellt eller via run_media_step-liknande brygga, men gated).
- Egna Familje-IG/FB-tokens registreras i `platform_tokens` (projekt-medvetet) — separat från The Prompts tokens.
- Landningssidans URL blir funnel-ankare; UTM/klick → trial → Stripe-konvertering yttas i Operations Center.
- KPI v1: räckvidd/engagemang (IG/FB) → landningssidans klick → trial-start → betald (Stripe) → churn.
