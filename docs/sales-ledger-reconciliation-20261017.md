# Reconcile already-applied sales schema, 2026-10-17

Main at f6f016c could not pass the read-only Vercel Migration Guard because production already contained `atlas_sales_pilot`, while its source lived only in draft PR #386. PR #388 and other independent previews were blocked.

This source-only reconciliation extracts the canonical migration and its policy/test/security inventory changes from frozen sales commit `08b3e0c544fabb5009e501d2527fc9ae10297489`. It does not merge sales application code, alter that branch, apply SQL, rewrite the production ledger or enable a feature.

Read-only production evidence from project `iboepohjwrhtgshrqaol`:

- Ledger: 153 entries, sales name `atlas_sales_pilot`, version `20261017130254`, one statement containing the original SQL.
- SQL SHA256: `7ea3de34909ac582d2534b291b448fb9ba3781c196167c0475fc4e1f2c301ca9`, identical to the 37,464 source bytes extracted with `git show`.
- Seven sales tables: RLS on, six with one owner-rooted authenticated SELECT policy, worker registrations server-only. Anon SELECT and authenticated writes denied; service SELECT permitted. FORCE RLS is not asserted for these sales tables.
- All 27 sales routines: SECURITY INVOKER, empty search_path, anon/authenticated EXECUTE denied, service EXECUTE allowed.
- Handlarborsen candidate inbox absent. Candidate inbox flag absent from Vercel env metadata. No production writes were performed by this reconciliation.

Policy stays v2, exact canonical/enforced counts advance from 129/115 to 130/116. No grandfathering, overrides or unknown-name exceptions were added. Synthetic missing, duplicate and unknown ledger names remain rejected. The digest regression pins the already-deployed SQL, normalizing only checkout CRLF.

Validation: 238/238 targeted tests across four suites pass (guard, statement security gate, schema security and reconciliation). TypeScript and remote CI/Preview are separate release gates, recorded in the PR after completion. The original failing preview is `dpl_7dAFXyxbBXXPMW9Ydy5A4PdV5ok8` (unknown sales migration).

After this merges, independently developed branches should merge main normally. The inbox schema install and production feature activation still require a separate operator approval and protected Preview verification. Oscar's account and permissions are unchanged.
