# Atlas workflow catalog P1 — read-only

This is a **discovery projection**, not a new automation engine or deployment.

- Reads from `ACTION_REGISTRY` and `ACTION_CLASS_POLICY` at call time.
- Derives governed-effect eligibility from the existing allowlist.
- Marks operational status `not_verified`: declared/executor-eligible is not deployed, enabled, authorized or live.
- Does not import n8n, use credentials, call providers, inspect runtime state, dispatch, or write to a database.
- Does not modify the canonical registry, policy, definitions, schedulers, gates or UI.

Future phases can expose the catalog via a separately authorized read-only Atlas
tool, and later add project-scoped health checks. Neither is part of P1.

Safety: this does not solve n8n's repeated-dispatch / exactly-once problem.
External writes must remain behind existing gates and must not be enabled by
catalog membership alone.
