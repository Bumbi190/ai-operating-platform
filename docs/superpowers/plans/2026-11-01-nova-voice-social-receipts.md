# Nova voice social receipts Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL: use superpowers:executing-plans.
**Goal:** Complete voice preparation and truthful social persistence responses.
**Architecture:** Scoped voice argument budget; pure receipt reducer/renderer; route buffers untrusted prose before social tool identification and emits only confirmed receipts.
**Tech Stack:** Next route, TypeScript, Vitest, native social RPC tools.
**Spec:** docs/superpowers/specs/2026-11-01-nova-voice-social-receipts.md

## Global Constraints
Reuse owned branch; preserve PR578/266/605. No production/content/provider/budget/schema/publication changes. Existing ownership, cost, origin and idempotency gates stay authoritative. No paid retries.

## Review Focus
1. SSE/TTS or reload leaks fabricated prose: route adversarial tests.
2. Sibling/full-project rows mistaken for writes: exact target and payload tests.
3. Queued/partial/uncertain interpreted as complete: state matrix.
4. Truncation executes partial tools or retries: route zero-write tests.
5. Context/budget leaks into source/Notion/mail or normal short speech: existing isolation suites and new budget tests.

## Task 1: Regression tests
Create apps/web/lib/qa/nova-social-receipts-route.test.ts driving actual POST, mock only provider/database. Use native handlers. Run focused suite RED; failures must expose current behavior.
Interface: request voice flag/history -> model max_tokens; tool RPC result -> SSE and persisted assistant text.
Expected: current 150 limit and fabricated prose fail assertions.

## Task 2: Receipt and route correction
Create apps/web/lib/social-launch/preparation-receipts.ts with strict target/payload validation and short trusted renderer. Wire route budget, prose buffering, incomplete-stop handling and failure fallback. Add pure receipt edge tests.
Run focused suite GREEN and relevant existing social/route/provider/isolation suites.
Interface: tool name/input/result -> receipt summary; no authority changes.
Expected: all new regressions pass, no new side effects.

## Task 3: Verification and review
Run typecheck and full Vitest suite serial/bounded workers; classify pre-existing failures with baseline evidence if any. Fresh reviewer whole diff. Fix important findings with RED/GREEN; record minor deferrals. Commit one coherent follow-up; prepare reviewable PR/Preview according to existing mandate and report actual boundaries.
Expected: clean diff, recorded tests, exact commit and review evidence.
