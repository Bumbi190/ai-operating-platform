# OMNIRA MEDIA RUNTIME — PHASE 0 PREFLIGHT

**Status:** read-only architecture investigation. Nothing was installed, generated,
deployed, or configured. The only repository write is this file.

**Date:** 2026-09-02
**Branch:** `feat/omnira-media-runtime`
**Worktree:** `.worktrees/omnira-media-runtime`
**Base:** `origin/main` @ `9bb9f118cd7553ec295ab4bd9138169152b4a85f`

**Evidence key** — every claim below is tagged:

- **FACT** — verified in this repository or in a current official upstream source, with a citation.
- **INFERENCE** — a conclusion drawn from facts, where the reasoning is stated.
- **RECOMMENDATION** — a proposal requiring a human decision.
- **UNKNOWN** — not determinable from available evidence. Not guessed.

---

## 1. Repository State

**FACT — canonical repository.**
`/Users/andrehultgren/Projects/Omnira/Code/ai-operating-platform`, remote
`https://github.com/Bumbi190/ai-operating-platform.git`.

**FACT — pre-flight readings (before any write):**

| Reading | Value |
| --- | --- |
| Local `main` | `e023fb8660e1fe2afa0adea1d0759f7ca663ed4a` |
| `origin/main` after fetch | `9bb9f118cd7553ec295ab4bd9138169152b4a85f` |
| Local `main` vs `origin/main` | 0 ahead, **11 behind** |
| `git status` (main) | clean, 0 entries |
| Pre-existing worktrees | 54 |

**FACT — local `main` was 11 commits behind `origin/main`.** The worktree was
therefore created from `origin/main`, not from local `main`. Local `main` was
not modified, fast-forwarded, or checked out.

**FACT — no collision.** Neither `feat/omnira-media-runtime` (local or remote)
nor `.worktrees/omnira-media-runtime` existed before this session. Nothing was
deleted or reset.

**FACT — the stale legacy checkout `/Users/andrehultgren/Developer/AI Operating
Platform` exists on disk and was not read, opened, or used.**

**FACT — pre-existing media-named branches on origin.** `fix/media-publish-channel-independence`
and `fix/media-semantic-duplicate-guard` are **already merged** into `origin/main`;
`fix/media-semantic-duplicate-guard-recovery` is **not merged**. All three concern
*publication* of media, not *generation*. None were touched.

**FACT — n8n is absent from `origin/main`.** `grep -rn "n8n" apps packages workers`
returns zero hits. The n8n track lives entirely on unmerged branches. Nothing in
this phase reads, depends on, or modifies it.

---

## 2. Existing Media Architecture

The single most important finding of this phase:

> **Omnira already has the provider seam this project was going to design, and it
> is better than the placeholder architecture in the brief. The Media Runtime is
> not a greenfield build. It is the completion of a deliberately unfinished
> layer.**

**FACT — the seam exists at `apps/web/lib/media/providers/`:**

| File | Role |
| --- | --- |
| `types.ts` | `MediaProvider` contract, `MediaCapability`, `MediaJobRef`, `MediaAsset`, `MediaCostEstimate` |
| `router.ts` | `resolveProviderFor(capability)`, `requireProviderFor`, `describeMediaProviders` |
| `gate.ts` | `decideMediaExecution` — pure, Default Deny, three states |
| `config.ts` | credential/mode resolution; the only module that returns a key |
| `errors.ts` | `MediaProviderError` with redaction **in the constructor** |
| `muapi.ts` | the one registered adapter (486 lines) |

**FACT — the documented target architecture** (`docs/architecture/muapi-media-provider.md:27-29`
and `lib/media/providers/types.ts` header):

```
Atlas
  → Media Orchestrator      (NOT BUILT — deliberately)
    → Provider Router       lib/media/providers/router.ts     ✅ built
      → MediaProvider       lib/media/providers/types.ts      ✅ built
        → MuAPI adapter     lib/media/providers/muapi.ts      ✅ built
```

**FACT — the missing layer is named and its absence is deliberate.**
`types.ts` states: *"The orchestrator is deliberately absent: it needs a QC loop
and a spend policy that Omnira has not designed yet, and a stub orchestrator
would become the thing everyone codes against."*

**FACT — the Atlas capability seam also exists**, at
`apps/web/lib/atlas/capability/media-generation.ts`:

- `MEDIA_GENERATION_TOOL_ID = 'media.generate'`
- `MEDIA_GENERATION_LICENSE_STATUS = 'draft'`
- `MEDIA_GENERATION_AUTONOMY_LEVEL = 'L0'`
- `MEDIA_GENERATION_AUTONOMOUS_EXECUTION = false`
- `mediaGenerationAvailability` refuses **every** mission unconditionally
- `MEDIA_GENERATION_UNMET_PREREQUISITES` lists `media_orchestrator` explicitly

**FACT — two independent gates, both currently closed.**
The provider gate (`gate.ts`) answers *"may an outbound call happen at all"*.
The capability license (`media-generation.ts`) answers *"may an agent reach for
this"*. Neither substitutes for the other, and `media-generation.ts` deliberately
does **not** derive its answer from `executionAllowed`.

### 2.1 CI-enforced boundary invariants

**FACT** — `apps/web/lib/qa/muapi-media-provider.test.ts` enforces, and will fail
the build on violation:

1. No production module writes `process.env.MUAPI_*` at runtime.
2. No module outside `config.ts` reads `MUAPI_(TEST|PROD)_API_KEY`.
3. The committed env template contains only empty placeholders.
4. **Nothing outside `lib/media/providers/` imports the MuAPI adapter directly** —
   vendor neutrality is a test, not a convention.
5. **No cron, route, or workflow calls `.generateImage(` / `.generateVideo(` /
   `.imageToVideo(` / `.lipSync(` / `.editImage(`.**
6. **The provider layer is not imported by any file under `/app/`.**

**INFERENCE — invariants 5 and 6 are a Phase 1 constraint, not an obstacle.**
They encode "no media generates itself". Any Phase 1 that wires an orchestrator
into a route must consciously amend these two tests and state why. Phase 1 as
recommended in §23 does **not** need to touch them.

---

## 3. Existing Generation Paths

The brief assumed Omnira has roughly one generation path. It has **five**, at
three different maturity levels.

### 3.1 Ideogram — shipped, governed, in production

**FACT — full traced path** for `POST /api/media/images/generate`
(`apps/web/app/api/media/images/generate/route.ts`):

```
route (Supabase auth)
 → media_scripts lookup → project_id (422 if absent)
 → generateSceneImages(script, hook, ExecutionContract)   lib/media/ideogram.ts:411
    → Claude (scene planning)                             lib/ai/anthropic.ts
    → generateIdeogramV3(...)                             lib/media/image-client.ts:66
       → resolveExecutionStopForContract(...)             lib/governance/execution-stop.ts:310
       → withGovernedSpend(...)                           lib/cost/governed-spend.ts:255
          → estimateImageSek → reserveSpend → dispatch → settleSpend
       → fetch https://api.ideogram.ai/v1/ideogram-v3/generate
       → logImageCost(...) → cost_events                  lib/cost/track.ts
 → uploadSceneImage(projectId, scriptId, i, url)          lib/media/storage.ts:79
    → Supabase Storage bucket 'media-assets' (PUBLIC)
 → media_scripts.images = string[]   (jsonb array of URLs)
```

**FACT** — `image-client.ts` header: *"Ideogram is Omnira's largest single spend
line — 157.92 SEK of 232.56 SEK in the audited month."*

**FACT — a second, richer Ideogram path exists**: `generateArticleHeroImage(brief,
execution, project)` (`lib/media/ideogram.ts:93`). It takes an `EditorBrief`, not
a prompt. See §9 — this is the most architecturally significant shipped code in
the repository for this project.

### 3.2 OpenAI `gpt-image-1` — shipped, governed, and hard-coded

**FACT** — `lib/ai/openai-client.ts` exports governed `openAIImageGenerate` (l.139)
and `openAIImageEdit` (l.164), both wrapped in `withGovernedSpend` and writing to
`cost_events`.

