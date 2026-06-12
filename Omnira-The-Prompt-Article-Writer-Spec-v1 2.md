# The Prompt — Article Writer Specification (v1, design only)

**Status:** Design review. No code, no migrations, no implementation. Resolves Risk R1 by defining the component that produces the website `body`. Companion to the Article Model Design Review (Option B), the Publishing Implementation Plan, and `omnira-publish-contract-v1.md`.

**Mandate:** produce publication-ready, factually accurate, properly attributed, **original** AI-news articles (not summaries, not rewrites) that map 1:1 to The Prompt's schema and scale to 1000+ articles at low cost.

**Position in the pipeline:** `News Hunter (discover/score/select) → [Ground via Hermes read] → ARTICLE WRITER → QA gate → publishToThePrompt()`. The Writer reuses everything upstream; only it and the QA gate are new.

---

## 1. Input contract

The Writer is a pure function: `(ArticleWriterInput) → ArticleWriterOutput`. It never fetches; callers assemble inputs (keeps it testable and cheap to retry).

### 1.1 `media_news_item` (required)
`id` (→ `external_id` seed), `title`, `summary`, `key_insight`, `url` (→ `source_url`), `source_name`, `content_angle`, `target_audience`, `virality_score`, `raw_output` (full Hunter JSON, for extra context). The editorial selection (`editorialNote`, `suggestedAngle`) from `claudeEditorialPick` may ride along as a hint.

### 1.2 Hermes read output (optional but strongly preferred — the quality lever)
From `callHermesRead(url)`: `{ title, text (clean source body ≤ ~4000 words), word_count }`. **This is the grounding corpus** — the Writer draws facts from `text`, not from its own training. Two modes:
- **Grounded mode** (Hermes present): write from `text`. Default and recommended.
- **Degraded mode** (Hermes absent/failed/short): write from `summary` + `key_insight` + `raw_output` only, and the output is flagged `grounding: "weak"` → forces a stricter QA threshold and caps length at "standard" (no deep analysis from thin inputs).

### 1.3 Optional image / context inputs
- `trendingTopics[]` (from `callHermesTrends`) — lets the Writer note why a story matters *now* and shape tags.
- `relatedSources[]` (future multi-source, §9) — additional `callHermesReadMany` texts. v1: single source only.
- `brandContext` — voice/taxonomy constants (the 6 category slugs, banned-claims list, style rules) injected at build time, not per call.
- No image is *input*; the Writer *emits* a `hero_image_prompt` (§2) that a later step renders.

### 1.4 Input guards (before spending a token)
Reject early (no LLM call) if: `source_url` not in `TRUSTED_DOMAINS`; grounded `text` < ~150 words AND `summary` empty (nothing to write from); item already published (dedupe by `external_id`). These keep cost and hallucination risk down.

---

## 2. Output contract

Single JSON object (constrained generation), mapping directly to the publish contract:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Original, ≤ ~75 chars; not a copy of the source headline; no clickbait. |
| `summary` | string | Meta/dek, ≤ ~160 chars (SEO description + card text). |
| `body` | string (markdown) | Original article (§3, §4). H2/H3, short paragraphs, no fabricated quotes. |
| `category` | enum | **One of the 6 slugs** (`news, models, tools, research, business, policy`); model-selected, grounded in the body; fallback `news`. |
| `tags` | string[] | 3–6, lowercase slugs, deduped; open vocabulary. |
| `hero_image_prompt` | string \| null | Text-to-image prompt for the hero; null if none. Not a URL. |
| `source_name` | string | Pass-through/normalized from the news item (attribution). |
| `source_url` | string | Pass-through (canonical original). |
| `_meta` | object | Non-published: `{ grounding: "strong"|"weak", model, tokens_in, tokens_out, est_cost, self_rated_confidence }` for QA/observability. |

`hero_image_url` is **not** produced here — a separate optional step renders `hero_image_prompt` → `generateIdeogramImage` → `uploadSceneImage` (public https) and attaches the URL before publish.

**Attribution is mandatory and structured:** every article carries `source_name` + `source_url`; the body must reference the source in prose at least once (e.g., "According to {source_name}…"). Original analysis is the Writer's; reported facts are the source's.

---

## 3. Recommended article structure

A consistent six-beat skeleton (the Writer adapts depth to length tier, §4):

1. **Headline** — concrete, specific, no hype. Actor + action + stake, but written for *reading* not for a 2-second scroll-stop.
2. **Lede** (1–2 sentences) — the single most important fact; what happened, who, when.
3. **Context** (1–2 short paras) — background a smart non-expert needs; prior state of play; attribute source facts here.
4. **Analysis** (1–2 paras) — *the original value*: what's actually new, why it's non-obvious, how it compares to alternatives. This is what makes it an article, not a summary.
5. **Implications** (1 para) — who is affected (builders, businesses, researchers, public) and how.
6. **What's next** (1–2 sentences) — open questions, expected follow-ups, what to watch. No prediction stated as fact.

The body must read as a coherent piece, not labeled sections — the beats are an internal scaffold, not visible headers (though longer pieces may use H2s for Context/Analysis).

---

## 4. Target article length

