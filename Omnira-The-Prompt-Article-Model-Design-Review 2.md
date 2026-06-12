# The Prompt — Article Generation Model (Design Review, no code)

**Status:** Design review only. Resolves Risk R1 from the Publishing Implementation Plan (no upstream source for the website `body`). No implementation, no migrations.

**Question:** what is the smallest flow that produces high-quality AI-news articles for The Prompt's schema (`title, summary, body(markdown), category, tags, source_name, source_url, hero_image_url?`), reusing as much of News Hunter as possible?

---

## Part A — Asset audit (what already exists)

### A.1 `media_news_items` (per story, produced by News Hunter)
`title, summary` (2–3 sentences), `key_insight`, `url` (→ `source_url`), `source_name`, `content_angle` (educational|controversial|inspiring|practical), `target_audience`, `virality_score`, `status` (new|approved|rejected|scripted), `raw_output` (full Hunter JSON), `created_at`. **This is article-adjacent metadata, but the `summary` was written to *select* a story for video, not to be read as a post.**

### A.2 `media_scripts` (per video, downstream of a news item)
`hook, script` (spoken voiceover ~150–200 words), `captions[], hashtags[], cta, tone, video_url, status` (pending_review|approved|rejected|published), `published_at`. **Spoken-word, retention-hacked prose ("X just did Y — here's what changed"). It is already a derivative of the news item — a second hop from the original source.**

### A.3 News Hunter pipeline (`lib/media/news-hunter.ts`) — fully reusable
`fetchAllSources()` (HN + 4 subreddits + 7 RSS feeds), `deduplicateAgainstDB()` (url + title, 14-day window), `scoreAndRank()` (virality: authority 30% / engagement 40% / recency 30%), `claudeEditorialPick()` (Claude picks top 3), `runNewsHunter()` orchestrator. Plus a **`TRUSTED_DOMAINS` whitelist** (~50 curated AI sources), `SOURCE_WEIGHTS`, and an AI-keyword filter. The editorial-pick system prompt currently selects for *short-form video* ("visual potential", "60-second video").

### A.4 Agent prompts (`lib/media/agents.ts`)
`NEWS_HUNTER_PROMPT`, `SCRIPT_WRITER_PROMPT` (both video-oriented). **There is no article-writer prompt.**

### A.5 Hermes (`lib/media/hermes.ts`) — optional external service (`HERMES_URL`)
- **`callHermesRead(url)` → `{ text: clean article text up to ~4000 words, word_count, title }`. This is the missing grounding primitive: it fetches the full source article so a writer can produce an accurate, original body rather than hallucinating.**
- `callHermesResearch(topic, depth)` → `{ summary, key_facts[], key_players[], recent_developments[], sources_visited[] }` (deeper, multi-source).
- `callHermesScrape`, `callHermesTrends`, `callHermesCompetitors`. All degrade gracefully (`isHermesConfigured()`).

