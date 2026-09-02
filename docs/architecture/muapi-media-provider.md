# MuAPI → Omnira Media Provider

**Status:** bootstrap. The provider layer is built and wired; execution is
disabled and no workflow can generate media.

---

## Why this integration exists

Omnira already generates media, but it does so by naming vendors. `lib/media/
ideogram.ts` builds an Ideogram request body and reads `IDEOGRAM_API_KEY` at four
separate call sites; `lib/media/elevenlabs.ts` does the same for voice. That
shape works for one vendor and becomes a migration every time a second one
arrives.

MuAPI is that second vendor — one key in front of ~765 endpoints spanning
text-to-image, image-to-video, video editing, lipsync, audio and 3D — and
Higgsfield and OpenArt are already named as the third and fourth. So the vendor
seam was written **once, before the first adapter**, rather than extracted later
from three copies of a `fetch` call.

### The target architecture

```
Atlas
  → Media Orchestrator      (NOT BUILT — needs a QC loop and a spend policy)
    → Provider Router       lib/media/providers/router.ts
      → MediaProvider       lib/media/providers/types.ts
        → MuAPI adapter     lib/media/providers/muapi.ts
```

Only the bottom three layers exist. The Media Orchestrator is deliberately
absent: it needs a quality-control pass and a spend policy that Omnira has not
designed yet, and a stub orchestrator would become the thing everyone codes
against before it had either.

**Nothing above the router names a vendor.** Callers ask for a capability
(`requireProviderFor('generateVideo')`), never for MuAPI. Adding Higgsfield is a
registry entry in `router.ts` and no change upstream.

---

## Claude Code MCP vs. the Omnira runtime

These are two unrelated paths to the same vendor, and conflating them is the
easiest mistake to make here.

|                | Claude Code MCP                     | Omnira runtime                     |
| -------------- | ----------------------------------- | ---------------------------------- |
| What it is     | `muapi mcp serve` over local stdio  | Direct HTTPS to `api.muapi.ai`     |
| Who uses it    | A developer, in an editor           | Omnira's Next.js server            |
| Credential     | The developer's macOS keychain      | `MUAPI_*_API_KEY` env vars         |
| Scope          | One machine                         | Every deployed environment         |
| Governed by    | Nothing in this repository          | `gate.ts` + the capability license |

The MCP is a **development tool**. It is registered in the developer's local
Claude Code config (never in a repo `.mcp.json`), it uses a credential stored in
the keychain by `muapi auth configure`, and it has no relationship to Omnira's
runtime whatsoever.

The consequence worth stating plainly: **an MCP that is connected in an editor
says nothing about whether Omnira can generate media.** They share a vendor and
nothing else.

---

## Test vs. production

MuAPI has a genuine sandbox. Keys created with `is_test: true` return mock
outputs and are **never billed** — which makes test mode the only configuration
in which an unattended mistake is free. That is the property the whole mode
system is built around.

| Mode         | Outbound calls | Credential read      | Billed |
| ------------ | -------------- | -------------------- | ------ |
| `disabled`   | none at all    | none                 | no     |
| `test`       | permitted      | `MUAPI_TEST_API_KEY` | no     |
| `production` | refused¹       | `MUAPI_PROD_API_KEY` | yes    |

¹ Refused until `MUAPI_PRODUCTION_ENABLED=1` is set **in addition to**
`MUAPI_MODE=production`.

### The rules the code enforces

1. **Production is never entered by the environment alone.** `resolveMuapiMode()`
   reads `MUAPI_MODE` and nothing else. The presence of a production key is not
   an input to mode selection — "a prod key is set, so we must mean production"
   is exactly how a sandbox integration starts billing.
2. **No credential fallback between modes.** Test mode cannot reach the
   production key and production mode cannot fall back to the test key. A mode
   without its own credential is a refusal, never a downgrade.
