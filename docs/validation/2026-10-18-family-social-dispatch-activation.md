# Familje-Stunden dispatch activation: source-only ledger reconciliation

The production rebuild that enables the owner-approved Familje-Stunden schedule was blocked by the normal migration guard: `sales_reply_sending` was already applied in production but absent from main's canonical source set.

This change imports only the exact already-applied SQL file, updates the enforced set counts from 145/131 to 146/132, and adds a regression case. It does not apply SQL, alter migration history, import the sales application feature, or change the frozen 14-entry grandfathered and 30-entry legacy lists. No override is used.

Verified source: PR #386 snapshot `1b31d1fe23d8e9e36edaeda4b593bd5f044960c7`, file `apps/web/supabase/migrations/20261018074615_sales_reply_sending.sql`.

Verified production ledger: version `20261018074615`, name `sales_reply_sending`, one statement, 25,411 UTF-8 bytes. Source and applied SQL SHA-256 both equal `80158d54a4cc5d7f15901f0ed8e67dc7fa04a8738054e14fb1c7be1cf484e49e`.

Validation:

- Before import, the regression failed with the exact unknown production-ledger name; the other 31 guard tests passed.
- After import and explicit fixture/count reconciliation, all 32 migration guard tests passed.
- The actual read-only production guard passed without an override: 132/132 enforced migrations, 169 unique known ledger names, no unknown or duplicate names.
- The imported Git blob is checked against the production SQL hash before commit.

The social content was approved by the owner after reviewing the final current-character images and captions. Native approval created batch `72ebfb22-537a-4fcc-bcf0-691f7449f3b4`, revision `e1fa082b-2d06-4bb5-8cc6-eda5d60bfc13`, manifest SHA-256 `056e7d2e404a4061e90bc332511cd2e3bb0d68ccb88d7b0a10c25d9224db302e`.

The four queued items are Facebook and Instagram for 20 October 2026 at 17:00 and 23 October 2026 at 20:30, Europe/Stockholm. All retain the exact approved revisions, media, account bindings and times. Production dispatch configuration authorizes only project `77cda551-57c9-4dc0-b019-1bb6438777f7`. Runtime activation verification follows the corrected deployment; no immediate publication is requested.
