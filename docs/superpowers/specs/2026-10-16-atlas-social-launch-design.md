# Atlas social launch — six project-selected channels

Date: 2026-10-16. Status: concrete design for the next development track; not a claim that connectors are implemented or accounts are connected.
Owner direction: André approved the launch workflow and selected YouTube, Facebook, Instagram, LinkedIn, X and Pinterest. TikTok is excluded.
Repository baseline: main 496e826cd130994a362c76305890fc49f5dd70bf.

## Intended outcome

An operator agrees with Atlas which social channels belong to each Omnira project. Atlas prepares a launch package, the operator connects real accounts and reviews exact content, and governed workers publish only to those approved destinations. Site and social content share approved project facts and brand assets. After social launch, return to builder polish and verify Atlas execution end to end.

## Owner decisions and defaults

- Supported channel catalogue: youtube, facebook, instagram, linkedin, x, pinterest.
- Pinterest's initial project is Familje-Stunden. Do not assign it automatically to other projects. A later explicit operator decision can change the plan.
- LinkedIn is primarily for Handlarbörsen; use a company Page as the initial target, not the operator's personal profile.
- Other channel assignments are chosen per project with Atlas. No requirement that every project use every channel.
- Names are display labels, never authorization. Resolve existing project UUIDs through authorized project access.
- A proposed channel, a verified account connection and permission to publish are separate facts.
- A channel selection never creates an account, grants authority, changes credentials or dispatches publishing.
- Keep project budgets unchanged. No paid model/image/video tests, credit purchases, new subscriptions or budget increases.
- Existing Lumvy preview and its approved three-page plan are preserved.

## Repository facts verified

- lib/media/social-bindings.ts supports instagram/facebook/youtube and immutable verified project/account bindings.
- SettingsSurface and lib/os/settings.ts already display project-scoped account and credential health metadata without exposing secrets.
- Instagram/Facebook credentials use the existing operator/project-gated token route. YouTube has project OAuth start/callback routes.
- Existing Instagram/Facebook publishers are video oriented; arbitrary text, image, carousel and Pin support must not be inferred from them.
- lib/media/social-destination.ts restricts existing machine publishers to the platform social project ai-media-automation.
- run_media_step in app/api/chat/route.ts operates that existing pipeline, requires operator capability and explicit publish confirmation. It is not a generic per-project launcher.
- The media-generation mission capability remains unlicensed; creating channel plans does not activate it.
- No LinkedIn, X or Pinterest connector was found in this baseline.

## Architecture decision

Use direct provider adapters behind the existing identity/credential and governed execution boundaries. Avoid adding a paid cross-posting service by default. Build in three independently testable increments:
1. Project channel plan, actual readiness and Atlas planning tools.
2. Real account connections for the selected providers.
3. Exact content review, scheduling and provider-specific publishing.

A paid aggregator is an optional later tradeoff, not a dependency or an authorized purchase. Browser automation that stores social passwords/cookies is not the connection strategy.

### 1. Project channel plan

Persist an owned, versioned channel plan. It records project, channel choices, purpose, target account kind, intended format, cadence and operator decisions. It contains no credentials and cannot represent a connected account. Atlas can read and propose revisions; operator UI decisions bind the exact saved revision.

The panel displays:
- Not selected / Planned / Needs connection / Verified at <time> / Needs renewal / Needs provider approval / Unavailable / Could not read.
- Selected account label and project from verified binding metadata only.
- Separate connection and publication readiness; a healthy credential does not imply publishing authority.
- No model call is needed to save choices, show guides, refresh local metadata or schedule already-approved content.

### 2. Account connections

Extend the canonical binding/credential vocabulary only when the adapter is implemented and tested. Do not append three names to existing types and claim working connectors. Audit all SQL check constraints, token schemas, health/audit schemas and switch statements before expanding the set.

Every connection:
- Uses authenticated operator and owned project checks, state/PKCE where applicable, bounded callback lifetime and replay protection.
- Verifies provider identity and required capabilities before recording a binding.
- Uses the existing one-project-per-external-account invariant. Account changes supersede bindings explicitly.
- Stores credentials through server-only storage; no tokens in model context, URL query logs, client read models or chat.
- Validates identity again before publication. Failed verification is not an empty or healthy account.
- Exposes missing app configuration or review requirements honestly. Do not ask for secrets in Atlas chat.
- Does not publish merely because OAuth succeeded.

