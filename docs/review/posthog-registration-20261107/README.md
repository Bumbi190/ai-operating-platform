# Local registration-report visual review

Actual HandlarborsenPosthogTraffic component and CSS rendered in a temporary Vite harness, React18, pinned dependencies, headless Chromium. All displayed values are synthetic and the screenshots visibly say so. No authenticated Next route, real PostHog query, account creation or production behavior is implied. The harness blocks every request outside its loopback origin; six final checks passed with zero browser errors and zero external requests.

Desktop1440x1100 and mobile390x844 each checked populated, zero-pageviews-with-submissions and unavailable states. Page stays within viewport; available dates are one text line; unavailable data does not invent a submission count. Mobile scrolling works with ArrowRight on the labeled focusable region; the final submission column can be brought fully into view. A before/after check reproduced two date lines in the original markup, then one with the scoped table styles. No test assertions or timeouts were weakened.

An initial visual helper used an ambiguous region locator; it was corrected to the specific accessible table-region name. Moving the pre-existing inline overflow style to CSS broke a literal SSR expectation; inline overflow behavior was preserved, retaining the existing test unchanged. Final37 focused tests and focused TypeScript pass.

Screenshots: desktop-populated.png, mobile-populated.png, mobile-populated-last-column.png and mobile-zero.png. Machine evidence: visual-check.json and date-wrapping-check.json.

PR preflight returned review_required/matching_local_branch with no matching open PR (121 inspected). Existing nearby journey/KPI branches were inspected read-only and contain no registration_submitted event in apps/web. Current purpose-specific branch was already approved and owns this implementation; continue it, create no new branch/worktree and do not overwrite those older workstreams. Receipt: ../../posthog-registration-release-preflight-20261107.json.

Final full-source comparison and timeout qualifications are recorded in ../../POSTHOG_REGISTRATION_RELEASE_CHECK_2026-11-07.md and ../../posthog-registration-release-baseline-20261107.json. The additional first-render timeout passed a selected unchanged diagnostic; the complete suite is still red.
