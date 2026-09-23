# Mission Risk & Authority Levels

**Status:** Canonical v0.2 (Phase 0 — classification scheme, not implemented; nothing here grants autonomy) · revised 2026-09-23

**v0.2 correction:** clarified that a Work Package's `authority` reference
(MISSION-CONTRACT.md §3/§5) is required at **every** level below, including
Level 0/1 — a risk level only ever changes whether an *additional* standing
human-approval gate is required on top of that authority, never whether
authority itself is required. Also disambiguated against a third existing
scale, `MissionRecord.risks` (see §0).

## 0. Read this before using "Level 0/1/2/3" anywhere near this codebase

**This is the second, unrelated risk/autonomy vocabulary already in this
codebase, not the first.** There are now three, and none of them may be
compared or merged:

Omnira already has a **different, canonical, locked** autonomy vocabulary:
**Chapter 18 — Autonomy Licensing Model** (`docs/architecture/executive-intelligence/atlas-knowledge/v1.0/package/01_Canonical_Knowledge/Chapters/chapter-18-autonomy-licensing-model.md`,
§18.10), which defines **L0–L6** (Observe, Recommend, Prepare, Execute
Internally, External Low-Risk, Conditional Business Autonomy, Full Strategic
Autonomy). It licenses how much a **production workflow** may do **without
per-action approval** — content publishing, spend, customer replies, and so
on. §18.13 (L2 — Prepare) even lists "Prepare code change" as an example
action a licensed workflow may take.

**The Mission Risk Levels below are a different axis, deliberately not
named `L0`–`L3`, and never abbreviated that way:**

