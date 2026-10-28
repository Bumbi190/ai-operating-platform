# The Prompt – FactCheck v1 (separate editorial workflow)

**Status: draft / disabled / not registered in the live Omnira workflow engine.** Tracked in GitHub issue #591: https://github.com/Bumbi190/ai-operating-platform/issues/591.

**Decision 28 October 2026:** Fact checking is independent of growth-oriented content quality scoring. A reported 8/10 engagement score is not a fact check, nor is a parser's `passed=true` a factual approval. The original Home Office story was already published with a fabricated QA fallback; incident #586 documents the correction/takedown decision.

## Desired sequence

1. **Source snapshot:** Fetch the exact original article from the canonical URL, preserve URL, date, publisher, immutable excerpt/source hash, and retrieve the best available primary sources. Reddit and Hacker News can indicate interest, but are not independent verification of a news claim.
2. **Material assertions:** Extract *all* potentially factual statements from hook, script, on-screen captions, CTA, thumbnail and social caption. Bind every assessment to project ID + script ID + revision ID + content SHA-256. Rewrites invalidate older evidence.
3. **Independent evidence search:** Seek confirming **and conflicting** material. Avoid treating syndication, copied press releases, the same parent publisher or the same model's paraphrase as independent confirmation. Use primary material where available and a second independent publisher for autonomous eligibility; otherwise escalate.
4. **Claim-level verification:** For each material sentence, record supported/unsupported/contradicted/misleading/not-factual, with exact source excerpts and explanation. A source's existence cannot prove semantic support; evidence interpretation remains part of the editorial review.
5. **Framing and certainty:** Compare the hook, summary, spoken script and on-screen text against the actual sources. Preserve 'may', 'plans to', 'alleged', 'according to', uncertainty, timelines, relevant denials, and opposing evidence. Do not manufacture false balance by presenting weak and strong evidence as equally credible.
6. **Decision:** *Ready for editorial approval* only when the evidence contract is complete, the independent reviewer finds support, framing is faithful, and risk is ordinary. Unsupported, stale, contradictory or sensitive stories remain **HOLD** or **REJECTED** until reviewed. No fact-check model can authorize social posting on its own.
7. **Traceability:** Persist a new immutable report for each content version; show source links, exact citation snippets, decision reasons and reviewer identity in the project UI. Manual actions need operator authorization and an audit trail.

## Deliberate limitation of the first code slice

`apps/web/lib/media/factcheck/contract.ts` provides a read-only evidence/coverage/verdict validation contract. The new `source-collector.ts` accepts only explicitly mapped publisher URLs, checks input and final URL identity, bounds article length, and produces source-hash receipts using an **injected reader**; it does not implement or invoke network access. The new `reviewer-preview.ts` runs an end-to-end **offline fixture rehearsal** with a second reviewer identity, strict source and revision binding, and no authority to generate or publish. It has no real source reader or model adapter attached. There are **no** AI/provider calls, database schema changes, executable Atlas action, persistent audit log, scheduling or publish hook. The JSON blueprint alongside this document remains an inactive design, not a deployed Omnira workflow.

The rules can confirm that quotes appear in supplied source snapshots, and that different mapped publisher groups are cited. These checks do NOT prove source authenticity or that a quote logically supports a claim. The offline runner uses simulated readers/reviewers. A real, separate fact-check model and trusted primary-source reader must still be integrated and audited. High-impact content (asylum, elections, health, alleged crimes, investigations, breaches) receives an additional keyword-based human-review floor, even when an upstream risk field says `standard`; this is defense-in-depth, not complete risk classification. Evidence and citations never automatically grant publish permission.

## Release order and safety

- Keep PR #585's emergency parser fail-closed fix separate from production activation of this **new** workflow. Do not hide failed reviews by lowering thresholds or auto-switching to publish.
- Replace the offline source-reader fixture with an independently reviewed, authenticated, project-scoped adapter. Hermes currently follows its own Playwright read flow and cannot by itself prove a safe final-URL/egress boundary; do **not** connect the collector to Hermes or arbitrary live URLs before network-level SSRF/redirect/DNS rebinding controls, content provenance and real publisher identity are verified. Unavailable/invalid sources must cause HOLD.
- Build a governed reviewer stage with project-specific cost ceilings, bounded retries and correct uncertainty handling; independent from the script writer.
- Store signed/revision-bound FactCheck reports with RLS; activate **one** verified script through preview and manual editor acceptance before touching production scheduling.
- Hook EVERY legacy and new render/publish route to the same approval identity. A report on an earlier draft must not authorize a new version or an edited video caption.
- Preserve existing image fallback and 10:00/20:00 business goal; fix DST separately in issue #378.
- Review previously published posts containing the historical parse-error placeholder, prioritizing material errors over bulk deletions.

## Editorial reference standards

- Associated Press editorial standards: https://www.ap.org/about/news-values-and-principles/telling-the-story/
- IFCN principles: https://ifcncodeofprinciples.poynter.org/the-commitments

**No paid model execution, database mutation, social publication or Vercel production rollout is authorized by this document.**
