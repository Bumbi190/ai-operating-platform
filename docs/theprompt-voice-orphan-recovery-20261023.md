# The Prompt — delayed voice orphan detection and one-owner dispatch (2026-10-23)

**Status: new automatic recovery is OFF by default.** This is a production-readiness and incident-prevention code change, not permission to run missed publishing slots or generate paid images/voice without the usual budget authority.

## Reproduced live incident

On Friday 2026-10-23, the normal The Prompt morning chain had failed earlier while Anthropic's old API key was invalid. After key rotation, a separate recovery/guard produced a new story at **09:00:55 UTC = 11:00:55 Europe/Stockholm**, *after* the regular **07:25 UTC** step2 voice slot and **08:00 UTC** morning publication slot. A read-only Supabase inspection showed script `d95b077a-a977-4a48-b596-b89459f0518e`:
- `status=approved`, quality score **8.0/10**, `voice_status=none`, `video_status=none`, `voice_attempts=0`, no audio/video and no `published_at`.
- `omnira_pipeline_retry` runs every five minutes, but it only retried voice status `failed`; its orphan logic covered **render not started after voice ready**, not **voice never started**. Neither the upcoming 17:25 UTC voice slot nor existing 60-minute selection would select the 09:00 UTC script by then. This is a genuine liveness gap; it does not imply any Instagram post was delivered.

## New recovery (flag-gated)

`GET /api/media/cron/pipeline-retry` now **observes** candidates and reports `voiceOrphanCandidates` (at most two per tick), without dispatching by default. An eligible candidate must:
- Belong to exactly the canonical The Prompt project derived from Supabase `projects.slug='ai-media-automation'`.
- Be approved, unpublished, with voice `none`/NULL, no audio nor timing data, and fewer than three voice attempts.
- Be older than ten minutes (so the ordinary next-stage scheduler has precedence), **but younger than six hours** (so stale news cannot silently incur paid backfills).
- Be examined through the existing `CRON_SECRET`-authenticated internal retry route. Failed DB lookup/read skips dispatch; absence of eligible candidate does nothing.

Paid recovery is additionally gated by `MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_ENABLED === 'true'` **and** the existing `H1_SPEND_GATE=1` hard budget enforcement. When both are active, it calls the existing step2 route for up to two already-approved candidates per tick. **No flag has been set in Vercel** in this code change. The current published voice/Ideogram still-image flow remains unchanged; Higgsfield video generation is still OFF.

## Step2: atomic compare-and-set before any provider call

A late recovery must not create duplicate paid voiceovers when two cron invocations select the same script. `step2` now:
1. Selects current `voice_status` and `voice_attempts`.
2. Refuses `ready`/`generating`/any unexpected state or three exhausted attempts.
3. Conditionally changes the row to `generating` using a single PostgREST UPDATE with matching `id`, own `project_id`, `status=approved`, exact observed voice state and attempts.
4. Requires the UPDATE to return the **claimed row** before it invokes ElevenLabs or Ideogram. A conflict returns `nothing_to_do`; any DB claim error returns HTTP 503, and both refuse external paid work.
5. Keeps existing confirmed failure/retry-count recording, stop enforcement, storage, and provider-budget gates.

The existing `trg_media_scripts_updated_at` BEFORE UPDATE database trigger was verified live on the intended Omnira Supabase project, preserving stuck-worker detection after the CAS.

## Activation & recovery plan

1. Review this PR independently; require GitHub security/DB boundary tests, local/CI typecheck, preview build and passing synthetic concurrent-claim tests. Do not loosen unrelated failing CI checks.
2. Decide separately whether The Prompt's existing approved-but-unvoiced scripts should be recovered despite a missed posting slot; orphan detection alone never posts them.
3. Only after operator approval of any resulting ElevenLabs/Ideogram spending, configure **Production** `MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_ENABLED=true`, with `H1_SPEND_GATE=1`; deploy the reviewed main commit. No automatic spending is authorised merely by merging the PR.
4. Watch the next authenticated `pipeline-retry` tick and both provider cost ledgers. Confirm `voiceOrphanRescued`, a single successful CAS, `voice_status=ready`, media in the script's own project storage, no duplicate provider cost entries. If provider status is uncertain, stop and reconcile; don't force a second paid dispatch.
5. Review video/render/publication separately; the orphan rescue does **not** retroactively publish content at the missed 10:00/20:00 slot. Disable the flag on anomaly and redeploy; keep existing media assets for reconciliation.

