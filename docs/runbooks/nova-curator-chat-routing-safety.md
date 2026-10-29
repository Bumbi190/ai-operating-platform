# Nova Source Curator — fail-closed chat routing until connected

**Status:** guarded routing bugfix only; NO Source Curator live integration,
approval, credentials, indexing or publication.

**Identity clarification (owner, 29 October 2026):** Atlas and Nova are the
**same AI/operator assistant**. Nova is the voice/persona used in Agent Office,
not a separate agent, account, principal or permission boundary. The source
curator is a capability of Atlas. The unavailable response must never suggest
that Nova needs to be linked as a second assistant.

Issue: [Nova Source Curator #600](https://github.com/Bumbi190/ai-operating-platform/issues/600).
Separate dormant pure-review engine: [PR #601](https://github.com/Bumbi190/ai-operating-platform/pull/601).
Private GitHub reader, also dormant: [PR #598](https://github.com/Bumbi190/ai-operating-platform/pull/598).

## Observed failure

Owner issued this exact Swedish request in Atlas chat:

> Nova, granska Handlarbörsens kunskapskällor och visa mig vilka beslut du behöver från mig.

Instead of Source Curator, the model chose the
handlarborsen_compare_workflow_evidence tool and returned CRM, inbox and
outreach counts. It did not review the 8 project knowledge drafts.

The explicit CRM/composite classifiers **do not** recognize that sentence.
The ordinary Atlas turn still exposes the generic full tool set to the model,
so the model could choose an unrelated tool. The screenshot illustrates
wrong tool selection, not a successful Nova review.

## Safety fix / scope

Only an explicit request **addressed to Nova** about
**Handlarbörsen knowledge sources/documents** is recognized, e.g. the exact
operator sentence above or "Atlas, be Nova granska Handlarbörsens
kunskapskällor". Negated commands, unrelated CRM reads, other project names
and meta questions remain on their existing routes.

Until a separate authorized Source Curator tool is deployed, this turn:

- has an **empty tool allowlist**;
- skips the full Atlas model prompt/context assembly and LLM request;
- emits an **exact, non-fabricated unavailable** text response using the
  normal SSE text/timing/done transport;
- persists the ordinary assistant notice in the existing conversation
  flow (subject to usual conversation ownership checks);
- does not invoke CRM, mailbox, external workflow catalog, Notion,
  actions, workers, OpenViking or any publisher;
- does not infer owner approval or assign a knowledge classification.

This is a **negative capability**: it stops a false claim of completed
work but cannot yet produce the requested review.

## Tests, limitations and future replacement

The zero-install native Node suite:
apps/web/lib/qa/nova-curator-routing.test.mjs

It includes the owner's exact sentence, lookalike CRM and other-project
requests, negation, empty-tool selection, actual chat-route integration
and deterministic SSE fallthrough. It checks module source text plus
the classifier; full authenticated browser acceptance remains a separate
manual test. The exact-head Preview build/CI must pass before promotion.

This guard is deliberately **separate** from PR #601 (pure offline
review engine), because it modifies the live chat route. When a
project-authorized Nova Source Curator reader is independently reviewed
and released, replace this disabled branch with an explicit
**Source-Curator-only tool turn**. Do not re-enable generic CRM tools
for the same user request.

No secrets, migration, schema, model, external API, new paid service,
production environment flag, cron, notification, automatic merge or
OpenViking credentials are introduced here.

**Rollback:** revert the chat-route guard and helper when the new
specialist handoff is authorized. This PR must not be confused with
the review engine becoming operational.