# Familje-Stunden — Trial-modell, Stripe & Meta-isolering: Audit + Plan

**Status:** Audit + implementationsplan. **Ingen kod/Stripe/Meta ändrad.**
Repos: **familje-stunden-v2** (`Bumbi190/familje-stunden-v2`, produktsajt/SPA + Supabase edge functions) och
**AI Operating Platform** (`Bumbi190/ai-operating-platform`, Omnira/Marketing Engine).
Isoleringsprincip: Familje-Stunden och The Prompt delar bara *neutral infrastruktur* — aldrig tokens, innehåll,
KB, kampanjer, utkast, publiceringsrättigheter, analytics eller brand rules.

---

# DEL 1 — TRIAL-MODELL AUDIT

## 1. Verifierade fakta (vad koden faktiskt gör idag)

| Fakta | Källa (fil) |
|------|-------------|
| **Standard-checkout ger 90 dagars (3 mån) trial till ALLA nya användare** — `trial_period_days: 90`, `shouldGetTrial = !hasPreviousSubscription` | `supabase/functions/create-checkout/index.ts` (TRIAL_PERIOD_DAYS=90, rad 24, 234, 320) |
| Klarna stöds (kort + Klarna) | `create-checkout/index.ts` `payment_method_types: ["card","klarna"]` |
| Manuell promo-kod tillåts i checkout (`allow_promotion_codes: true`) | `create-checkout/index.ts` |
| Webhook ger **3-månaders promo-entitlements** för kupong som är 100% off + repeating + 3 mån | `supabase/functions/stripe-webhook/index.ts` (isOur3MonthPromo, rad 321–494) |
| Admin kan sätta **90 dagars** trial manuellt | `supabase/functions/admin-set-trial/index.ts` (90 days) |
| Nav-CTA: **"Prova gratis i 3 månader"** | `src/components/Navbar.tsx` (rad 199, 294) |
| Checkout-banner: **"3 månader gratis för nya medlemmar"**, "59 kr/mån dras efter provperioden" | `src/pages/Checkout.tsx` (rad 117–212) |
| ProvaGratis-sida: "3 mån gratis", kod **FAMILJESTUNDEN2026**, "Efter 3 månader: 59 kr/mån" | `src/pages/ProvaGratis.tsx` (rad 45, 169, 203–598) |
| Pris: **59 kr/mån** (recurring, STRIPE_PRICE_ID); ingen bindningstid | `Prenumerera.tsx`, `index.html` JSON-LD (price 59) |
| SEO/JSON-LD: "59 kr per månad utan bindningstid ... prova Känslomånaden helt gratis" | `index.html` (rad 175, 226) |
| **Omnira marketing-canon säger "provmånad" (= 1 månad)** trial, CTA "Prova gratis" | `content/familje-stunden/marketing-bible.md` (rad 37, 48, 57, 68); `apps/web/lib/marketing/kb/marketing-canon.ts` (PROOF_POINTS "59 kr + provmånad gratis") |

## 2. Motstridiga fakta (konflikter)

| # | Konflikt | A | B | Önskat (verifierad regel) |
|---|----------|---|---|---------------------------|
| C1 | **Trial-längd (standard)** | Sajtens checkout = **90 dagar** | Omnira-canon = **provmånad (1 mån)** | **1 månad** |
| C2 | **Hjälte-CTA** | `Home.tsx` = "Starta din prenumeration" → /prenumerera | `Navbar.tsx` = "Prova gratis i 3 månader" | En konsekvent: "Prova gratis (1 mån)" |
| C3 | **Trial-budskap i copy** | Hela sajten = "3 månader gratis" | Omnira-canon = "provmånad" | 1 månad standard; 3 mån endast VIP |
| C4 | **Två 3-månadersmekanismer** | Default `trial_period_days=90` | 3-mån 100%-off-kupong (FAMILJESTUNDEN2026) | Behåll ENDAST kupongen (VIP); default → 30 dagar |
| C5 | **Social proof** | "500+ familjer" (StatsBar) | Stripe ~5 aktiva + 3 trial | Sann formulering eller ta bort |
| C6 | **Prisnivåer** | Sajt = 1 nivå (59 kr digital) | Omnira-canon nämner 59/129/199 (Digital/Bok/Box) | Lågprio — bekräfta om Bok/Box finns |

## 3. Fillokationer (nyckelställen att ändra senare)
- Trial-logik: `supabase/functions/create-checkout/index.ts` (TRIAL_PERIOD_DAYS), `admin-set-trial/index.ts`, `stripe-webhook/index.ts`.
- Copy: `src/components/Navbar.tsx`, `src/pages/Checkout.tsx`, `src/pages/ProvaGratis.tsx`, `src/pages/Home.tsx`, `src/pages/Prenumerera.tsx`, `src/pages/FAQ.tsx`, `index.html` (SEO + JSON-LD), `src/components/landing/StatsBar.tsx` (500+).
- Omnira-canon (redan 1 mån — håll i synk): `content/familje-stunden/marketing-bible.md`, `apps/web/lib/marketing/kb/marketing-canon.ts`.

