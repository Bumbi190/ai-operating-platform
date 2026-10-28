# The Prompt — fact-checked website articles (Workflow B) v1

Status: **implemented behind a flag that is OFF. Not scheduled. Migration proposed, not applied.**
Date: 28 October 2026. Work ID `THEPROMPT-ARTICLE-FACTCHECK-20261028`.

## What it does

When the social pipeline selects a news item (a `media_scripts` row with `news_item_id` and status
`approved | ready | publishing | published`), a separate, durable job writes a longer English article
(deep tier, 900–1 300 words when the sources support it) about the same `news_item_id`. The job then
fact-checks it and saves it to `website_content` as `pending_review` for the owner to review in Omnira.

```
Workflow A (unchanged)  step1 → script → voice/images/video → publish 10:00 / 20:00 Europe/Stockholm
                              │
                              └─ read-only scan ─┐
Workflow B (new)                                  ▼
  /api/content/articles/jobs/tick  enqueue (1 per news item, 24h cap) → claim (SKIP LOCKED + lease)
    → sources (Hermes /read: originating report + ≤2 independent stored reports)   free
    → draft  (existing writeArticle, deep tier)                                    paid ×1
    → article QA (existing reviewArticle)                                          free
    → fact-check (claim extraction + verdicts, quotes verified in code)            paid ×1
    → [one revision of flagged sentences → re-check]                               paid ×2, optional
    → website_content pending_review  (meta.factcheck_required = true)
  Owner: /atlas/content/[id] → FactCheck Report → Approve → /review → publication gate
    → existing publishArticle (System A) → website confirms → status published + destination_url
```

Workflow B never writes to `media_scripts`, `media_news_items`, social tables or `approvals`, and
Workflow A does not call or wait for Workflow B. Each can fail on its own.

## Fact-check gate (separate from article QA)

Article QA (`lib/article/qa.ts`) checks structure, attribution, slop and copy overlap. It does not verify
facts and is never treated as a fact-check. The fact-check (`lib/article/factcheck/`) works like this:

1. **Sources** are fetched independently of the writer: the originating report and up to two stored
   reports of the same story from *other publisher groups*. They are matched by headline similarity
   among the News Hunter's own `media_news_items`. Hosts from an explicit table are labelled `primary`
   (vendor blogs, arXiv, government sites). Ownership groups (for example Wired and Ars Technica) count
   as one publisher. Only public https URLs are used, the URL is classified after redirects, and too-short
   pages are skipped.
2. The **reviewer model** (the same Anthropic Sonnet family as the writer, via the governed `getAnthropic`)
   lists every checkable claim. For each claim it gives the exact article sentence, an importance level,
   a verdict, and verbatim quotes.
3. **Deterministic validation** (`contract.ts`) trusts none of it:
   - each sentence must exist in the body, or the whole review is refused;
   - each quote must exist verbatim in the cited snapshot;
   - `supported` without a verified quote becomes `unsupported`;
   - `contradicted` without a verified quote becomes `uncertain`.
4. **Verdict:**
   - `passed` requires every central claim to be `supported` and nothing contradicted or unsupported;
   - an `uncertain` *supporting* claim passes only if the sentence is visibly qualified ("reportedly", "has not confirmed" and similar);
   - central claims backed by only one publisher are reported, but not blocking, since independent corroboration is "where possible".
5. If the verdict is `needs_revision`, the flagged sentences are revised **once**: corrected from sources, qualified, or removed.
   The article is then re-checked. If it still does not pass, it is `blocked`.
6. The report is stored in `website_content.meta.factcheck`, together with the sources, every claim, the
   verified and rejected quotes, the downgrades and the `bodySha256` of the exact text that was checked.

**Publication gate** (`/api/content/articles/[id]/review`, approve): for rows with `meta.factcheck_required`,
it requires `qa.pass`, `factcheck.verdict === 'passed'` and `sha256(payload.body) === factcheck.bodySha256`.
Otherwise it returns 409 before any write, and reject still works. The row is marked `published` only after
`publishArticle` returns the website's confirmation, and `destination_url` comes from that response.
Rows from the existing generate paths are unchanged.

Honest limits: the gate proves that the cited text exists in the cited source and records how the model read
it. It does not prove the model understood the quote correctly. That is the owner's review. Quote verification
is exact-substring after normalisation, so a paraphrased quote is rejected (fail-closed).

## Idempotency, resume and concurrency

- Identity: `external_id = omnira_<news_item_id>` (the existing contract). The job table is unique on it and on
  `(project_id, news_item_id)`, so duplicate triggers and overlapping cron runs create at most one job and one article.
- Claim: `FOR UPDATE SKIP LOCKED` plus a fresh `lease_token`. Every checkpoint and the finish call match on the token,
  so a worker whose lease expired cannot write.
- Resume: each step writes its result to `checkpoint` before the next starts. A restarted job skips completed reads and
  paid calls (tested by call counts). The remaining window: a crash *between* a provider response and its checkpoint
  repeats that one call.
