# Context Routing

**Status:** Canonical v0.1 (Phase 0 — routing design, not implemented)

## 1. Principle

A coding worker must never receive the entire Omnira repository, history, or
Knowledge Vault by default. Context is loaded progressively, only as far as
the mission actually needs.

```
mission → determine relevant subsystem → load minimum context → expand only when needed
```

This is not a new memory system. It is a routing layer in front of systems
that already exist:

- **Atlas Memory** — `apps/web/lib/atlas/memory/{flags,recall-memories,record-event}.ts`,
  `apps/web/lib/atlas/intelligence/memory-context.ts`,
  `apps/web/lib/atlas/action-memory.ts`.
- **Atlas Knowledge Provider** — `apps/web/lib/atlas/knowledge/{document,policy,rank,types,vault-provider,vault-walk}.ts`
  and `projection/*` (canonical-json, canonical-path, eligibility, secret-scan,
  snapshot, source, report) — read-only by construction, zero production
  consumers by design as of its Phase 1 merge.
- **Canonical docs** (`docs/`, `decisions/`) — the domain-owned README
  convention ("Läs detta först" / "read this first"), already written with
  Claude/Codex/Atlas as an explicit intended reader.

## 2. Known current limitation — verify before assuming rich recall

As of the last checkpoint, **Atlas Memory (M4) is largely starved**: very few
events recorded, and the Minne UI surface reads a store with zero rows in it
(three memory stores currently coexist without full reconciliation). A
Context Router built today must **not assume memory recall will return
anything useful** and must fail gracefully to L0/L1 context (below) when it
doesn't. Re-verify actual event counts before relying on this document's
snapshot — it decays fast.

## 3. Progressive levels

### L0 — Minimal system/repository abstract

- Repository identity, canonical branch, current `HEAD` SHA.
- The domain's top-level `README.md` if the mission's `scope`/`repository`
  maps to a documented domain (e.g. `docs/trading-system/README.md`).
- Nothing project- or file-specific yet.

### L1 — Subsystem/project overview

- The relevant subsystem's own docs, if one exists under `docs/architecture/*`
  or a domain `docs/<domain>/README.md`.
- `contextReferences.docRefs` from the Mission Contract, resolved to files.
- A directory listing (not full contents) of `allowedPaths` from the Mission
  Contract.

### L2 — Task-specific files, decisions, tests, and details

- Full contents of files inside the mission's `allowedPaths`.
- Related test files for those paths.
- Specific ADRs (`decisions/adr-*.md`) that govern the touched area, if any.
- Knowledge Provider documents matched by `contextReferences.knowledgeRefs`,
  passed through its existing secret-scan/eligibility projection — a Context
  Router must never bypass that projection to read Knowledge Vault content
  directly.
- Memory events matched by `contextReferences.memoryRefs`, if any exist
  (see §2 — treat absence as the expected case, not an error).

## 4. Routing rule

```
Load L0 always.
Load L1 for the mission's declared subsystem only.
Load L2 only for paths inside allowedPaths, and only the specific
  Knowledge/Memory references the Mission Contract names — never
  a keyword search across the whole vault.
Expand to a wider L2 set only if a deterministic gate or the independent
  reviewer reports a failure that names a file outside the current set —
  never speculatively.
```

Expansion is logged as an evidence receipt-shaped event (see
EVALUATION-GATES.md), the same way SDF-1A already treats every input as
something that must be provable after the fact, not just used silently.

## 5. Non-goals for this document

- Does not create a new memory or knowledge store.
- Does not change what the Knowledge Provider's projection allows through.
- Does not implement the loader described above — this is the target shape
  for the next implementable slice (PHASE-0.md §4).