### A.6 Images & storage
`ideogram.ts` `generateIdeogramImage(prompt)` / `generateNewsImage(...)` → URL; `storage.ts` `uploadSceneImage(...)` → public **https** URL (matches the contract's hero requirement).

### A.7 Quality tooling (`lib/ai/`)
`evaluator/`, `validators/`, `golden-checklist.ts`, `style-governance.ts` — reusable for an article QA gate.

**Conclusion of audit:** discovery, dedup, scoring, editorial selection, trusted-source curation, image generation, public hosting, and QA tooling **already exist and are reusable**. The *only* genuinely missing component is an **Article Writer** step that turns a selected news item (ideally + the full source text from `callHermesRead`) into a website-shaped article. Body grounding is solvable today.

---

## Part B — The three options

### Option A — Publish short-form briefs straight from `media_news_items`
Map `title` + `summary` + `key_insight` into a tiny post; little/no new generation.

### Option B — Generate full articles from `media_news_items`
New Article Writer agent. Input = selected news item + (when available) `callHermesRead(url)` full source text. Output = original `title`, meta `summary`, ~500–800-word markdown `body`, model-selected `category` (constrained to the 6 slugs), `tags`, optional hero-image prompt. Reuses **all** of News Hunter unchanged.

### Option C — Generate articles from approved `media_scripts`
Expand the approved spoken video script into an article.

---

## Part C — Evaluation

| Criterion | A — Briefs from news_items | B — Articles from news_items | C — Articles from scripts |
|---|---|---|---|
| **Implementation complexity** | Very low (mapping only, no new agent) | **Medium** (one new agent + taxonomy + optional Hermes read/image) | Medium agent **+ coupling** to the full video pipeline |
| **Content quality** | Low (2–3 sentences, thin) | **High** with source grounding; med-high without | Medium (spoken→prose is lossy; 2nd-hop from source) |
| **Scalability** | Very high (already produced) but thin scales thin | **High** (1 LLM call/article, parallelizable) | **Low–med** — capped at video throughput (~1–3/day) and gated on render+approval |
| **Editorial quality** | Low (headline written to *select*, not read; no structure) | **High** (own brand voice, lede/context/why-it-matters, attribution, fact guardrails) | Medium (inherits sensational hook style; needs de-hyping) |
| **Operational cost** | ~$0 | **Low** (~1 Sonnet call ≈ cents; +opt. Hermes/image) → ~$10–50 for 1000 | Similar LLM cost **plus** full video-pipeline cost upstream |
| **Launch speed** | Fastest (days) | **Medium (1–2 weeks)** to a solid agent | Slowest to a *steady stream* (depends on video pipeline health) |
| **SEO / originality risk** | **High** (thin/near-duplicate of source summary) | Low (original, grounded, attributed) | Low–med (original but derivative chain) |

**Key disqualifiers:**
- **A** puts thin, near-duplicate content on the first 1000 indexed pages — an SEO and brand liability for a site whose promise is substance ("no fluff" ≠ "no content"). Its only real edge is cost, which B nearly matches.
- **C** couples article volume to video throughput (you'd get ~1–3 articles/day, only after render + approval) and runs a source→script→article telephone game that degrades factual fidelity. It cannot supply 1000 articles in any reasonable window.

---

## Part D — Recommendation: Option B (grounded), with A as a fast-path and C as later reuse

**Primary architecture for the first 1000 articles: Option B — an Article Writer step grounded in the full source text.**

Smallest viable flow (reusing News Hunter end-to-end):

1. **Discover & select — unchanged.** `runNewsHunter()` produces ranked, deduped, trusted-source candidates. *One change:* add an article-selection lens (depth / evergreen / SEO potential) — either a parameter on `claudeEditorialPick()` or a sibling prompt — instead of "visual potential." Reuses all fetch/dedup/score machinery.
2. **Ground.** For each selected item, call `callHermesRead(url)` to pull the clean full source text. If Hermes is unconfigured/fails, fall back to `summary` + `key_insight` + `raw_output` (degraded but functional). This single primitive is what makes bodies accurate and original rather than hallucinated.
3. **Write.** New **Article Writer** agent (one Sonnet call) → returns JSON: original `title`, meta `summary` (≤ ~160 chars for SEO), `body` (markdown, ~500–800 words: lede → context → why it matters → what's next), `category` **chosen from the 6 allowed slugs** (model-selected, grounded in the body it just wrote; `news` fallback — cleaner and more accurate than a static `content_angle`→category map), 3–6 `tags`, and an optional `hero_image_prompt`. Hard guardrails: no fabrication, attribute the source, prefer the source's own facts.
4. **(Optional) Hero image.** Run `hero_image_prompt` → `generateIdeogramImage` → `uploadSceneImage` (public https). Deferrable — launch text-only, batch-add images later (contract `hero_image_url` is optional).
5. **QA gate.** Light pass via existing `lib/ai` validators / `golden-checklist` (factual consistency vs source, length, banned-claim check) before it becomes eligible to publish.
6. **Hand to publishing.** The output maps 1:1 to the v1 contract; `publishToThePrompt()` (per the Publishing plan) sends it. `external_id = omnira_<news_item_id>`.

**Why this is the right call for 1000 articles:** it reuses ~80% of the existing pipeline (everything except the writer), decouples article cadence from video production (most news items become articles without ever becoming videos — so volume isn't capped by renders), costs roughly $10–50 total in LLM/image spend, and yields original, attributed, structured posts that won't get buried as thin content.

**Role of A and C (not the core):**
- **A as a breaking-news fast-path.** For time-sensitive stories, publish a short brief immediately, then **PATCH it into a full article** once the writer runs — the contract's PATCH-on-update + immutable slug make this upgrade seamless (same `external_id`, same URL). This gets A's speed without A's permanence-of-thinness.
- **C as later cross-promotion.** Once a flagship video ships, optionally spin its approved script into a companion article (with a de-hyping rewrite). A "nice to have" for reusing top performers — never the primary funnel.

---

## Part E — Risks & decisions to confirm

- **Hermes dependency.** `callHermesRead` is the quality lever; if Hermes is often unavailable, body quality drops to summary-grounded. Decision: is Hermes reliably configured in prod, or do we need a fallback reader (e.g., a direct fetch + readability extraction)?
- **Hallucination.** Mitigated by source grounding + QA gate, but never zero. The brand promise ("factual, no hype") demands the QA step ship with v1, not later.
- **Category fit.** Model-selected from 6 slugs is cleaner than mapping `content_angle`, but the 6 may prove too coarse/fine after the first ~100 articles — revisit taxonomy then (not now).
- **Selection lens.** Confirm whether to fork the editorial-pick prompt for articles (depth/SEO) or keep the video lens for v1 and tune later.
- **Volume target.** 1000 articles at ~10–20/day (well within News Hunter's daily candidate volume) is ~2–3 months; confirm the target cadence so cost/scheduling can be sized.

**Recommended next step (still design):** spec the Article Writer agent — exact input contract (news item + Hermes read), output JSON schema (mapping to the v1 contract), prompt design, and the QA gate — before any code.