- Cost gate / stop (`SpendRefusedError`, `ExecutionStoppedError`, not-dispatched): `deferred`. The job is re-queued after
  60 minutes and the attempt is not counted. There is no fallback provider. An in-flight abort that may already have been
  billed (`GovernanceDispatchUnknownError`) is `failed` and is not auto-retried.
- AI or network errors: retry with back-off, up to `max_attempts` (default 3), then `failed`.
- Saving uses `writeMode: 'reviewable_only'`: an existing `published/approved/rejected/scheduled/failed` row is never
  overwritten. The UPDATE carries `status = 'pending_review'`, so an approval racing the write wins.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `THEPROMPT_ARTICLE_JOBS_ENABLED` | unset → off | Only the exact string `true` enables it. |
| `THEPROMPT_ARTICLE_JOBS_SINCE` | unset → nothing enqueued | ISO timestamp. Only social selections after it are enqueued, so there is no archive backfill. |
| `THEPROMPT_ARTICLE_JOBS_DAILY_MAX` | 2 (0–6) | New jobs per rolling 24 h, enforced in SQL under an advisory lock. |
| `THEPROMPT_ARTICLE_JOBS_MAX_ATTEMPTS` | 3 (1–5) | Attempts before `failed`. |

## Estimated additional cost

Anthropic `claude-sonnet-4-6` at $3 / $15 per million input/output tokens (`lib/ai/pricing.ts`):

| Step | Input tokens | Output tokens | ≈ USD |
|---|---|---|---|
| Draft (deep) | ~5 500 | ~1 800 | 0.045 |
| Fact-check | ~13 000 | ~3 000 | 0.085 |
| Revision (only if needed) | ~13 000 | ~1 800 | 0.066 |
| Re-check (only if needed) | ~13 000 | ~3 000 | 0.085 |

- **Typical article: ≈ $0.13. Worst case with revision: ≈ $0.28.**
- At the default 2 articles a day: **≈ $8–17 per month (≈ 85–180 SEK)**.
- Retries add at most one repeated step per crash.
- Hermes `/read`: 1–3 reads per article on the existing service. No new integration; there is extra load, but its hosting cost is not metered here.
- The governed boundary *reserves* a context-window ceiling per call before dispatch. That uses temporary budget headroom, but not real spend. If the daily budget is tight, jobs defer instead of failing.

No new external AI service, paid API, search API or webhook is introduced.

## Security

- Tick route: `Bearer CRON_SECRET`. With the flag off it returns `disabled` before creating a DB client.
- Project isolation: the job reads only `media_news_items` of its own `project_id`. The review route keeps its existing
  ownership check, and foreign rows still return 404.
- The job table has RLS enabled and owner-read only. The SECURITY DEFINER functions are executable only by `service_role`
  (verified on PGlite: anon/authenticated get "permission denied").
- Source URLs are https-only, have no credentials, and exclude private/loopback/link-local hosts and raw IPs; they are
  classified by their final URL. This is a pre-filter, not SSRF protection: the fetch happens inside Hermes, which owns egress.
- Source text is passed to the model as data inside `<source>` tags. Prompt injection inside a source can at worst
  influence verdicts, and every verdict still needs a verbatim quote plus owner approval.

## Verification done

- 87 vitest cases across 7 files: contract, sources, runner, tick route, review gate, store, error class.
- Targeted mutants were killed by named assertions with byte-verified restores: review gate disabled,
  evidence verification skipped, draft rewritten on resume, body hash ignored, loose flag parsing, unbounded revisions.
- The proposed SQL was run on PGlite (`20261028150000_website_article_jobs.verify.mjs`, 9/9): duplicate enqueue,
  daily cap, exclusive claim, stale-token fencing, deferred not counting, expired-lease reclaim, max-attempts → failed,
  and the grants. It runs on a single connection, so real SKIP LOCKED contention was **not** exercised. Recommended next:
  a two-connection test on PostgreSQL 17 before applying.

## Activation (each step needs the owner's explicit approval)

1. Review and apply `docs/workflows/proposed-migrations/20261028150000_website_article_jobs.sql`. Move it into
   `apps/web/supabase/migrations/` per the migration guard and regenerate `database.types`.
2. Set `THEPROMPT_ARTICLE_JOBS_SINCE` to the activation time and `THEPROMPT_ARTICLE_JOBS_ENABLED=true` (Preview first).
3. Schedule the tick: for example every 15 minutes via pg_cron (GMT) or `vercel.json`. Schedules are not changed in this PR.
4. Watch the first articles in `/atlas/content`. Only an explicit Approve publishes.

## Known residual risks

- The legacy `approvals`-based pipeline (`lib/article/pipeline.ts`, `ARTICLE_AUTOPUBLISH=high`) uses the same
  `external_id` scheme. If it were run for the same news item, it could publish its own version. It is untouched here.
  Keep `ARTICLE_AUTOPUBLISH` unset.
- The default (`upsert`) save used by the existing generate routes can still overwrite a published row's
  `website_content` record. This is pre-existing behaviour and is not changed here.
- Corroboration depends on the News Hunter having stored other coverage of the same story. Without it, articles pass
  on the originating report plus any primary source, and the report shows `central_claims_single_publisher`.
