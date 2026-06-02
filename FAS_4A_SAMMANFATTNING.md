# Omnira — Sammanfattning: Token-fix + Fas 4a (Atlas Growth Intelligence — Foundation)

_Datum: 2026-06-02. Omfattar (1) lösningen av Instagram-token-blockeringen och (2) Fas 4a — datagrunden för Atlas som tillväxt-strateg._

---

## 0. TL;DR

- **Token-blockeringen är löst.** Orsaken var inte token i databasen utan **Vercels Data Cache** som serverade ett gammalt, dött `EAAW`-token. Fix: service-role-klienten kör nu `no-store`. IG + FB + YouTube postar nu automatiskt — morgonvideon gick ut live på alla tre.
- **Fas 4a är byggd och live.** Datagrunden för tillväxt-intelligens: följar-tidsserie, Content Score, Opportunity Engine (scaffold), topic-taggning, och korrekt projekt-attribuering.
- **Inga UI-förändringar** gjordes denna fas — allt är backend/data. Att synliggöra intelligensen i gränssnittet är första steget i nästa fas.

---

## 1. Nya sidor, komponenter och UI-förändringar

**Inga.** Denna fas var helt backend/data. De nya tjänsterna (Content Score, Opportunities, följar-collector) producerar data men exponeras ännu **inte** i någon sida eller komponent. Detta är en medveten avgränsning — grunden först, gränssnittet när datan mognat. Att koppla in detta i Atlas Home / Executive Summary är den rekommenderade första micro-uppgiften i nästa steg (se §8).

---

## 2. Nya databastabeller

| Tabell | Syfte | Nyckelkolumner |
|---|---|---|
| `account_snapshots` | **Konto-nivå tidsserie** (distinkt från `media_insights` som är per-inlägg). Grunden för all tillväxt-/publikanalys. | `project_id, platform, snapshot_date (unik), followers, reach, profile_views, raw` |
| `opportunities` | Atlas **samlar** möjligheter (Feature 7). Inga auto-actions. | `project_id, type, title, rationale, score, confidence, evidence(jsonb), status` |

**Ändrade tabeller:**
- `media_scripts`: nya kolumner `topic` (ämnesklassning) och `format` (default `'reel'`).

Båda nya tabellerna har **RLS på** utan klient-policy → endast service-role (cron/Atlas) kommer åt dem. Migrationsfiler ligger i `supabase/migrations/20260602_atlas_growth_*.sql`.

**Datakorrigering (engångs):** 35 `media_scripts` + 9 `media_insights` flyttade från projektet *Familje-Stunden* → *AI Media Automation (The Prompt)*, där de hör hemma. (5 dubblett-`news_items` lämnades kvar under Familje — ofarliga.)

---

## 3. Nya services, funktioner och backend

**Token/postning:**
- `lib/supabase/admin.ts` — admin-klienten tvingar nu `cache: 'no-store'` (token får aldrig cachas). *Detta är fixen som löste hela blockeringen.*
- `app/api/media/cron/youtube/route.ts` — härdad: laddar upp **alla** publicerade videor som saknas på YouTube inom 48h (loopar, äldst först, tak 3/körning) i stället för bara den senaste. Hoppar aldrig över en video vid försenad publicering.

**Fas 4a — Growth Intelligence:**
- `lib/media/account-insights.ts` — `igAccountSnapshot()` / `fbAccountSnapshot()`: hämtar konto-mått (följare m.m.) från Graph API, degraderar tyst till `null`.
- `app/api/media/cron/account-snapshot/route.ts` — daglig collector som upsertar en rad per plattform/dag i `account_snapshots`.
- `lib/atlas/content-tags.ts` — `classifyTopic()`: deterministisk ämnesklassning.
- `lib/atlas/content-score.ts` — `contentScore()`: relativ poäng 0–100 per inlägg ur `media_insights`, rankar bästa/sämsta + per ämne. **Urvalsmedveten** (`sampleSize` + `confidence`).
- `lib/atlas/opportunities.ts` — `detectOpportunities()`, `detectAndStoreOpportunities()`, `listOpportunities()`: Opportunity Engine-scaffold. Tröskelstyrd och ärlig — påstår aldrig en slutsats på för lite data.
- `app/api/media/cron/step1/route.ts` — pinnar AI-nyhetspipen till The Prompt (`ai-media-automation`) i stället för "första projektet"; taggar `topic`/`format` vid skapande.
- `app/api/media/news/cron/route.ts` — kör bara för The Prompt (inte Familje/GainPilot).
- `app/api/media/cron/insights/route.ts` — kör `detectAndStoreOpportunities()` dagligen efter insights.

