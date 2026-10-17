# Atlas Digital Growth & Sales Intelligence — v1

## Why this exists

Omnira is intended to automate the repeatable work of **digital businesses** while keeping high-impact actions behind the owner's approval. Skyze E-handel Bootcamp (four local MKV files, reviewed on 2026-10-17) offered useful *generalized* operating principles. This document adapts those principles to Omnira; the commercial training content itself is **not** copied into the product.

### Evidence level / scope of course review

- All four source recordings were locally located and inspected through sampled video frames.
- **Part 2** (~1m52s) was locally transcribed in full; **parts 1, 3, 4** were transcribed in selected 75-second segments (~36 minutes in total).
- Useful topics seen/heard: keyword demand, CPC, segmentation, landing-page conversion, 3PL/order/customer support automation, paid-search measurement, recurring value, and extracting improvement ideas from customer complaints.
- Marketing anecdotes, revenue figures, conversion assumptions, specific ROAS and claims of autonomous profits are **presenter claims**, not independently verified. Do not turn them into business targets.
- The audio transcription is automated and contained errors. Timestamps and qualitative findings are orientation aids, not legal or factual transcripts.
- Do NOT commit the MKVs, transcript files, contacts, private customer material, or imported course assets to this repository.

## Architecture boundary

Existing systems remain authoritative: Atlas Content Growth for creative editorial work; Familje-Stunden marketing campaign planner, brand guard and its approved canon; project-scoped analytics and provider permissions; and existing Omnira identity, quotas, approval, broker, spend ledgers and audit logs.

This phase creates a **new pure calculation and recommendation layer**, NOT a second content tool or an active task executor.

Source:
- `apps/web/lib/growth-intelligence/decision-engine.ts`
- `apps/web/lib/qa/growth-intelligence-decision.test.ts`
- `.agents/skills/atlas-digital-growth/SKILL.md`

### Input requirements

A trusted adapter will eventually supply each `GrowthWindow`:
- exact Omnira project identifier (`familje-stunden`, `handlarborsen`, `the-prompt`);
- a project-owned funnel;
- inclusive start and end UTC dates and a fixed attribution window;
- distinct entrants and converted members of the **same attributable cohort**;
- matching `measurementKey` (event definition) for both comparison windows;
- independent project-bound, verified, opaque provider report references.

A TypeScript `verified: true` property from an LLM **does not itself authenticate** a provider. Future adapters must verify provider ownership and provenance outside this pure module. Customer names, emails and private URLs must not be stored as evidence refs.

### Output contract

`analyzeGrowthFunnel(current, previous?)` returns:
- `data_gap` if data is missing, unverified, cross-project, events/cohorts differ, or periods overlap;
- `insufficient_sample` if either cohort has fewer than 30 eligible entrants;
- `stable_or_improved` if there is no sufficiently large directional decline;
- `needs_review` only when a verified comparable cohort has both >=5 percentage-point and >=20% relative decrease.

These thresholds are *triage heuristics* to prioritize investigation, **not** a statistical significance test. They do not establish causality or forecast revenue.

Any proposal is a **local draft** with `execution: 'not_authorized'`, `allowedSpendSek: 0` and `humanApprovalBeforeExternalExecution: true`. `classifyGrowthAction` distinguishes local analysis/drafts from proposals for email, posts, paid campaigns, changes to price/production, or accessing private records, but always returns `authorizesExternalExecution: false`. It does not consume an approval token or bypass existing action gates.

## Project-specific loops

### Handlarbörsen (B2B)
1. Observe evidence of dealer outreach, reply/registration, verification, first listing and first verified interest.
2. Identify a funnel bottleneck with a stable cohort definition and small-sample warnings.
3. Draft one product/onboarding improvement or individual follow-up for review, without emailing automatically.
4. Approved changes go through existing product workflow; track pilot activation and feedback.
5. Oscar's LinkedIn and any external outreach need their own connection, permissions and human approval.

### Familje-Stunden (subscription)
1. Observe traceable landing -> trial -> paid -> retention cohorts using existing project-bound analytics and Stripe only where actually connected.
2. Draft parent-helpful onboarding, activity discovery, monthly theme or trial clarity changes.
3. Recheck approved Nova/Pling/Sanna assets, pricing, trial, consent, family protection and CTA before creative review.
4. Publish/spend only via the existing review and approval flow. Measure retained paid members, not just clicks.

### The Prompt (audience + traffic)
1. Observe accurately sourced story performance, qualified views, profile visits, follows, retention and website referrals where attributable.
2. Draft *verified* editorial/CTA hypotheses through the existing Content Growth workflow.
3. Preserve Victoria voice and factual QA. Never optimize engagement by fabricating sources or headline claims.
4. No cross-posting, paid promotion or API spending without authorized connections and approval.

## Future phases (NOT delivered by v1)

1. **Verified read adapters:** PostHog, project CRM, Stripe, social providers; define event cohorts, provenance, freshness, purpose and rate limits. If absent, surface a data gap.
2. **Durable opportunity ledger:** project-specific immutable observation refs, hypotheses, approved owner proposals, outcomes and repeatability/idempotency keys; no raw personal data in insights.
3. **Human-approved action bridge:** bind an exact plan to authorized connector, owner identity, budget, audience, expiry and broker/license checks. The separate runtime, NOT the planner, gates and executes.
4. **Continuous eval:** compare like-for-like cohorts, avoid premature decisions, reverse failed changes, learn from feedback; schedule small-budget analysis-only jobs after permission.
5. **Operator UI:** show the observed metric, source and confidence; a side-by-side `Vad Atlas såg` / `Förslag` / `Vad kräver mitt godkännande` view per organization.

## Non-goals

- No new Shopify store or dropshipping stack; the referenced course is illustrative.
- No automatic inbox sends, bulk dealer outreach, ads, price changes, production code changes, secrets read, cross-project memory, scraping, credit spend or data uploads.
- No persistence, endpoints, cron, migrations, schema changes, live external API calls or adapter wiring in v1.
- No guarantee that Atlas already has the external tools needed to carry out a recommendation.
