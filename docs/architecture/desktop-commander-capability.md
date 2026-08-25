# Desktop Commander — Capability Definition, Security Model & Integration Boundary

**Status:** Phase 0 — declared, unlicensed, wired to nothing
**Date:** 2026-08-25
**Owner:** André Hultgren
**Autonomy level (Ch18.10):** `L0 — Observe` · **License status (Ch18.49):** `draft` · **Autonomous execution:** `false`
**Decision record:** [`decisions/adr-desktop-commander-capability.md`](../../decisions/adr-desktop-commander-capability.md)
**Machine-readable declaration:** [`apps/web/lib/atlas/capability/desktop-commander.ts`](../../apps/web/lib/atlas/capability/desktop-commander.ts)
**Guard:** [`apps/web/lib/qa/desktop-commander-unlicensed.test.ts`](../../apps/web/lib/qa/desktop-commander-unlicensed.test.ts)

> **Phase 0 grants nothing.** This document exists so that Desktop Commander is not
> forgotten while the rest of Omnira is built, and so that when it *is* connected, the
> boundary was designed before the capability arrived rather than after. Nothing here
> authorizes an execution. No code in this repository can reach Desktop Commander.

---

## 1. What Desktop Commander is, in Omnira's vocabulary

Desktop Commander is an **execution capability**: a host-side runtime that reads and
writes files, runs shell commands, manages long-lived processes, and searches and edits
code on the machine it runs on.

In Omnira's terms it is a **tool**, reached at the end of the authority chain — never a
participant in deciding what should happen:

```
Atlas
 ├── Executive Intelligence      judgment          (Ch2)   — NOT Desktop Commander
 ├── Memory                      experience        (Ch22)  — NOT Desktop Commander
 ├── Intelligence Graph          structure                 — NOT Desktop Commander
 │
 └── Delegation Layer            bounded authority (Ch21)
      └── Agent (Manager)
           └── Mission tool bound + availability proof      ← the gate that already exists
                ├── Web Search / Browser / APIs / GitHub / Image Generation
                └── desktop.commander                       ← declared here, unlicensed
                     └── isolated local execution           ← NOT BUILT (prerequisite)
```

**Canonical identifier:** `desktop.commander`, in the `desktop.*` namespace the tool-registry
design (`MARK_XXXIX_TOOL_ARCHITECTURE_AUDIT.md` §11) reserves for host-side runtimes. That
design's own phasing places a `desktop-agent` runtime at **registry v1.3** — after the
policy/capability layer (v1.1) and dynamic runtime registration (v1.2). Desktop Commander
inherits that position; it does not jump the queue.

### 1.1 Responsibilities it may eventually hold

Processing, not deciding. Transforming bytes it was given, inside a scope it was granted:

- process retrieved information into structured artifacts
- run approved scripts and tools
- manage files inside one project's granted workspace
- transform data; local analysis; media processing (image, PDF, audio)
- build, validation and QA tasks
- release packaging

### 1.2 Responsibilities it may never hold

These are boundaries between systems, not risk ratings. No autonomy level and no approval
moves them, because each names a different chapter's territory:

| Never | Because |
|---|---|
| Atlas Memory | Ch22 — Memory preserves experience. A file is not a memory, and a filesystem is not a memory store. |
| Executive Intelligence | Ch2 — judgment is EI's. Desktop Commander transforms bytes and never interprets them. |
| Intelligence Graph | Structure is derived from evidence, not from whatever a script happened to write. |
| Delegation | Ch21 — delegation *cuts* authority. An executor that could delegate could widen its own. |
| Project authorization | Ch6 — project scope is resolved and authorized *before* any tool is reached. |
| Web/research retrieval | Ch23 — retrieval belongs to the Knowledge/Research layer (see §7). |
| Autonomy licensing | §18.2 — "Executive Intelligence may not grant itself higher autonomy." A capability that can widen its own license has no license. |

---

## 2. MCP verification record

Verified **2026-08-25**, **read-only**. No configuration was changed, no directory was
broadened, no blocked command was removed, no credential or unrelated personal file was
inspected.

