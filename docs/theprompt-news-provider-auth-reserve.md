# The Prompt — Anthropic 401 incident, cost-governed reserve (2026-10-23)

**Status: code prepared only. The new auth-error fallback is OFF unless the operator explicitly authorizes it, and this document does not authorize API spend, paid video, cron retries or automatic publishing.**

## Verified problem

On 23 Oct 2026, Vercel errors showed Anthropic returning HTTP **401** with a structured `authentication_error` whose message was exactly `invalid x-api-key`. This blocked The Prompt's `/api/media/news/cron`; independent Dream and morning-briefing flows also use Anthropic and failed. The production `ANTHROPIC_API_KEY` variable exists according to encrypted Vercel metadata but is not accepted by the provider. Key presence is not validity. A Claude web subscription does not substitute for a valid API credential.

**Preferred recovery:** rotate/provision a valid Anthropic Console API key via Vercel's protected environment settings and redeploy the reviewed commit. Do NOT decrypt, echo, store in GitHub or paste secrets into chat. Do not rerun missed scheduled jobs without deduplication and human review.

## Optional narrowly scoped emergency reserve

A server-only opt-in `MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED=true` allows **only** calls satisfying all conditions to use the existing governed OpenAI media-text reserve after a *provably unbilled* Anthropic credential rejection:

- Execution context is `AUTONOMOUS`.
- Governed project is `ai-media-automation` (The Prompt).
- Agent is `News Hunter`; operation is `Analyze News`.
- Provider response is HTTP **401**, structured envelope `{type:"error",error:{type:"authentication_error",message:"invalid x-api-key"}}`.
- A server-side `OPENAI_API_KEY` is present.
- The existing `openAIChatCompletion` admission/budget and execution stop controls independently authorize the **single** `gpt-5.4-mini` text completion.

The feature flag is **absent/false by default**. It is not a blanket failover for other projects or for Script Writer, Dream, CFO Briefing, UI chat, image/video generation, or arbitrary 401 errors. Existing explicit Anthropic *low-credit* fallback is unchanged.

### Guarantees and refusal cases

- Never fallback on `400 invalid_request`, `403`, 5xx, 429, network timeouts, SDK transport ambiguity, governance-unknown completion, or stopped/budget-refused calls.
- If the secondary OpenAI budget gate refuses or its result is incomplete, propagate the error without further retries or invented content.
- Preserve source provenance and The Prompt's normal news review state. Do not enable `auto_pipeline=1` or bypass editorial approval.
- A new reserve may incur actual OpenAI API charges, even though it uses hard project spend gating. Request explicit operator approval **before enabling** and agree a conservative monthly/day spend ceiling.
- This is not a replacement for repairing the invalid Anthropic key: `/api/media/cron/morning-briefing` and `/api/media/cron/dream` still call Anthropic directly.

## Local verification

A failing-first fixture showed the auth-error fallback did not run before this change. After the narrow code change, all **26 media-text fallback tests** and **90/90 across four related media/news suites** passed on Hultgren. Cases prove default OFF, The Prompt-only operation, no cross-project or manual request, no ambiguous 401 fallback, OpenAI key required, one secondary attempt, and preservation of the OpenAI spend-refusal.

**Deployment discipline:** separate PR with independent review, clean lockfile install, full typecheck and successful Vercel preview. Do not enable the new flag in production during review. After an approved activation, watch actual `/api/media/news/cron` results, spending ledger, and publication gates; stop immediately if any status/receipt is ambiguous.

Related: [issue #518](https://github.com/Bumbi190/ai-operating-platform/issues/518), [Higgsfield video pipeline #516](https://github.com/Bumbi190/ai-operating-platform/issues/516).