## 4. Risknivå
| Fynd | Risk |
|------|------|
| 90-dagars default-trial åt alla (mot 1-mån standard) | **HÖG** — 3 mån gratis till varje ny kund = uppskjuten/utebliven intäkt |
| "500+ familjer" mot verkligt ~5 | **HÖG** — falskt påstående, trovärdighets-/förtroenderisk |
| Inkonsekventa CTA (3 mån vs starta prenumeration) | MEDEL — konverteringsförvirring |
| Två överlappande 3-mån-mekanismer | MEDEL — underhåll/buggrisk |
| Omnira-canon (1 mån) ↔ sajt (3 mån) divergens | MEDEL — Marketing Engine annonserar fel trial |

## 5. Rekommenderade fixar (översikt — detaljeras i Del 2 & 4)
Sätt 1-månadstrial som standard i `create-checkout`; uppdatera all sajt-copy 3 mån → 1 mån; gör 3-mån till
kupong/inbjudan-only (VIP); fixa "500+"; håll Omnira-canon (redan 1 mån) i synk; en konsekvent CTA.

---

# DEL 2 — STANDARDISERING AV PRENUMERATIONSMODELL

**Verifierade affärsregler:**
- **Standard:** 1 månad gratis trial · 59 kr/mån därefter · ingen bindningstid · Klarna stöds.
- **VIP/Test:** 3 månader gratis · endast via manuell inbjudan eller särskild kupong.

## Vad som behöver uppdateras (kod/copy)
1. `create-checkout/index.ts`: `TRIAL_PERIOD_DAYS = 90 → 30` (1 månad). (Alternativ: sätt `trial_end` till +1 kalendermånad; 30 dagar är enklast och förutsägbart.)
2. `admin-set-trial/index.ts`: behåll 90 dagar — detta blir **VIP-vägen** (manuell 3-mån). Tydliggör i namn/kommentar att 90 = VIP.
3. All standard-copy → "1 månad gratis" / "provmånad": Navbar, Checkout-banner, Home hjälte-CTA, Prenumerera, FAQ, index.html SEO + JSON-LD.
4. ProvaGratis-sidan + kod FAMILJESTUNDEN2026: gör **inbjudan-only** (sluta annonsera 3 mån publikt) eller flytta bakom en VIP-länk.
5. Hjälte-CTA enhetlig: "Prova gratis i 1 månad" (eller "Prova gratis"), samma överallt.
6. Omnira-canon är redan "provmånad" (1 mån) → ingen ändring, men verifiera att Drafter/Guard fortsätter annonsera 1 mån (de gör det).

## Vilka Stripe-objekt behöver uppdateras
| Objekt | Åtgärd |
|--------|--------|
| **Pris** (STRIPE_PRICE_ID, 59 kr/mån recurring) | Ingen ändring |
| **Default-trial** | Kod-driven (`trial_period_days`), INTE en kupong → ändras i create-checkout (90→30). Ingen Stripe-objektändring krävs. |
| **3-mån 100%-off repeating-kupong** (VIP) | **Behåll.** Webhook-logiken (isOur3MonthPromo) förutsätter 100% off + repeating + 3 mån. |
| **Promotion code** (FAMILJESTUNDEN2026 → den 3-mån-kupongen) | Gör **invite-only**: ta bort publik exponering; ev. ny privat kod; begränsa max_redemptions/redeem_by. |
| Klarna | Redan på i checkout — verifiera aktiverat i Stripe-konto. |

## Vilken kupong ska behållas / bli default
- **Behåll:** den 3-månaders 100%-off repeating-kupongen → blir **VIP/Test-vägen** (inbjudan/kod).
- **Default:** INGEN kupong. Standard = 30-dagars `trial_period_days` i koden (ingen rabattkupong).

## Migrationsrisker
- **Befintliga 90-dagars-trials:** att ändra `TRIAL_PERIOD_DAYS` påverkar **endast nya** checkouts. Befintliga prenumerationer behåller sin satta trial i Stripe — förkorta dem INTE retroaktivt (orättvist/juridiskt tveksamt).
- **Publik 3-mån-kod:** så länge FAMILJESTUNDEN2026 + ProvaGratis annonserar 3 mån publikt undermineras 1-mån-standarden — måste stängas/invite-only samtidigt som copy ändras.
- **Webhook:** behåll isOur3MonthPromo för VIP-kupongen (rör inte).
- **SEO/JSON-LD:** uppdatera annars indexeras "fel" trial.
- **Konsekvens Omnira↔sajt:** Marketing Engine annonserar redan "provmånad" (1 mån) — efter sajt-fixen är de i synk; ingen Drafter-ändring behövs.

---

# DEL 3 — META / FACEBOOK / INSTAGRAM ISOLERING