| Property | Verified value |
|---|---|
| Connected to this Claude Code environment | **Yes**, as a plugin-provided MCP server |
| Server identity | `@wonderwhy-er/desktop-commander` **v0.2.47** |
| Tools exposed | **26** (see §2.1) |
| `defaultShell` | `/bin/zsh` |
| `allowedDirectories` | **`[]` — empty** |
| `blockedCommands` | 33 entries (`sudo`, `su`, `dd`, `mkfs`, `shutdown`, `reg`, `takeown`, …) |
| `telemetryEnabled` | **`true`** |
| `fileReadLineLimit` / `fileWriteLineLimit` | 1000 / 50 |
| Container / VM | **None** — `isContainer: false`, `isDocker: false`; running directly on the host macOS user account |

### 2.1 Tool surface

- **Filesystem (9):** `read_file`, `read_multiple_files`, `write_file`, `write_pdf`, `create_directory`, `list_directory`, `move_file`, `get_file_info`, `edit_block`
- **Terminal & process (7):** `start_process`, `interact_with_process`, `read_process_output`, `force_terminate`, `list_sessions`, `list_processes`, `kill_process`
- **Search (4):** `start_search`, `get_more_search_results`, `stop_search`, `list_searches`
- **Configuration (2):** `get_config`, **`set_config_value`**
- **Telemetry / meta (4):** `get_usage_stats`, `get_recent_tool_calls`, `get_prompts`, `give_feedback_to_desktop_commander`

`read_file` also accepts URLs, so the tool surface includes **outbound network fetch**.

### 2.2 Successful installation is not evidence of safe configuration

Three verified facts make the installed instance **more** permissive than its defaults suggest:

1. **`allowedDirectories: []` means unrestricted, not restricted.** Its own source
   (`isPathAllowed`) returns `true` for every path when the list is empty, and its own
   config UI labels this state "All folders allowed (no restriction)". The empty list
   reads like a safe default and is the opposite of one.
2. **`set_config_value` is exposed to the model.** The configuration that defines the
   restrictions is editable by the same agent the restrictions apply to. Upstream's
   guidance is to change configuration in a *separate* chat window for exactly this reason.
3. **Telemetry is on.** Usage information leaves the machine by default.

---

## 3. Security model — the load-bearing finding

> **Desktop Commander's `allowedDirectories` and `blockedCommands` are not a security
> boundary, and Omnira must never treat them as one.**

This is not an inference. Upstream states it directly: directory restrictions and command
blocking "can be bypassed through various methods including symlinks, command substitution,
and absolute paths or code execution", and `allowedDirectories` "only restricts filesystem
operations, not terminal commands." Reading the shipped code confirms both:

- the terminal handlers **never consult `allowedDirectories`** — path validation exists only
  on the filesystem tools;
- `validateCommand` matches a **basename against a deny-list**, so `python3 -c …`,
  `bash -c …`, a copied binary, or any interpreter reaches everything the deny-list names.

A deny-list over an interpreter is a speed bump, not a boundary.

### 3.1 The classification that follows

**Desktop Commander running on the host is a privileged capability equivalent to shell
access as the founder's user account.** Its blast radius is every file that user can read
or write — every Omnira project, every other project on the machine, SSH keys, browser
profiles, cloud credentials, and the Claude configuration that defines the agent's own
permissions.

Genuine containment requires **OS-level isolation** — a container or VM — which upstream
also states. Phase 0 records that requirement; it does not build it.

---

## 4. Threat model

Mapped to the canonical Ch17 Damage Boundary harm categories. "Phase" is when the control
must exist — not when it would be nice to have.