| Tier | Trigger | Body length | Structure used |
|---|---|---|---|
| **Breaking** | High virality + time-sensitive; or degraded grounding | ~150–300 words | Headline + lede + 1 context para + 1 implication line. Upgradable later via PATCH (same `external_id`/slug). |
| **Standard news** (default) | Normal selected item, grounded | ~450–750 words | All six beats, concise. |
| **Deep analysis** | High-value story + strong grounding (rich `text`, multiple facts) | ~900–1,300 words | All six beats expanded; H2 sections; may pull more from source. |

Tier is decided by the caller (from virality/grounding/angle) and passed in, so length is deterministic and cost is predictable. The Writer never pads to hit a count — "no fluff" is a hard rule; it writes to the floor of the tier if the story is thin.

---

## 5. Prompt design

### 5.1 System prompt (shape, not final copy)
> *You are the senior staff writer for "The Prompt," a premium AI-news publication. Bloomberg/Reuters discipline with the readability of The Verge. You write original, accurate, attributed articles for a smart general audience. You are given source material; you report its facts faithfully and add original framing and analysis. You never fabricate.*

The system prompt carries: brand voice, the six-beat structure, the length tier rules, the 6-slug taxonomy with one-line definitions, the banned-claims/hype list, and the output JSON schema.

### 5.2 Writing rules
Lead with the fact, not a windup. Short sentences, active voice. Define jargon on first use. One idea per paragraph. No listicles, no SEO keyword stuffing, no "in conclusion." Markdown only (H2/H3, bold sparingly, links to the source). Original phrasing — **never reproduce more than ~15 consecutive words from the source** (paraphrase + attribute; quote only short, clearly-marked excerpts).

### 5.3 Factuality guardrails
Use only facts present in the grounding `text` (or `summary`/`key_insight` in degraded mode). Numbers, dates, names, and quotes must be traceable to the source. If a needed fact is absent, **omit it** rather than infer. Distinguish reported fact ("{source} reports…") from the Writer's analysis ("This suggests…"). Mark uncertainty explicitly ("It is unclear whether…").

### 5.4 Anti-hallucination rules
No invented quotes, statistics, dates, product names, version numbers, funding amounts, or people. No claims about events after the source's date. No fabricated links — the only URL is `source_url`. If grounding is too thin to write a tier, the Writer must downgrade the tier (or emit `confidence: low` for the QA gate to reject) rather than fill gaps from training memory. A self-check instruction asks the model to list, internally, each non-trivial claim and confirm it traces to the source before finalizing; claims that don't trace are cut.

### 5.5 Attribution rules
`source_name` + `source_url` always preserved. At least one in-prose attribution. Original reporting from third parties is credited to them, not to The Prompt. The Prompt's voice owns only analysis/framing. No implication that The Prompt independently verified facts it only read from the source.

---

## 6. QA layer

A layered gate — cheap deterministic checks first, LLM scoring only if needed. Reuses existing `lib/ai` tooling.

### 6.1 Automated structural checks (free, deterministic)
Reuse `validators/output-validator.ts`: valid JSON, all required fields present and typed, `category` ∈ 6 slugs, `tags` 3–6 valid slugs, `title`/`summary` within length, `source_url` present and == input (not mutated), body within the tier's word band, markdown parses, body contains ≥1 attribution phrase.

### 6.2 Originality & slop (free, deterministic)
Reuse `evaluator/slop-detector.ts` (`detectSlop` → `slopToQualityScore`): reject AI-slop patterns (filler phrases, "in today's fast-paced world," hedge stacks). Add a **copy-overlap check**: longest common substring / n-gram overlap between `body` and source `text`; reject if it exceeds the paraphrase threshold (guards originality + copyright).

### 6.3 Evaluator scoring (LLM, cheap — Haiku)
Reuse `evaluator/content-evaluator.ts` `evaluate(...)` to score on: factual-consistency-with-source, attribution present, voice/brand fit, clarity, no-hype. Returns a 0–100 with issues. Run only on items that pass 6.1–6.2.

### 6.4 Confidence scoring
Composite per article: `confidence = f(grounding strength, structural pass, slop score, copy-overlap, evaluator score, model self-rating)`. Bucketed: **high** (auto-eligible to publish), **medium** (eligible but flagged for optional human spot-check), **low** (rejected).

### 6.5 Rejection criteria (any → reject, do not publish)
Invalid/incomplete JSON; category not in set; factual-consistency below threshold; copy-overlap above threshold; missing attribution; slop score above threshold; degraded grounding + below the stricter threshold; fabricated-URL detected; confidence = low. Rejected items are logged with reasons (reuse `run-log`/`alert`) and either auto-retried once (transient/format) or queued for human review (substantive).

### 6.6 Human-in-the-loop hook
QA feeds the **generic `approvals`** primitive (per the Publishing plan, Risk R6): high-confidence may auto-approve (configurable), medium/low route to a human. This is where editorial control lives without coupling to the Familje marketing system.

---

## 7. Cost analysis

