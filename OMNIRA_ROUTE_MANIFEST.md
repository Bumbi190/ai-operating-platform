# Omnira — Route-manifest (officiell sanningskälla för route-klassificering)

_PR-0-artefakt, plannivå. Väntar på din granskning/godkännande **innan** PR-0 byggs. Genererat ur faktisk kod: 93 `route.ts` + 2 stray-dubbletter. Auth/service-role/scope härledda ur import- och anropssignaler i varje fil (`createAdminClient`, `supabase/server`, `requireUserOrApiKey`/`lib/api-auth`, `CRON_SECRET`, webhook-signatur). **PR-0:s `route-drift`-jobb verifierar manifestet mot faktiskt beteende — markeringar med ⚠ ska bekräftas per route under bygget.**_

---

## Legend

- **Klass:** **U** User-data · **S** System/cron · **W** Webhook · **A** Admin/farlig · **X** Extern API (v1)
- **Auth:** `User` (cookie/RLS-session) · `User/API-key` (`requireUserOrApiKey`) · `Cron-secret` · `Signatur` · `Ingen ⚠`
- **SR:** Ja = använder `createAdminClient` (service-role, kringgår RLS) · Nej = RLS-klient/ingen DB
- **Scope:** hur isolation upprätthålls (`project_id`, `via run→project`, `business`, `global`, `ingen ⚠`)
- **KS (Kill Switch):** `Ja` = måste honorera per-projekt-paus · `N/A` = ren läsning · `infra` = plattformsnivå
- **Risk:** Low / Medium / High (isolations-läckagepotential × blast radius)

**Viktig kontext från middleware:** `middleware.ts` släpper igenom **alla** `/api`-routes (ingen global auth-grind). Varje route **måste** därför self-autha — auth-kolumnen nedan är den enda spärren.

---

## Klass U — User-data (returnerar tenant-data; högsta testprioritet)

| Path | Auth | SR | Scope | KS | Risk |
|---|---|---|---|---|---|
| `/projects` | User | Nej | project_id (owner) | N/A | Low |
| `/projects/by-slug/[slug]` | User | Nej | project_id | N/A | Low |
| `/projects/[slug]/agents` | User | Nej | project_id | N/A | Low |
| `/projects/[slug]/agents/[id]` | User | Nej | project_id | N/A | Low |
| `/projects/[slug]/workflows` | User | Nej | project_id | N/A | Low |
| `/projects/[slug]/workflows/[id]` | User | Nej | project_id | N/A | Low |
| `/projects/[slug]/dream` | User | Ja | project_id | Ja | Medium |
| `/runs` | User | Nej | project_id | N/A | Low |
| `/runs/[id]` | User | Nej | via run→project | N/A | Low |
| `/runs/[id]/ebook` | User | Nej | via run→project | N/A | Low |
| `/runs/[id]/monthly-pdf` | User | Nej | via run→project | N/A | Low |
| `/runs/[id]/mp3-manus` | User | Nej | via run→project | N/A | Low |
| `/runs/[id]/stream` | User | Ja | project_id | N/A | Medium |
| `/runs/[id]/resume` | User | Ja | via run→project | Ja | Medium |
| `/outputs/[id]` | User | Nej | via run→project | N/A | Low |
| `/approvals` | User | Ja | via run→project | N/A | Medium |
| `/approvals/[id]` | User | Ja | via run→project | Ja | Medium |
| `/conversations` | User | Ja | project_id | N/A | Medium |
| `/conversations/[id]` | User | Ja | project_id | N/A | Medium |
| `/manager` | User | Ja | project_id | Ja | Medium |
| `/evaluate` | User | Ja | project_id | N/A | Medium |
| `/memory/patterns` | User | Nej | project_id | N/A | Low |
| `/leads` | User | Ja | project_id | N/A | Medium |
| `/business/leads` | User/API-key | Ja* | project_id (param) | N/A | Medium |
| `/business/campaigns` | User/API-key | Ja* | project_id (param) | N/A | Medium |
| `/business/revenue` | User/API-key | Ja* | project_id (param) | N/A | Medium |
| `/chat` | User | Ja | project_id | Ja | Medium |
| `/chat/tts` | User/API-key | Nej | ingen | N/A | Low |
| `/fix-image-agent` | User | Ja | via run | Ja | Medium |
| `/actions/resume-failed` | User | Ja | project_id | Ja | Medium |
| `/marketing/plans` | User | Ja | project_id | N/A | Medium |
| `/marketing/plans/generate` | User | Ja | project_id | Ja | Medium |
| `/marketing/plans/[id]/generate-drafts` | User | Ja | project_id | Ja | Medium |
| `/marketing/drafts` | User | Ja | project_id | N/A | Medium |
| `/marketing/drafts/generate` | User | Ja | project_id | Ja | Medium |
| `/marketing/drafts/return` | User | Ja | project_id | N/A | Medium |
| `/marketing/approvals` | User | Ja | project_id | Ja | Medium |
| `/marketing/guard` | User | Ja | ingen ⚠ | N/A | Medium |
| `/marketing/guard/validate` | User | Ja | project_id | N/A | Medium |
| `/media/scripts` | User | Ja | project_id | N/A | Medium |
| `/media/scripts/[id]` | User | Ja | via script→project ⚠ | N/A | Medium |
| `/media/scripts/[id]/regenerate` | User | Ja | project_id | Ja | Medium |
| `/media/scripts/from-run` | User | Ja | project_id | N/A | Medium |
| `/media/news` | User | Ja | project_id | N/A | Medium |
| `/media/news/[id]` | User | Ja | via news→project ⚠ | N/A | Medium |
| `/media/news/from-run` | User | Ja | project_id | N/A | Medium |
| `/media/news/hunt` | User | Ja | project_id | Ja | Medium |
| `/media/images/generate` | User | Ja | project_id | Ja | Medium |
| `/media/music/generate` | User | Ja | project_id | Ja | Medium |
| `/media/voice` | User | Ja | project_id | Ja | Medium |
| `/media/insights/check` | User | Ja | ingen ⚠ | N/A | Medium |
| `/media/render-input/[scriptId]` | User | Ja | project_id | N/A | Medium |
| `/media/render/start` | User | Ja | project_id | Ja | Medium |
| `/media/token` | User | Ja | ingen ⚠ (secrets) | infra | **High** |
| `/media/publish/instagram` | User | Ja | ingen ⚠ | Ja | **High** |
| `/media/pipeline/daily` | User | Ja | project_id | Ja | **High** |
| `/media/pipeline/full` | User | Ja | project_id | Ja | **High** |
| `/media/pipeline/intro` | User | Ja | project_id | Ja | Medium |

