# Familje-Stunden – November social review starter in Omnira

Date: 2026-10-20. Branch: codex/family-social-import-20261020.
Base: current origin/main at c9b329a, not the older offline Remotion branch.

## Basis verified read-only
Project ID: 77cda551-57c9-4dc0-b019-1bb6438777f7.
Project name/slug: Familje-Stunden / familje-stunden.
Approved social plan revision: e745041f-ad3a-493f-bd3b-025525d561b2.
Approved plan choices:
- Facebook TEXT, manual editorial review.
- Instagram IMAGE, manual editorial review.

The separate offline Familia-Stunden November creative branch contains
original preview and alternate videos, plus November forest/Nova/Pling
source evidence. Neither VIDEO format nor borrowed music is approved by
the above social plan.

## Product change
The existing Social Content panel now conditionally offers:
- Hämta novembertext för Facebook
- Hämta novemberbildförslag för Instagram

These are proposal **starters**, not approved media or authorized sends.
They appear ONLY for the exact owner project, current approved plan
revision and both expected manual channel choices. If the plan changes,
the starter is hidden until separately reviewed and updated.

Clicking either button ONLY populates an UNSAVED editor draft with an
editable Swedish caption. No network write is performed by the starter.
The normal existing Save button is still the only save action, and the
normal existing approval/publication gates remain unchanged.

The suggestions have:
- mediaIds=[], scheduledAt=null, linkUrl=null.
- No video content, no publication account, no private asset URLs.
- The Instagram IMAGE idea needs an actual verified, registered project
  image before its content approval can succeed.
- The Facebook TEXT draft requires its own editorial approval.
- The existing Calendar is not written or changed. Its normal
  source-social integration can show an actual stored scheduledAt
  only after separately reviewed and saved time.

## Verification
From apps/web:
- Vitest: family-november-suggestions.test.ts
- Playwright: two new tests in social-content.spec.ts:
  manual import/save + no auto-send, and fail-closed on changed channel plan.
- TypeScript: tsc --noEmit
- Existing Social Content Playwright and content validation tests pass.

No credentials or secrets added. No external video/image/TTS generation.
No writes to production, no publishing or calendar events, no costs from
AI provider calls. PR and deployment require independent code review.

The development worktree for the offline 15-second video is unchanged.
It can be presented for owner review separately; production video posts
still require a new social plan revision and distribution approvals.
