# Atlas brief and mockup approval

## Outcome
Atlas and the operator agree the website purpose, audience, pages, visual direction and features before construction. The saved proposal displays three real rendered layout mockups. The operator explicitly approves one; only then can the existing plan approval start the ordinary governed website queue. The immutable selected draft is a design reference for all approved pages.

## Constraints
- Preserve existing approved plans, live previews and recovery lineage. Lumvy remains three pages; no new run or recovery activation for it.
- No live paid model/image tests, credit top-ups or budget changes. Project budget remains100 SEK/month. Mockup layout creation, viewing and selection use no model calls.
- Work only in the owned Hultgren worktree; base605cc176dcdd60cae0c45b90947c84ce279b5d8a. Reuse existing auth, project ownership, lifecycle, stop, claim, budget and queue boundaries.
- Existing user authorization covers implementation, review, merge and production publication; do not introduce repeated authorizations for these steps.

## Design
The existing plan content is the agreed brief. Planning guidance must clarify missing facts instead of inventing proof or simplifying approved page count. Three deterministic responsive static-website.v1 drafts are derived from the saved content and its visual direction: editorial, image-led and structured. Each shows a homepage layout plus the complete agreed page list. They are explicitly visual proposals, not working previews or completed pages. The same strict compiler validates each.

Mockups are immutable database records bound to project, plan revision, source plan digest and SHA256 of exact canonical draft bytes. Private API endpoints provide owner-scoped compiled artifacts. No external images, SVG or model-written JavaScript are enabled. Optional image placeholders remain clearly identifiable until actual assets exist. This stage does not activate a paid image provider.

A new revision requires design review; existing revisions are grandfathered without rewriting them. An operator-only same-origin endpoint records an exact mockup approval. A model tool can read/prepare proposals but cannot approve. The selected design can change before plan approval; after plan approval it is locked and edits require a new revision. SQL enforces this independently of the client. A new revision invalidates prior design selection.

Plan-decision insertion pins the design decision. Session insertion snapshots its exact draft and digest. Writer acquisition rejects old workers that cannot consume design references before model dispatch. The normal worker validates the reference and passes its CSS/HTML as subordinate design guidance alongside the full approved brief and page list. No fallback strips the reference. Existing no-paid recovery fencing remains intact.

The plan card contains proposal thumbnails and a full-width responsive comparison view. On mobile it uses the existing Preview tab; project controls remain collapsed and chat drafts persist. Approving a mockup returns a durable receipt; the existing Godkänn och bygg action is enabled only afterward. Typed plan approval follows the same database gate.

UI UX Pro Max is added as pinned, reviewed knowledge-only material with upstream license and hashes. It is discoverable through existing skill tools; do not inject every new document into every build. Selected mockup tokens carry concise visual guidance to conserve prompt budget.

## Verification
Pure renderer/contract tests, real local SQL ownership/staleness/hash/idempotency/gate tests, worker reference propagation and old-worker fencing, and mobile/desktop browser approval flows. Providers remain fixtures. Exact-head CI, independent whole-branch review, locked-head merge, READY deployment and domain aliases; fresh project cost read before final report.
