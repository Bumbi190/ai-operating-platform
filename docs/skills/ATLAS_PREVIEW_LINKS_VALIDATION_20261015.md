# Atlas static preview links and rejected-draft evidence — 2026-10-15

The real OpenAI recovery run bf3bf73d-a6bc-4a0f-b68e-83b2713016df cost 0.2581 SEK and failed INVALID_LINK. Its raw response was not retained; only the generic error remains. The exact historical offending href is unknown. This patch does not claim to have reconstructed it or produced a successful live preview.

Reproduced independently with deterministic fixtures: the compiler rejected valid internal root /, known extensionless /about and about, root-relative /about.html, and the same-page empty fragment #. These cases explain a reproducible class of false rejections, not proof of the old response.

Changes:
- Normalize only flat route names that resolve to an existing package page, and / to index.html. Existing home-to-index alias rules remain conditional on no distinct index page. No URL decoding, dot-segment resolution, query, protocol, external network, or arbitrary path capability is added.
- Accept href=# for top-of-current-page navigation. Nonempty fragments still require a valid existing local ID. In opaque srcdoc preview, the owned runtime intercepts both forms and scrolls locally; exported files retain native anchor behavior.
- INVALID_LINK messages identify page and link position plus allowed page names. They never echo untrusted URLs or secrets.
- Give the model explicit canonical-link and demo-button guidance. No guarantee of future model adherence is claimed.
- On a rejected parsed/generated package, use canonical owned finalization (claim and cancellation) and store bounded inert evidence in existing run_logs with role system, code, source SHA256, model, project/session/run/generation. Full content is retained only within the existing 1MiB artifact byte bound. Claim credentials are excluded. Oversized content retains metadata only.
- Evidence is not a candidate, preview, success checkpoint, execution request or automatic retry. Best-effort logging failure preserves the original validation error.
- Verified production run_logs RLS ties reads to runs whose project is owned by auth.uid(). No grants, schema, saved plans, budgets or model routing are changed.

Validation:
- RED:8 artifact assertions failed on internal aliases/top links and missing diagnostics; the rejected-draft worker case found no saved evidence.
- GREEN so far:53 artifact assertions and2 retained-draft byte/provenance assertions; TypeScript passes. Worker/browser and independent review evidence will be recorded in the PR.
- Browser fixture generates /contact and /, and preview/export tests follow both directions. All 10 existing Chromium workspace flows passed before the review delta.
- Independent review identified srcdoc fragment navigation and a stop crossing the diagnostic gate. Both were reproduced RED: clicking #lower destroyed the iframe context through navigation; stopping during compiler rejection yielded STOPPED rather than INVALID_LINK. The delta uses preview-local scrolling and existing checkOwnedFinalization, preserving permanent failure without requeue while retaining cancellation/claim fencing. Final regression results are recorded in the PR.
- No paid model requests are used for implementation or verification. The old response cannot be repaired retroactively because it was not stored.

Reference: MDN anchor documentation and linked HTML specification confirm href=# as native top navigation: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a . API/provider behavior is unchanged.
