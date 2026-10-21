# Omnira Collaborator – Handlarbörsen workflow delegation v0

## Goal

The Owner and Collaborator use the same Omnira organization shell and Project Command Center. The Collaborator can read all approved project information, but all projects outside the canonical Handlarbörsen project remain observation-only. Existing Owner project and Atlas execution authorization stays unchanged.

## Authorized server operations

On exactly the Handlarbörsen project (both `project_id` and `slug` match the verified registry identity), an active Collaborator can:

1. **GET** the bounded public metadata list of the project's workflows.
2. **POST** a new *inactive*, manual workflow shell with `steps=[]`, `trigger='manual'`, `cron_expr=null`, and `active=false`. Only a bounded `name` and optional `description` are accepted.
3. **PATCH** an existing workflow's `name` or `description` only. Its UUID and verified project ID are both predicates on the UPDATE.

The server derives the actor from `auth.getUser()`, resolves active organization membership, scopes allowed project IDs to the verified organization Owner, and enforces the canonical Handlarbörsen project identity. Same-origin JSON is required for every mutating request. Every response is private/no-store. Service-role is used only after those checks; ordinary collaborator project RLS is **not** widened.

## Never delegated in this phase

No POST/PATCH/DELETE on another project; no execution, enable/disable, cron, triggers, steps, secrets, keys, credentials, spending, billing, deployment, role management, approvals, code execution or workflow deletion. No broad legacy `/api/projects` access. A future live workflow execution path must independently enforce existing human approval, budget and executor gates rather than treating this restricted metadata API as execution authority.

The UI renders the existing Owner Command Center in read-only mode, with a Handlarbörsen-specific metadata editor outside the disabled controls. A UI-visible button is not permission; server authorization is required for each operation. Existing owner page routes and models remain unchanged.

## Validation and rollout

Run the focused organization route, middleware, permission, shared Command Center and write-runtime suites, plus TypeScript and GitHub CI. No production access or extra roles should be enabled by this change until required checks and a real collaborator-session test pass. A successful POST must not be reported as failed simply because a subsequent list refresh fails. Avoid storing tokens or confidential configuration in workflow descriptions.