## Tests

The new failing-first suite `lib/qa/theprompt-voice-orphan-recovery.test.ts` covers missing CRON_SECRET, previously generated voice, lost CAS, DB read error, one successful dispatch, exhausted/retry attempt fencing, The Prompt-only age-bounded orphan selection, disabled-by-default detection, required hard spend gate, and missing project fail-closed handling. Initial tests were RED against the old implementation. The fixed version passed **12/12** tests with no production calls or credential access. Wider suite status and independent review must be recorded after clean-install verification.

Related: [Anthropic key recovery incident #518](https://github.com/Bumbi190/ai-operating-platform/issues/518) and [Higgsfield media project #516](https://github.com/Bumbi190/ai-operating-platform/issues/516).

## Follow-up verification — 2026-10-23

An extra compare-and-set guard now also refuses to claim any row with an existing `published_at`, `audio_url` or `timing_url`, rather than buying media for a partially completed or already published script. The mock integration test asserts each SQL filter. A two-worker synthetic race case verifies that one conditional claim succeeds and one returns `nothing_to_do`, with **exactly one** ElevenLabs and one Ideogram invocation.

After isolated lockfile `npm ci --ignore-scripts` (949 packages, no inherited node_modules junction), the final focused test set passed **51/51** across the new voice-orphan integration suite, spend retry lifecycle and provider boundary suites. The **complete web TypeScript check PASSED** (exit 0). Earlier exploratory broader Windows QA (6 suites) had 11 unrelated failures in legacy static scanning / 5-second timeouts; these are **not** counted as passing tests or certified pre-existing without a base comparison. Independent read-only review and Vercel/GitHub checks remain release gates. No database write, provider request or cron replay was executed during development.

## Safety hardening — explicit UTC cutover for paid voice-orphan recovery

As of the Oct 23 follow-up, an additional required server-only setting makes delayed-voice recovery *prospective by default* rather than retroactively spending on a missed publication slot:

- `MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_ENABLED=true` (existing opt-in)
- `H1_SPEND_GATE=1` (existing mandatory strict budget enforcement)
- **NEW: `MEDIA_PROMPT_VOICE_ORPHAN_RECOVERY_FROM_UTC=YYYY-MM-DDTHH:MM:SSZ`** (or with `.SSS` milliseconds), set explicitly after the operator's approval.

All three are required for a paid recovery dispatch. The cutoff must be a valid canonical **UTC** timestamp and at least ten minutes old at the time of the retry tick. Missing, malformed, locally offset, impossible-date, or not-yet-eligible cutoffs keep the paid path **OFF**. The database query must also require that the script was generated at or after this approved cutoff; the existing six-hour freshness rule still applies. There is no implicit "all scripts since midnight" default.

The current old 11:00 manuscript can still appear in the nonbillable `voiceOrphanCandidates` monitoring result when recovery is disabled, but activating recovery with a cutoff *after* that manuscript does **not** buy its voice or images. Releasing this code must **not** create or set either environment variable automatically. The operator may explicitly approve an older cutoff for an individual production recovery later, with budget, editorial review, no duplicate publishing, and media reconciliation checked separately.

The regression suite covers the cutoff-required failure, malformed UTC values, future cutoffs, no silent backfill of the Oct 23 script, preserved read-only orphan monitoring while the flag is OFF, and the existing atomic single-claim behavior. The remote paid provider calls remain mocked in automated tests. No production variables, credentials, database rows, cron executions, or publishing schedules were modified as part of this hardening.