3. **Two switches for production.** `MUAPI_MODE=production` alone does nothing;
   `MUAPI_PRODUCTION_ENABLED=1` is required as well. One switch is one typo.
4. **A refused production is not silently downgraded to test.** The mode still
   reads `production` so an operator sees what they chose and why it is blocked.
5. **Typos degrade toward the harmless state.** An unrecognised `MUAPI_MODE`
   resolves to `test`, never to `production`.
6. **`disabled` means disabled.** Not just generation — polling, model listing
   and health checks are refused too. A "read-only calls are surely fine"
   carve-out is how a disabled integration acquires a live network path.

---

## Security rules

- **No key in the repository.** Not in source, not in `.mcp.json`, not in docs,
  not in commits, not in logs. `lib/qa/muapi-media-provider.test.ts` scans for
  this and fails the build.
- **`.env*` is blanket-ignored**, which is why the config template is tracked as
  `docs/architecture/muapi-media-provider.env.example` rather than `.env.example`.
  Its two key lines are asserted empty by a test.
- **Credentials never leave `config.ts`.** `resolveMuapiConfig()` returns
  `hasCredential: boolean`; the key itself is reachable only through
  `resolveMuapiCredential()`, which the adapter calls at the moment it builds a
  request header. Status surfaces get a boolean, never a value to print.
- **Redaction happens in the error constructor**, not at the log call. This is
  the lesson from the Meta incident recorded in `lib/media/meta-errors.ts`: a
  token reached the logs because every log site assumed the message was already
  safe. `MediaProviderError` redacts in its constructor, so anything that
  catches it and prints `err.message` is safe without knowing it needs to be.
  Redaction has three layers: header/parameter forms, Meta's existing literals,
  and the live credential matched exactly as a backstop.
- **Error messages carry route templates, not URLs.** No query string can ride a
  credential into a log line.

---

## What is disabled right now

Two independent gates, and **both** must pass before an agent can generate
anything. Neither substitutes for the other.

**1. The provider execution gate** — `lib/media/providers/gate.ts`
Governs whether an outbound HTTP call may happen at all. Default: `disabled`.

**2. The capability license** — `lib/atlas/capability/media-generation.ts`
Governs whether a *mission* may declare media generation among its tools.
Declared and deliberately unlicensed, following the same pattern as
`desktop-commander.ts`:

- license status `draft` (§18.50 — "A Draft license is incomplete. It grants no
  authority")
- autonomy level `L0` — Observe
- `MEDIA_GENERATION_AUTONOMOUS_EXECUTION = false`
- `mediaGenerationAvailability` refuses every mission — **including when MuAPI
  is fully configured and healthy in test mode**, because reachability has never
  been the same thing as authority

So the operator-facing status reads:

```
media_generation: available
provider:         muapi
mode:             test
execution:        disabled
```

`available` is a build-time fact, `mode` is a configuration fact, and
`execution` is the authority fact. They are kept separate because a single
boolean would have hidden the last one.

**Why the split matters:** `MUAPI_ENABLED` is infrastructure ("the runtime can
talk to MuAPI"); the capability license is authority ("an agent may spend money
making a video"). If one switch governed both, enabling the provider to run a
health check would silently allow every workflow to generate.

---

## How the provider is activated later

**Do not do these steps now.** They are recorded so the sequence is a decision
rather than an improvisation.

### Step 1 — sandbox smoke test (free)
1. Create a sandbox key at <https://muapi.ai/access-keys> with `is_test: true`.
2. Set `MUAPI_ENABLED=1`, `MUAPI_MODE=test`, `MUAPI_TEST_API_KEY=…` in
   `apps/web/.env.local`.
3. Call `new MuapiProvider().healthCheck()`. Mock outputs, no billing.

### Step 2 — production (requires a human decision)
Blocked until every unmet prerequisite in
`MEDIA_GENERATION_UNMET_PREREQUISITES` is satisfied:

| Prerequisite            | State                                          |
| ----------------------- | ---------------------------------------------- |
| `spend_policy`          | **BUILT** (G1) — `lib/cost/governed-spend.ts`  |
| `project_budget`        | **BUILT** (G1/G2) — see the correction below   |
| `approval_gate`         | Ch27 Approval Inbox, not wired to media        |
| `output_quality_control`| **not built** (designed: Familje-Stunden CCA)  |
| `media_orchestrator`    | **not built**                                  |
| `autonomy_license`      | must be issued by a human (§18.2)              |

> **Correction (Media Runtime Phase 0, 2026-09-02).** The two rows above
> previously read "**not built** — Omnira has cost tracking only". That was true
> when this document was written and is now stale: Governance G1 and G2 shipped
> afterwards. `lib/cost/governed-spend.ts` is the canonical provider spend
> boundary (project resolution → estimate → reservation → refusal → settlement),
> backed by `project_budgets`, `spend_reservations`, `cost_rates` and
> `cost_events`, with atomic budget scopes and replay safety in
> `20260831_budget_scopes.sql`.
>
> Note the consequence for this integration: a MuAPI path that becomes billable
> must call `withGovernedSpend`, not grow a spend concept of its own. `gate.ts`
> records that a parallel `MediaSpendPolicy` seam once lived in this directory
> and that G1 deleted it for exactly that reason.
>
> `MEDIA_GENERATION_UNMET_PREREQUISITES` in
> `lib/atlas/capability/media-generation.ts` still lists `spend_policy` and
> `project_budget` as unmet. That list is a deliberate, hardcoded human decision
> about media specifically, not a probe of what exists — wiring MuAPI to the
> shipped boundary is the work that would justify removing them.

Only then: `MUAPI_MODE=production` **and** `MUAPI_PRODUCTION_ENABLED=1` **and**
`MUAPI_PROD_API_KEY`, plus flipping the capability license off `draft`.

---

## Next steps

**Media Orchestrator.** The layer between Atlas and the router. Owns model
selection (which of ~765 endpoints serves this intent), job lifecycle across
polling or webhooks, and the retry/QC loop. It is where `MediaSpendPolicy` gets
a real implementation.

**Provider Router, second provider.** Routing is deliberately dumb today — first
registered provider that declares the capability and may execute. A scoring
heuristic written against a single candidate would encode MuAPI's quirks as
general rules. Higgsfield or OpenArt makes the trade-off real; write it then.

**Quality control.** Nothing currently judges whether generated output is usable.
`lib/media/quality.ts` scores existing pipeline output and is the natural place
to extend. Note the prohibition: a generator must never also be the judge of
whether its own output is publishable.

**Spend layer.** ~~Omnira has cost *tracking* and no budget.~~ **Superseded by
Governance G1/G2** — see the correction above. Omnira has a budget, a
reservation, a refusal and a settlement, all behind
`lib/cost/governed-spend.ts`. The remaining media-specific work is not to build
a spend layer but to route MuAPI through the one that exists.

**Cost attribution.** `MediaRequestBase.costContext` is carried through the
contract but not yet written to `cost_events`; wire it when execution is enabled
so the first billable call is already attributed.

**Canonical assets (Media Runtime Phase 1, shipped on
`feat/omnira-media-runtime`).** Provider outputs are no longer the end of the
line. `lib/media/asset/admission.ts` performs canon §21.5 Output-to-Asset
admission — retrieve, validate, checksum, store, capture provenance — and
returns an asset identity that survives the vendor URL expiring. When a MuAPI
path becomes billable, its `MediaJobResult.assets[].url` should be admitted
through that boundary rather than persisted as a URL, and
`MediaJobResult.simulated` maps directly onto `asset_provenance.simulated` so a
sandbox image can never be mistaken for a paid one. See
`docs/architecture/media-runtime/PHASE1_RESULT.md`.