**FACT** — the only call sites are `lib/ai/runner.ts:84` and `lib/ai/runner.ts:579`.
Both pass the literal string `model: 'gpt-image-1'`. **There is no provider or
model selection anywhere in this path.**

**FACT — a reference-image path already ships.** `generateWithReference()`
(`lib/ai/runner.ts:66`) fetches a reference image and calls `openAIImageEdit` so
the model receives it as a visual guide for character style and proportions.

**FACT — and it degrades silently.** On reference-fetch failure it returns `null`;
the caller then generates *without* the reference (`runner.ts:64` comment:
*"Faller tillbaka till null om referenshämtningen misslyckas"*). Character
consistency is therefore lost with a `console.warn` and no record.

**INFERENCE — this is exactly the anti-pattern canon prohibits.** Intelligence
Fabric §6.254 *Hidden Feature Loss*: *"Adapters must not ignore requested Features
silently. If character references are unsupported, the mapping must report
incompatibility or degradation."* This is a live, shipped violation and is the
strongest concrete argument that the Media Runtime is needed.

### 3.3 ElevenLabs — shipped, governed (audio)

**FACT** — `lib/media/elevenlabs.ts`: `generateVoiceover` and `generateSoundEffect`,
via `/with-timestamps` for word-level subtitle timing, wrapped in
`withGovernedSpend`, rate `elevenlabs_usd_per_1k_chars`.

### 3.4 Remotion / AWS Lambda — shipped (video composition, not generation)

**FACT** — `apps/remotion/` (compositions `ShortFormVideo`, `SimpleNewsReel`),
driven by `lib/media/lambda-render.ts` and `/api/media/render/*`. This *composes*
existing assets; it does not synthesise pixels.

### 3.5 MuAPI — built, gated off, zero call sites

**FACT** — `MuapiProvider` declares all eight capabilities
(`muapi.ts:75-84`): `generateImage`, `editImage`, `generateVideo`, `imageToVideo`,
`lipSync`, `uploadReference`, `estimateCost`, `discoverModels`.

**FACT** — it has no production call sites, enforced by test (§2.1).

### 3.6 Summary of what generates what

| Modality | Shipped today | Governed by `withGovernedSpend` | Provider selection |
| --- | --- | --- | --- |
| Image | Ideogram v3, OpenAI `gpt-image-1` | yes, both | **none — hard-coded** |
| Audio (speech) | ElevenLabs, OpenAI `openAISpeech` | yes, both | **none — hard-coded** |
| Music | Pixabay lookup (`lib/media/music.ts`) | no (free/curated URLs) | n/a |
| Video (synthesis) | **none shipped** | — | — |
| Video (composition) | Remotion on Lambda | no | n/a |

---

## 4. Existing Provider / Model Abstractions

**FACT — a provider abstraction exists and is good.** `MediaProvider`
(`types.ts`) with mandatory `describe()`, `healthCheck()`, `getStatus(ref)` and
**optional, capability-gated** generation methods. The router checks the
`capabilities` array; it never probes for a method.

**FACT — capability discovery already exists** as `MediaCapability`, a closed
union of eight operations, with refusal *before* any network call
(`assertCapability`, `gate.ts`).

