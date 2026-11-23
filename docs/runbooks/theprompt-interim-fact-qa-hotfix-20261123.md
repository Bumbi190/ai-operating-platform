# The Prompt — isolated source / editorial QA hotfix (23 November 2026)

**Environment:** local-only worktree, based on production main `58023816fb853c6d4ece5617800cf7ce4c63303a`
**Branch:** `fix/theprompt-source-grounding-interim-20261123`
**Project:** The Prompt `a8a1b1f6-c222-4893-9399-b1fb3bc2fa52` only
**State:** QA PREPARED, NOT DEPLOYED OR PUBLISHED

## Scoped fixes
1. `lib/media/script-prompt.ts` now prevents unverified recency, fabricated performance figures, autonomous actions and fictional "production code" anecdotes from being presented as approved writing examples. It distinguishes source-supported examples from style.
2. `lib/media/quality-source-excerpt.ts` selects up to 4400 characters of actual source text, retaining relevant late claim evidence and qualifications rather than truncating the source after 600 characters. It **does not invent, augment, translate or approve** the source.
3. `lib/media/quality.ts` uses the excerpt in the genuine Quality Gate request and rejects missing evidence. All existing factual scoring floors stay in place.
4. `lib/media/official-source-fallback-policy.ts` and `app/api/media/cron/step1/route.ts` reuse the *already existing* guarded first-party HTML source reader, **only when Hermes failed or was unconfigured, and only within the existing optional 28s article enrichment budget**. Non-official origins, insecure URLs and off-budget calls are denied. Failure falls back to the original summary AND unchanged fail-closed QA, never an approval.
5. A previously undersized synthetic first-party index test fixture was made realistic enough to satisfy the reader's existing minimum-page-length guard. This changes **the test fixture, not the production security threshold**.

## Confirmed tests and build limitations
- **38/38 targeted Vitest tests pass** on this isolated main-based branch (7 suites), including mocked outbound editorial QA, absent evidence, late benchmark qualifiers, official URL/domain/time limits, article parser and existing media consumers.
- `git diff --check` passed.
- Full TypeScript `tsc --noEmit` did not pass on this worktree: **3 unrelated module-resolution/type errors around `@remotion/lambda/client`**, because the shared local dependency junction lacks the package, despite it being declared in `apps/web/package.json`. This is a *local dependency installation problem* and must be repaired/verified using an isolated correct install before deploying. Do NOT fake module declarations or copy a secret-bearing `.env`.
- Changes are isolated from the dirty V4.04 premium branch and were developed from the production main Git SHA. No AWS credentials or deployment settings were read/decrypted/changed.

## Deployment policy / actual operational blockers
The live Vercel code is still the old simple `cron/step2` ElevenLabs+Ideogram and `cron/step3` Remotion pipeline; V4.04 generation holds are **not deployed**. Existing 07:20 / 08:00 and 17:20 / 18:00 slots are on, project and global STOP are off.

This hotfix aims at factual quality but **does not fix AWS**, produce a new voice, render or publish a video. The last identified AWS failure was `UnrecognizedClientException`; Vercel lists generic `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` and Remotion settings but credentials' actual IAM validity was not tested. New Remotion-prefixed keys/expected account for the local STS identity canary are not provisioned in the inspected production metadata. No secret values were viewed.

**Before any production action:**
1. Independent review of the scoped code change against main, complete verified install and full test/build; no automatic merge/deploy with the dirty V4.04 branch.
2. AWS operator checks the actual Remotion AWS account/principal/region/function and repairs invalid IAM credentials *without sharing them in chat*, then runs free read-only STS canary with matching Remotion role before any billable Lambda render.
3. User/owner authorizes a time-limited interim old-format visual exception plus budget ceiling. Factual QA, copyright/rights, STOP, exact script identity and provider receipts **cannot be bypassed**.
4. Use only a **new, source-reviewed, not-previously-published current script**; no Muse, Osmo, archived videos or synthetic V4.04 technical previews. Validate the final MP4 and publish once through canonical idempotent routes only.

**No Git push/PR, deployment, AWS render, provider call, database write, social publication, new automation or provider-credential access was performed here.**

## Further evidence: likely Vercel ↔ Remotion AWS credential collision

Remotion's official troubleshooting page for `UnrecognizedClientException`:
https://remotion.dev/docs/lambda/troubleshooting/unrecognizedclientexception
explicitly calls out serverless environments where the generic AWS names
are injected or used for other purposes. It recommends dedicated
`REMOTION_AWS_ACCESS_KEY_ID` and `REMOTION_AWS_SECRET_ACCESS_KEY`,
which take priority in Remotion Lambda's credential selection.