Token assumptions per article: input ≈ 7k (system ~1k + news item ~0.3k + Hermes `text` ~5.3k for ~4k words + tier/schema ~0.4k); output ≈ 1.5k (≈ 750-word body + JSON). Prices per 1M (confirmed from `lib/ai/pricing.ts`): Sonnet 4.6 $3 in / $15 out; Haiku 4.5 $0.80 / $4.

| Component | Model | Per article |
|---|---|---|
| Writer (recommended) | Sonnet 4.6 | (7k×$3 + 1.5k×$15)/1M ≈ **$0.044** |
| Writer (budget variant) | Haiku 4.5 | ≈ **$0.012** |
| QA structural + slop + overlap | none (deterministic) | $0.000 |
| QA evaluator (optional) | Haiku 4.5 | ≈ **$0.005** |
| Hero image (optional) | Ideogram / gpt-image-1 | ≈ **$0.04–0.08** |
| Hermes read | external service | marginal (self-hosted) |

**Per article:** text-only ≈ **$0.05** (Sonnet writer + Haiku QA); with hero image ≈ **$0.10–0.13**. Budget (Haiku writer, no image) ≈ **$0.017**.

| Volume | Text-only (Sonnet) | With hero images |
|---|---|---|
| 100 | ≈ **$5** | ≈ **$10–13** |
| 1000 | ≈ **$49** | ≈ **$90–130** |

Cost is a non-issue at this scale — quality and accuracy dominate. **Recommendation: Sonnet 4.6 for the Writer** (the body is the product; the brand promise is accuracy and no-slop), Haiku for QA, hero images batched/optional. Even 1000 articles with images is ~$100.

---

## 8. Publishing readiness — exact conditions to call `publish_article()`

An article may be sent **only if all hold**:

1. **Schema-complete:** valid JSON; `title`, `summary`, `body`, `category`∈6, `tags` 3–6, `source_name`, `source_url` all present and typed (6.1 pass).
2. **Attributed:** `source_url` == the input source; ≥1 in-prose attribution; `source_name` set.
3. **Original:** copy-overlap below threshold (6.2); slop score below threshold.
4. **Factual:** evaluator factual-consistency ≥ threshold (stricter if grounding weak) (6.3).
5. **Confidence:** bucket = high (auto), or medium **and** human-approved via `approvals` (6.4/6.6). Low = never.
6. **Category exists:** `category` is one of the seeded slugs (the contract rejects unknowns with `category_not_found`).
7. **Hero (if present):** `hero_image_url` is a public `https://` URL (contract requirement); if image step skipped, field omitted (allowed).
8. **Idempotency set:** `external_id = omnira_<news_item_id>` assigned; mapping recorded so retries PATCH, not duplicate.
9. **Lifecycle decided:** caller sets `published_at` (null=draft, future=scheduled, now/past=published) — the Writer/QA never auto-publishes; publishing is an explicit, gated step.

Only then does the payload go to `publishToThePrompt()` → `publish_article(payload)`.

---

## 9. Future evolution (post-v1, non-blocking)

- **Multi-source articles:** swap single `callHermesRead` for `callHermesReadMany` + `callHermesResearch` (already exists: `key_facts[]`, `key_players[]`, `recent_developments[]`). Writer synthesizes across sources with per-fact attribution. Same output contract; richer grounding; higher tier ceiling.
- **Opinion / editorial pieces:** a distinct prompt + a clearly-labeled `opinion` treatment (and likely a `category`/flag), explicitly separating analysis from reporting — must stay visually and editorially distinct from news. Higher human-review bar.
- **Long-form research:** deep-dives from `callHermesResearch(topic, "deep")` spanning many sources; 2,000+ words; Opus-tier writer justified by lower volume; mandatory human review.
- **Newsletter generation:** a *consumer*, not a producer — compose the daily/weekly newsletter from already-published articles (titles + summaries + links) rather than re-generating. Natural fit with the existing newsletter signup; near-zero marginal LLM cost (Haiku assembly).
- **Feedback loop:** pipe `approvals` edits/rejections back into memory (the platform already does this via `saveFeedback`) so the Writer prompt improves from human edits over time.

---

## 10. CTO recommendation for v1

Ship the **smallest grounded Writer**: single-source, Sonnet 4.6, grounded by `callHermesRead`, emitting the §2 contract; QA = deterministic checks + slop/overlap + a Haiku factual-consistency score + confidence bucketing into the generic `approvals` gate; hero images optional/batched; three length tiers with breaking-news upgradable via PATCH. Reuse News Hunter, Hermes, ideogram/storage, and the `lib/ai` evaluators wholesale — the only net-new artifacts are one prompt, one orchestration step, and the QA composite.

This hits all five mandates (publication-ready, accurate, attributed, original, scalable), costs ~$50 per 1000 text articles, and is decoupled from the video pipeline so volume isn't capped.

**Decisions to confirm before the build spec:** (a) Hermes prod reliability + whether a fallback reader is needed for degraded mode; (b) auto-publish high-confidence vs. always-human-gate for the first N articles; (c) launch text-only or with hero images from day one; (d) Sonnet vs. Haiku writer (recommend Sonnet). With these locked, the next artifact is the build-level spec (exact prompt copy, JSON schema, thresholds) — still no code until you say go.
