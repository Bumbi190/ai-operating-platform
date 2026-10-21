---
name: atlas-digital-growth
description: Verified, project-scoped demand analysis, sales/activation experiments and owner-gated actions for Atlas and digital businesses.
---

# Atlas digital growth & sales intelligence

Use for digital business growth, sales, demand, acquisition, activation and retention. This skill is knowledge and drafting guidance; it CANNOT grant provider access, spend, contact customers, deploy, publish, or override Omnira approval/cost/project gates.

## Continuous improvement loop

1. **Observe:** Identify the active organization/project, permitted sources and time window. Request verified project-bound provider data from PostHog, Stripe, Supabase, social providers, or approved CRM when integrations exist. No connector = data gap, not guessed numbers.
2. **Diagnose:** Track a consistent, cohort-attributed funnel: demand -> acquisition -> activation -> conversion -> retention. Compare equal-duration nonoverlapping windows, identical event definitions and attribution. Separate signal from causality and report tiny samples.
3. **Propose:** Show observed metric, exact source refs, baseline and current window, plausible causes, alternative explanations, and ONE measurable reversible experiment. State expected costs as estimates, not promises.
4. **Draft:** Write a local content, onboarding or outreach proposal with project-specific canon and a single primary metric. Local drafts are not permission to execute.
5. **Owner gate:** Before any email, DM, external post, production change, private customer data access, pricing update, or spending, use the EXISTING Omnira tenant/owner/approval/broker/spend flow with scope and expiry. Approval is checked at execution time by the authoritative runtime, not in this skill.
6. **Execute only when explicitly authorized:** Never bypass a missing provider connection or license. Never assume Atlas can perform a proposed action merely because this skill describes it. Actual execution adapters must be separately implemented.
7. **Learn:** Recheck the agreed metric and evaluation window, log measured outcome, confidence and next hypothesis. No guaranteed ROI/ROAS.

## Strict project distinctions

### Handlarbörsen
- Dealer lifecycle: contacted dealer -> pilot registration -> verified dealer -> first listing -> first verified interest.
- Respect already-sent Founding Pilot invitations, the separately approved dealer cohorts and individual opt-outs.
- Focus B2B onboarding, pilot feedback, dealer activation, relevant outreach drafts and listing quality. Do NOT automatically email contacts, mass follow up or operate Oscar's LinkedIn.

### Familje-Stunden
- Funnel: landing sessions -> trial cohort -> paid subscription -> monthly retention, only where attributable sources support it.
- Recommend valuable activities, onboarding clarity, seasonally relevant offers tied to *approved* monthly canon; safeguard children's content, prices, consent and family data.
- Use approved Nova/Pling brand only; no fallback voice, no fabricated benefit, fear-based parent hook or unapproved CTA.

### The Prompt
- Funnel: verified viewers -> profile visit -> follow -> attributable project site visit (where instrumented).
- Compare source-backed factual hooks, watch-through, 3s retention, follows, traffic and posting context.
- Editorial truth and Victoria voice lock beat engagement. Do not invent news, run paid ads or cross-post between projects.

## Ideas abstracted from owner's Skyze videos

Reviewed **excerpts**, not the entire course: measure search demand/intent, avoid guessing product fit, segment where unit economics justify it, diagnose the funnel and paid search waste with real data, build recurring customer value, automate operations with explicit exceptions, and turn recurring customer feedback into product improvements. The presenter’s specific revenue/ROAS and conversion claims were NOT independently verified; they must never become automatic target assumptions or budget recommendations.

## Implementation and boundaries

- Pure tested decision contract: `apps/web/lib/growth-intelligence/decision-engine.ts` with `analyzeGrowthFunnel()`, `classifyGrowthAction()`.
- Project-isolated, provider-verified cohort evidence only. Repeated source IDs are not proof of causal results.
- Directional review heuristic: >=30 eligible entrants per cohort, >=5 percentage-point and >=20% relative decline. This is NOT statistical significance or a campaign forecast.
- Every generated `draft_experiment` has `execution: not_authorized`, `allowedSpendSek: 0` and requires owner approval before external execution. No raw recipient lists or credentials in proposals.
- Existing `atlas-content-growth` owns video hooks/render direction, Familje-Stunden marketing workflows own its canon, and existing Omnira owner/broker/ledger controls own authorization.
- Do not ingest, copy or publish the commercial course videos or transcripts into Atlas knowledge. Only project-adapted principles and source pointers.
- The current implementation does NOT fetch live data, store proposals or execute work. Connecting these requires separately reviewed adapters and durable approval plumbing.

See `docs/atlas-digital-growth-v1.md` for rollout checkpoints and source boundaries.
