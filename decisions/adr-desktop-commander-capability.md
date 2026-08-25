# ADR — Desktop Commander as a Declared, Unlicensed Local-Execution Capability

**Status:** Accepted · governs all Desktop Commander integration work
**Date:** 2026-08-25
**Owner:** André Hultgren
**Phase:** Desktop Commander Phase 0 — architecture only; no capability granted
**Authoritative spec:** [`docs/architecture/desktop-commander-capability.md`](../docs/architecture/desktop-commander-capability.md)
**Canonical authorities relied on:** Executive Intelligence Canonical v1.0 — Ch6 (Project Isolation), Ch17 (Damage Boundary), Ch18 (Autonomy Licensing), Ch20 (Mission Briefs), Ch21 (Delegation), Ch23 (Knowledge Integration), Ch27 (Approval Inbox)
**Supersedes:** nothing. Desktop Commander had no prior architectural position in this repository.

---

## 1. Context

Desktop Commander is installed and connected to the founder's Claude Code environment as an
MCP server. It is being evaluated as a future **local execution capability** for Atlas and
delegated Omnira agents — local research processing for The Prompt, media and release
pipelines for Familje-Stunden, and scoped file and script work generally.

Three facts make an architectural decision necessary **now**, before any integration:

1. **It is already reachable from a Claude environment.** The gap between "installed" and
   "wired into Omnira" is one import. Absent a written boundary, that import is a plausible
   future convenience.
2. **Its own restrictions are not a security boundary.** Verified read-only on 2026-08-25
   (v0.2.47): upstream states directory restrictions and command blocking "can be bypassed
   … including symlinks, command substitution, and absolute paths or code execution", and
   that `allowedDirectories` "only restricts filesystem operations, not terminal commands."
   The shipped code confirms it — terminal handlers never consult the allow-list, and the
   command filter is a basename deny-list that any interpreter walks around. The installed
   instance additionally has `allowedDirectories: []`, which its own source treats as
   **unrestricted**, on the host with no container.
3. **Omnira's authority architecture already exists** — Delegation Envelope V1, the mission
   capability-availability seam, the project-isolation boundary, and the canonical Ch18
   autonomy model. A capability introduced without reference to them would either duplicate
   them or bypass them.

Omnira is simultaneously moving toward strict project isolation. A capability that can read
the whole host is precisely the thing that would silently undo it.

## 2. Decision

1. **Desktop Commander is classified as a privileged local-execution capability**, canonical
   identifier **`desktop.commander`**, in the `desktop.*` namespace. Its trust level is
   *equivalent to shell access as the founder's user account* — not the lower level its
   `allowedDirectories`/`blockedCommands` settings suggest.
2. **Phase 0 grants nothing.** License status **`draft`** (Ch18.49/§18.50 — "grants no
   authority"), autonomy level **`L0 — Observe`** (Ch18.10), `autonomous_execution = false`.
   No code in this repository may reach it, and a guard test enforces that.
3. **No new capability broker.** The Delegation Envelope's tool bound (§21.13 — "the MAXIMUM
   a Manager could ever reach, never a grant that it may reach it") together with
   `MissionCapabilityAvailability` (which already fails closed) **is** the gate. A second
   gate beside them would be a second place to get it wrong.
4. **No second project-identity system.** Scope reuses `project_id` (via
   `lib/atlas/isolation.ts`), `agent_id`, `envelopeId`, `missionId`+`version`, the Ch18
   autonomy level and the existing audit context. Only `execution_id` and the sandbox's own
   scopes (filesystem/network/command/secret) are new, and they belong to the execution
   environment rather than to Omnira's identity model.
5. **No new lifecycle enum.** The informal `experimental → sandboxed → delegated →
   production` ladder maps onto the canonical Ch18 license statuses and L0–L6 levels; the
   canonical names are the ones used.
6. **Retrieval and execution stay separate capabilities.** Desktop Commander never owns
   search, browsing or ingestion (Ch23). A research agent may hold both, granted separately.
7. **Containment is an OS-level property.** Any license above L0 requires container or VM
   isolation. Desktop Commander's own configuration is never accepted as the boundary.

## 3. Authority & precedence rules

- **Capability is not permission** (§18.6). That Desktop Commander is installed, connected
  and functional creates no authority to use it. That it is *convenient* creates none either.
- **A license is issued, never assumed** (§18.2). Executive Intelligence may recommend
  higher autonomy; it may not grant it. No file in this repository can issue the license.
- **Isolation survives bad reasoning** (Ch6.3). The boundary must hold when a model reasons
  incorrectly or is manipulated by retrieved content — so it cannot be a prompt instruction,
  a path argument checked after the fact, or a tool setting the agent itself can edit.
- **When this ADR and the code disagree with the canonical chapters, the chapters win**, and
  the disagreement is logged as work rather than resolved by reinterpretation.
- **Order of operations is load-bearing:** authorize the project → derive the mount →
  start the isolated environment → execute. Any design that checks scope after execution
  begins is rejected regardless of how well it tests.

## 4. Consequences

**Accepted:**

- Desktop Commander stays unreachable from Omnira until P1–P9 (spec §9) exist. The largest
  blocker — **P4, OS-level execution isolation** — does not exist today and is not scheduled
  in Phase 0 or Phase 1.
- Near-term local automation for The Prompt and Familje-Stunden remains manual or
  operator-driven. This is a deliberate cost, paid to keep project isolation provable.
- Familje-Stunden cannot be the first integration while its `atlas_mode` is `observer`
  (`isExecutable()` is false); Ch30 makes The Prompt the natural proving ground, at L3.

**Gained:**

- A capability that would otherwise have been wired in by convenience now has a written
  trust level, a threat model, and a checked guard.
- The eventual integration point is fixed: **tool-registry v1.3**, behind the policy layer
  (v1.1) and dynamic runtime registration (v1.2) — not ahead of them.

**Explicitly out of scope for Phase 0:** sandbox implementation, MCP client, tool registry,
database migration, autonomous execution, project automation, UI, secrets, deployment.

## 5. Review

This ADR is revisited when **P4 (execution isolation)** is designed, or earlier if Desktop
Commander's security model materially changes upstream. Until then the Phase 0 state is
enforced by [`apps/web/lib/qa/desktop-commander-unlicensed.test.ts`](../apps/web/lib/qa/desktop-commander-unlicensed.test.ts),
which fails if the license status, the autonomy level, the refusal, or the "wired to nothing"
property is reversed.