| | Chapter 18 Autonomy Licensing (L0–L6) | Mission Risk Level 0–3 (this document) |
|---|---|---|
| Governs | How much a *production workflow* may do without asking each time | How much oversight a *coding-worker mission* needs before its PR may be promoted |
| Subject | An operating workflow instance, already running in Omnira | A single, bounded, time-boxed code-delegation mission |
| Granted by | An autonomy license (§18.2), issued by an authorized decision-maker | A mission's declared `riskLevel` field (MISSION-CONTRACT.md), checked against this table |
| Existing implementation | Not implemented in code yet (per `lib/atlas/authorization/types.ts`'s own exclusion note) | Not implemented yet — Phase 0 is documentation only |

A mission that produces a low-risk code change (Mission Risk Level 1) could
still, once merged and deployed, become part of a workflow that itself
someday needs an L4 autonomy license to publish its output. **The two
numbers are unrelated and must never be compared or added.** If both
vocabularies are ever visible in the same UI or log line, always qualify
which one: "Mission Risk Level 1" vs. "Autonomy License L4", never bare
"Level 1" / "L4".

**The third existing scale: `MissionRecord.risks`.** Chapter 20's
`MissionRecord` (`lib/atlas/mission/types.ts`) already carries `risks:
MissionRisk[]` — a list of named risks, each with its own `severity: 'low' |
'medium' | 'high'`. This is neither of the above: it is a per-risk
assessment on the governing Mission itself (e.g. "vendor API may rate-limit
— medium"), not a single overall tier for a Work Package's promotion
oversight. **Mission Risk Level 0–3 may be *informed by* a Work Package's
inherited `MissionRisk[]` entries (a Work Package descending from a Mission
with a `high`-severity risk should rarely be Level 0), but it is not derived
from them mechanically, does not replace them, and must never be printed as
if it were the same field.** Three scales, three names, always spelled out
in full: "Autonomy License L4", "Mission Risk Level 1", "Mission risk
`high`".

## 1. The four Mission Risk Levels

**Read before the table below: at every level, `authority` (MISSION-CONTRACT.md
§3/§5 — a live reference into an existing `AuthorizationStatus` grant /
`MissionAuthorityRecord`) is required and non-null. A risk level never
decides *whether* a Work Package has authority — only whether an
*additional*, standing human-approval gate (`humanApprovalRequired`) sits on
top of that authority before promotion. Capability is never authority, at
any level, including Level 0.**

### Mission Risk Level 0 — Mechanical

Very low-risk, mechanical work with no behavioral ambiguity:

- Formatting
- Typos
- Documentation
- Lint fixes
- Trivial test updates (e.g. updating a snapshot to match an already-reviewed
  behavior change)

**Target policy (not implemented):** may eventually auto-merge after
deterministic gates alone (EVALUATION-GATES.md §1) — no independent review,
no *additional* human-approval gate. `authority` is still required and
non-null (§1 above) — Level 0 narrows the review bar, never the requirement
that a live grant already exists. The Work Package still runs inside SDF-1A's
capability/path boundary; "low risk" narrows the review bar, not the
containment.

### Mission Risk Level 1 — Normal software development

Ordinary application work with a clear, testable scope:

- UI components
- Ordinary backend changes
- Contained refactors
- Bug fixes

**Target policy (not implemented):** may eventually merge automatically
after required deterministic checks **and** independent review **and**
evaluation (EVALUATION-GATES.md) — no *additional* standing human-approval
gate by default, unless the specific Work Package's `humanApprovalRequired`
says otherwise. `authority` is still required and non-null regardless.

### Mission Risk Level 2 — Sensitive implementation

Work that touches a boundary this codebase already treats as
security/governance-sensitive:

- Database migrations
- Auth
- Memory (`lib/atlas/memory/*`, `lib/atlas/knowledge/*`)
- Agent/governance runtime (`lib/governance/*`, `lib/atlas/authorization/*`,
  `lib/atlas/code-work/*` itself)
- Third-party integrations
- Architecture changes

**Target policy (not implemented):** a worker may implement, test, and fully
prepare the change — reaching `ready_for_human_review` — but
`humanApprovalRequired` is `true`: an **additional** standing human-approval
gate sits on top of the `authority` reference every level already requires,
before sensitive deployment/promotion. SDF-1B2's operator plane is the
concrete precedent for exactly this pattern: full worker preparation, human
grant/deny at the boundary via the existing `AuthorizationStatus` flow.

### Mission Risk Level 3 — Human-authority operations

Irreversible, financial, or canonical-authority-changing operations:

- Spending money
- Production credentials
- Destructive production operations
- Trading risk
- Changing canonical governance
- Changing authority policy
- Changing canonical trading strategy/risk
- Irreversible production actions

**Target policy (not implemented):** a worker may research, plan, implement,
and test where applicable — but **may never autonomously authorize the final
real-world action**. This mirrors the existing, already-enforced rule for
trading (`omnira-governance-hard-gate-audit`: exactly one pre-spend gate call
site) and for Anthropic spend (`lib/ai/anthropic.ts`'s pre-request
reservation, which still requires the calling code path to be authorized
before it can reserve at all).

## 2. Machine-readable-friendly shape (documentation only in Phase 0)

```ts
type MissionRiskLevel = 0 | 1 | 2 | 3

interface RiskLevelPolicy {
  level: MissionRiskLevel
  label: 'mechanical' | 'normal_development' | 'sensitive_implementation' | 'human_authority'
  requiredChecks: 'deterministic_gates_only' | 'deterministic_gates_plus_review'
  independentReviewRequired: boolean
  // `authority` is NOT a field here — it is not something a risk level can turn
  // on or off. It is required unconditionally by MISSION-CONTRACT.md §5 before
  // a Work Package may exist at all. `humanApprovalRequired` (matching
  // MISSION-CONTRACT.md's `requiredReview.humanApprovalRequired`) only ever
  // governs the ADDITIONAL gate on top of that already-required authority.
  humanApprovalRequired: boolean
  mayAutoMerge: boolean // always false today; Phase 0 defines the field, not the automation
}
```

No table implementing `RiskLevelPolicy` exists yet. When one is built, it
belongs beside `lib/atlas/code-work/policy.ts`, not as a new standalone
module — risk-level policy is admission policy, and SDF-1A already owns
admission policy for code work.

## 3. Explicit non-grant

Nothing in this document grants any mission any autonomy. A Work Package's
declared `riskLevel` is a *classification*, checked by policy that does not
exist yet. Until that policy exists, every Work Package — regardless of
declared level — requires the same explicit human review SDF-1B2 already
enforces, in addition to (never instead of) a live `authority` reference.

This is the same rule stated in README.md §2 and MISSION-CONTRACT.md §0/§5,
applied here specifically to risk level: **capability ≠ authority.** A
worker capable of producing a correct, low-risk patch (Level 0) is not
thereby authorized to have it merged — `authority` (a real
`MissionAuthorityRecord` / `AuthorizationStatus` grant) must already exist,
for every Work Package, at every level, before translation into
`CodeWorkAdmissionV1` even begins. What changes level to level is only
whether *another* human has to look at it *again* on top of that.
