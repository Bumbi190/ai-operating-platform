# Social start and reusable project profile — design 2026-10-16

## Intent and authorized scope
André approved continuing the clearer start guide, a reusable company profile and a reviewed publication path. Familje-Stunden already has Facebook and Instagram; Pinterest may exist but is unused. Primary outcome: understand the next step and prepare consistent content without finding API credentials or starting paid generation. Actual account connection and the first public post are deferred until André participates. No provider side effects during development. Preserve The Prompt, Lumvy and parallel voice/overview work.

This architectural increment implements the start/profile portion. The independent manual publication subsystem has its own spec/plan and follows this increment in the same work session; a guide must never claim that subsystem is live before it is.

## Approach
Reuse current project social workspace and canonical assets. A project profile stores description, audience, tone, website URL, call to action, factual boundaries and up to five owned preferred image/video IDs. Immutable revisions and optimistic concurrency protect edits. It is saved working context, not publishing authority or a verification of its factual claims. Existing exact post review remains authoritative. Changing this working context does not rewrite approved posts.

Keep company context local to each project rather than introducing a global brand service or duplicating website builds. Atlas can read and save a profile discussed with the operator; cannot approve content or publish. All tools require the owned conversation's project.

## Contract and storage
SocialProfileInput: description(1..1200), audience(1..600), tone(1..300), websiteUrl(nullable HTTPS, max2048), callToAction(0..300), factualBoundaries(0..1000), preferredMediaIds(unique UUIDs,max5). Reject unknown fields, missing fields and control bytes. No inferred pricing, promises or seeded project facts.
SocialProfileView: project{id,name,slug}, revision|null{id,sequence,sha256,profile,createdAt}, assets(current owned metadata), workspaceUrl.
Tables social_project_profiles(root/current revision) and social_project_profile_revisions(immutable, exact input/idempotency, actor/conversation).
RPCs social_profile_read/save use social_launch_assert_owner, active-project write guards, project-row serialization, exact key/input replay before stale-revision comparison; old retry returns current head, never a rollback. Both server-only RLS, no web-role grants; invoker functions with empty search_path.
No profile write can create an account binding, publish task, decision, media generation or budget change.

## UI
Add Företagsunderlag tab and concise start guide to the same social workspace. Guide provides labeled steps and explicit next action for missing/unapproved channel plan, content preparation and future account activation. Readable account status is independent of selected channels; unknown/unreadable stays unknown.
A locked Nytt utkast includes an actionable Gå till kanalplanen button. Tab changes retain unsaved profile/content drafts. Loading/failed refreshes cannot overwrite edits or a newer successful save; switching project aborts and remounts.
Profile editor starts empty, labels optional website/assets, retains values/key after failure, sends expectedRevisionId. Changes elsewhere produce a visible conflict and preserve edits. Show saved version and saved-context status, never an approval claim.
No API keys, server variable names or setup implementation instructions in the normal start flow. Existing advanced setup details remain accessible for the later connection step.
Initial and save reads show current canonical assets; deactivated/missing preferred assets are marked unavailable and never reused silently.
Atlas content guide reads this context before proposing new posts; saved source revision is included in its tool result, but profile contents are untrusted task data, never instructions overriding tools or project scope.

## Verification
Pure validation, real local SQL ownership/conversation/concurrency/idempotency/immutability/stops, actual API and Atlas dispatch, rendered mobile/desktop browser tests including held responses, draft retention and explicit locked-state action. Relevant social/chat/type/migration/isolation checks. One independent whole-branch review and exact-head CI/merge/production verification. No live provider/model generation or posts.
