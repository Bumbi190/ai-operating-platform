# Company-search debug execution plan

Spec: docs/superpowers/specs/2026-11-04-company-search-debug-design.md. Continuous safe debugging under owner standard, same PR386.

- [x] Observe failing raw name/identity, two dealer codes and accounting tests plus desktop/mobile diagnostics/query/zero cases. Source tests observed 9 failures before correction; UI behavior verified in final test run.
- [x] Correct optional branch gating and strict dealer catalogue; add aggregate diagnostics without extra requests or exposing rejected identities.
- [x] Render diagnostics and explicit pending-query/zero states; preserve no-auto-search/retry and separate saved-name filtering.
- [x] Run complete affected source/company/Discovery/Lead Finder/Sales regressions, browser interactions/errors/mobile, TypeScript; separate reviewer inspects delta and fixes verified regressions.
- [ ] Commit and push same PR, verify exact-head Preview/CI and record a concrete debug report with live-policy limitation. No next feature activation.