**FACT — there is no model abstraction.** `MediaRequestBase.model` is a bare
`string`, deliberately un-defaulted (*"a default model is a spend decision, and
this layer does not make spend decisions"*). `listModels()` is optional and
returns `MediaModelDescriptor { name, category?, description? }` — a catalogue
entry with **no capability, cost, or quality fields**.

**FACT — routing is deliberately trivial.** `resolveProviderFor` returns the
first registered provider that declares the capability and is executable. The
header states a scoring heuristic written against one candidate *"would encode
MuAPI's quirks as if they were general rules"*.

### 4.1 The three real blockers for multi-provider

**FACT — blocker 1: `MediaProviderId` is a closed union of cloud vendors.**

```ts
export type MediaProviderId = 'muapi' | 'higgsfield' | 'openart'
```

No local provider can be expressed. Adding `'comfyui'` is a one-line change, but
the union also implies a wrong model: a provider id is treated as a *vendor*,
with no notion of a provider *instance* (two ComfyUI nodes, one on a workstation
and one on a server, are different endpoints with different capacity).

**FACT — blocker 2: the gate is MuAPI-shaped.** `decideMediaExecution(config:
MuapiConfig)` and `assertMediaExecutionAllowed(config: MuapiConfig, …)` take a
**MuAPI-specific** config type, and `errors.ts` calls `resolveMuapiCredential()`
directly inside the generic redactor. A second provider cannot use the gate
without either widening the type or duplicating the gate.

**FACT — blocker 3: the capability set has no local-runtime vocabulary.**
`MediaCapability` covers operations only. There is nothing for reference-image
support, seed control, transparency, resolution ceilings, model availability,
VRAM headroom, or queue depth — the properties on which a *local* provider must
be judged.

**INFERENCE.** Blockers 1 and 2 are small, contained refactors of a young,
well-tested module. Blocker 3 is the genuine design work.

---

## 5. Existing Asset Storage

**FACT — there is no asset table.** Every `CREATE TABLE` across both migration
directories (`apps/web/supabase/migrations`, 72 files; `supabase/migrations`, 38
files) was enumerated. There is no `assets`, `media_assets`, `artifacts`, or
`files` table. The full table list contains `cost_events`, `cost_rates`,
`project_budgets`, `spend_reservations`, `media_scripts`, `media_news_items`,
`media_insights`, `website_content`, `workflow_*`, `atlas_*`, `stop_events` — and
no asset entity.

**FACT — generated media are stored as URL strings on pipeline tables:**

| Location | Shape |
| --- | --- |
| `media_scripts.audio_url` | `text` — Supabase Storage public URL |
| `media_scripts.video_url` | `text` |
| `media_scripts.timing_url` | `text` |
| `media_scripts.images` | `jsonb` — *"Array of 5 public image URLs"* (`20260520_media_images.sql`) |
| `website_content.hero_image_url` | `text` |

**FACT — the bucket is public.** `20260520_media_tables.sql`:
`INSERT INTO storage.buckets (id, name, public) VALUES ('media-assets','media-assets', true)`.

**FACT — paths are pipeline-derived, not identity-derived**
(`lib/media/storage.ts`): `audio/{projectId}/{scriptId}.mp3`,
`video/{projectId}/{scriptId}.mp4`.

**FACT — canon prohibits exactly this representation.** Intelligence Fabric ch21:

- **§21.7 Asset Is Not URL** — *"URLs may expire, redirect, change, or disappear.
  Canonical Asset identity shall remain independent."*
- **§21.9 Asset Is Not Storage Path** — *"Storage paths are implementation details."*
- **§21.6 Asset Is Not File**, **§21.8 Asset Is Not Filename**,
  **§21.10 Asset Is Not Provider Object**.

**INFERENCE — the shipped asset layer is the most canon-nonconformant part of
Omnira's media stack**, and it is nonconformant in the four ways ch21 names
explicitly. This is not a style objection: with no asset identity, nothing can
answer "what generated this?", re-render a derivative, revoke a rights-restricted
image, or migrate storage without breaking every stored reference.

**FACT — a second, project-scoped bucket is declared but not populated.**
`content/familje-stunden/canon/canon.meta.json` declares
`binary_assets.bucket = "familje-stunden"` with `status: "pending_import"` and
`checksum: null` for both canonical character images.

---

## 6. Existing Evidence / Provenance

**FACT — there is no media provenance record.** No table links a generated asset
to the provider, model, prompt, seed, reference assets, or cost that produced it.

**FACT — three partial, non-overlapping systems exist:**

**1. `cost_events`** (`20260602_cost_events.sql`) — the closest thing to
provenance. Per billable call it records `provider`, `model`, `agent`,
`operation`, `unit_type`, `units`, `cost_usd`, `cost_sek`, `run_id`, `script_id`,
`metadata jsonb`, `created_at`. **It has no asset reference.** Given an image
URL there is no way to find its `cost_events` row.

**2. `website_content` hero-image columns** — the only *render* provenance in the
repository, and it is per-article, not per-asset:

- `hero_image_source` — `'brief' | 'fallback_writer' | NULL` (`20260621_…`)
- `hero_image_render_input jsonb` — *"The exact request body sent to Ideogram"*
- `hero_image_brief jsonb` — the editor's reasoning (`20260619_…`)

**FACT** — the migration states only the brief-driven path captures this; the
`generateNewsImage` fallback path records `NULL`. Provider, model, cost, seed and
duration are **not** captured on any path.

**3. `workflow_evidence`** (`20260829_workflow_instance_core.sql:163`) — append-only
(DB-enforced), with a load-bearing `source` check constraint distinguishing
`'automated'` from `'attested'`. It is bound to `instance_id` (a workflow
instance), not to an asset.

**INFERENCE — `workflow_evidence` is the right *pattern* and the wrong *scope*.**
Its automated/attested split and DB-level append-only enforcement are exactly
what asset provenance needs. Reusing the table would be wrong (it is
instance-bound by FK); reusing its **construction** is right. Canon agrees:
§21.5 *Output-to-Asset Admission* requires provenance capture as an admission
precondition, not as a log written afterwards.

---

## 7. Existing Cost / Budget Controls

**The brief and the existing media doc are both out of date here. Correcting this
changes the Phase 1 recommendation materially.**

**FACT — `docs/architecture/muapi-media-provider.md` states `project_budget` is
"**not built** — Omnira has cost tracking only". That is stale.** Governance G1/G2
shipped after that document was written.

**FACT — what actually exists:**

| Component | Location | State |
| --- | --- | --- |
| `withGovernedSpend` | `lib/cost/governed-spend.ts:255` | shipped — *"the canonical provider spend boundary"* |
| `project_budgets` | `20260602_project_budgets.sql` | shipped, seeded (media 700 SEK, familje-stunden 500, gainpilot 300) |
| `spend_reservations` | `20260830_spend_budget_gate.sql` | shipped |
| Budget scopes + replay safety | `20260831_budget_scopes.sql` | shipped (G2) |
| `cost_events` / `cost_rates` | `20260602_cost_events.sql` | shipped |
| Execution stop authority | `lib/governance/execution-stop.ts` | shipped (G3A/G3B/G3C) |

**FACT — `governed-spend.ts` owns the whole sequence:** project resolution,
estimate, reservation, refusal, settlement. Its header records the audit finding
that motivated it: *"33 runtime call sites that can spend real money and exactly
ONE that reserved budget first."*

**FACT — two hard-won semantics that the Media Runtime must not re-derive:**

- **Fail closed.** *"every way of NOT getting an answer refuses"* — no project
  ref, unresolvable ref, throwing lookup, non-finite estimate, failed RPC.
- **Ambiguity is not a refund.** The default for an unrecognised failure is to
  **settle** (keep the money counted). Only `ProviderNotDispatchedError` — a
  failure an adapter can *prove* never reached the provider — releases headroom.

**FACT — seeded image rates:** `ideogram_v3_usd_per_image = 0.080`,
`gpt_image_usd_per_image = 0.042`, `usd_sek = 10.50`.

**FACT — the new provider layer is NOT wired to this.**
`MediaRequestBase.costContext` is carried through the contract and never written
to `cost_events`; `gate.ts` explicitly disclaims budget authority. `gate.ts` also
records that a parallel `MediaSpendPolicy` seam once existed here and **Governance
G1 deleted it** — *"a second spend abstraction is a second place for 'may we
spend' to be answered."*

**INFERENCE — the single most important constraint on Phase 1:** the Media
Runtime must call `withGovernedSpend`. It must not introduce an estimate, a
reservation, a budget, or an approval concept of its own. That mistake has
already been made once in this exact directory and removed by audit.

---

## 8. Correct Integration Seam

**RECOMMENDATION — do not create `MediaRequest` / `MediaRouter` /
`GenerationProvider`.** All three names in the brief are already occupied by
better-specified concepts, two of them by shipped code.

| Brief's placeholder | Correct existing home | Status |
| --- | --- | --- |
| `GenerationProvider` | `MediaProvider` (`lib/media/providers/types.ts`) | **shipped — reuse** |
| `MediaRouter` (dispatch) | `resolveProviderFor` (`router.ts`) | **shipped — extend** |
| `MediaRouter` (policy) | Placement Policy + Routing Profile (canon ch11/ch19) | not built |
| `MediaRequest` | Production Specification / Creative Brief (canon ch20) | not built; **shipped precedent exists** |
| — the missing layer — | **Media Orchestrator** | **named, specified, absent** |

**FACT — the seam is already named by the repository itself.** `media_orchestrator`
appears in `MEDIA_GENERATION_PREREQUISITES` and `MEDIA_GENERATION_UNMET_PREREQUISITES`
(`lib/atlas/capability/media-generation.ts`). The layer to build is not a new
idea; it is a checkbox the repository is already waiting on.

**RECOMMENDATION — the Media Runtime belongs in exactly one new module,
`apps/web/lib/media/orchestrator/`, sitting between the Atlas capability seam and
the existing router:**

```
Atlas / mission
  → lib/atlas/capability/media-generation.ts     authority       ✅ shipped (refusing)
    → lib/media/orchestrator/                    ← THE NEW LAYER
       ├── brief → specification                 what is wanted
       ├── eligibility (policy)                  what is allowed      ← deterministic
       ├── ranking                                which allowed one    ← preference
       ├── lib/cost/governed-spend.ts            may we afford it     ✅ shipped
       ├── lib/governance/execution-stop.ts      may anything run     ✅ shipped
       └── admission → Asset                      what we now own
    → lib/media/providers/router.ts              which provider       ✅ shipped
      → MediaProvider                            how to call it       ✅ shipped
```

**INFERENCE — why not the connector layer, the workflow engine, or the Atlas tool
system.** `lib/publishing/` is publication, and canon (§20 vs §21) and
`media-generation.ts` both forbid a generator owning publication. The workflow
engine (`workflow_instances`, PR1–PR9h) is a *scheduler* — media generation is a
step it may one day dispatch, not the place the media decision lives. The Atlas
capability system is the **authority** boundary and already holds the media entry;
putting routing there would collapse authority and selection into one file, which
`media-generation.ts` explicitly refuses to do (*"Not a provider choice"*).

---

## 9. Proposed Minimal Media Request Contract

**FACT — the brief's proposed field list is largely wrong for Omnira, and Omnira
already ships the correct pattern.**

**FACT — canon §20.28 Brief Versus Prompt:** *"A Creative Brief describes canonical
creative intent. A Provider prompt is one implementation-specific instruction
derived from that Brief."*

**FACT — Omnira already implements this in production.** `EditorBrief`
(`lib/article/photo-editor.ts:52`) is vendor-neutral:

```ts
export interface EditorBrief {
  story: string            // one sentence, no jargon
  visual_metaphor: string  // the editorial tension as a visual idea
  shot: string             // a cover concept in EDITOR language, not prompt language
  avoid: string[]          // clichés to avoid for THIS story
  editorial_style: EditorialStyle
}
```

and `generateArticleHeroImage(brief, execution, project)` (`lib/media/ideogram.ts:93`)
constructs the Ideogram `prompt` and `negative_prompt` **inside the adapter**
(l.105-111) from that brief plus `STYLE_REFERENCE_MAP`.

**RECOMMENDATION — Atlas must send a brief, never a prompt.** A `prompt` field on
the request would hand the prompt-engineering decision to Atlas and permanently
couple every caller to whichever vendor's prompt dialect was assumed. Omnira has
already proven the brief shape works against a real provider.

### 9.1 The proposed minimal contract

Fields are justified individually. Anything not justified by a **shipped** need
or an **explicit canon requirement** is omitted.

| Field | Type | Why it survives |
| --- | --- | --- |
| `capability` | `'image.generate' \| 'image.edit' \| 'video.image_to_video' \| …` | Canon §6.26 granularity. Drives eligibility. |
| `projectId` | `string` | Project Isolation is an official architecture principle (`FAMILJE_CHARACTER_CONSISTENCY_AGENT_DESIGN.md`); `governed-spend` refuses without a project. |
| `execution` | `ExecutionContract` | **Already mandatory** on every shipped generation path. Not defaultable. |
| `purpose` | enum | Canon §20.23 requires `purpose`. It is what makes "disposable graphic" vs "premium marketing image" a *declared* fact rather than an inferred one. |
| `brief` | `CreativeBrief` | §20.28. Replaces `prompt`. |
| `outputSpec` | `{ aspectRatio, minResolution?, transparency?, format? }` | Real, shipped needs: `ARTICLE_HERO_ASPECT='16x10'`, coloring pages need transparency, Remotion needs known dimensions. |
| `references` | `AssetRef[]` | **The one field the brief undersold.** Required by `generateWithReference` today and by the entire Familje-Stunden canon. Must be asset identities, never URLs (§21.7). |
| `consistencyRequirement` | `'none' \| 'preferred' \| 'required'` | The routing dimension the product actually needs. `required` must *refuse* a provider that cannot honour references (§6.254), never silently degrade — which is today's bug. |
| `maxCostSek` | `number \| null` | A per-request ceiling **below** the project budget. Never above: the budget is not negotiable by a caller. |

**Deliberately excluded, with reasons:**

- `prompt` — §20.28; belongs to the adapter.
- `provider` / `model` — canon §6.247 *Provider as Capability Name* anti-pattern.
  A caller naming a vendor defeats the layer.
- `privacyRequirement` — **not yet.** Canon has a Data Classification system
  (ch23) and a Private Routing Profile (§19.14). Inventing a boolean here would
  create a second, weaker classification. Model it when a classified asset exists.
- `latencyPreference`, `qualityPreference`, `costPreference` as free knobs —
  these are **derivable from `purpose`**. Three independent sliders let a caller
  request "premium, instant, free" and force the router to invent a tie-break.
- `localPreference` — this is a **Placement** concern (§19.16), not a request
  field. See §11.
- `seed` — no shipped need. Ideogram and `gpt-image-1` do not expose usable seed
  control in the paths Omnira uses. Add it when a provider that honours it lands.

---

## 10. Provider vs Model Boundary

**RECOMMENDATION — the brief's two-level model (Provider → Model) is one level
short.** Canon separates three things that Omnira currently conflates:

| Canon concept | Chapter | Question it answers | Example |
| --- | --- | --- | --- |
| **Provider** | ch8 Provider Registry | Who is accountable / billed? | `openai`, `muapi`, `self` |
| **Model** | ch7 Model Registry | What produces the pixels? | `gpt-image-1`, `FLUX.2-klein-4B`, `Qwen-Image` |
| **Model Deployment** | §19.16 | *Where* does that model run? | this ComfyUI node vs that one |
| **Adapter** | §16.19 | How is it called? | `adapter.comfyui.workflow`, versioned |

**FACT — canon §19.16 Placement Is Not Routing Alone:** *"Routing selects an
eligible intelligence or execution resource. Placement determines where that
resource operates. A Model may have several Deployments with different placement
properties."*

**INFERENCE — this is the cleanest resolution of the local/cloud question in the
brief.** "Local vs cloud" is not a provider attribute and not a model attribute.
`FLUX.2-klein` is one *model*; running it on a workstation node and running it via
MuAPI are two *deployments* of it. Modelling local-ness as a provider flag would
make the same model appear as two unrelated providers and would break cost and
quality comparison between them.

**FACT — canon already names local connectors.** §16.22 gives
`connector.local.ollama` as a canonical connector identity example, and §16.27
allows an Endpoint to be a *"local socket"* or *"process command"*. Local
providers are already inside the canonical model; they are only absent from
Omnira's implementation.

**RECOMMENDATION for Phase 1 (deliberately less than the above):** introduce
`Model` as a first-class registry entry with declared capability flags, keep
`Provider` as-is, and record `deployment` as a **string field on the model entry**
with a single value (`'vendor'`) until a second deployment of the same model
actually exists. Building the full Deployment object before there are two
deployments is the "overly generic framework" the brief warns against.

---

## 11. Routing Authority

**RECOMMENDATION — three layers, and the middle one is deterministic and
non-negotiable.** This matches both the brief's instinct and canon.

```
1. INTELLIGENCE   Atlas          → capability, purpose, brief, consistency need
                                   Atlas MAY reason. Atlas MAY NOT name a provider.

2. ELIGIBILITY    Omnira         → the ALLOWED SET. Deterministic, no model call.
   (Placement Policy §19.36 + Routing Profile ch11)
     • capability license          lib/atlas/capability/media-generation.ts  ✅
     • execution stop              lib/governance/execution-stop.ts          ✅
     • provider execution gate     lib/media/providers/gate.ts               ✅
     • budget headroom             lib/cost/governed-spend.ts                ✅
     • capability support          MediaProvider.capabilities                ✅
     • model feature support       ← NEW (consistency, transparency, aspect)
     • placement policy            ← NEW (local-only / no-external)

3. RANKING        Router         → best of the ALLOWED SET only.
                                   Cannot add a candidate. Can only order.
```

**INFERENCE — the load-bearing property is that ranking cannot widen the allowed
set.** Atlas saying "quality = premium" is an *input to ranking*, never an input
to eligibility. Atlas saying "use provider X" is not expressible at all, because
the request contract has no provider field (§9). Authority is enforced by the
*shape of the type*, not by a check that could be forgotten — which is the same
technique `config.ts` uses to make "test mode cannot spend" structurally true.

**FACT — canon §19.20 Local Execution Is Not Governance Bypass:** local resources
*"shall still require: Capability eligibility, Model or Tool registration,
authority, Budget where applicable, scheduling, evidence, evaluation, and Incident
handling."*

**INFERENCE.** A local provider is therefore not a way around the gates. It enters
through the *same* eligibility layer, with the same license and the same stop
authority. Only the *cost model* differs (§12).

**RECOMMENDATION — ranking stays trivial in Phase 1.** With one eligible provider
per capability there is no selection problem, and `router.ts` already argues
persuasively that a heuristic tuned against one candidate encodes that
candidate's quirks as general rules. Ranking becomes real work when a second
provider is registered — not before.

---

## 12. Cost-Aware Routing

**FACT — the brief is right that LOCAL != FREE, and canon agrees.** Intelligence
Fabric ch26 lists reservations for *"budget, lager, providerquota, **GPU**,
tidsslottar och human attention"*; GainPilot ch20 lists *"GPU-tid"* as a tracked
cost.

**FACT — `cost_events` cannot represent local cost today.** Its `unit_type` CHECK
constraint is closed: `('tokens','characters','images','seconds','requests')`.
There is no GPU-seconds unit and no electricity concept. Adding one is a
migration, not a code change.

**RECOMMENDATION — do not build a second cost system, and do not model
electricity in Phase 1.**

| Cost dimension | Phase 1 treatment | Why |
| --- | --- | --- |
| API monetary cost | `withGovernedSpend` + `cost_events`, unchanged | shipped and audited |
| Local GPU time | **measure and record only** — wall-clock seconds into provenance | you cannot price what you have never measured |
| Local electricity | **do not model** | requires a power measurement Omnira has no source for; a guessed number would become a budget input |
| Local latency | record; feed ranking later | latency is a real routing input and is free to measure |
| Local machine availability | **eligibility, not cost** | an offline node is ineligible, not expensive |
| Storage | already Supabase; unchanged | — |

**INFERENCE — the correct Phase 1 statement of local cost is "zero monetary,
non-zero capacity".** A local generation reserves **capacity** (a queue slot, a
node) rather than **money**. Canon supports this directly: §19.22 lists
`Resource Lease` and `Capacity Record` as canonical objects alongside budget.
Conflating the two — charging a fake SEK figure for a local render — would corrupt
the one budget system Omnira has, which G1 exists to protect.

