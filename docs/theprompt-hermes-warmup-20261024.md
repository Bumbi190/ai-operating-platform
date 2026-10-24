# The Prompt: bounded Hermes warmup (2026-10-24)

## Read-only production evidence

Inspected on 24 October 2026 from 17:33 Europe/Stockholm. Production Vercel main is db9d09a498e27cf1c7597b32b197d45febbd664f (READY, Higgsfield PR #541). The ordinary Hultgren checkout has unrelated changes and was not edited. This correction uses its own worktree/branch based on that exact production commit.

Vercel runtime errors report "Task timed out after 10 seconds" on /api/media/cron/warmup, last observed 2026-10-24 07:10 UTC. Production source sets maxDuration=10 and awaits a fetch to Hermes /health with no cancellation signal. A slow or suspended service can consume the entire function lifetime; this is a real deadline mismatch. Source comments describe a roughly 50-second Render cold start; that latency was not remeasured or guaranteed in this investigation. No manual warmup, /trends, /read, /scrape, cron, retry or publication endpoint was called.

The latest normal Step1 on 24 October also logged the 7-second /trends timeout and later /read timeout. Existing draft PR #529 removes the unused Step1 trends call without changing its single News Hunter input. This warmup PR is independent of #529; neither PR alone proves the Hermes worker's browsing paths healthy. The separate source-provenanced trends design is tracked in #527. Optional article-read cancellation remains separate work.

## Narrow correction

Allow warmup a 60-second function budget and a single /health request with a 55-second abort deadline. Leave five seconds for the handler to report its existing warm/cold result. Health checks have a finite five-second default for other callers; warmup explicitly uses the larger cold-start allowance. Fetch health freshly with no-store, no retries and no provider authentication forwarded. An unavailable endpoint remains cold; unauthorized requests remain 401 and unconfigured Hermes remains skipped.

No scheduling, database, image/video generation, source selection, recovery flag or publication changes. No production deploy or merge is authorized by this PR. It does not assert that waking Hermes ten minutes before Step1 guarantees subsequent browser readiness.

## Safe verification and rollout

Synthetic tests exercise authorization, unset configuration, a 50-second health response, a hung transport aborted before the function limit, HTTP failures and safe network errors. A real loopback HTTP server verifies native fetch cancellation without calling an external service. Record final test, typecheck, build, independent review and CI evidence in the PR.

After normal review and a separately approved release, inspect the next ordinary scheduled warmup and Step1 logs. Do not replay cron, missed slots or paid jobs to test this change. A remaining cold result requires worker-side read-only diagnosis, not automatic generation/recovery or broader timeouts.

## Content and cost snapshot

The Prompt project a8a1b1f6-c222-4893-9399-b1fb3bc2fa52 was not paused. Its 23 October evening and 24 October morning scripts are marked published with Instagram, Facebook and YouTube URLs. The older 23 October 09:00 UTC script d95b077a-a977-4a48-b596-b89459f0518e remains approved with no voice/video; leave it untouched.

At inspection, 24 October booked Anthropic/ElevenLabs/Ideogram totals were 0.6460 + 1.0080 + 2.5200 = 4.1740 SEK. On 23 October those providers totalled 4.2444 SEK; OpenAI adds 0.4907 SEK (all-provider total 4.7351 SEK). These are ledger snapshots, not a guarantee of complete provider billing. No billable provider work was initiated by this investigation.
