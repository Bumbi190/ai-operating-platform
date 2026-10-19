# The Prompt real-provider QA — 18 October 2026

## Actual result

A fresh source, an English private-probe manuscript and a conservative cost preflight are ready. Actual Ideogram image quality and a new complete movie have NOT been verified: the local image and voice credentials are empty. No provider request was dispatched, no credits were consumed and no replacement image provider was silently substituted.

The saved candidate is docs/the-prompt-provider-qa-candidate-20261018.json. It is a research/probe input, not a trusted production source receipt, rights receipt or publishing approval.

## Source and duplicate checks

Primary: https://www.anthropic.com/research/employment-at-anthropic
The page's original publication metadata is 2026-10-16T16:26:00.000Z, not the later news coverage time. A direct HTML capture yielded SHA-256 f9e00782cebf64ee2fa6918c576de5507eeefbe4982dfe556693b30cb0428473. Raw HTML stays private and outside Git.

Cross-check: https://techcrunch.com/2026/10/17/anthropic-says-its-workforce-has-become-less-junior-and-is-spending-more-time-in-meetings/
Coverage metadata is 2026-10-17T20:21:19+00:00; its visible publication time is 1:21 PM PDT. This date was NOT substituted for the report's earlier original publication date.

The original report was 37.1 hours old at the actual preflight (2026-10-18T05:29:36Z). It expires under the 48-hour pilot rule at **18 October 16:26 UTC / 18:26 Stockholm**. It cannot fill the 20:00 Stockholm slot. If this passes while blocked, select a genuinely new source; do not refresh its timestamp.

A project-scoped read-only Supabase query found no prior report/coverage entry or publication for this candidate. This is evidence at the time checked, not a future duplicate lock.

The short script in the JSON describes the report's human-review bottleneck and explicitly limits its conclusions to the company's self-study. It makes no claim of economy-wide proof or layoffs. The generated images, when available, must be original conceptual illustrations, labelled AI ILLUSTRATIONS; no downloaded article/Getty photo was used.

## Cost preflight

Existing configured project budget: 100 SEK/day, 400 SEK/week, 700 SEK/month. This is not provider balance or authorization to spend the whole amount.

Configured book-price ceilings:
- Three Ideogram images: 2.52 SEK.
- One Victoria narration: 1.18692 SEK.
- Primary scene planner: 1.743 SEK.
- Possible explicit credit-refusal fallback planner: 3.220875 SEK.
- Conservative sum including BOTH planner ceilings: 8.670795 SEK; absolute probe cap: 12 SEK.

These are preflight bounds from the existing canonical price/budget functions, not newly verified invoices or provider balances. H1_SPEND_GATE=1 was set only in the temporary probe process to honor refusals; production configuration was untouched. Actual cost in this pass: zero.

## Concrete configuration blocker

The active workstation web .env.local contains empty quoted values for IDEOGRAM_API_KEY and ELEVENLABS_API_KEY. A first presence-only file check counted the quotes; a real Next env load correctly identified both as absent. The primary text and Supabase credentials were usable for read-only preflight.

Vercel confirms the two provider variables are configured for preview/production as sensitive variables. Their values were unavailable for export. No effort was made to extract them through a running app, change protection, rotate credentials or replace the provider/account.

A standalone private probe under apps/remotion/public/the-prompt-qa/anthropic-provider-qa.ts reached the real source/stop/rate checks, then refused missing configuration. Its default mode has no paid calls. The local server bootstrap resolves Next's empty server-only marker and the real local-text-contract source; it stubs no provider, budget or governance code.

## Code fix and validation

Only the explicit illustrated profile gains the new configuration preflight, after source validation and before step2 claims or launches voice/images. Missing scene-planner, image or voice configuration returns provider_configuration_required / ILLUSTRATED_PROVIDER_NOT_CONFIGURED, with provider roles but no keys or secret values. Configuration does not imply valid credentials, credit, budget, rights or release approval.

Observed regression RED: a fresh story with missing provider configuration reached voice_failed and failure accounting. GREEN: provider_configuration_required, zero paid boundary calls and zero row writes. Partial missing/whitespace cases for each provider also stop; a configured case still reaches the existing providers/error path. Flags-off defaults and other project behavior are unchanged.

- Full Remotion Node/tsx suite: 115/115 PASS, zero failures/skips.
- Editorial-lab and news-preview isolation contracts: PASS.
- Full web TypeScript: PASS.
- Extended existing provider/budget/stop/authorization web tests: 273/273 PASS across eight files (serial, 20-second test/hook timeout).
- This small follow-up was self-reviewed; the preceding adapter revision had a fresh reviewer.

## Next execution path

The preferred next step is an owner-authenticated private Vercel preview execution path that uses its existing provider credentials in place, with a durable no-replay boundary, exactly three images, one Victoria narration and the same conservative cost cap. Such an entrypoint was NOT deployed or exposed in this revision. Alternatively, the owner can provision the two missing keys through normal local configuration; do not paste them into the chat.

Only after actual provider images, voice timings and encoded output exist can their quality and exact-output approval be assessed. All earlier rights/release, disclosed production composition, schedule, metrics and rollback requirements remain open.

No new MP4, real-provider QA pass, merge, deployment, environment/cron change, production row write, public post or live experiment activation is claimed.