---

## 13. Proposed Local Provider Boundary

**RECOMMENDATION — a local provider must satisfy `MediaProvider` unchanged, plus
one additive interface. No Fooocus-specific assumption appears in either.**

The existing contract already covers more than expected: every generation method
is optional and capability-gated, and every provider is async-by-contract with
`getStatus(ref)` — which is exactly how a local queue behaves.

**What must be added, and why each is not optional:**

| Concern | Why the existing contract cannot express it | Canon anchor |
| --- | --- | --- |
| **Node identity** | `MediaProviderId` names a vendor; two ComfyUI hosts are one id | §19.52 Runtime Node |
| **Health / reachability** | `healthCheck()` exists but returns `{ok, detail}` — no capacity, no queue depth | §19.22 Health Observation |
| **Capacity** | nothing expresses "busy", so nothing can refuse before queueing | §19.22 Capacity Record, Resource Lease |
| **Hardware profile** | no VRAM/accelerator concept; a 16 GB node and an 80 GB node look identical | §19.22 Hardware Profile |
| **Installed models** | `listModels()` returns `{name, category?, description?}` — no capability, no cost, no VRAM need | ch7 Model Registry |
| **Cancellation** | **the contract has no cancel at all** | — |
| **Timeout** | not in the contract; a local render can take minutes | — |
| **Concurrency limit** | absent; unbounded submission to a single GPU is a self-inflicted DoS | §15 quotas |
| **Output retrieval** | `MediaAsset.url` assumes a fetchable URL; a local runtime may produce a **file path** | §21.7 |
| **Disk headroom** | absent; a full disk fails mid-render | §19.22 Storage Volume |

