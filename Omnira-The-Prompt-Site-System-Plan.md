# Omnira → The Prompt — Systemplan för sajtagenter (2026-06-11)

**Status:** Översiktsplan. Bygger på `Omnira-The-Prompt-Publishing-Implementation-Plan.md`, `Omnira-The-Prompt-Article-Writer-Spec-v1.md` och webbsajtens `docs/omnira-publish-contract-v1.md`. Mål: hemsidan uppdateras helt automatiskt med nyhetsartiklar och blogginlägg, skrivna och kvalitetssäkrade av Omnira-agenter.

---

## 1. Nulägesbild — vad som redan är byggt

Mer än hälften av systemet finns redan i kod:

| Komponent | Status | Var |
|---|---|---|
| News Hunter (viral nyhetsjakt: HN + Reddit + RSS → dedupe → viralitetsscore → Claude-redaktörsval) | ✅ Klar | `apps/web/lib/media/news-hunter.ts` |
| Article Writer (originalartiklar groundade i källtexten via Hermes, inte omskrivningar) | ✅ Klar | `apps/web/lib/article/writer.ts` + `ground.ts` |
| QA-gate (struktur, slop, copy-overlap, confidence-nivåer) | ✅ Klar | `apps/web/lib/article/qa.ts` |
| Approval-koppling (generiska `approvals`-primitiven) | ✅ Klar | `apps/web/lib/article/approval.ts` |
| Pipeline-orkestrator (Hunter → Writer → QA → Approval → Publish, `autoPublish: none\|high`) | ✅ Klar | `apps/web/lib/article/pipeline.ts` |
| Publishing-connector (destinationsregister, `the-prompt` via `publish_article`-RPC, retry, idempotens via `external_id`) | ✅ Klar | `apps/web/lib/publishing/*` |
| Smoke-test-endpoint | ✅ Klar | `app/api/publishing/smoke` |
| pg_cron-infrastruktur (29 aktiva jobb via `omnira_cron`) | ✅ Klar | Omnira-DB |
| Sajtens läslager + RLS-schemaläggning (`published_at <= now()`) | ✅ Klar | Webbsajt-repot |
| Sajtens design/UX P2 (featured, kategorifilter, react-markdown, relaterade artiklar, 404) | ✅ Klar 2026-06-11 | Webbsajt-repot (ej committat) |

## 2. Vad som saknas

| # | Gap | Typ |
|---|---|---|
| A | Migration `0002_omnira_publishing.sql` ej applicerad på The Prompt-DB (`shtffzmmcqdmundfuvda`) | **Blockerare** |
| B | Env-vars i Omnira Vercel: `THE_PROMPT_SUPABASE_URL` + `THE_PROMPT_SERVICE_ROLE_KEY` | Blockerare |
| C | Inget cron-jobb kör artikelpipelinen (alla 29 jobb är video/briefing/drift) | Automatisering |
| D | Hero-bilder för artiklar (storage/Ideogram/og:image-fallback) | Kvalitet |
| E | `publications`-spårning (external_id, slug, published_url, status) + dashboardvy | Observability |
| F | Bloggagent finns inte (långform, egen kadens, egen prompt) | Ny agent |
| G | Sajten saknar `/blog`-route + blogg-kategori | Sajt |
| H | SEO: per-artikel OG-taggar, RSS, dynamisk sitemap | Sajt |
| I | Service-role-nyckel bör bytas till scoped `omnira_publisher`-roll | Härdning |

---

## 3. Målarkitektur

```
                       OMNIRA (ai-media-automation / "The Prompt")
                       project_id-isolerat enligt isolationsregeln
┌─────────────────────────────────────────────────────────────────────┐
│  pg_cron                                                            │
│  ├─ omnira_articles_morning  (07:00) ─┐                             │
│  ├─ omnira_articles_evening  (17:00) ─┤                             │
│  └─ omnira_blog_weekly       (mån 09) ─┐                            │
│                                       │                             │
│  NYHETSAGENT                          │  BLOGGAGENT                 │
│  News Hunter ──► Article Writer       │  Ämnesbacklog ──► Blog      │
│  (viral jakt)    (grounded, original) │  (evergreen)      Writer    │
│        │               │              │                     │       │
│        └────► QA-gate ◄┘              └──────► QA-gate ◄────┘       │
│                 │                                  │                │
│        confidence-routing                 alltid human approval     │
│        high → auto-publish                (långform = högre insats) │
│        med/low → approvals                         │                │
│                 │                                  │                │
│                 └──────► lib/publishing ◄──────────┘                │
│                          publish_article RPC (idempotent)           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ external_id = omnira_<news_item_id>
                               ▼
                THE PROMPT-DB (shtffzmmcqdmundfuvda)
                articles + RLS → synlig när published_at <= now()
                               │
                               ▼
                theprompt.ai (ren läsare, noll cron)
                /            nyheter (featured + grid)
                /articles    kategorifilter
                /blog        bloggagentens inlägg (kategori: blog)
```

