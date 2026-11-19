# Office production release and browser acceptance — 2026-11-19

The owner accepted the previously reviewed two Office migrations, controlled release and owner-session proof. No new paid provider/service is included.

PR #644 source9e97d4e merged normally as3999724fdff36ad5a239e6455fa06b86c4c60cc3 after all eight GitHub boundary/guard workflows passed. No admin bypass or force-push. Actual production deployment dpl_2mo3N3wzBxQ2dzPkRwyt9hzmvyGz is READY on omniraos.se/app.omniraos.se at that merge commit. Its build log confirms165/165 enforced migrations and202 known ledger names. The earlier preview dpl_6Ymiaje7P9SC4Rh4e3UA46uUeu8P was canceled by the project's ignored-build policy despite a green GitHub Vercel context; it is not counted as a successful build.

Applied, in order:
- office_step_activity, ledger20261119061352, SHA2565674b6ded86f3840a0b677d119464de3d272b54c85c54f44ac3ab582fc4d47a5.
- office_workflow_state, ledger20261119061409, SHA256499d4286b71955c5611b2411cdbea7f029413fd82b7632bb3cb0fcec133e73f3.

Stored statements match the exact reviewed LF-normalized canonical bytes. Existing office_visit_sessions/version20261113122811/hash a77bbd8837122cf419c271e534b594811217caec5c9142941bd6eecd8a7fb337 is unchanged. The one old visit remains identity_v1/revision0. Lower roles have no execute grants; private functions remain definer/empty search_path; service_role has no direct visits SELECT. No execution history or workflow definition was changed.

Only OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED=true was added, production only. Prior rollback deployment:dpl_DjynN7rCt8jUpAD8juRykHx7NPqB. Rollback disables this feature and restores the previous application if required; additive applied schema/ledger stays intact.

## Actual acceptance finding

The immutable workflow bundle and saved native installation re-verified without changes. Its explicit foreground entry launched the real fixed workflow game and companion. The genuine owner-authenticated page loaded the project/agent registry. The browser's first local status probe failed; no workflow grant/native acknowledgement or actual live idle is claimed. The local server was listening; a scoped unauthenticated CORS OPTIONS check returned204 with the expected narrow origin/headers. This does not prove the browser received a successful authenticated response.

The owner's screenshot showed Familje-Pling held with "Arbetsstatus okänd". This is consistent with the absent workflow binding, not evidence of verified idle. No fabricated idle signal or native hold bypass was used.

Opening Brave's internal site-settings URL was rejected by the browser URL policy. It was not retried through an alternate browser surface, raw CDP, shell UI, profile files or a security-setting change. The application-level permission check below reads only this site's standard permission status; it grants no permission and is a safer normal application diagnostic.

## Focused web correction

Same existing owned branch/worktree, fast-forwarded to main3999724f. Current preflight listed calendar PR449 (two paths) and445 (one path); metadata/scope review found no Office paths. Both foreign stacks were preserved. PR644 is merged and cannot be extended, so one follow-up fix PR uses the same owned branch; no new local branch/worktree.

Three product files:
- Legacy and visit loopback requests declare targetAddressSpace:loopback. Upstream authenticated requests do not receive that hint or the local bearer key.
- The panel queries only the granular loopback-network permission for its own origin and explains a known denial before any source read/grant. Unsupported queries fall back to the existing explicit button flow. It never uses the obsolete combined local-network-access query.
- A first capability probe gets30 seconds for a browser permission prompt. Grant/attach/ack/freshness deadlines remain unchanged. Hiding/unmounting during the permission query prevents a late local request.

This is standards compatibility and actionable diagnostics. It does not assert that a permission denial was the proven cause of the first failed probe; the real UI is checked after release.

Sources: [Chrome Local Network Access guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access), [Chrome142 release notes](https://developer.chrome.com/release-notes/142). Scope is literal127.0.0.1; CORS, authorization, host checks and fixed native targets are not loosened.

Verification: new regressions first failed on old code. Final79/79 Office Node tests, strict Office TypeScript0 diagnostics, all three real synthetic HTTP transport suites, and optimized local Next build exit0 with synthetic .invalid configuration and cached dependencies. Next's existing global type/lint bypass and cache/font/Edge warnings remain unchanged; global type/lint and real owner connection are not claimed. One old abort test now waits until its probe actually starts after the new permission await, retaining its abort assertion; a new test separately covers hide-before-request. Native Python/SQL/assets were not changed and their earlier acceptance is not relabeled.

Evidence retains the original failed run and the corrected final test output. Git text copies trim trailing whitespace; original copies remain on the PC. No screenshot, token, cookie, pairing fragment or production secret is included.