**FACT — the cancellation gap is not local-specific and matters more than it
looks.** `MediaProvider` has no `cancel(ref)`. For a cloud vendor a lost job is a
bounded charge. For a local node, an uncancellable job holds the only GPU
indefinitely and starves every subsequent request.

**RECOMMENDATION — model output as bytes-or-location, not URL.** `MediaAsset.url`
is a cloud assumption. A local provider returns a path inside its own workspace.
Since §21.5 requires retrieval and integrity validation before admission anyway,
the honest shape is a *retrievable handle* the orchestrator resolves — which also
removes the "vendor-hosted URL expires" problem for cloud providers.

---

## 14. Fooocus Findings

**RECOMMENDATION: do not adopt Fooocus. It is the wrong candidate, and the
evidence is unambiguous.**

**FACT — Fooocus is in bug-fix-only maintenance and is architecturally frozen.**
The README (github.com/lllyasviel/Fooocus, read 2026-09-02) states the project,
*"built entirely on the Stable Diffusion XL architecture, is now in a state of
limited long-term support (LTS) with bug fixes only"*, and that *"There are no
current plans to migrate to or incorporate newer model architectures."*

**FACT — findings against the brief's checklist:**

| Dimension | Finding |
| --- | --- |
| Maintenance | **LTS, bug fixes only**; latest release v2.5.0 |
| License | GPL-3.0 |
| Platforms | Windows (primary), Linux, macOS Apple Silicon M1/M2, Colab, Docker |
| Minimum hardware | NVIDIA RTX 2xxx+, **4 GB VRAM**, 8 GB RAM, 40 GB disk |
| Architecture | **SDXL only**, by explicit design |
| Official HTTP API | **none.** `--listen` / `--share` expose the *Gradio UI*, not an API |
| Automation | third-party only — `mrhan1993/Fooocus-API` (FastAPI wrapper); the widely-deployed Replicate variant runs **Fooocus 2.3.0**, behind upstream 2.5.0 |
| Text-to-image | yes, with strong opinionated defaults |
| Image-to-image / reference | yes (ControlNet, image prompt, FaceSwap/PyraCanny) |
| Inpainting / outpainting | yes |
| Model flexibility | SDXL checkpoints + LoRA only |
| Prompt behaviour | **heavily rewritten by built-in expansion/styling** |
| Seed control | yes |

**INFERENCE — three disqualifiers for autonomous use, in order of severity:**

1. **No official API.** Automating Fooocus means depending on an unaffiliated
   wrapper, on a version behind upstream, for a project that is itself frozen.
   That is a supply chain with three independent decay paths.
2. **Prompt rewriting is a governance problem, not a quality one.** Fooocus's
   value proposition is that it silently improves your prompt. Omnira's
   provenance requirement (§21.5, §6.254) is that the *actual* instruction is
   recorded and that degradation is reported. A runtime whose selling point is
   undisclosed prompt mutation is structurally at odds with that.
3. **SDXL-only, permanently.** The brief's own goal is that *"No single image
   model should become Atlas' permanent image engine."* Adopting a runtime that
   has publicly declined to support future architectures locks in the exact
   outcome the project exists to prevent.

**FACT — Fooocus's quality is not the issue.** For a human sitting at a UI wanting
good SDXL output with no knobs, it remains a reasonable tool. That is simply not
the use case here.

---

## 15. ComfyUI Findings

**RECOMMENDATION: ComfyUI is the correct local runtime candidate, if and when
local generation is pursued at all (see §21 — it currently cannot be).**

**FACT — evidence from github.com/comfyanonymous/ComfyUI, read 2026-09-02:**

| Dimension | Finding |
| --- | --- |
| Maintenance | **active** — *"a weekly release cycle targeting Monday"*, ~131k stars, 5,849 commits on master |
| License | GPL-3.0 |
| Platforms | Windows, Linux (NVIDIA/AMD ROCm/Intel Arc + Ascend NPU, Cambricon), **macOS Apple Silicon M1–M4** |
| HTTP API | **yes, documented** — `/prompt`, `/history`, WebSocket; *"a local API for integrating workflows into applications"* |
| Automation | workflow JSON is serialisable and submittable — the native automation unit |
| Model families | SDXL, SD3.5, **FLUX.1 / FLUX.2**, Qwen-Image, Hunyuan Image, Ideogram 4; video (Wan 2.1/2.2, LTX-Video, HunyuanVideo, CogVideoX); audio; 3D |
| Queue behaviour | built-in queue with history; job ids returned by `/prompt` |
| Frontend/backend | separated since Aug 2024; frontend is a pip dependency |
| API stability | **no stated guarantee** |

**INFERENCE — the integration unit is a *workflow*, not a *prompt*, and this is
both the main strength and the main risk.**

- *Strength:* a ComfyUI workflow can encode reference-image conditioning,
  ControlNet, LoRA and multi-stage pipelines that no flat request contract could
  express — which is precisely what character consistency needs.
- *Risk:* a workflow JSON references **node types by name and models by
  filename**. It breaks if a custom node is missing, renamed, or updated. A
  workflow is therefore a *versioned artifact Omnira must own and pin*, not a
  configuration string.

