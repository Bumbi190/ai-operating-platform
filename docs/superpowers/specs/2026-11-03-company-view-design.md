# Handlarbörsen: read-only Företag view

## Intent and authority

André wants an internal Omnira menu to find car dealers by area, see previous contact immediately, and inspect website evidence. Continue the existing Harvey work in Draft PR #386. The accepted product direction is reuse of discovery/SCB and the contact journal. Technical decisions below are the assistant's implementation choices under the owner's autonomous development standard, not additional commercial decisions.

## Approaches

1. **Extend the existing project tools (chosen direction):** one owner-only Företag page, using current Sales contact/history readers, SCB archive and bounded public discovery adapter. Preserves project identity, historical decisions and source provenance.
2. Separate CRM/search store: rejected because duplicate contact truth and stale exclusions undermine the purpose.
3. Replace search with a paid Maps/AI service: deferred; requires source, cost and coverage decisions and is unnecessary for this increment.

## Scope

- `/projects/handlarborsen/companies`, linked in the active project's sidebar and Lead Finder. Preserve the existing Lead Finder route and Sales workspace.
- Search saved company/contact records by name, branch, email, orgnr and area. Missing area remains unknown; never infer it from a name or legal number.
- Separate manual public search for Bilhandlare in the six already configured discovery cities. Existing query bounds: radius 1–25 km, at most 25 source results. Reuse only an already configured provider; no fallback, new subscription, key, flag or paid call during development.
- Public search is ephemeral: no batch, candidate, contact or history write. No save/promote/review controls. Explicit submit, no mount fetch, retry, polling or background job.
- Source results are leads for inspection, not verified dealers or permission to contact. Existing adapter can omit duplicates by email/domain; disclose that it is a bounded selection, never all dealers or a company census. Do not join contact history by domain or automatically merge corporate identities.
- Server projection reads contacts with stable ID pagination (500 per page, 10,000 safety cap plus sentinel); incomplete/failed pagination never becomes a complete baseline. Timing reads are pure read RPCs, batched at 200 IDs. **Do not use sales_read_workspace: it calls sales_reconcile_expired and can mutate jobs.**
- SCB saved candidates and research archive use existing gated owner readers and preserve their incomplete/disabled states. Their current caps and old snapshots are disclosed, not described as live coverage.

## Data and identity

Every row retains its source identity. Contact IDs, SCB orgnr records and provider source IDs are not silently merged by names or domains. Exact normalized email can attach a possible prior address history to a public result, but must be labelled an address match rather than verified company identity. Name-only matches are warnings without imported event history. Multiple contacts sharing an address remain separate identity records; summary unique-address counts use a set. Registered-account snapshot matches remain prevention-only and dated; a nonmatch is unknown.

History uses only the current revision referenced by timing. Match contact version and history revision before displaying dates. Canonical event counts deduplicate connected event/provider IDs and explicitly reviewed duplicates, so one message with several IDs counts once. Never count failed-before-send as sent; receipt of a letter is not automatically pilot interest. Accepted means transport acceptance, not final delivery. Open/click must never become a reply. Missing provider-level delivered/complaint/open/click evidence stays unknown.

Known unsubscribe, hard/temporary bounce and company-verification blocks remain intact. A generic suppression flag is labelled Kontaktspärr, not falsely called an unsubscribe. Read-only display cannot clear a block. Kareby, Newman, Moberg, EVExperten and Solsta decisions remain visible as dated handoff context; newer mail requires actual review and does not automatically erase that context.

## Screen

Use existing Omnira dark surface, cyan accent, restrained borders and accessible text. Compact header, source-health strip, name/area/status filters and results with contact badge in each row. Responsive cards rather than a wide table on mobile. Details expand inline to show recipient, branch, provenance, observed messages, last outbound/inbound, review note, coverage gaps and the earliest review floor when present. Label the floor as a review date, never booked or approved sending. External links pass the current public URL validator, use noreferrer and never execute fetched HTML.

Status badges are independent: Contacted / History unknown / No contact found in available evidence, plus Contact block / Excluded / Possible match / Registered snapshot / Incoming letter needs review. Unknown history never renders as Not contacted. Saved and fresh-search sections show separate counts and provenance.

## Boundaries

Owner authorization and exact Handlarbörsen project ID must precede every protected read and every provider invocation. Ordinary RLS contact reads; service-only timing RPC only after the same verified principal/project scope. Private no-store responses. No source credentials or complete raw workspace objects in browser props. Deny other projects, collaborators, missing sessions and malformed/duplicate query parameters.

No mail, schedule, approval, contact edits, worker changes, policy changes, timing changes, main merge, production schema apply or production activation. Existing pilot promises remain 6/12 months; first recruitment stop at 10 is unaffected. Webbuilder stays review drafts. Media pricing, 3D, billing and autonomous campaigns are separate work.

## Acceptance and verification

1. Auth/project/feature failures cannot invoke a reader or provider; endpoint permits read GET and ephemeral search POST only.
2. Complete 501+ contacts are paginated and represented without a 500-row truncation; repeated IDs, malformed/cross-project rows, cap and read failure mark the source unavailable/incomplete.
3. Case-insensitive duplicate recipients count once; shared domains and similar names never merge identity or outbound histories.
4. Provider-ID aliases and reviewed duplicates count one message; failed-before-send and incoming/open/click are not outbound acceptance.
5. Missing/stale/version-mismatched history, unavailable mailbox and stale registration snapshots never produce contact readiness. No control grants readiness.
6. Name/area/status filters work, empty/error states are explicit, unsafe URLs cannot become links; desktop/mobile browser checks cover actual interactions and no unintended writes.
7. Only synthetic provider/mail data in automated tests. No real source queries, email changes or secret output. Report focused test/type/browser results and any broader-suite limitations honestly.

## Repository preflight

Read-only preflight HB-COMPANY-VIEW-20261103 found 123 open PRs and returned review_required based on metadata similarity to competitor-history PR #306. Manual file inspection places that work under project analytics; this increment belongs to existing Harvey Sales/discovery Draft PR #386, head 1d15d8d. Reuse the clean detached continuation worktree hb-sales-slim-20261029 and normal fast-forward push to the same PR branch only after verifying remote head. Do not alter the original branch worktree, other branches or PRs.

## Deferred

Live account-registry synchronization, full mailbox/provider reconciliation inside the app, wider geographic sources, persistent new-candidate selection and website fetching/AI analysis need separate implementation. This view exposes existing evidence and safe links; it does not claim those integrations are complete.

## Resolved review details

Public search centre/radius is search-area provenance, never inferred company city. Recipient stop and bounce/unsubscribe state feed a structured blocked flag. A bounded no-match state requires a current attested empty history, all three fresh complete channels and zero timing blockers; the rest remain unknown. One independent builder check had no unresolved decisions.
