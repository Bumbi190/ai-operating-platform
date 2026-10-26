# Calendar workflow link

Continue the approved personal/Atlas planning feature. Link an Atlas work block to an existing Familje-Stunden monthly-release instance in its own project, then read its real status. No new instance, wake time, transition, approval, provider action or publication is created. The canonical product definition is currently a draft planning process, and the UI must disclose that limit.

## Approach

Extend the existing draft with optional `workflowInstanceId`. Reuse versioned, idempotent calendar writes. Validate kind=work_block, responsibility=atlas_planned, explicit project and UUID in both parsers. A separate row trigger calls a narrowly scoped private, read-only definer helper to check session owner/project/instance membership. This helper needs privileged lookup because browser roles cannot read the workflow table; it grants no workflow capability. Read projections recheck the allowed project scope and project equality independently. Missing/unreadable links are orange, never a fallback green from manual status.

Use the existing project-scoped workflow reader once per week to supply both selectable instances and linked snapshots, including instances with no wake time. Only the product monthly-release key is selectable; capability-test definitions are not product choices. Match vendored definition hash/version before interpreting a gate. A complete instance is labelled “Flödet avslutat”, not proof of content production. Active draft definitions show “Planeringsflöde”; unknown definitions/states remain orange. An abandoned flow stays neutral. Calendar cancellation wins over workflow display. A linked block's manual workStatus cannot override its source snapshot.

## Scope

Project changes, responsibility=self and conversion to private clear the link. Recurring edits continue to apply to the series, with the same explicit warning. Existing drafts stay valid. Workflow read failure clears choices and makes linked status unavailable; private calendar data remains usable. This increment prepares the connection; actual production handlers and an authorized start contract are future work, as the inspected scheduler evaluates only.

## Verification

Failing parser/projection tests first; browser create/reload/unlink and failure states; isolated full-history SQL tests for same-project success, foreign/project/proof-instance rejection, direct-write bypass, unchanged wake/status/version/transition counts, and private/helper ACLs. No hosted mutation or deployment.