Provider targets:
| Channel | Initial destination | Delivery needed |
| --- | --- | --- |
| YouTube | Project channel | Reuse OAuth/identity code; validate channel and upload scope; respect upload quota/audit visibility. |
| Facebook | Project Page | Reuse canonical project binding; add approved text/link/image formats alongside existing video path. |
| Instagram | Professional account | Reuse binding and credential checks; add reviewed image/carousel formats as needed. |
| LinkedIn | Handlarbörsen company Page first | New OAuth adapter, organization identity and actual posting permission; app product access required. |
| X | Selected project account | New user-context OAuth adapter; verify applicable API pricing and approved spend cap before paid calls. |
| Pinterest | Familje-Stunden account and board first | New OAuth adapter, account/board ownership checks and access-tier readiness; Trial writes are private sandbox entities. |

### 3. Content and publication

Reuse approved project brand/content facts, existing images and reviewed templates first. Separate content preparation, quality review and publishing duties; an agent cannot approve its own post. Generated media remains a separate governed spend operation.

Review binds exact text, media hashes, destination binding/version, project and schedule. A changed account, caption, image, project, schedule or plan invalidates the relevant approval. Initial mode is per-content review; standing publication authority is a later explicit policy, never inferred from developing this feature.

Use existing durable runs and stop/cost preflight. Each channel has an independent delivery record and provider receipt. A retry reconciles ambiguous outcomes before another write, so success on one channel cannot cause duplicate posting there when another channel fails. Stop/pause applies before every outbound write, including subsequent channels.

Do not remove PLATFORM_SOCIAL_PROJECT_SLUG restrictions as a shortcut. Add an explicit project/destination-scoped publication authority path; The Prompt keeps its existing behavior.

## Cost design

- Current 100 SEK/month budget belongs to the website project, not automatically to the older media pipeline or every social project.
- Establish a verified per-project spend policy before connecting paid generation/API operations.
- Reuse approved assets and batch content planning. Adapt text/format per channel rather than paying for a new image per destination.
- Deterministic scheduling/dispatch of existing content requires no model invocation; hosting/API charges are still accounted for.
- No automatic model retry loops, silent provider fallback, credit purchases or changed budget caps.
- X is planned but paid calls remain disabled until its applicable price and hard limit are verified. No numeric price is assumed here.
- YouTube/Pinterest/LinkedIn provider approval is distinct from André's approval of development. Missing external access is shown as a setup requirement.

## Verification and delivery

No live social posts or paid generation tests during implementation. Provider fixtures verify OAuth/callback errors, account mismatch, revoked access, duplicate delivery, cross-project attempts, rate limiting, stale approvals, concurrent changes, stop-before-send and partial multi-channel success.

Browser tests cover mobile project/channel selection, truthful unreadable/setup states, exact content review and retained drafts. SQL/RLS tests prove project isolation, immutable identity, revision conflicts and server-only credential access. Run shared-DB suites sequentially.

For each increment: relevant tests, independent review, CI on exact head, merge locked to that head, production READY and alias verification. Activation is separate from deployment and requires actual authorized provider access; publishing is not inferred from a successful deploy.

## Next track after social launch

Polish the builder experience and verify Atlas can carry out the agreed workflow: brief → approved plan → approved mockup → build → review → approved launch content → governed publish. Record actual run/preview/post receipts and cost; never report technical availability as completed execution.

## Sources checked 2026-10-16

- Meta official Instagram collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- YouTube upload/OAuth: https://developers.google.com/youtube/data/guides/uploading_a_video
- LinkedIn Posts API and permissions: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- LinkedIn organization authorization: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-authorizations/getting-started
- Pinterest access tiers: https://developers.pinterest.com/docs/key-concepts/access-tiers/
- Pinterest OAuth: https://developers.pinterest.com/docs/getting-started/connect-app/
- Pinterest boards/Pins: https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/
- X post endpoint: https://docs.x.com/x-api/posts/create-post
- X documentation index: https://docs.x.com/llms.txt

X numeric API pricing could not be verified from the accessible official pricing pages. Resolve it against the applicable developer account before any paid activation.