\* `business/*` autentiserar via `requireUserOrApiKey` men läser genom `lib/business/store.ts` som kör service-role + param-scope → exakt mönstret PR-3B/guard ska härda.

## Klass S — System/cron (cron-secret + service-role; cross-project by design)

| Path | Auth | SR | Scope | KS | Risk |
|---|---|---|---|---|---|
| `/runs/drain` | Cron-secret | Ja | project_id (måste) | **Ja** | **High** |
| `/runs/execute` | Cron-secret | Ja | via run→project | **Ja** | **High** |
| `/media/cron/autonomous` | Cron-secret | Ja | ingen ⚠ | **Ja** | **High** |
| `/media/cron/publish` | Cron-secret | Ja | ingen ⚠ (honorerar paus idag) | **Ja** | **High** |
| `/media/cron/reply-comments` | Cron-secret | Ja | ingen ⚠ | **Ja** | **High** |
| `/media/cron/youtube` | Cron-secret | Ja | ingen ⚠ | **Ja** | **High** |
| `/media/cron/refresh-tokens` | Cron-secret | Ja | ingen ⚠ (secrets) | infra | **High** |
| `/media/cron/step1` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/step2` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/step3` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/step4` | Cron-secret | Ja | ingen ⚠ | Ja | Medium |
| `/media/cron/pipeline-retry` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/account-snapshot` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/competitors` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/insights` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/cron/morning-briefing` | Cron-secret | Ja | project_id | N/A | Medium |
| `/media/cron/token-health` | Cron-secret | Ja | global (tokens) | infra | Medium |
| `/media/cron/heartbeat` | Cron-secret | Ja | global | infra | Low |
| `/media/cron/warmup` | Cron-secret | Nej | global | infra | Low |
| `/media/news/cron` | Cron-secret | Ja | project_id | Ja | Medium |
| `/media/render/complete` | Cron-secret | Ja | via render→project ⚠ | Ja | Medium |
| `/media/research/query` | Cron-secret | Nej | global | N/A | Low |
| `/media/research/scrape` | Cron-secret | Ja | ingen ⚠ | N/A | Medium |
| `/briefing/cron` | Cron-secret | Ja | project_id | N/A | Medium |
| `/business/cron/stripe-snapshot` | Cron-secret | Ja | project_id | Ja | Medium |
| `/bugscanner/run` | Cron-secret + User | Nej | global | infra | Medium |
| `/media/render/status/[renderId]` | **Ingen ⚠** | Ja | ingen ⚠ | N/A | **High** |

## Klass W — Webhook (extern signatur)

| Path | Auth | SR | Scope | KS | Risk |
|---|---|---|---|---|---|
| `/webhooks/stripe` | Signatur (Stripe) | Nej | project_id | Ja | Medium |
| `/webhooks/instagram` | verify_token (GET); POST-signatur ⚠ | Ja | ingen ⚠ | Ja | **High** |

## Klass A — Admin/farlig (måste vara låst, ej i normal prod-runtime)

| Path | Auth | SR | Scope | KS | Risk |
|---|---|---|---|---|---|
| `/migrate` | User | Ja | project_id | infra | **High** |
| `/seed` | Cron-secret + User | Ja | project_id | infra | **High** |
| `/media/debug/subscribe-webhooks` | Cron-secret | Nej | project_id | infra | **High** |

## Klass X — Extern API (v1)

| Path | Auth | SR | Scope | KS | Risk |
|---|---|---|---|---|---|
| `/v1/runs` | API-key | Ja | project_id | Ja | Medium |
| `/v1/runs/[id]` | API-key | Ja | ingen ⚠ | N/A | Medium |
| `/v1/workflows` | API-key | Ja | project_id | N/A | Medium |

---

## Röda flaggor (omedelbara isolationssignaler att vända gröna)

Utgångsläget §1/§2 ska beta av, prioriterat:

1. **`/media/render/status/[renderId]` — service-role UTAN auth.** Enda genuint oautentiserade SR-routen. Bekräfta + lägg auth/scope. **High.**
2. **`/webhooks/instagram` — POST-signatur ej verifierad (endast `verify_token` på GET) + service-role + ingen projekt-scope.** Verifiera Meta-signatur + routa till rätt projekt. **High.**
3. **Cron med `Scope: ingen ⚠` som agerar externt** (`autonomous, publish, reply-comments, youtube, refresh-tokens, step4, research/scrape`): saknar synlig projekt-scope → måste loopa per projekt + honorera kill switch via `claim_runs`/drainer, inte route-internt. **High/Medium.**
4. **`/media/token` + `/media/cron/refresh-tokens` — secrets utan tydlig projekt-scope.** Tokens är redan per `project_id` (`platform_tokens`); läs/skriv måste scopas. **High.**
5. **Admin/farliga (`/migrate`, `/seed`, `/media/debug/subscribe-webhooks`)** — bekräfta att de är låsta bakom admin-secret och ej anropbara i prod. **High.**
6. **`business/*` + `v1/*` — service-role + param-scope.** Authade, men scoping via store-lager/param → härdas av tenancy-guarden (PR-5). **Medium.**
7. **Två stray-dubblettfiler:** `media/cron/step3/route 2.ts` och `media/render/start/route 2.ts` — sannolikt oavsiktliga skuggfiler (jfr `brand 2/`, `supabase 2/`). **Radera/granska** — en stale shadow-route är en isolationsrisk. **High (operativ).**

---

## Bindning till PR-0

- **Detta manifest = sanningskällan** för CI-jobbet `route-drift`: varje route måste ha en post; en route som ändrar klass, inför service-role i U/X utan guard/scope, eller saknar `Cron-secret` i S → **failar**. Nya routes utan manifest-post → **failar**.
- **Leak-testet (`routes.test.ts`)** itererar manifestet och kör assertion-setet per klass (U: A med B:s id → tomt/403; S: 401 utan secret + kill-switch; W: signatur + rätt projekt; A: låst; X: API-key + scope).
- **`Scope: ingen ⚠`** och **`Auth: Ingen ⚠`** är de rader som ska gå röd→grön när §1 (RLS/policy), PR-3 (scopa queries) och §2 (guard) landar. Manifestet gör den listan explicit och mätbar.

---

## Status & nästa steg

- **Plannivå. Inget byggt.** Manifestet inväntar din granskning.
- **Att bekräfta vid granskning:** (a) ⚠-raderna (auth/scope) stämmer mot faktiskt beteende, (b) Kill-Switch-kolumnen speglar vad du vill paus-styra per projekt, (c) risknivåerna matchar din prioritering.
- **När du godkänt manifestet bygger vi PR-0** utifrån det (katalog-enumerering + `routes.test.ts` + CI-workflows), och börjar vända de röda flaggorna gröna — isolation före autonomi, oförändrat.

---

### Referensfiler
`apps/web/middleware.ts` (släpper `/api` förbi) · `apps/web/lib/api-auth.ts` (`requireUserOrApiKey`) · `apps/web/lib/supabase/{admin,server,client}.ts` · `apps/web/lib/business/store.ts` · `apps/web/app/api/**/route.ts` (93) · `supabase/migrations/{20260603_durable_runs,20260528_pass_a_safeguards,20260602_g1_multitenant_platform_tokens}.sql`.
