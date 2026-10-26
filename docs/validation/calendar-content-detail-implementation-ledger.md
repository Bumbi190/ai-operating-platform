# SDD ledger — plan: docs/superpowers/plans/2026-10-26-the-prompt-calendar-events.md

2026-10-26: André approved dated calendar design, inline image/video/email clarification, and native implementation plan. Reuse existing isolated clone and dedicated branch. No approval/sending authority added. Existing baseline tests run before implementation.

Pre-flight Task1→2→3: source references identify media script or exact social revision/hash; source dates do not imply publication authority. Detail API resolves selected content server-side; week DTO has no media/body. Consistent.
Pre-flight Task2→3/4: shared discriminated content union, inert email/text rendering, owned media resolver. Generic existing review controls remain their original paths, no new calendar send path. Consistent.
Pre-flight Task3→5: private race guards include user/project/source/revision, new local browser fixture and existing calendar regressions. Consistent.

Ruling: Reuse established isolated clone/build copy; Git Bash helper already fails under this Windows environment, so setup/brief/test ledger equivalents use native PowerShell and committed evidence. No product impact; avoids another checkout or dependency install.

Task1 in progress; Tasks2–5 pending.
Task1 complete:4 date/status projection tests,2 scoped source tests, aggregation regression and legacy queue tests22/22 passed after missing-module/missing-aggregate RED. Separate tsc passed. Reader moved into focused source-media-events module; old queue reader remains as shared safe parsers/backward compatibility until unused UI retirement.
Task2 tests9/9 passed after missing normalizer/media/detail/API RED. Exact social job revision/hash remains pinned and rejects substitution. Legacy real-source check found12 recent S3 films, all exact script-named render/bucket paths. Ruling: support those existing producer videos using HTTPS S3 region/bucket/render/script exact-path binding, without server fetching; registered assets use the existing same-origin hash-checked media endpoint. If verification fails, show missing video rather than loading an arbitrary URL. No new media admission or rendering.