**INFERENCE — this maps cleanly onto canon §16.19-16.21 Adapter Version
Immutability** (*"Historical Executions shall preserve the exact Adapter Version
used"*). An Omnira ComfyUI adapter should treat each pinned workflow as an adapter
version, so a stored asset can always be explained by the exact graph that made it.

**FACT — security is the strongest caution.** ComfyUI executes arbitrary graphs
and its custom-node ecosystem is unvetted Python running in-process. Any Omnira
deployment must treat a ComfyUI node as an untrusted execution environment
(§19.31 Zone Trust Class), never as a library.

**FACT — no API stability guarantee is published.** This argues for a thin,
well-tested adapter and against building deep behavioural assumptions on
endpoint semantics.

---

## 16. Modern Local Model Findings

**FACT — runtime and model must not be conflated, and the brief is right to
insist.** ComfyUI is a *runtime/orchestrator*. FLUX, Qwen-Image and SDXL are
*model families*. Fooocus is a runtime **welded to one model family** — which is
exactly why it fails §10's separation.

**FACT — licensing is the decisive axis, and it disfavours the brief's assumption.**

| Model | License | Commercial self-host | Size / VRAM |
| --- | --- | --- | --- |
| **FLUX.2 [dev]** | **FLUX Non-Commercial License** | **no** — requires a separate BFL Self-Hosted Commercial License | 32B, ~32 GB VRAM @ FP8 |
| **FLUX.2 [klein] 9B** | FLUX Non-Commercial License | no | 9B |
| **FLUX.2 [klein] 4B** | **Apache 2.0** | yes | 4B, ~13 GB (RTX 3090) |
| **Qwen-Image** | **Apache 2.0** | yes | 20B MMDiT |
| **SD 3.5 / SDXL** | Stability community/open licenses | varies by tier — review required | SDXL ~6.9 GB checkpoint |

**FACT** — verified at huggingface.co/black-forest-labs/FLUX.2-dev (read
2026-09-02): the license is the *FLUX Non-Commercial License*, and BFL offers a
separate *Self-Hosted Commercial License* for commercial rights.

**INFERENCE — this is a genuine constraint on Omnira specifically, not a
theoretical one.** Familje-Stunden is a commercial product (Stripe integration is
in the repo) and The Prompt is a publication. Self-hosting FLUX.2 [dev] or
[klein] 9B to produce assets for either would need a paid BFL licence. The exact
boundary between "outputs are usable commercially" and "self-hosting in a
commercial service" in BFL's terms is a **legal question, not an engineering
one**, and should be answered by a human before any FLUX weights are downloaded.

**RECOMMENDATION — if local generation happens, start with Apache-2.0 weights.**
Qwen-Image (best-in-class text rendering, fully permissive) or FLUX.2 [klein] 4B
(permissive, modest VRAM). This removes the licence question entirely from the
first increment.

**UNKNOWN — character-consistency capability of each family under Omnira's actual
requirement.** Public comparisons measure aesthetic quality and prompt adherence.
Nova/Pling consistency is an *instance-identity* problem on non-photographic
characters, which those benchmarks do not measure. This must be tested against
the real canon references before any model is selected — and cannot be answered
from documentation.

---

## 17. Existing / Future Cloud Providers

| Provider | Omnira integration state | Evidence |
| --- | --- | --- |
| **Ideogram** | **shipped, governed, largest image spend** | `lib/media/image-client.ts`, `lib/media/ideogram.ts`, rate `ideogram_v3_usd_per_image` |
| **OpenAI `gpt-image-1`** | **shipped, governed, incl. reference/edit path** | `lib/ai/openai-client.ts:139,164`; call sites `lib/ai/runner.ts:84,579`; rate `gpt_image_usd_per_image` |
| **ElevenLabs** | **shipped, governed (audio)** | `lib/media/elevenlabs.ts` |
| **MuAPI** | **adapter built, gated off, zero call sites** | `lib/media/providers/muapi.ts` |
| **Higgsfield** | **not integrated** — id reserved only | `MediaProviderId` union; absent from `REGISTRY` |
| **OpenArt** | **not integrated** — id reserved only | same |
| Pixabay (music) | shipped, ungoverned (free/curated) | `lib/media/music.ts` |

**FACT — Ideogram and ElevenLabs are *not* behind the provider layer.**
`types.ts` says so explicitly: *"Not a replacement for the Ideogram/ElevenLabs
call sites… nothing in this directory is imported by the existing media pipeline."*
So Omnira today has **two parallel media architectures**: the shipped, governed,
vendor-named one, and the unused, vendor-neutral one.

**FACT — external API state (light audit, 2026-09-02):** both Higgsfield and
OpenArt expose REST APIs; Higgsfield's is async with request IDs and webhooks,
OpenArt's API access is gated to paid tiers. Both fit `MediaJobRef` /
`getStatus()` without contract change.

**FACT — MCP connections are not Omnira integrations.** This session has MuAPI,
OpenArt and Higgsfield MCP servers connected. `docs/architecture/muapi-media-provider.md`
already draws this distinction: *"an MCP that is connected in an editor says
nothing about whether Omnira can generate media."* No MCP generation tool was
called during this phase.

---

## 18. Provider Selection Matrix

Qualitative. Ratings are grounded in the citations in §14–§17; where evidence is
absent the cell says so rather than carrying an invented score.

| | Ideogram | OpenAI `gpt-image-1` | MuAPI | ComfyUI (local) | Fooocus (local) |
| --- | --- | --- | --- | --- | --- |
| Placement | cloud | cloud | cloud (aggregator) | local | local |
| Omnira state | **shipped** | **shipped** | built, off | none | none |
| Monetary cost | 0.080 USD/img | 0.042 USD/img | credits | none | none |
| Capacity cost | none | none | none | **GPU + queue** | **GPU + queue** |
| Quality ceiling | high (typography) | high | model-dependent | **model-dependent, highest ceiling** | SDXL-era |
| Speed | seconds | seconds | seconds–min | **hardware-bound** | hardware-bound |
| Privacy | external | external | external | **local** | **local** |
| Reference images | limited | **yes (`images.edit`)** | yes (`uploadReference`) | **yes, richest** | yes |
| Character consistency | UNKNOWN | partial, used today | UNKNOWN | **highest potential** | moderate |
| Inpainting | limited | yes | model-dependent | yes | yes |
| Transparency | no | no | model-dependent | yes | limited |
| Video | no | no | **yes** | **yes** | no |
| API quality | good | **excellent** | good, 1 key/765 endpoints | good, **no stability guarantee** | **none official** |
| Hardware need | none | none | none | **substantial** | moderate |
| Ops complexity | low | low | low | **high** | medium |
| Maintenance health | vendor | vendor | vendor | **active weekly** | **bug-fix-only** |
| Licence risk | ToS | ToS | ToS | GPL-3 runtime + **model licence** | GPL-3, SDXL |

**INFERENCE — the matrix does not currently justify a local provider.** The two
columns where local wins outright are privacy and marginal monetary cost. Omnira
has no classified media workload today (§9), and image spend is ~158 SEK/month —
so the monetary win is small in absolute terms while the operational and hardware
cost is large. The real long-term case for local is **character consistency**
(ComfyUI's reference/ControlNet workflows), and that case is currently unproven
(§16, UNKNOWN).

---

## 19. Asset Lifecycle

**RECOMMENDATION — adopt canon §21.5 *Output-to-Asset Admission* verbatim as the
lifecycle. It is more precise than the brief's sketch and already authoritative.**

```
Media Request (brief + purpose + references + execution)
   ↓  eligibility (allowed set)                    ← deterministic, §11
   ↓  ranking → provider + model
   ↓  withGovernedSpend: estimate → reserve        ← lib/cost/governed-spend.ts
   ↓  provider dispatch → MediaJobRef
   ↓  poll getStatus(ref) → OUTPUT                 ← §21.4: Output ≠ Asset
   ↓  ADMISSION (§21.5), all required:
   ↓     retrieval · integrity validation · type validation
   ↓     classification · provenance capture · storage
   ↓     rights-state assignment · lifecycle assignment
   ↓  → ASSET  (stable id, version, checksum, provenance)
   ↓  settle spend
   ↓  project association
   ↓  QC gate (CCA / Image QA)                     ← designed, not built
   ↓  → available for publication (a separate, separately-authorized act)
```

**FACT — `Output` and `Asset` must have distinct identity** (§21.4: *"Output
identity and Asset identity shall remain distinct"*). An Output may become
rejected evidence, a temporary intermediate, a Candidate, or an Asset. Today
Omnira has neither identity — it has a URL string.

**RECOMMENDATION — the minimum viable asset record**, deliberately smaller than
canon's full object model:

| Field | Why minimal-but-required |
| --- | --- |
| `id` | §21.15 — the thing that does not exist today |
| `project_id` | Project Isolation is an official principle |
| `kind` | image / video / audio |
| `mime_type`, `bytes`, `width`, `height`, `duration_ms` | validated at admission, not trusted from vendor |
| `checksum` (sha256) | §21.3 integrity evidence; also what `canon.meta.json` currently has as `null` |
| `storage_path` | an *implementation detail* of the asset, not its identity (§21.9) |
| `provenance` | §10 below |
| `created_at` | — |

**FACT — Supabase Storage is already canonical de facto** (bucket `media-assets`,
public), and the canon manifest declares a second bucket `familje-stunden`
(`pending_import`). **No Supabase change was made in this phase.**

**RECOMMENDATION — flag, do not fix now:** the `media-assets` bucket is
**public**. That is acceptable for The Prompt's published reels; it is a question
worth answering before it holds unpublished Familje-Stunden drafts or any
classified asset.

---

## 20. Security Threat Model

Scoped to the boundary this project would create. Ownership is assigned per
control, as the brief asks.

| Threat | Owner | Rationale |
| --- | --- | --- |
| Prompt/brief injection via retrieved content | **Omnira** | briefs are assembled from news, articles, canon — all upstream of the provider |
| Secret leakage into prompts | **Omnira** | already partly solved: `MediaProviderError` redacts **in the constructor** (`errors.ts`), the Meta-incident lesson |
| Provider response validation | **Omnira** | `MEDIA_PROVIDER_RESPONSE_INVALID` exists; must extend to bytes, not just JSON |
| Oversized output / decompression bombs | **Omnira**, at admission | §21.5 requires type + integrity validation *before* the Asset exists — the correct chokepoint |
| Malicious reference assets | **Omnira** | references must be **asset ids**, never caller-supplied URLs (§9) |
| SSRF via reference URL | **Omnira** | follows directly from the above: if no URL is accepted, there is no fetch to redirect |
| EXIF / metadata privacy leakage | **Omnira**, at admission | strip on admission; a vendor may embed prompt text in EXIF |
| Metadata prompt injection (downstream) | **Omnira** | provenance is *data*; never re-fed to a model as instruction |
| Unbounded generation | **Omnira** | `withGovernedSpend` bounds monetary spend today; capacity needs the local-side equivalent (§12) |
| Path traversal / arbitrary FS read | **provider sandbox** | a local runtime's workspace must be a mount, not a host path |
| Arbitrary code execution via custom nodes | **provider sandbox** | ComfyUI custom nodes are unvetted in-process Python (§15) |
| Unsafe / malicious model files | **provider sandbox**, with an Omnira allowlist | `.ckpt` pickles execute on load; prefer `safetensors` + pinned hashes |
| GPU denial-of-service, queue starvation | **provider sandbox**, surfaced to Omnira | requires the concurrency + cancel gap in §13 to be closed first |
| Disk exhaustion | **provider sandbox** | Omnira must refuse on a reported headroom signal, not discover it by failing |
| External network egress from the node | **provider sandbox** | a local node that can call out is not local in the sense §19 means |

**INFERENCE — the two controls that must be built first, before any local
runtime, are the ones with no current home:** *admission-time validation* (which
does not exist because assets do not exist) and *cancellation/concurrency* (which
`MediaProvider` cannot express, §13).

---

## 21. Hardware / Operational Considerations

**UNKNOWN — Omnira has no canonical hardware profile.** A repository-wide search
for `VRAM`, `CUDA`, `GPU`, local inference endpoints (`:7860`, `:8188`) and
accelerator names found **no hardware specification, no runtime node record, and
no local endpoint configuration** anywhere in code, config, or docs. The only GPU
references are doctrinal (canon ch19/ch26, GainPilot ch20) and one line in the CCA
design about DINOv2 latency.

Per the brief's instruction, this is reported as UNKNOWN rather than invented.

**FACT — the development host, measured directly (read-only, this session).**
This is *a machine*, explicitly **not** a canonical Omnira hardware profile:

| | |
| --- | --- |
| Chip | Apple M4 (`Mac16,12`) |
| CPU / GPU cores | 10 / **8** |
| Unified memory | **16 GB** |
| Free disk | **4.1 GB** of 228 GB (74% used) |

**INFERENCE — this machine cannot host local generation today, and the disk figure
is the binding constraint.** An SDXL checkpoint is ~6.9 GB and FLUX.2 [klein] 4B
substantially more; neither fits in 4.1 GB of free space. Setting aside disk,
16 GB of *unified* memory shared with the OS and an 8-core GPU is far below the
~13 GB VRAM floor for FLUX.2 [klein] 4B and the ~32 GB for FLUX.2 [dev].

**RECOMMENDATION — treat "where would local generation run?" as a blocking product
question, not an implementation detail.** It has exactly three answers, and they
lead to different architectures:

1. **A dedicated GPU workstation** — makes local real; requires the Runtime Node
   model in §13 and capital expenditure.
2. **Rented GPU** — this is cloud with extra steps; it defeats the privacy
   argument and reintroduces monetary cost, but keeps model choice open.
3. **No local, for now** — the honest current state. Multi-provider still pays off
   immediately across Ideogram / OpenAI / MuAPI / Higgsfield / OpenArt.

**INFERENCE — option 3 is currently the correct default**, because it is the only
one that requires no purchase and no unproven assumption, and because §18 shows
the local win is currently privacy-only for a workload that has no privacy
requirement yet.

---

## 22. n8n Compatibility

**No n8n code was read, imported, modified, or depended upon. `origin/main`
contains zero n8n references.**

**INFERENCE — the recommended architecture is n8n-compatible by construction,
and specifically because of the Asset work in §19.**

The compatibility requirement in the brief is that n8n receives **asset identity
or an authorized Omnira capability**, never provider credentials, generation
policy, or canonical assets. That is satisfiable only if an asset *identity*
exists — which is precisely what Omnira lacks today. Currently the only thing
Omnira could hand n8n is a **public Supabase URL**, which is the worst case: it
is a credential-free capability grant that never expires, cannot be revoked, and
carries no provenance.

So:

```
Atlas → Media Runtime → Asset (id, provenance, rights) → workflow/n8n → publication
                              ↑
                    n8n receives THIS, not a provider key,
                    and not a permanent public URL
```

**RECOMMENDATION — no n8n work in this track.** The one thing Phase 1 should do
for future n8n compatibility is create the asset identity, which it needs anyway.
Nothing else. Phase 3 of n8n remains parked.

---

## 23. Proposed Phase 1

**RECOMMENDATION — the smallest useful implementation is NOT the orchestrator,
and NOT a local provider. It is the Asset.**

**Phase 1: Canonical Asset Identity + Provenance (read/write, no generation
behaviour change).**

**Why this and not the orchestrator:**

1. **It is the binding constraint.** Provenance (§6), n8n compatibility (§22),
   admission-time security (§20), reference-by-identity (§9), and rights handling
   all require an asset identity, and none can be built without it.
2. **It has zero spend risk.** It changes no generation path, adds no provider,
   flips no gate, and needs no credential. It cannot cause an unintended charge —
   which matters given that the thing being governed here is irreversible spend.
3. **It pays off immediately against the shipped pipeline**, not only against
   future providers: the Ideogram and `gpt-image-1` paths get provenance the day
   they are backfilled.
4. **The orchestrator is blocked without it.** §21.5 makes provenance capture and
   integrity validation *preconditions of admission*. An orchestrator built first
   would produce Outputs with nowhere canonical to put them, and would very likely
   grow its own ad-hoc storage — which is how the deleted `MediaSpendPolicy`
   duplication happened in this exact directory.
5. **It is honest about the hardware unknown (§21).** It commits nothing to local
   generation while that question is open.

**Scope — in:**

- `assets` table: id, project_id, kind, mime, bytes, dimensions/duration,
  sha256 checksum, storage_path, created_at.
- `asset_provenance`: asset_id, provider, model, adapter_version, request hash,
  brief snapshot, reference asset ids, cost_event_id, duration_ms, `simulated`
  boolean, `source` (`automated` | `attested`) — reusing the
  `workflow_evidence` construction (§6), **append-only, DB-enforced**.
- `lib/media/asset/admission.ts` — the §21.5 admission function: retrieve,
  validate type and integrity, checksum, store, record provenance, return an
  Asset. One entry point.
- Wire the **two shipped image paths** (`uploadSceneImage`, `uploadArticleHeroImage`)
  through admission, writing both the asset row and the existing URL column, so
  nothing downstream breaks.
- Extend `cost_events.metadata` (or add a nullable `asset_id`) so a spend row and
  an asset can be joined in both directions.

**Scope — explicitly out:**

- The Media Orchestrator, routing, ranking, eligibility.
- Any new provider, local or cloud. `MediaProviderId` is not touched.
- Enabling MuAPI, or changing any gate or license.
- The Model Registry (§10) — it belongs to Phase 2 with the orchestrator.
- Backfilling historical assets (a separate, reversible data task).
- The QC gate / CCA.

**Phase 2 (sketch, for sequencing only — not approved here):** Media Orchestrator
+ Model Registry + eligibility, wired to `withGovernedSpend`, with MuAPI as the
second *eligible* provider in **test mode**. Phase 3: ranking, once two providers
are genuinely eligible. Local runtime is not on this path until §21's hardware
question is answered.

---

## 24. Expected Files To Change

Listed before implementation, as required. **Nothing in this list has been
touched.**

**New:**

```
apps/web/supabase/migrations/2026XXXX_media_assets.sql
apps/web/lib/media/asset/types.ts            Asset, AssetRef, Provenance
apps/web/lib/media/asset/admission.ts        the §21.5 admission function
apps/web/lib/media/asset/store.ts            persistence (admin client)
apps/web/lib/media/asset/validate.ts         mime/bytes/dimension/bomb checks
apps/web/lib/qa/media-asset-admission.test.ts
docs/architecture/media-runtime/ASSET_MODEL.md
```

**Modified (narrow, additive):**

```
apps/web/lib/media/storage.ts                uploadSceneImage / uploadArticleHeroImage → admission
apps/web/lib/cost/track.ts                   carry asset_id on image/voice cost rows
apps/web/app/api/media/images/generate/route.ts   persist asset ids alongside images[]
docs/architecture/muapi-media-provider.md    correct the stale project_budget claim (§7)
```

**Explicitly NOT modified in Phase 1:**

```
apps/web/lib/media/providers/*               no contract change, no new provider id
apps/web/lib/atlas/capability/media-generation.ts   license stays draft/L0
apps/web/lib/cost/governed-spend.ts          spend boundary untouched
apps/web/lib/governance/*                    stop authority untouched
apps/web/lib/qa/muapi-media-provider.test.ts invariants 5 and 6 stay green
supabase/* (production)                      no Supabase change is applied in Phase 1 without explicit approval
```

---

## 25. Explicit Non-Goals

- Not a Fooocus integration. Fooocus is assessed and **not recommended** (§14).
- Not a local generation project. Local is deferred pending §21.
- Not a new budget, approval, or spend system. `withGovernedSpend` is the one
  boundary (§7).
- Not a new evidence system. The `workflow_evidence` construction is reused (§6).
- Not a publication path. Generation and publication stay separate
  (`MEDIA_GENERATION_PROHIBITED_RESPONSIBILITIES` includes `publishing`).
- Not a QC agent. CCA is designed elsewhere and stays there (§26).
- Not an n8n integration (§22).
- Not a rewrite of the shipped Ideogram / ElevenLabs call sites.
- Not a generic media framework. Every field in §9 is justified individually or
  omitted.

---

## 26. Risks / Unknowns

| # | Item | Type | Impact |
| --- | --- | --- | --- |
| R1 | **No hardware exists for local generation**; dev host has 16 GB unified memory and 4.1 GB free disk | FACT | Blocks any local provider. Needs a product decision (§21). |
| R2 | **FLUX [dev] / [klein] 9B are non-commercial**; Omnira's media is commercial | FACT | Legal review required before any FLUX weights are obtained (§16). |
| R3 | Character-consistency capability of any local model **against the real Nova/Pling canon** | UNKNOWN | The main strategic argument for local is unproven. |
| R4 | `media-assets` bucket is **public** | FACT | Fine for published reels; must be answered before unpublished or classified assets land there (§19). |
| R5 | `generateWithReference` **silently degrades** when the reference is missing | FACT | Live §6.254 violation; character consistency can be lost with only a `console.warn` (§3.2). |
| R6 | Familje-Stunden canonical character images are `pending_import` with `checksum: null` | FACT | The reference set the whole consistency story depends on is not in storage yet. |
| R7 | `MediaProvider` has **no `cancel`** and no concurrency/timeout concept | FACT | Must be closed before any local runtime; a stuck job holds the only GPU (§13). |
| R8 | ComfyUI publishes **no API stability guarantee**; custom nodes are unvetted Python | FACT | Adapter must be thin; node must be an untrusted zone (§15, §20). |
| R9 | Fooocus automation depends on a third-party wrapper pinned to an older version of a frozen project | FACT | Basis for the §14 recommendation. |
| R10 | `docs/architecture/muapi-media-provider.md` contains a **stale** claim that `project_budget` is not built | FACT | Corrected in §7; the doc itself should be fixed in Phase 1. |
| R11 | Two parallel media architectures coexist (vendor-named shipped vs vendor-neutral unused) | FACT | Acceptable and deliberate today; must not be allowed to become three. |
| R12 | `cost_events.unit_type` CHECK cannot express GPU-seconds | FACT | Blocks local cost accounting; deliberately deferred (§12). |
| R13 | Local `main` is 11 behind `origin/main` | FACT | Worktree was branched from `origin/main`; no action needed, but worth noting. |

---

## 27. GO / NO-GO Recommendation

### GO — with a materially different Phase 1 than the brief anticipated.

**GO on the Media Runtime as an architecture track.** The need is real and is
demonstrated by shipped code, not by speculation: image generation is hard-coded
to `gpt-image-1` in two places, character references degrade silently, generated
assets exist only as public URL strings, and nothing can answer "what made this
image?".

**GO on Phase 1 = Canonical Asset Identity + Provenance** (§23). It is the binding
constraint on every other part of the vision, it carries no spend risk, and it
improves the pipeline that is running today rather than only a future one.

**NO-GO on Fooocus.** Bug-fix-only maintenance, permanently SDXL-only by the
maintainer's own statement, no official API, and prompt rewriting that conflicts
with Omnira's provenance requirements. Adopting it would install exactly the
single-model lock-in this project exists to prevent.

**NO-GO on any local runtime *now* — and this is a hardware fact, not a
preference.** ComfyUI is the correct candidate when the time comes, but there is
no machine to run it on: 16 GB unified memory and 4.1 GB free disk on the only
documented host. Deferring costs nothing, because multi-provider value is
available immediately across the cloud providers Omnira already has.

**NO-GO on building the Media Orchestrator first**, despite it being the named
missing layer. Without asset identity it would produce Outputs with no canonical
destination and would likely grow its own storage and its own spend concepts —
the precise duplication that Governance G1 already had to delete from this
directory once.

### Decisions required from you before Phase 1 starts

1. **Confirm Phase 1 scope = Asset + Provenance**, not the orchestrator. This is
   the one place I am recommending against the brief's implied ordering, and the
   reasoning is in §23.
2. **Hardware (R1).** Is there, or will there be, a GPU host for local generation?
   The answer determines whether the local provider contract (§13) is designed
   soon or shelved.
3. **`media-assets` bucket is public (R4).** Keep it public for now, or make
   asset visibility a Phase 1 field?
4. **Backfill.** Should Phase 1 backfill provenance for existing
   `media_scripts.images` / `website_content.hero_image_url` rows, or only record
   forward from the change?
5. **R5 — the silent reference degradation.** Fix it inside this track (it is a
   real, live correctness bug), or spin it off as its own small PR? It is
   independent of the asset work.

### Stop gate

**Phase 0 ends here.** Nothing was installed, downloaded, generated, or deployed.
No credentials were added, no Supabase change was made, no Docker or GPU workload
was started, no gate or license was flipped, and Phase 1 has not begun.
