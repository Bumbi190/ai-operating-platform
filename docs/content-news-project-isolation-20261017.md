# Legacy AI-news navigation scope (2026-10-17)

## Purpose
A media-enabled non-news project (such as Familje-Stunden) was shown The
Prompt's legacy Breaking, News and Scripts UI. These controls use AI-news
terminology, Victoria voice and platform-branded provider copy, which is not a
valid Familje-Stunden editorial interface.

## Implemented changes
- A pure, explicit display predicate recognizes the-prompt and the original
  ai-media-automation legacy default project slug.
- News and Scripts layouts verify the current user's allowed project identity
  as well as the legacy news UI identity, and otherwise return notFound.
- The project media dashboard renders Breaking, News and Scripts entry points
  only for the recognized news project. Its own project-filtered media records
  continue to work for any project with media.enabled.

## Owner permissions are deliberately UNCHANGED
Existing media APIs intentionally allow a signed-in owner to generate or
render content belonging to their own project. The Breaking route separately
limits final publication to platform-owned accounts. The larger GitHub
security tests rely on those distinctions. Merely owning a different project
is not grounds to disable that project's existing API endpoints.

Therefore this PR does NOT change Breaking, Voice, Images, Music or Render API
authorization, token/role selection, spending rules, credentials, RLS or
publisher destination controls. Its scope is **UI separation**, not an
enforcing server-side content-type guard.

## Follow-up for true Content Studio capability separation
Introduce a reviewed project-scoped production capability (voice by
project/role, source-image lineage and publication destination) with a
migration plan that preserves existing owner-scoped media API contracts.
In particular, do not let a Familje-Stunden task silently generate Victoria
or substitute Sanna for Nova. Confirm the correct content studio TTS adapter
and make voice lock an executable provider boundary before enabling Family
auto-production.

## Verification
- 4 targeted UI/authorization-compatibility tests.
- Existing media-script-authorization, breaking-dual-authority-isolation and
  platform-authority-closure suites must stay fully green.
- No external provider calls, publishing or database changes.
