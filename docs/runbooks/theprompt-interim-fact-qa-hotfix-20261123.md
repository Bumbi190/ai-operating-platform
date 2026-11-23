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