**Schemaläggning:**
- `pg_cron`: `omnira_account_snapshot` — dagligen 07:00 UTC.
- Cowork scheduled task: `omnira-evening-post-check` — varje kväll 20:15 lokal tid (18:15 UTC). Verifierar att kvällsvideon gick ut på IG/FB/YouTube, fångar fastnade renderingar, bekräftar snapshot + insights.

---

## 4. Datakällor Atlas nu använder

**Sedan tidigare:** `cost_events` (kostnad), `revenue_events` (intäkt — tom), `leads` (tom), `media_scripts`, `media_insights` (per-inlägg), `projects`, `approvals`, `runs`, `platform_tokens`.

**Nytt i 4a:**
- `account_snapshots` — följar-/konto-tidsserie (tickar dagligen).
- `opportunities` — upptäckta möjligheter.
- `media_scripts.topic` / `.format` — innehållsdimensioner.

---

## 5. Fullt fungerande idag

- **Automatisk postning** till Instagram + Facebook + YouTube (morgon + kväll), via no-store-fixen. Verifierat live.
- **YouTube-uppladdning** som aldrig hoppar över en video (härdad cron).
- **Kommentarssvar** (samma token-väg → nu live).
- **Per-inlägg insights** (`media_insights`) — 10 inlägg med reach/engagement.
- **Följar-snapshot** — IG-följare fångas dagligen (live: 3 följare).
- **Content Score** — rankar de 10 inläggen relativt, med N + konfidens.
- **Opportunity Engine** — upptäcker och lagrar (1 möjlighet hittills: ämnet *regulation* leder, n=3, medium konfidens — och den visar sina siffror).
- **Topic-taggning** — automatiskt på nya inlägg + bakåt-taggat.
- **Korrekt projekt-attribuering** — The Prompts innehåll/insikter ligger nu rätt.
- **Cost Intelligence** (från tidigare faser) — kostnad i SEK per leverantör/projekt/agent.

---

## 6. Förberett men saknar data ännu

- **Tillväxtsignaler / publikbeteende** — kräver en följar-tidsserie över tid (just nu 1 dag). Mognar på dagar–veckor.
- **Project Health (Audience Growth, Momentum)** — väntar på samma tidsserie.
- **Rikare Opportunity-detektorer** (posting-time, format, growth) — format är konstant (`reel`) tills fler format införs; growth väntar på serien.
- **FB konto-följare** — Graph returnerar inte `fan_count` med nuvarande page-token (degraderar till null).
- **YouTube prenumeranter** — konto-snapshot för YouTube ej implementerad ännu.
- **IG konto-insights** (reach, profile_views) — kräver scope `instagram_manage_insights` (followers_count funkar utan).
- **ROI / intäkt** — `revenue_events` och `leads` är tomma → ROI = 0x tills en källa kopplas.
- **GainPilot & Familje-Stunden** — har ingen egen innehålls-/lead-pipeline; nu (korrekt) tomma på AI-nyheter.

---

## 7. Teknisk skuld & kända begränsningar

- **Git-friktion:** kodändringar måste pushas manuellt av dig (sandboxen kan inte committa pga låsfiler). DB-ändringar gör jag direkt.
- **Liten datavolym:** Content Score är *relativ* inom ~10 inlägg → signaler är riktningsgivande, inte statistiskt säkra. Opportunity-konfidens `medium` på n=3 är något generös (men N visas alltid transparent). Trösklarna kan skärpas.
- **Grov topic-klassning:** nyckelordsbaserad; ~11/35 hamnar i `other`.
- **Ej synliggjort:** Content Score & Opportunities samlas men visas inte i UI eller i Atlas konversation ännu.
- **Opportunities** saknar UI och dismiss-flöde.
- **5 dubblett-`news_items`** kvar under Familje-Stunden (ofarliga).
- **IG-insights/scope:** djupare konto-mått kräver scope-uppgradering + token-regenerering.

---

## 8. Rekommenderad nästa fas

**Steg A — nu, låg risk (synliggör det vi redan har):**
Koppla `contentScore()` + främsta `opportunity` in i `atlasExecutiveSummary` och en liten "Content Intelligence"-yta, så Atlas faktiskt *svarar som strateg* när du frågar "hur går The Prompt?". (Detta var micro-steget jag påbörjade — ej committat ännu.)

