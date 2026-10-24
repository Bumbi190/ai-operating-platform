# Calendar production preview

Continue the approved calendar/Atlas plan with a reviewable, read-only production summary in the existing event panel. Existing execution approvals are purpose-scoped and cannot safely be created from arbitrary HTTP targets. This increment therefore exposes no grant or start action.

Approach: use the existing calendar access resolver and owner project scope, recheck project ownership, read the linked instance constrained to that project, and match its definition to the vendored v2 story contract. Alternatives were a separate release page (breaks calendar context) or a combined generic approval/start endpoint (cannot reuse the existing purpose-bound authorization creation safely). The existing panel is the implementation choice.

For a saved Atlas work block with a trusted flow link, “Granska produktionsjobb” opens month, theme, language, audience, page split, current state and current evidence checks. Show an explicit unknown cost and required execution approval/budget controls, never “ready” or a fabricated price. Invalid/old definitions show an actionable contract explanation, without upgrading instances. The calendar time remains the planned work time; this view creates no execution or publication schedule.

Only session-authenticated GET is supported. Unknown fields, duplicate parameters, foreign projects/instances and failed ownership checks fail closed. Responses are private/no-store and omit raw evidence details, credentials and authorization payloads. UI fetch is cancelable, scoped by saved project/instance, and hidden on unsaved link changes. No new dependencies or schema migrations.

Verification: unit tests for canonical summaries, completion/evidence integrity and scoped access; route tests for session/scope/parameter failures; browser tests for mobile rendering, failure/retry and request ordering. No hosted or paid execution.
