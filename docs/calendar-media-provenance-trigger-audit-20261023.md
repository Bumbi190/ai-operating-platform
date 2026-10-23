# Media provenance and review-evidence trigger audit

23 October 2026. PR #504 is DRAFT. All new source files in this work are test-only.

The isolated PostgreSQL replay revealed six triggers, not just the four
media-news triggers initially expected. Two are older asset-provenance
protections: one refuses overwrites, and one refuses deleting provenance
while the asset remains present, while allowing parent asset deletion.
The four newer triggers reserve a provider-admission identity on insert,
validate the immutable review evidence on insert, and block subsequent
update/delete/truncate of the saved evidence.

The new catalog audit covers six trigger definitions and five underlying
callback function bodies. It checks trigger attachment and timing, enabled
state, callback owner and execution mode, relevant SQL conditions, and
SHA-256 change-detection fingerprints measured from the owned PostgreSQL
replay. Three new media guards must deny PUBLIC/anon/authenticated/scoped
worker EXECUTE. The two legacy asset-provenance callbacks were created
without an empty search_path; their historical ACLs are not assumed to
match the newer guard functions. They are source-pinned, but their
permission hardening needs a separate independent review.

This is static/source-backed auditing rather than a proof that a
media or Meta publication receipt was obtained. No production
database, platform key, public route or social account was modified.
The canonical replay still uses fake provider interaction; the
publication-dispatch outcome remains independently protected from
automatic retry. Do not merge the draft as a deployable feature.

Remaining risks: hosted legacy ACL comparison, transitive calls from
the provenance and news snapshot guards, historical media migration
reconciliation, provider-authenticated Meta receipts and independent
publishing broker validation.

## Isolated proof, October 23

The closed PostgreSQL/PostgREST cross-tree replay loaded the test-only
media-review evidence migration and returned six active provenance
triggers covering five distinct callback bodies. Both previously
existing asset_provenance triggers were included in the measured
inventory. The callback definitions and trigger descriptions were
pinned to the actual isolated PostgreSQL catalog hashes. A second
replay with those source/trigger pins enforced reported
`CROSS-TREE MEDIA PROVENANCE TRIGGER PASS`, preserving all previous
calendar worker and media-news validation gates.

Five native Node tests passed for the isolated trigger inventory,
including deliberate in-memory mutation of timing, source, callback,
privilege and append-only checks. The two older asset callback
functions have unreviewed historical direct EXECUTE ACLs; they are
not claimed to be as hardened as the new three news-specific guard
functions. No hosted ACL/grant migration or live Meta request was run.

This is a code/configuration-change detector, not complete assurance
of every dynamic dependency or cryptographic provider outcome.