**Steg B — Fas 4b, efter ~2–3 veckors data:**
Growth Signals, Insights Feed (naturligt språk), Growth Timeline, Project Health-score, och UI-skiftet "dashboard → briefing". Lyser först med tidsserie + volym.

**Parallella spår (oberoende av tid):**
- **Intäktskälla** (Stripe eller manuell `/api/revenue`) → lås upp ROI.
- **Scope-uppgradering** för IG-insights + **YouTube-prenumerant-snapshot** + **FB-följare** → komplett konto-tidsserie över alla tre kanaler.
- **GainPilot / Familje-Stunden** — egna pipelines om/när de ska aktiveras.

---

## 9. Arkitekturöversikt — hur allt hänger ihop

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DATAKÄLLOR (Supabase / iboepohjwrhtgshrqaol)                             │
│                                                                           │
│  projects · platform_tokens · runs · approvals                            │
│  media_news_items → media_scripts(+topic/format) → media_insights         │
│  cost_events · revenue_events(tom) · leads(tom)                           │
│  account_snapshots ★ny   ·   opportunities ★ny                            │
└───────────▲───────────────────────────────────────────────▲─────────────┘
            │ skriver                                         │ skriver
┌───────────┴───────────────────────┐         ┌──────────────┴─────────────┐
│  COLLECTORS / CRONS (Vercel)       │         │  KOSTNAD                   │
│  step1–4 → publish → youtube       │         │  lib/cost/track.ts         │
│  reply-comments · insights         │         │  → cost_events             │
│  account-snapshot ★ny (07:00)      │         └────────────────────────────┘
│  (pipen pinnad till The Prompt)    │
└───────────┬────────────────────────┘
            │ läser (allt via no-store admin-klient ★fix)
┌───────────▼───────────────────────────────────────────────────────────────┐
│  ATLAS SERVICE-LAGER (lib/atlas/*) — deterministiskt, ärligt, read-mostly   │
│                                                                             │
│  identity.ts (vem Atlas är + affärsprofiler)                                │
│  context.ts  → ATLAS BRAIN: enad live-ögonblicksbild (kostnad, intäkt,      │
│                leads, publicerat, godkännanden, fallerade körningar)        │
│  ├── activity.ts ........ Agent Activity (runs + cost_events)               │
│  ├── social.ts .......... Social Foundation (media_insights aggregat)       │
│  ├── content-score.ts ★ . GROWTH: relativ poäng 0–100 + ranking/ämne        │
│  ├── content-tags.ts ★ .. ämnesklassning                                    │
│  ├── opportunities.ts ★ . OPPORTUNITY ENGINE (scaffold: samlar, ej agerar)  │
│  └── executive.ts ....... EXECUTIVE BRAIN: vad hände / kostade / funkade /  │
│                           göra härnäst   (★ Growth ej inkopplat här ännu)   │
│  actions.ts (prioriterade rekommendationer)                                 │
└───────────┬─────────────────────────────────────────────────────────────────┘
            │ exponeras i
┌───────────▼───────────────────────────────────────────────────────────────┐
│  YTOR (UI / API)                                                            │
│  Atlas Home · Activity Center · Action Center · chat (konverserande Atlas)  │
│  Cost Center (/costs) · Revenue (/revenue)                                  │
│  ★ Growth Intelligence: INGEN yta ännu — data samlas men visas inte         │
└─────────────────────────────────────────────────────────────────────────────┘

★ = nytt/ändrat i denna fas
```

**Hur lagren hänger ihop, i ord:**
Crons skriver rådata till Supabase via en gemensam **no-store admin-klient** (fixen som löste token-buggen). **Atlas Brain** (`context.ts`) läser ihop en enad ögonblicksbild. Ovanpå den sitter specialiserade hjärnor: **Business Intelligence** (activity + social), **Cost Center** (cost_events), **Revenue Center** (revenue_events — väntar på data), och nytt: **Growth Intelligence** (content-score + account_snapshots) samt **Opportunity-förberedelsen** (opportunities-tabell + detekteringstjänst). **Executive Brain** (`executive.ts`) syntetiserar allt till "vad hände / kostade / funkade / göra härnäst" — men Growth- och Opportunity-lagren är ännu **inte inkopplade i Executive Brain eller någon UI-yta**; det är nästa steg som gör intelligensen synlig.