| # | Risk | Harm category (Ch17 §17.7) | Control | Phase |
|---|---|---|---|---|
| T1 | **Host filesystem exposure** — unrestricted read/write across the whole user account | Security · Data & Privacy | OS-level isolation; per-project workspace mounts; read-only by default with explicit write mounts | Prerequisite |
| T2 | **Shell execution beyond the path restriction** — terminal ignores `allowedDirectories` | Security | Treat terminal as unbounded; contain at the OS, never at the tool's config | Prerequisite |
| T3 | **Command-filter bypass** — basename deny-list defeated by interpreters and absolute paths | Security (§17.36 malicious code execution) | Allow-list of approved scripts/tools; never a deny-list | Prerequisite |
| T4 | **Prompt injection via retrieved content** — a fetched page or file instructs the agent, and the agent holds a shell | Security · Systemic | Retrieval and execution are separate capabilities (§7); retrieved bytes are data; no execution path derives its command from fetched content | Design (now) |
| T5 | **Cross-project data leakage** — `familje-stunden` reaching `the-prompt` files | Systemic & Cross-Project (§6.2) | `lib/atlas/isolation.ts` allow-list resolved *before* the tool; filesystem scope derived from `project_id`, never from a caller argument | Partly shipped |
| T6 | **Secret & credential exfiltration** — `.env`, tokens, SSH and cloud keys are ordinary files | Security (§17.37–§17.39) | Secrets never on a mounted path; scope credentials by project/tool/action/duration/actor (§17.38); rotate on suspicion (§17.39) | Prerequisite |
| T7 | **Network exfiltration** — `read_file` fetches URLs; shell has full egress | Security · Data & Privacy | Network policy on the execution environment; egress deny-by-default | Prerequisite |
| T8 | **Tool-config modification** — `set_config_value` lets the agent widen its own restrictions | Security (privilege escalation) | Configuration outside the execution environment and not model-reachable; config changes are a human act | Prerequisite |
| T9 | **Destructive filesystem operations** — overwrite, move, delete | Operational · Economic | Ephemeral environments; snapshot/rollback; approval gate for irreversible acts (Ch27) | Prerequisite |
| T10 | **Privilege escalation** — reaching credentials or config that widen later runs | Security | Scoped execution identity; no ambient founder identity; least privilege by construction | Prerequisite |
| T11 | **Persistence** — a background process, cron entry or shell profile edit surviving the task | Security · Operational | Ephemeral execution; process reaping; timeout and resource limits | Prerequisite |
| T12 | **Unauditable action** — no record of what ran | Trust (Ch26) | Every invocation auditable: capability, project, mission, envelope, command, result | Prerequisite |
| T13 | **Telemetry leakage** — usage data leaving by default | Data & Privacy | Decide telemetry posture explicitly before any Omnira use | Phase 1 |
| T14 | **Capability mistaken for permission** — "it's installed, so it may" | Trust · Systemic | §18.6; license status `draft`; the guard test | **Controlled now** |

### 4.1 Isolation requirements to evaluate before any license above L0

Recorded as requirements. **Phase 0 implements none of them.**

Container isolation · VM isolation where the workload warrants it · process isolation ·
dedicated workspace mounts · project-scoped filesystem mounts · read-only mounts by default ·
explicit write mounts · ephemeral execution environments · egress network policy · secret
isolation · credential isolation · audit logging · human approval gates · capability leases
(time-bounded, revocable) · scoped execution identity · timeout and resource limits.

---

## 5. Where Desktop Commander fits — and what Omnira already has

The audit finding that shaped this phase: **Omnira does not need a new capability broker.**
The gates already exist, and they are better than a new layer would be because they are
already tested and already fail closed.

| Concern | Existing canonical system | Verdict |
|---|---|---|
| "May this agent reach this tool?" | `DelegationEnvelope.tools` + `attenuate.ts` (§6.39: narrow, never widen) | **Reuse.** §21.13 already states a tool bound is "the MAXIMUM a Manager could ever reach, never a grant that it may reach it" — exactly Desktop Commander's required semantics. |
| "Is the tool actually usable?" | `MissionCapabilityAvailability` (`lib/atlas/mission/capability.ts`) | **Reuse.** Its production default `unprovenAvailability` already fails closed; a mission stops at Approved rather than becoming Ready. |
| "Which projects may this see?" | `lib/atlas/isolation.ts` — `getAllowedProjectIds`, `assertProjectAllowed`, `IMPOSSIBLE_PROJECT_ID` | **Reuse.** Empty allow-list yields zero rows, never an unscoped query. |
| "How does a Manager refuse?" | `DelegationRejectionReason` — includes **`tool_unavailable`** | **Reuse.** The typed refusal for an unreachable tool already exists. |
| "What authority level applies?" | Ch18.10 `L0…L6` + Ch18.49 license statuses | **Reuse.** No new lifecycle enum. |
| "Which project mode is live?" | `lib/atlas/lifecycle.ts` — `atlas_mode` | **Reuse.** `isExecutable()` already gates execution to `active` projects. |
| "What may be read?" | `lib/atlas/data-registry.ts` | **Precedent** for how a scoped resource registry is written here. |
| Runtime tool registry | **Does not exist yet** — designed in `MARK_XXXIX_TOOL_ARCHITECTURE_AUDIT.md` §11 (v1.0–v1.3) | **Do not build in Phase 0.** Desktop Commander lands at v1.3. |