## 1. Nuvarande token-arkitektur (Omnira)
- Tabell **`platform_tokens`** är projekt-medveten (G1): kolumner `project_id, platform, token_type, access_token, account_id, expires_at`; unik nyckel **(project_id, platform, token_type)**. (`supabase/migrations/20260602_g1_multitenant_platform_tokens.sql`)
- **`getToken(platform, project?)`** (`apps/web/lib/media/token-store.ts`): läser raden för (projekt, plattform); default-projekt = `ai-media-automation` (The Prompt); **env-fallback ENDAST för default-projektet**.
- Projekt: The Prompt = `a8a1b1f6…` (har IG-token), Familje-Stunden = `77cda551…` (**0 tokens idag**).
- `token_health`-tabellen är **inte** projekt-scopad (nyckel = platform) → övervakar i nuläget bara The Prompts token.

## 2. Är isolering redan stödd? — **JA, på lagringsnivån**
Per-(project_id, platform, token_type) gör att Familje kan ha **egna** IG/FB-tokens under `project_id=77cda551`,
helt åtskilt från The Prompt (`a8a1b1f6`). Env-fallbacken läcker inte (gäller bara default-projektet).
`getToken('instagram','familje-stunden')` skulle returnera Familjes token; `getToken('instagram')` The Prompts.

## 3. Saknade delar
- **`token_health` saknar `project_id`** → kan inte övervaka Familjes tokens separat (skulle krocka/skriva över The Prompts hälsorad). Behöver projekt-scope (litet tillägg).
- **Ingen Publisher byggd ännu** → tokens behövs först när Marketing Engine v1 Publisher (v2) kommer; idag genereras bara utkast.
- **familje-stunden-v2-appen postar inte själv till Meta** — och ska inte ha Meta-tokens; publicering sker server-side via Omnira.

## 4. Rekommenderad implementation
1. Skapa **egna** Familje-Meta-tillgångar: eget Instagram Business-konto + egen Facebook-sida (@familjestunden), separata från The Prompt.
2. Generera long-lived token; spara via `setToken(platform, token, expiresAt, { project: 'familje-stunden', accountId })` → hamnar under `project_id=77cda551`.
3. Lägg `project_id` på `token_health` + scope:a token-health-cronen per projekt (så Familjes token-status syns separat i Operations Center).
4. **Lägg ALDRIG Meta-tokens i familje-stunden-v2** (.env/Vercel) — posting går via Omnira.

## 5. Säkerhetsrisker
| Risk | Mitigering |
|------|-----------|
| Token sparas utan `project` → defaultar till The Prompt → korskontaminering | Anropa alltid `setToken(... {project:'familje-stunden'})`; aldrig utan projekt |
| The Prompts `INSTAGRAM_ACCESS_TOKEN` i env läcker via fallback | Env-fallback gäller bara default-projektet; Familje använder DB-raden — säkert. Se till att Familje-appen inte har Meta-env. |
| token_health blandar projekt | Lägg project_id (Del 3.3) |
| RLS | `platform_tokens` är service-role-only — behåll |

---

# DEL 4 — IMPLEMENTATIONS-ROADMAP

**Fas 1 — Fixa trial-konsistens (kod + copy, familje-stunden-v2)**
- `create-checkout`: `TRIAL_PERIOD_DAYS` 90 → 30.
- Uppdatera copy 3 mån → 1 mån överallt (Navbar, Checkout, Home hjälte-CTA, Prenumerera, FAQ, index.html SEO/JSON-LD).
- Enhetlig CTA ("Prova gratis i 1 månad").
- Fixa "500+ familjer" (StatsBar) → sann formulering/ta bort.
- ProvaGratis + FAMILJESTUNDEN2026 → invite-only.
- Bekräfta Omnira-canon (redan 1 mån) oförändrad.

**Fas 2 — Konfigurera Stripe**
- Behåll 59 kr-priset; behåll 3-mån 100%-off-kupongen som **VIP-only**; begränsa/dölj dess promotion code.
- Verifiera Klarna aktiverat; verifiera att default nu ger 30 dagars trial; verifiera att ingen publik 3-mån-kod finns.

**Fas 3 — Konfigurera Meta-konton**
- Skapa Familjes egna IG/FB + token; spara via `setToken(project='familje-stunden')`; lägg `project_id` på `token_health`.

**Fas 4 — Verifiera end-to-end**
- Checkout: ny kund → 1 mån trial (kort + Klarna), 59 kr efter.
- VIP-kupong/inbjudan → 3 mån.
- Marketing Engine-utkast annonserar 1 mån (Drafter/Guard); inga falska påståenden (Guard MKT-FALSEPRICE).
- Meta-isolering: `getToken('instagram','familje-stunden')` = Familjes token; `getToken('instagram')` = The Prompts; inget läckage.

## Verifiering som kräver dig/Stripe-dashboard (kan ej läsas från sandbox)
- Exakta Stripe-objekt: aktiv 3-mån-kupong-ID + dess promotion code(s), max_redemptions/redeem_by, om Klarna är påslaget i kontot, exakt STRIPE_PRICE_ID-belopp. (Koden refererar dem; siffrorna måste bekräftas i Stripe.)
- Verkligt familjeantal för "500+"-beslutet.

> Inget ändrat. Detta är audit + plan. Säg till vilken fas du vill börja med så bygger jag den isolerat.
