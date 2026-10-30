# Atlas model and agent router — advisory release handoff

Date: 2026-10-23
Branch: codex/atlas-router-advisory-release-20261023
Base: origin/main commit 544c3c3

## Purpose
Port previously reviewed P2/P3 advisory-only model and agent selection code to current main. This does not enable execution.

## Scope
- Reuses vetted pure catalog and router in apps/web/lib/atlas/model-router.
- Candidate classes: local Qwen/Ollama, Codex CLI authenticated via ChatGPT, unverified Abacus CLI and budget-approved OpenAI API.
- Validates task, fresh health evidence, data classification, independent review, quota, expected cost and explicit spending authority.
- Every decision carries dispatchAuthorized=false. Existing broker, SDF-1 admission, independent reviewer and owner approval remain mandatory.
- No changes to job dispatcher, Cron, live cloud provider, budget system, Supabase schema, OAuth or production UI.
- Included read-only Windows preflight does not execute a model or disclose credentials.

## Host status verified October 23
- Ollama loopback is reachable and qwen3:4b exists.
- Last read-only preflight: 1,980 MB free physical RAM; 9,955 MB free VRAM; GPU 38 C.
- localInferencePreflightPass=false since the approved preflight needs >=4,096 MB free RAM. A prior snapshot had only 490 MB.
- Qwen inference on October 22 failed GPU PTX JIT allocation; a running Ollama endpoint is not proof inference succeeds.
- Codex CLI is authenticated via ChatGPT on Hultgren, but future subscription quota is not proven.
- Abacus CLI is installed, not logged in; costs and underlying model identity are unverified.
- Do not stress GPU or memory, close user processes, change drivers, or expose Ollama publicly.

## Local verification
- 17/17 isolated pure router tests passed on current main baseline.
- Scoped strict TypeScript check passed.
- Full GitHub CI and Vercel preview remain release gates. No live model call or production toggle is part of this PR.

## Next release stages, separate decisions
1. Free RAM headroom and perform bounded, synthetic local Qwen smoke only after preflight passes.
2. Transport independently attested health/result evidence through the existing authorized desktop broker, not a public 11434 port.
3. Review new worker capability and dispatch contracts with identity, project scope, spend, reviewer independence and human approval.
4. Activate executable model routing only after another authorization and full staging proof. This code only proposes model candidates.