Nyckelprinciper (oförändrade från kontraktet): Omnira är enda skrivaren, sajten är ren läsare; idempotens via `external_id`; schemaläggning via `published_at` (ingen cron på sajten); allt project_id-isolerat.

---

## 4. Byggfaser

### Fas 1 — Aktivera publiceringen (blockerare, ~½ dag)
1. Lös Supabase-åtkomst (bjud in MCP-kontot i The Prompt-orgen, eller kör manuellt).
2. Applicera migration `0002` på `shtffzmmcqdmundfuvda`; smoke-testa `publish_article`/`unpublish_article` med kontraktets exempel (draft → schemalagd → publicerad → unpublish).
3. Sätt `THE_PROMPT_SUPABASE_URL` + `THE_PROMPT_SERVICE_ROLE_KEY` i Omnira Vercel.
4. Kör `/api/publishing/smoke` + en manuell pipeline-körning → första riktiga artikeln live.

**Exit:** en artikel publicerad från Omnira, omkörning uppdaterar samma rad (ingen dubblett).

### Fas 2 — Automatisera nyhetsagenten (~2–3 dagar)
1. Nya pg_cron-jobb: `omnira_articles_morning` + `omnira_articles_evening` → `/api/content/articles/generate` (CRON_SECRET-mönstret).
2. Start med `ARTICLE_AUTOPUBLISH=none` — allt går via approvals tills QA:n bevisat sig (~1–2 veckor), därefter `high` (high-confidence auto-publiceras, medium/low till människa).
3. Hero-bilder: Ideogram-generering eller og:image-fallback, hostad via `lib/media/storage.ts` (https-krav i kontraktet).
4. `publications`-tabell + dashboardvy (status, slug, published_url, senaste försök).
5. Drainer för retry av transienta fel (mönster: `pipeline-retry`).
6. Koppla newsjacking: breaking news via `/api/media/breaking` kan trigga en extra artikel-körning utanför schemat.

**Exit:** 2 artiklar/dag publiceras utan handpåläggning (efter förtroendeperioden), allt loggat och larmat.

### Fas 3 — Bloggagenten (~2–3 dagar)
1. Ny agentrad i `agents`-tabellen (project-isolerad), egen long-form-prompt: djupgående guider/analyser/listor, 1200–2000 ord, evergreen.
2. Ämnesbacklog-tabell (`blog_topics`: ämne, vinkel, sökord, status) — fylls av en topic-scout (trendanalys + sökordsidéer) och/eller manuellt.
3. Återanvänd Writer-infran: ny tier `deep`, grounding via Hermes-läsning av flera källor, samma QA-gate men striktare (långform = högre slop-risk).
4. Alltid human approval för blogg (lägre volym, högre insats per inlägg).
5. Publicera med `category: { slug: 'blog', name: 'Blog' }` (RPC:n auto-skapar kategorin).
6. Cron: `omnira_blog_weekly` (1–2 inlägg/vecka).
7. Sajten: `/blog`-route som filtrerar på blogg-kategorin + navlänk (litet jobb, P3 från sajtplanen).

**Exit:** 1–2 blogginlägg/vecka, godkända i approvals-flödet, synliga på /blog.

### Fas 4 — SEO & distribution på sajten (~1–2 dagar)
1. Per-artikel OG-taggar via Vercel edge middleware (krävs för att delningar på FB/LinkedIn ska visa rätt titel/bild).
2. JSON-LD `NewsArticle`/`BlogPosting`.
3. Dynamisk sitemap + RSS-feed genererad från Supabase (edge function) — RSS ger gratis distribution och plockas upp av aggregatorer.
4. Koppla mätlagret: artiklarnas trafik in i Omniras insights.

### Fas 5 — Härdning & federation (löpande)
1. Byt service-role-nyckeln mot scoped `omnira_publisher`-roll (kan bara köra de två RPC:erna).
2. Destinationsregistret växer till N sajter — varje ny Omnira-sajt = en registrypost + samma kontrakt v1.
3. Global paus (`checkAutomationPaused`) gäller redan alla publiceringar.

---

## 5. Beslutspunkter (Andre)

| Beslut | Rekommendation |
|---|---|
| Nyhetskadens | 2/dag (morgon + kväll) — matchar befintliga video-fönster |
| Autopublish-policy | `none` första 1–2 veckorna, sedan `high` |
| Bloggkadens | 1–2/vecka, alltid human approval |
| Bloggämnen | Topic-scout föreslår, du godkänner backloggen |
| Hero-bilder | Ideogram-genererade (eget bildspråk) med og:image som fallback |

## 6. Ordning

1. **Fas 1 nu** (kräver bara Supabase-åtkomst — allt annat är klart)
2. Fas 2 direkt efter (cron + bilder + spårning)
3. Fas 3 bloggagenten
4. Fas 4 SEO när innehållet flödar
5. Fas 5 löpande