Read-only Vercel Production environment metadata for the shared
`ai-operating-platform-web` app (23 Nov 2026):
- **Present:** generic `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_REGION`, `REMOTION_LAMBDA_FUNCTION_NAME`,
  `REMOTION_SERVE_URL`.
- **Not present among inspected keys:** `REMOTION_AWS_ACCESS_KEY_ID`,
  `REMOTION_AWS_SECRET_ACCESS_KEY`,
  `REMOTION_AWS_EXPECTED_ACCOUNT_ID`.
- Values and AWS account identifiers were **not** read or decrypted.
- On 21 Nov the Osmo row has `UnrecognizedClientException`,
  `render_attempts=3`, no `render_id`, no `render_bucket`
  and no MP4. An older, already published Muse video also has that
  failure recorded, but must **not** be retried or republished.

**Safe operator restoration, restricted to The Prompt's renderer:**
1. In the intended **Remotion AWS account** find the actual
   function/bucket/region, a dedicated least-privilege Remotion IAM
   principal and its *active matched* key/secret (or an approved
   role-based alternative). Confirm which principal Remotion should
   use. Do not assume the existing generic Vercel AWS keys belong
   to the correct account or are still valid.
2. In **Vercel → ai-operating-platform-web → Settings →
   Environment Variables**, provision the independent Remotion-prefixed
   pair as **Production-only** secrets using Vercel's secret-entry UI.
   Do **not** paste keys in ChatGPT, source files, logs, email or the
   user's Git repository. Do **not** delete or repurpose generic AWS
   variables that other Omnira/Bedrock workloads may depend upon.
3. Set a separate **non-secret** trusted expected Remotion account
   ID in secure application configuration only after the account
   owner verifies it. A read-only `sts:GetCallerIdentity` canary must
   establish that the *same prefixed* principal belongs to the right
   AWS account, plus read-only checks for region and function.
   The earlier local preflight implementation is staging-only and not
   a production bypass or authorization token.
4. Deploy any reviewed configuration change under the owner's normal
   Vercel approval process. The changed runtime environment must be
   instantiated/redeployed for env updates to apply.
5. Before one small, spending-limited private Lambda test, verify
   global/project STOP, exact account, dedicated IAM rights, one-time
   render claim, provider status reconciliation and the user's approved
   interim-format budget. If any check fails, stay on QUALITY_HOLD.

This is a probable collision **not proof of the AWS account or IAM state**.
No credentials were decrypted, rotated, copied or updated; no
external STS call, Lambda render, deployment or post was initiated.

## 23 Nov: The Prompt Quality Gate reserve output JSON mode (local-only)

The evening cron (17:20 Europe/Stockholm) saved a fresh draft as
`pending_review` with the explicit verdict
`Quality check timed out — manual editorial review required.`.
Vercel logs also show a later completed model answer of 2497 text
characters rejected by the strict JSON parser. These two signals
indicate independent timing and response-format problems; **do not**
pretend fixing JSON syntax fixes the 8-second watchdog deadline.

A narrowly scoped guard was added to
`apps/web/lib/media/text-client.ts`:
- Only when `ctx.agent === 'Quality Gate'`,
  `ctx.operation === 'Score Content'`, and
  `ctx.project.projectSlug === 'ai-media-automation'`, pass
  `response_format: { type: 'json_object' }` to the existing
  **governed OpenAI fallback**. It does not change the Anthropic
  primary request, budget gating, model, STOP or retry count.
- JSON mode ensures syntax when the chosen provider supports it,
  but **does not verify the factual content or schema**.
  `parseQualityScore` and the prior minimum-score veto still apply;
  refusals, malformed schemas and timeouts remain QUALITY_HOLD.
- Other media tasks (e.g., News Hunter) do not receive JSON mode,
  as asserted by regression tests.
- OpenAI documentation:
  https://developers.openai.com/api/docs/guides/structured-outputs
  (see JSON mode vs Structured Outputs).

**Targeted tests: 38/38 PASS, TypeScript: PASS.** No paid API
call, no production write/deploy, no status override. Existing
technical quality-recheck route is authenticated and one-shot but
NOT scheduled to salvage the missed evening slot; it was not
dispatched because that would spend and mutate a real script.