### 5.1 Capability scope — reusing canonical identifiers

The scope concept a future execution grant needs, expressed in identifiers Omnira **already
has**, so no second project-identity system is introduced:

| Scope field | Canonical source | Status |
|---|---|---|
| `project_id` | `projects.id`, resolved via `lib/atlas/isolation.ts` | Exists |
| `agent_id` | `agents` table / `DelegationRole` | Exists |
| `delegation_id` | `DelegationEnvelope.envelopeId` | Exists |
| `mission_id` + `missionVersion` | `MissionId`, mission lineage | Exists |
| `capability_id` | `MissionToolBound.tool` = `desktop.commander` | Declared here |
| `approval_level` | Ch18.10 autonomy level + Ch27 Approval Inbox | Exists |
| `audit_context` | Decision Ledger / Ch26 transparency | Exists |
| `execution_id` | — | **New in a later phase.** One id per isolated run; the only genuinely new identifier. |
| `filesystem_scope` · `network_scope` · `command_scope` · `secret_scope` | — | **New in a later phase**, as properties of the execution environment — not of Omnira's identity model. |

The split matters: everything about *who is asking* already exists and must be reused;
only *what the sandbox permits* is new, and it belongs to the sandbox.

---

## 6. Project isolation

Ch6.2: "no project should accidentally inherit the data, permissions, memory, strategy, or
authority of another project." Ch6.3: isolation "must be a property of the system", intact
"even when a model reasons incorrectly."

A future `familje-stunden` agent must not reach `the-prompt` files, and vice versa. Given
the §3 finding, that guarantee **cannot** be delivered by Desktop Commander's
`allowedDirectories`. It must be delivered by the execution environment: one project, one
mount, resolved from the authorized `project_id` before the environment starts — never
from a path the model supplies.

The ordering is the invariant: **authorize the project, derive the mount, then start the
environment.** A path argument checked after the fact is the weak model Ch6.3 rejects.

---

## 7. Boundary with Research / Web Intelligence

Desktop Commander is **not** Omnira's research layer, and must not become it.

| Web / Research capability | Desktop Commander |
|---|---|
| Search, browse, retrieve sources | Process what was retrieved |
| RSS / API ingestion | Transform, convert, extract |
| Competitor and news discovery | Run approved scripts and tools |
| Produces **raw information** (Ch23.9) | Produces **artifacts** from it |

Ch23.2 is the governing line: "Knowledge provides evidence about reality. Knowledge does not
create authority over reality." Retrieval brings in bytes; execution acts on them; neither
is permitted to become the other. Keeping them as separate capabilities is also control
**T4**: when the fetcher and the shell are one capability, a malicious page is one step from
a command. When they are two, retrieved content is data that crossed a boundary.

A research agent may eventually hold **both**, and that is the point of granting them
separately:

```
Atlas → Research delegation → Research Agent
          ├── Web Search / Browser      retrieve
          └── desktop.commander         process (isolated, scoped)
                    ↓
              structured evidence → Intelligence Graph / Memory / Executive Intelligence
```

---

## 8. Integration lifecycle

Omnira **already has** a canonical lifecycle, so Phase 0 does not introduce
`experimental → sandboxed → delegated → production`. That ladder maps onto the canonical
model as follows, and the canonical names are the ones used everywhere:

