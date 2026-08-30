-- ─────────────────────────────────────────────────────────────────────────────
--  PR9f — authorization is required exactly when the CLASS says it is.
--
--  ── WHY THIS MIGRATION EXISTS ──────────────────────────────────────────────
--  PR9c's binding CHECK requires `authorization_id IS NOT NULL` for every bound
--  action. That was right when every bindable action was write-capable. It is
--  wrong now: ACTION_CLASS_POLICY.READ_ONLY.requiresAuthorization is false, so a
--  scheduler-created observation has no authorization to name — and the only way
--  to satisfy the old CHECK would be to FABRICATE one. An invented authorization
--  is far worse than a nullable column: it would be indistinguishable in the
--  ledger from a human decision.
--
--  ── THIS IS NARROWER, NOT WEAKER ───────────────────────────────────────────
--  For every write-capable class the requirement is completely unchanged —
--  REVERSIBLE_WRITE, MATERIAL_WRITE, FINANCIAL, EXTERNAL_COMMUNICATION and
--  DESTRUCTIVE all still demand a non-null authorization_id. The CHECK now
--  simply states the rule the policy table already stated: authorization is
--  required exactly when the class requires it. A NULL authorization_id becomes
--  PROOF that the row is READ_ONLY, which is a stronger invariant than before.
--
--  The nine other binding columns keep their all-or-nothing rule untouched, so
--  partial binding is still impossible and the 1251 legacy runs are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.runs drop constraint if exists runs_action_binding_complete;
alter table public.runs add constraint runs_action_binding_complete check (
  -- A legacy run: nothing bound.
  (workflow_instance_id is null and workflow_def_hash is null and workflow_from_state is null
   and action_kind is null and action_class is null and target_version_hash is null
   and authorization_id is null and idempotency_key is null and attempt_group is null
   and authorized_at is null)
  or
  -- A bound action: the nine identity columns are always present, and the
  -- authorization is present unless the class is one that needs none.
  (workflow_instance_id is not null and workflow_def_hash is not null and workflow_from_state is not null
   and action_kind is not null and action_class is not null and target_version_hash is not null
   and idempotency_key is not null and attempt_group is not null and authorized_at is not null
   and (action_class = 'READ_ONLY' or authorization_id is not null))
);

comment on constraint runs_action_binding_complete on public.runs is
  'PR9c/PR9f: a run is either fully unbound (legacy) or fully bound. authorization_id is required for every class EXCEPT READ_ONLY, which needs none — so a null authorization_id is proof the action is READ_ONLY.';

-- The inverse, stated separately so it cannot be lost in the big disjunction:
-- only a READ_ONLY action may omit its authorization.
alter table public.runs drop constraint if exists runs_unauthorized_action_is_read_only;
alter table public.runs add constraint runs_unauthorized_action_is_read_only check (
  workflow_instance_id is null
  or authorization_id is not null
  or action_class = 'READ_ONLY'
);
