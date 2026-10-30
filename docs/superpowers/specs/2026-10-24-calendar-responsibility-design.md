# Calendar planning responsibility

Continue the user's approved calendar plan: reserve personal work time now and plan work for Atlas as flows become available. A manual work block stores optional `responsibility: 'self' | 'atlas_planned'`. Missing means self, preserving existing events. Private appointments cannot carry this field. This is planning metadata, never execution permission, a worker claim, or proof of execution.

## Approach

Extend the existing validated draft JSON and owner-scoped, versioned, idempotent calendar CRUD. This avoids a second assignment store and preserves the existing conflict handling. A separate assignment RPC/table would duplicate ownership and version rules; encoding responsibility in notes would lose validation. Implementation choice: extend the draft. No queue writes or new grants. Existing recurring edits affect the series, explicitly stated in the editor.

## Behavior and boundaries

Work blocks show Du or Atlas – planerat. The editor explains that Atlas work does not start automatically. Existing workflow entries still show Atlas-flöde. A planned Atlas work block remains blue until its manual work status changes; selecting Atlas never changes completion. Existing personal appointments remain compatible. Switching back to private removes planning responsibility. Deploy the validator migration before the UI. Hosted deployment remains blocked by the previously documented migration baseline; local evidence must not be described as deployed functionality.

## Validation

Parser tests cover both values, old drafts, private/invalid values and unknown execution fields. Browser tests create, reload, edit, switch kind and inspect persisted responsibility. Isolated PostgreSQL checks cover old drafts, persisted metadata, invalid direct writes, cross-owner rejection, idempotency and version conflict using the existing calendar RPC.