| Informal name | Canonical Omnira state |
|---|---|
| experimental | License status **`draft`** (Ch18.50 — "grants no authority") at **L0 — Observe** |
| sandboxed | License **`proposed`** / **`approved`**, scoped to an isolated environment, at **L3 — Execute Internally** |
| delegated | License **`active`** but **`restricted`** (Ch18.54), reached only through a Delegation Envelope |
| production | License **`active`**, still project-, action-, time- and budget-scoped — never global (§18.3) |

**Phase 0 state:** `draft` · `L0` · `autonomous_execution = false`.

Two canonical rules constrain everything above: §18.2 — Executive Intelligence "may not
grant itself higher autonomy"; §18.6 — "Capability must never be interpreted as permission."
A license is issued by a person, is time-scoped, and is revocable (§18.57).

---

## 9. Hard blockers before any autonomous use

Autonomous Desktop Commander execution is **blocked** until every one of these exists. Each
names a real system, so the list can be checked rather than believed:

| # | Prerequisite | Today |
|---|---|---|
| P1 | Project isolation | `lib/atlas/isolation.ts` shipped; leak-test harness (PR-0) still outstanding |
| P2 | Delegation Layer | Envelope V1 + attenuation shipped; one hop (Manager) only |
| P3 | Capability authorization / availability proof | Seam shipped; production default is `unproven` — a real proof does not exist |
| P4 | **Execution isolation (container/VM)** | **Does not exist. The single largest blocker.** |
| P5 | Scoped execution identity | Does not exist |
| P6 | Audit trail for invocations | Ledger patterns exist; tool-invocation audit does not |
| P7 | Approval policy (Ch27) | Approvals surface exists; per-action gate for execution does not |
| P8 | Secret isolation (§17.38) | Not designed for host execution |
| P9 | Failure / timeout / resource handling | Does not exist |

**P4 is the gate.** Without OS-level isolation, every other control is advisory, because
§3 shows the tool's own restrictions can be walked around from inside a shell.

---

## 10. How this could later serve the projects

Recorded as direction. None of it is authorized, and none of it is built.

Project modes below are the values set by migration `20260623_150000_atlas_project_lifecycle.sql` (The Prompt/`ai-media-automation` → `active`, `familje-stunden` → `observer`, `gainpilot` → `hibernate`). The **live** `projects.atlas_mode` governs at run time; a mode change is a precondition to re-check, not a detail.

### The Prompt (`atlas_mode: active`)
Local research processing · news-collection pipeline support · source processing ·
browser/research support · scripts · media processing · file management · QA ·
publication-support workflows.

Ch30 names The Prompt as Omnira's "first autonomy proving ground", so it is the natural
first candidate — *after* P1–P9, and starting at **L3 (internal, reversible)**. Publication
remains a separate authority: §18.8's own example delegates "prepare and manage the pipeline"
while still forbidding publication.

### Familje-Stunden (`atlas_mode: observer`)
Monthly production workflows · asset organization · story-production pipeline support ·
image processing · PDF generation and validation · audio/MP3 processing · file QA ·
release packaging · market and competitor research support.

Two constraints bind harder here. `observer` mode means `isExecutable()` is **false** —
analysis only, no execution surface — so Familje-Stunden cannot be the first integration
without a deliberate mode change. And Ch17 §17.25 (child-related harm) applies to its
content, which raises the approval bar rather than lowering it for "routine" media work.

---

## 11. What Phase 0 deliberately did not build

Named so a later reader does not mistake absence for oversight:

- no sandbox, container or VM
- no MCP client, no invocation path, no connection of any kind
- no tool registry or capability broker (Omnira has no runtime registry yet; building one to
  hold a single unlicensed entry would be Phase 1 work mislabelled)
- no second project-identity system
- no new lifecycle enum
- no database migration
- no autonomous execution, no Atlas shell access
- no browser crawler, competitor monitoring or news monitoring
- no Familje-Stunden or The Prompt automation
- no agent orchestration, no Delegation Layer expansion
- no UI changes, no secrets, no deployment

**Phase 0's entire deliverable is a boundary that nothing crosses, written down where it can
be checked.**
