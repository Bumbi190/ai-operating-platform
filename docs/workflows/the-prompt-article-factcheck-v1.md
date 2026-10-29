# The Prompt — fact-checked website articles (Workflow B) v1

Status: **implemented behind a flag that is OFF. Not scheduled. Migration proposed, not applied** — reviewed and
verified with separate connections on an isolated PostgreSQL 17 (see "Queue migration: review and PostgreSQL 17 test").
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
   is shown the **headline, lede and body** exactly as they will be published and lists every checkable claim. For each claim it gives the exact article sentence, an importance level,
   a verdict, and verbatim quotes.
3. **Deterministic validation** (`contract.ts`) trusts none of it:
   - each sentence must exist in the headline, the lede or the body (matched per field, never across a field
     boundary), or the whole review is refused (`review_sentence_not_in_article`);
   - a headline or lede claim is always **central**, even if the reviewer labels it supporting (`title_claim_is_central`);
   - each quote must exist verbatim in the cited snapshot;
   - `supported` without a verified quote becomes `unsupported`;
   - `contradicted` without a verified quote becomes `uncertain`.
   - **Coverage:** the reviewer chooses which claims to list, so omission is checked in code. The headline and
     **every** lede sentence must always be listed, with or without fact signals; a false headline over a correct
     body is therefore never `passed` (`title_not_verified` / `summary_not_verified`). Every body
     sentence with a fact signal (a number, amount or percentage, a quotation, a date or weekday, or an
     event verb such as announced, launched, raised, acquired, said, according to, costs or available)
     must be contained in a listed claim sentence. A listed *fragment* does not count. Any such sentence
     the reviewer omits is added as an `unsupported` **central** claim (`omitted_by_reviewer`), so the
     article cannot pass. It goes to revision, and if it is still omitted it is blocked.
     Honest limit: a factual sentence with none of these signals (for example "The company was bought
     by its rival.") is not caught by this rule and still relies on the reviewer and the owner.
4. **Verdict:**
   - `passed` requires every central claim to be `supported` and nothing contradicted or unsupported;
   - an `uncertain` *supporting* claim passes only if the sentence is visibly qualified ("reportedly", "has not confirmed" and similar);
   - central claims backed by only one publisher are reported, but not blocking, since independent corroboration is "where possible".
5. If the verdict is `needs_revision`, the flagged sentences are revised **once**: corrected from sources, qualified, or removed.
   The article is then re-checked. If it still does not pass, it is `blocked`.
6. The report (version 2) is stored in `website_content.meta.factcheck`, together with the sources, every claim
   (with the field it was found in), the verified and rejected quotes, the downgrades, `fieldSha256`
   (`title`, `summary`, `body`) and `contentSha256` over the exact triple that was checked.

**Publication gate** (`/api/content/articles/[id]/review`, approve): for rows with `meta.factcheck_required`,
it requires `qa.pass`, `factcheck.verdict === 'passed'`, report version 2, and that the **payload it is about to
publish** has exactly the reviewed `title`, `summary` and `body` (per-field hash and combined hash). Editing only
the headline or only the lede after a passed check is refused (`factcheck_title_mismatch` /
`factcheck_summary_mismatch`) until the new version has itself been fact-checked. A body-only version-1 report is
refused (`factcheck_unknown_version`). Otherwise it returns 409 before any write, and reject still works. The row is marked `published` only after
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
- **The final save is lease-fenced, atomically.** `website_article_job_save_content(job, token, row)` checks the lease
  (`token`, `state = 'running'`, `lease_expires_at > now()`) under the job row's lock and writes `website_content` in
  the same transaction. A worker whose lease expired or was taken over writes nothing (`lease_lost` →
  `LeaseLostError`, no finish); the next owner resumes from the checkpoint with zero model calls. A claim during an
  in-flight save skips the locked job instead of stealing it. Identity (`project_id`, `news_item_id`,
  `external_id`) and `status` come from the job row, never from the caller. Before this fix the save went straight to
  `website_content` with no lease check: reproduced on PostgreSQL 17 (a stale worker wrote 1 row after a takeover).
- Every checkpoint also renews the lease (heartbeat). A live worker therefore keeps its job; only a worker that stopped
  checkpointing for the whole lease (600 s, longer than the route's 300 s `maxDuration`) can be taken over, and its
  later writes are fenced out. Two workers can therefore not run paid steps for the same job at the same time,
  except in the one-step crash window above.

## Queue migration: review and PostgreSQL 17 test

The proposed SQL was reviewed before testing. Changes made in review:

| Finding | Risk | Change |
|---|---|---|
| `search_path = public` on SECURITY DEFINER functions | Differs from the repo convention (`''`, 464 uses); a shadowing object could be resolved first | `set search_path = ''`, every name schema-qualified |
| `p_daily_max = null` | `count >= null` is never true: the daily cap would be silently off | Rejected (`22023`); allowed range 0–24 |
| `p_lease_seconds = null` | `lease_expires_at` null never "expires": job stuck forever | Rejected; allowed 30–3600 |
| Unknown `p_outcome` | Fell through to `queued`: a typo would re-queue (and re-spend on) a job | Rejected |
| `external_id` only a caller convention | A wrong id could create a second identity for one news item | `CHECK (external_id = 'omnira_' \|\| news_item_id)` + checked in enqueue |
| Running state without a lease was representable | A running job with no lease can never be reclaimed | `CHECK ((state = 'running') = (lease_token and lease_expires_at not null))` |
| RLS policy called `auth.uid()` per row | Performance (Supabase advisor) | `(select auth.uid())` |
| `finish` delay unbounded | A bad caller could park a job for years | Clamped to 0–86 400 s |
| **Final `website_content` save not lease-fenced** (PR review, 29 Oct) | A worker whose lease was taken over could still write the article; **reproduced** | New `website_article_job_save_content`: lease proof + write in one transaction under the job row lock |

**Test environment.** `20261028150000_website_article_jobs.pg17-concurrency.sh` starts a throwaway container from the
locally present Supabase image `public.ecr.aws/supabase/postgres:17.11.0.004` with `--pull never` (no download) and
`--network none` (unreachable from anywhere), creates a fresh database per run, applies Supabase-equivalent roles,
default privileges and `auth.uid()`, then the migration, and removes the container on exit. No shared, local-dev or
production database is touched. Workers are **separate backend connections** (dblink) acting as `service_role`, as the
tick route does through PostgREST; the controller holds or releases their transactions so races are deterministic.

**Result on the migration as proposed: 77/77 checks pass** (`...pg17-concurrency.sql`; the real `website_content`
schema from `apps/web/supabase/migrations` is applied first):

- **SKIP LOCKED:** while worker 1 holds job A's row lock, worker 2's claim returns immediately with job B, and a third
  claim returns nothing; each job ends up running once with distinct lease tokens.
- **Concurrent claims:** 20 rounds × 8 workers released at the same instant × 5 jobs: every job claimed exactly once.
- **Daily cap under concurrency:** a second enqueue waits on the per-project lock (`wait_event_type = Lock`) and then
  returns `daily_cap`; exactly `cap` rows.
- **Duplicate triggers:** 8 simultaneous enqueues of one news item → 1 `enqueued`, 7 `exists`, one row.
- **Leases:** a live lease is not reclaimable; an expired one is reclaimed with a new token and attempt 2; the stale
  worker's checkpoint write (the exact `repo.ts` fence) changes 0 rows and its `finish` returns false.
- **Retries:** back-off is honoured, attempts 1→2→3, then `failed` with `finished_at`; never claimed again.
- **Cost gate:** six deferrals in a row consume no attempt.
- **Crashes:** a worker that died on its last attempt is failed, not re-run; a worker whose connection dropped is
  resumed by the next claim with its paid draft still in `checkpoint`.
- **Validation and constraints:** the six review findings above are enforced (`22023` / `23514`).
- **Privileges and RLS:** `anon` and `authenticated` cannot enqueue, claim, finish or update; an owner reads only their
  own project's jobs; `anon` cannot read.
- **No duplicate AI spend per news item:** of 8 simultaneous claimers of one job exactly one gets it; after it is saved,
  re-triggering returns `exists` and the job is never claimed again.
- **Social independence:** a social write (`media_scripts` insert) completes while article-job row and advisory locks
  are held; job operations leave `media_scripts` byte-identical; no foreign key, trigger or function reference from the
  job queue to any media/social/approvals table.
- **Fenced final save (T14–T16):** an expired lease, a taken-over lease and a finished job all get `lease_lost` and
  write **zero** rows; the current owner saves exactly one row (a retry updates the same row); a claim during an
  in-flight save neither takes the job nor waits; a published row is never overwritten; an operator's hero image is
  preserved; a wrong `payload.external_id` is rejected; `anon`/`authenticated` cannot call the function.

**The suite detects real faults.** The driver re-runs it against deliberately broken copies of the migration and
fails unless every copy is caught (final run: `VERDICT: PASS`):

| Broken copy | Caught by |
|---|---|
| claim uses `FOR UPDATE` without `SKIP LOCKED` | T1: the second worker waits on the first worker's row lock |
| claim without row locking | T1, T2 (8 workers all got the **same** job with 8 different tokens), T13 (8 workers would have run paid steps for one news item) |
| enqueue without the per-project advisory lock | T3: no lock wait, both `enqueued` past a cap of 1 |
| `finish` not fenced on the lease token | T5: the stale worker's `saved` lands, the real owner's is refused |
| a deferral consumes an attempt | T7: the job is unclaimable after 3 deferrals |
| a null daily cap is accepted | T10 |
| final save not fenced on the lease token | T14: the stale worker's save is accepted and writes a row |
| final save accepts an expired lease | T14: an expired-but-unreclaimed lease still writes |

The harness itself was debugged honestly: the first runs hung or errored because of test-side bugs (the controller's
own transaction held locks; plpgsql name clashes), not migration bugs. Controller writes now go through a separate
autocommit connection, every statement has a 90 s timeout, and a test block that aborts is reported as FAIL rather than
silently missing.

## Isolated end-to-end test (real code, real database, no spend)

`20261028150000_website_article_jobs.integration.sh` runs the **real** `repo.ts`, `store.ts` and `runArticleJob`
(`lib/qa/article-jobs-isolated-db.test.ts`) against PostgreSQL 17 + PostgREST in throwaway containers. Only the writer,
reviewer, reviser and Hermes reads are fakes. Isolation: local images only (`--pull never`), the database has no
published port and sits on an `--internal` network, PostgREST is published on `127.0.0.1` at a random port, random
password and JWT secret per run, everything removed on exit. The test refuses any non-loopback URL and points the
Supabase env of its own process at the throwaway stack. The repo's real `website_content` migrations are applied.

| Test | Before the fix | After |
|---|---|---|
| I1 enqueue → claim → run → save → finish; stored row passes the publication gate | pass | pass |
| I2 lease taken over right before the final save | **fail: stale worker `saved`, 1 row written** | pass: `lease_lost`, 0 rows; new owner saves once with 0 model calls |
| I3 lease expired (not reclaimed) at save | **fail: written** | pass: 0 rows; next claim resumes and saves with 0 model calls |
| I4 two ticks at once on one job | pass | pass: exactly one claims it |
| I5 existing published article | pass | pass: never overwritten |

Removing `leaseFence` from `repo.ts` (falling back to the unfenced write) makes I2 and I3 fail again (byte-verified restore).

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
| Fact-check (full coverage) | ~13 000 | ~4 500 | 0.107 |
| Revision (only if needed) | ~13 000 | ~1 800 | 0.066 |
| Re-check (only if needed) | ~13 000 | ~4 500 | 0.107 |

- **Typical article: ≈ $0.15. Worst case with revision: ≈ $0.33.**
- At the default 2 articles a day: **≈ $9–20 per month (≈ 95–210 SEK)**.
- Checking the headline and lede adds roughly 100 input and 200 output tokens per check (< $0.005). The larger
  effect is indirect: a headline the sources do not support now triggers the one revision (≈ +$0.17).
- The fact-check `max_tokens` is 9 000, so the reviewer can list every checkable sentence.
- Retries add at most one repeated step per crash.
- Hermes `/read`: 1–3 reads per article on the existing service. No new integration; there is extra load, but its hosting cost is not metered here.
- The governed boundary *reserves* a context-window ceiling per call before dispatch. That uses temporary budget headroom, but not real spend. If the daily budget is tight, jobs defer instead of failing.

No new external AI service, paid API, search API or webhook is introduced.

## Security

- Tick route: `Bearer CRON_SECRET`. With the flag off it returns `disabled` before creating a DB client.
- Project isolation: the job reads only `media_news_items` of its own `project_id`. The review route keeps its existing
  ownership check, and foreign rows still return 404.
- The job table has RLS enabled and owner-read only. The SECURITY DEFINER functions (`search_path = ''`) are executable
  only by `service_role` (verified on PostgreSQL 17 with Supabase-equivalent default privileges, and on PGlite).
- Source URLs are https-only, have no credentials, and exclude private/loopback/link-local hosts and raw IPs; they are
  classified by their final URL. This is a pre-filter, not SSRF protection: the fetch happens inside Hermes, which owns egress.
- Source text is passed to the model as data inside `<source>` tags. Prompt injection inside a source can at worst
  influence verdicts, and every verdict still needs a verbatim quote plus owner approval.

## Verification done

- 120 vitest cases across 7 files: contract, sources, runner, tick route, review gate, store, error class.
  This includes headline/lede cases: a false headline or lede over a verified body never passes (omitted,
  fabricated quote, contradicted, fragment-only, "supporting"), and a headline-only or lede-only edit after a
  passed check (including one added word) is refused by the route with no `publishArticle` call. An end-to-end
  runner test gates the exact payload `toPublishPayload` builds from the saved draft.
  This includes the owner's scenario: a new central claim is added to the test article and the AI reviewer
  leaves it out of its list. The result is never `passed`. It is blocked after the revision round if still
  omitted, and the publication gate refuses it.
- Targeted mutants were killed by named assertions with byte-verified restores:
  - review gate disabled;
  - evidence verification skipped;
  - draft rewritten on resume;
  - body hash ignored;
  - loose flag parsing;
  - unbounded revisions;
  - coverage check disabled;
  - a fragment counted as coverage;
  - an omitted claim treated as supporting;
  - headline/lede excluded from coverage, or required only with fact signals;
  - a headline claim allowed to stay "supporting";
  - the gate ignoring the title hash, the summary hash or the content hash, or accepting v1 reports;
  - claims located across a field boundary;
  - the runner checking a different lede than it saves, or not showing the reviewer the lede;
  - the gate normalising the headline before hashing (survived at first; killed after adding the
    one-added-word route test).
- The proposed SQL was run on PGlite (`20261028150000_website_article_jobs.verify.mjs`, 9/9, single connection) and
  on an isolated PostgreSQL 17 with separate connections (77/77, 8 broken copies caught), plus the isolated end-to-end
  test of the real TypeScript against PostgreSQL 17 + PostgREST (5/5).

## Activation (each step needs the owner's explicit approval)

### Preview is not isolated

Preview writes to the **production** database. Evidence (29 Oct):
- Every Vercel build, Preview included, runs `apps/web/scripts/check-migrations.mjs`, which uses that build's
  `NEXT_PUBLIC_SUPABASE_URL` + service key to read `omnira_applied_migrations` and fails closed unless it matches the
  repo. Preview builds of this PR are READY, so Preview's database carries the full production ledger; the only
  Supabase branch (`h1p5-staging`) is stale (MIGRATIONS_FAILED).
- The PR review (29 Oct) read Vercel env metadata, without values: the Supabase URL, anon key and service-role key are
  single records targeted at both `production` and `preview`.
- Our own attempt to list the env metadata was refused (Vercel API 403 for this connection; no Vercel CLI installed),
  so that point is the reviewer's observation, not re-verified here.

So a "Preview test" would apply the migration to production and write production rows. **Do not use Preview for the
first article test.**

### Safe first article test (isolated database)

Use the isolated stack above, which is already proven with fakes. The remaining step is ONE real article, needing a
separate owner approval because it spends money:

1. Run `...integration.sh` unchanged (no spend) to confirm the stack.
2. With approval: the same stack, but the real writer and reviewer for **one** news item whose source text is
   supplied as a fixture (or read once through Hermes, if its credentials may be used locally). Budget ≈ $0.15,
   at most ≈ $0.33; `DAILY_MAX=1`, `MAX_ATTEMPTS=1`. Uses the existing Anthropic key through the governed boundary,
   so no new service. Nothing can publish: the stack has no website destination.
3. Review the resulting `website_content` row and FactCheck Report (exported from the throwaway database) before
   anything touches production.

Only after that, as separate approvals: apply the migration to production in a quiet window, then a production (not
Preview) flag with `DAILY_MAX=1` and one manual tick, then a schedule. An alternative to step 2 is a dedicated Supabase
project or branch for staging, which is a new paid resource and needs its own approval.

Later, separately approved: production flag and a tick schedule (for example every 15 minutes via pg_cron in GMT).

## Known residual risks

- A job that keeps being deferred by the cost gate is re-queued every 60 minutes without consuming attempts. Each
  deferral is refused before dispatch (no spend), but the job never ends on its own; cancel it by hand if needed.
- A failed or blocked article is never re-enqueued automatically (re-trigger returns `exists`). Retrying one needs a
  deliberate manual action.
- The PostgreSQL 17 and end-to-end tests use the Supabase image and Supabase-equivalent privileges, not the
  production database itself; production-specific objects (other policies, triggers, extensions) were not part of it.
- Other writers of `website_content` (the legacy approvals pipeline and the default `upsert` generate routes) do not
  go through the lease-fenced function. They are not article jobs and are unchanged.

- Other published payload fields are **not** fact-checked: `category`, `tags`, `source` (name/url) and the hero
  image. `source` comes from the news item, not from the model. Category and tags are labels, not claims.
- Because every headline must be supported by a verbatim quote, a purely editorial headline ("What Acme's move
  means for developers") will usually go to revision, and is blocked if the revision keeps it. This is a deliberate
  fail-closed choice; watch the blocked rate in the first Preview articles.

- The legacy `approvals`-based pipeline (`lib/article/pipeline.ts`, `ARTICLE_AUTOPUBLISH=high`) uses the same
  `external_id` scheme. If it were run for the same news item, it could publish its own version. It is untouched here.
  Keep `ARTICLE_AUTOPUBLISH` unset.
- The default (`upsert`) save used by the existing generate routes can still overwrite a published row's
  `website_content` record. This is pre-existing behaviour and is not changed here.
- Corroboration depends on the News Hunter having stored other coverage of the same story. Without it, articles pass
  on the originating report plus any primary source, and the report shows `central_claims_single_publisher`.
