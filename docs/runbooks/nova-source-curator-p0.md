# Nova Source Curator — Stage P0 offline review kernel

**Work:** [Issue #600](https://github.com/Bumbi190/ai-operating-platform/issues/600)
**Status:** pure, inactive and NON-AUTHORIZING. This is not the live Nova tool or an OpenViking release.

## Purpose

Nova should do repetitive, evidence-grounded pre-review work before the operator makes
editorial, sensitivity, project scope and transport decisions. The owner should not be asked
to blindly check 8 × 3 boxes. This kernel prepares a **bounded evidence/risk dossier**;
it grants **no** approval, publication, indexing, memory writer, retrieval or execution capability.

### Reuse, not parallel authority

- The owner-controlled Vault Policy v1 and the existing
  `parseKnowledgeDocument`, `evaluateEligibility` and `scanForSecretShapes`
  functions remain the authority for editorial status, classification and hard-secret checks.
- `#590/#593/#595` still govern a separate, blocked OpenViking evaluation.
- `#572/#574/#579/#587` still govern the narrow, working Notion read-only seam.
- `#598` is now merged as a separate, Preview-gated **read-only GitHub code
  inspector** for Handlarbörsen. Its GitHub App authorization, repo-ID gate
  and transport are **NOT** reused or activated by this offline P0. This is
  not approval to read private operator-local knowledge drafts.
- The original P0 PR `#601` was closed **unmerged** after its four files were
  preserved verbatim inside current `#602`, which also stages the negative
  Atlas chat-routing guard. Do not create another parallel curator PR.
- The stale and broad `#343` is not merged or imported.

## Source contract

The **trusted** calling operator must independently check the fresh user/project access,
exact repository identity, commit/tree path and blob SHA **before** passing source bytes.
The pure function `prepareNovaSourceReview(raw, trustedScope)` additionally checks:

- exact public Omnira repo identity, numeric repo ID, project UUID/slug and full 40-hex commit;
- 1–16 distinct project document candidates; bounded in-memory source/note texts;
- canonical source paths and expected SHA-256 **and Git blob SHA-1** over exact source bytes;
- parsed frontmatter through the current policy evaluator (no classification defaults);
- secret-pattern counts over source, draft and path;
- original exact line/quote matches (literal provenance only, NOT semantic fact-checking);
- suppresses immutable citation URLs if canonical pointer, project/scope or revision
  is inconsistent, or secret-shaped content appears in either the original or draft,
  even when the literal quote and source digests still match;
- named entity must occur in the exact quote to avoid cross-company citation;
- current/planned claims are always marked as unresolved for fresh verification;
- no raw source or untrusted quote is returned in the compact metadata report.

`repositoryTreeIdentityIndependentlyVerified:false` is deliberately always reported.
Git hash consistency alone cannot prove which repository/tree was read. Named-subject
anchoring does not prove correct company attribution without independent source review.
Source text is data, never an instruction to run a tool.

A model-proposed data classification is returned **only as a proposal**. This module does
not edit a note, persist decisions, confirm independent reviewers, mark `approved`,
or grant permission to transport `internal` content.

### Safe output semantics

`readyForOwnerReview` means only that the input is structurally reviewable.
All the following remain **false** even for an `approved` + `internal` note:

- `ownerApproved` and `classificationApproved`
- `sourcePublicationAuthorized` and `indexingAuthorized`
- `runtimeActivationAuthorized` and `modelExecutionAuthorized`
- `anyExternalWorkPerformed`

The output may contain canonical **public Omnira repository** paths and pinned URL
references. It never contains original contents, private notes, claimed full answers,
names from subject fields or tokens. Do not pass an unreviewed private source to a
cloud model merely because it is readable locally.

## Focused reproducible tests — zero package installation

From repository root, with Node.js 22 or later:

```bash
node --no-warnings --experimental-strip-types --test apps/web/lib/qa/nova-source-curator.test.mjs
```

The suite uses **synthetic fixtures only**, exercises the real existing document parser,
publication policy and secret scanner, and asserts the source-curator module is not
wired into live Atlas chat. It tests eight draft notes, foreign-repository/foreign-project
denial, altered commit/blob, bad canonical path, Kareby Bil vs EVExperten collision,
unsafe simulated secret, suppressing citations for mismatched project or canonical
pointer, a secret in a correctly hashed original, temporal uncertainty and absent
execution authority.

## Separate gates before Nova integration

1. Independent code/security review on exact final commit, plus full TypeScript/CI.
2. A reviewed **operator-local** adapter for approved Obsidian draft access; it must
   not silently copy the user's private local review folder or customer emails to GitHub.
3. Strict read-only owner-session tool with fresh project checks; UI must show what
   was actually verified and what needs human decision, without pretend approvals.
4. Owner-approved transport/classification decisions, immutable local source snapshot,
   genuinely independent 30+10+8 held-out questions, then lexical vs OpenViking 3×
   comparison under the existing NO-GO quality gate.
5. Any OpenViking live deployment requires **another** explicit permission decision.
   Do not create cron, turn on a feature flag, set paid API keys, write SQL or send mail.

**Rollback:** Remove this unimported module, its offline tests and this runbook.
Current Notion chat, Atlas M4 and production remain unchanged.