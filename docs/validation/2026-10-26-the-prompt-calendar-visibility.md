# The Prompt calendar visibility — validation 2026-10-26

The approved change adds a separate current publishing queue to the native calendar. It reads the owned ai-media-automation project's existing media_scripts and active binding metadata. It does not change daily news production, human approvals, publisher selection, jobs, cron configuration or budgets.

The current queue has no invented appointment time. It shows approved unfinished/ready videos and pending destinations after global published. Saved IDs confirm only their own channel's saved receipt; raw provider observations/errors are omitted. Missing/blocked/unknown bindings and expired channel-specific freshness are explicit. Meta cannot pick a published row, so missing Meta receipt in such a row requires inspection rather than claiming a future automatic Meta send. YouTube remains waiting when eligible after Meta succeeds.

Verification completed:

-20 new projection/owned-reader/aggregation/component tests passed. RED was observed for missing projection/reader/component and absent aggregate queue, and for the additional Meta-published predicate regression.
-70 focused calendar tests passed, including real local isolated database access regression tests, DST/occurrence/layout/progress and the new20.
-4 new Chromium flows passed: current undated queue and source link/filter; coalesced focus/visibility refresh and mobile width; failed read/logout/late response; newly mounted user isolation.
-27 existing Chromium calendar flows passed, covering meeting editing, responsibility/workflow links, timing/DST, saved-receipt races, account changes and decision visibility.
-Separate TypeScript check passed.
-Production build passed with synthetic localhost Supabase settings; no real provider credentials loaded for the build. Build does not substitute for the separate typecheck.
-Independent whole-branch static review approved without Critical, Important or Minor findings. Reviewer did not rerun tests or validate live provider/publication/deployment state.
-Mobile fixture screenshot inspected: no horizontal overflow; per-channel status is readable. Screenshot is synthetic, not the live user's calendar.

Environment issues: the Git Bash helper could not initialize Windows named objects, so equivalent scratch/ledger setup used native PowerShell. Restricted loopback sockets prevented the first browser run; approved local elevated execution passed. One ambiguous browser alert selector was scoped to the intended calendar-read alert. Restricted build-directory access failed with EPERM; the same local build passed with approved access. None required weakening product checks.

History preparation: origin/main fetched at547f46c. Rebased only this feature's five commits onto it; pre-rebase127e4b0 and main547f46c had identical trees. Reviewed pre-rebase range5f05bfc..62b8413 retains identical product files after rebase. Whole-change review and tests therefore apply to the resulting tree.

Limits: bounded100 active and100 published source snapshots, at most100 visible items, explicit truncation. No full-history completeness claim or new provider verification. Queue refresh is on normal calendar reload/focus, not a new push service. No new weekly producer or AI invocation. Familjestunden's first week was already prepared; four Nov4/8 channel jobs remain governed by their existing approvals. No new drafts or scheduled jobs were created by this feature.

Release: local implementation and validation complete. GitHub upload, PR checks, production release and live read-only smoke remain separate pending steps until executed and recorded. No deployment success claimed here.

Post-review live-source inspection:30 approved/publishing rows, zero missing receipts among the101 newest published rows, Family target week still four queued jobs. To keep the specified compact layout with this real backlog, show five rows by default, waiting films first, and native expandable remainder. Additional UI regression observed RED→GREEN. Final focused suite71/71 and5 new Chromium flows passed (32 browser flows total with existing27). Separate tsc passed. The resulting local build is being rechecked. PR550 opened and attached; no production release yet at this checkpoint.
