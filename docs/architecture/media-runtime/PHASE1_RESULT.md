# OMNIRA MEDIA RUNTIME — PHASE 1 RESULT

**Canonical Asset + Provenance Foundation**

**Branch:** `feat/omnira-media-runtime` · **Worktree:** `.worktrees/omnira-media-runtime`
**Originally based on:** `origin/main` @ `9bb9f11`
**Rebased onto:** `origin/main` @ `ef48afbde948065900cf5dfd492116fa3c8411e2` (see §Refresh Against Current Main)
**Date:** 2026-09-02

---

## Result

**PASS.** The private-draft-storage invariant is now structurally satisfied in
the authored foundation (§Private Draft Storage Hardening), so the condition
attached to this result is met.

One item still requires your action before this branch can deploy: the migration
must be applied (§Schema / Migration). One scope reduction I made deliberately is
flagged rather than buried (§Security Boundary, the SSRF allowlist).

| Check | Outcome |
| --- | --- |
| Typecheck (`tsc --noEmit`) | clean |
| Full suite (`vitest run`) | **216 files, 6467 tests, all passing** (re-run after the rebase) |
| New tests | 54 (admission) + 21 (SQL, real DB) + 5 (proof path) = **80** |
| Migration applied to a REMOTE database | **no** — authored only |
| Migration applied to a THROWAWAY LOCAL database | **yes** — and it revealed a real defect (§Private Draft Storage Hardening) |
| Supabase production / Docker / deploy / model download | **none** |
| Blast radius vs. Phase 0 estimate | **smaller** (see §Files Changed) |

---

## Repository State

Pre-flight, before any edit:

| Reading | Value |
| --- | --- |
| Branch | `feat/omnira-media-runtime` |
| HEAD at the time | `9bb9f118cd7553ec295ab4bd9138169152b4a85f` |
| HEAD vs `origin/main` | 0 ahead, 0 behind |
| `git status` | 1 entry — the untracked Phase 0 doc |
| `PHASE0_PREFLIGHT.md` | present |
| Unexpected drift | none |

*(Historical: that was the state when Phase 1 was written. The work has since
been committed and rebased — see §Refresh Against Current Main.)*

**One environment note.** The worktree had no `node_modules`, and the machine has
**547 MB free disk** (down from 4.1 GB at Phase 0), so `npm install` was not
viable. `node_modules` is symlinked to the canonical checkout's instead. Both
symlinks are gitignored and appear in no diff. They make the suite runnable in
this worktree; delete them freely.

---

## Canonical Asset Model

Two new tables. The narrowest placement that satisfies canon, and nothing more.

### `public.assets`

| Column | Why it earns its place |
| --- | --- |
| `id` uuid PK | The canonical identity — the whole point (§21.15) |
| `project_id` → projects | NOT NULL. Ownership; RLS cannot scope a nullable owner |
| `kind` CHECK (image/video/audio) | Drives validation; widening the CHECK needs no rename |
| `mime_type`, `byte_size` | Validated at admission, never trusted from a vendor |
| `checksum_sha256` CHECK 64-hex | Integrity evidence (§21.3) — proves a moved object is unchanged |
| `width`, `height`, `duration_ms` | Nullable *because the medium lacks them*, not because they were skipped |
| `visibility` CHECK, DEFAULT `internal` | §Visibility below — the fail-closed half |
| `status` CHECK (active/archived/superseded) | Matches the repo's existing lifecycle vocabulary |
| `storage_bucket`, `storage_path` | Current LOCATION, not identity (§21.9) |
| UNIQUE (bucket, path) | One asset per stored object |

**Deliberately absent:** tags, collections, folders, renditions, rights holders,
licence terms, alt text, ordering. Canon defines Representations and Renditions
(§21.23–21.35); Phase 1 stores one location per asset because Omnira produces
one. This is not a DAM.

**On the name.** `assets`, not `media_assets`. The bucket is already called
`media-assets`, and giving the table a near-identical name would undercut the one
distinction it exists to make — that an asset is *not* its storage. Scope is
enforced by the `kind` CHECK, which widens without a rename.

### `public.asset_provenance`

`asset_id` is the primary key: exactly one provenance record per asset, and it
cannot outlive the asset or be duplicated.

**Required:** `source` (`generated | uploaded | derived | imported`) — the only
field every asset has.

**Optional (all nullable):** `provider`, `model`, `provider_request_id`,
`adapter_version`, `seed`, `brief_hash`, `request_hash`, `cost_event_id`,
`duration_ms`. Plus `reference_asset_ids uuid[]`, `simulated boolean NOT NULL
DEFAULT false`, and `provider_metadata jsonb`.

**Why nothing vendor-specific is required.** A human-uploaded character reference
has no provider, model or seed. Requiring any of them would make the canonical
layer unable to hold the exact asset class Familje-Stunden's character canon
depends on. Canon §6.254 forbids adapters silently dropping requested features;
the mirror of that rule is that the canonical layer must not silently *require*
vendor-specific ones. Test 6/12 proves an upload admits with every provider field
null.

**Append-only, enforced in the database** by `asset_reject_mutation()` triggers —
the same construction as `workflow_evidence` and `atlas_authorizations`. Note
what is *not* append-only: `assets` itself. Location, visibility and status are
*meant* to change; the record of what produced the bytes is not.

**RLS** follows the owner-scoped project-native pattern verbatim from
`20260613_media_rls_hardening.sql`. Provenance derives its policy from `assets`
via subquery so there is one ownership rule, not two that can drift.

---

## Storage Identity Model

The separation is structural, not conventional:

```
IDENTITY     assets.id                    durable, never changes
LOCATION     storage_bucket + storage_path may change; moving ≠ new asset
DELIVERY     publicDeliveryUrl(location)   derived on demand, never stored as identity
```

Three mechanisms make it hold rather than merely intend it:

1. **`AssetId` is a branded type.** A URL, storage path, or provider request id
   cannot be passed where an asset identity is required — the compiler catches
   the exact confusion this phase exists to end.
2. **`putAssetBytes` returns a `StorageLocation`, never a URL.** The legacy
   `uploadArticleHeroImage` returned a public URL and nothing else, which is
   *why* every hero until now existed only as a URL: a caller handed a URL stores
   a URL. A caller of the new boundary physically cannot record a URL as identity.
3. **URL derivation runs identity → URL, never the reverse.** Contrast
   `app/api/outputs/[id]/route.ts`, which today recovers a storage path by
   string-splitting a public URL:

   ```ts
   const path = output.file_url.split('/storage/v1/object/public/outputs/')[1]
   ```

   That line breaks if the bucket is renamed, if the URL is signed rather than
   public, or if Supabase changes its URL shape. Nothing built on
   `publicDeliveryUrl` can acquire that bug, because bucket and path are already
   known before a URL exists.

**A found bug, worth naming.** That `outputs` route creates a *signed* URL but
parses a *public* URL prefix. Since the bucket is public the signing adds no
protection, and if the bucket were ever made private the split would silently
yield `undefined`. Not fixed here (out of scope) — recorded in §Remaining Risks.

**One correctness improvement over the legacy path.** The old helper chose the
file extension from the response header — `contentType.includes('png') ? 'png' :
'jpg'` — so a WebP was stored as `.jpg` and any header the provider got wrong
went into the path. Admission derives the extension from the MIME type that has
*already passed* the magic-number check, making "extension matches bytes"
structurally true.

---

## Visibility / Publication Semantics

Two values: `internal` and `public`. The smallest vocabulary that separates "not
for the world" from "published". No ACL system.

**`internal` is the default in three places** — the column, the TypeScript type,
and `admitAssetBytes` — so an omitted field can never yield a public asset.

**The guarantee, and the honest consequence.** The only bucket Omnira defines is
`media-assets`, created **public** in `20260520_media_tables.sql`. So there is
nowhere private to put bytes. Rather than model visibility and then quietly
ignore it, `assertVisibilityPlacement` **refuses** to write a non-public asset
into a world-readable bucket:

```
Refusing to store a "internal" asset in the world-readable bucket "media-assets".
A non-public bucket must be provisioned before non-public assets can be admitted.
```

Today that refuses *every* draft. That is the correct behaviour, not a temporary
inconvenience: the alternative is writing a draft where anyone can read it and
recording `visibility: 'internal'` beside it, which would make the column a
comforting lie. Proven by four tests, including that omitting `visibility`
refuses rather than publishes.

### RESOLVED by the hardening amendment

The paragraphs above describe Phase 1 as first submitted, when the only bucket
was public and every draft was therefore refused. That gap is now closed —
`media-assets-private` is created by the same (still-unapplied) migration and
`internal` assets are routed to it. See §Private Draft Storage Hardening for the
model, the access analysis, and the defect that applying the migration locally
uncovered.

---

## Private Draft Storage Hardening

Added after the Phase 1 review, into the **still-unapplied** migration.

### Doctrine check, before any SQL was written

You asked me to verify rather than assume that an unapplied migration may be
edited. **It may.** The only migration-immutability statements in the repository
both scope the prohibition to migrations that have *already been applied*:

- `docs/memory/2.0/stage-1/MEMORY_STAGE_1_FOUNDATION_PLAN.md:223` — *"Do not edit
  already-applied migrations unless this repo is confirmed not to have any
  applied migration history."*
- ibid. `:363` — *"Prefer one new reconciliation migration rather than editing
  existing **applied** migrations."*

Three supporting facts: the file is untracked in git, so it has never been in a
deployed build; no `apply_migration` was ever run against it; and **no test pins
migration content or checksums** — the guards count files by derived ledger name,
which an in-place edit leaves unchanged. So the count did not gain an extra slot
for the hardening: there is no second migration. *(The slot itself later moved
from 59 to 60 when the branch was rebased — see §Refresh Against Current Main.)*

### Storage precedent found (and the gap in it)

| Question | Precedent in this repository |
| --- | --- |
| Bucket creation | **One** instance: `insert into storage.buckets (id, name, public) … on conflict do nothing` (`20260520_media_tables.sql:7`) |
| Private buckets | **None** |
| `storage.objects` RLS | **None anywhere** — verified across both migration directories |
| Signed URLs | **One** call site, 1-hour expiry (`app/api/outputs/[id]/route.ts:27`) |
| Bucket size / MIME limits | **None** — the one insert sets `(id, name, public)` only |

**A gap worth recording:** two buckets in live use — `outputs` and `run-images` —
exist in **no migration at all**. They were created by hand. That is the same
drift `20260613_media_rls_hardening.sql` was written to close for tables (*"RLS
was later enabled by hand in the live project but never written down"*). Not
fixed here — they are outside the Media Runtime boundary and adopting them would
mean asserting a live state this change has not inspected. `TRUSTED_BUCKETS`
deliberately excludes both, so the asset layer will not write into storage whose
provisioning is not in the repository.

### Bucket model

```sql
insert into storage.buckets (id, name, public)
values ('media-assets-private', 'media-assets-private', false)
on conflict (id) do nothing;
```

Exactly the existing precedent's shape. **`public = false` is the load-bearing
part**: Supabase refuses the `/object/public/…` route for a non-public bucket at
the storage service, so the guarantee does not depend on a policy this migration
writes and could get wrong.

`media-assets` stays public and unaltered — published heroes are served from it.

**Bucket-level `file_size_limit` / `allowed_mime_types` are deliberately not
set.** There is no convention for them here, and a column this migration cannot
test against a live Supabase is a way for the whole migration to fail on apply.
Both limits *are* enforced in `lib/media/asset/validate.ts` (`MAX_BYTES`,
`ADMITTED_MIME_TYPES`) and unit-tested. Promoting them to bucket columns is a
sound defence-in-depth follow-up once this applies cleanly.

### Placement: structural, not merely checked

The invariant is enforced by removing the ability to express its violation:

```ts
// AdmitAssetInput
storage: { path: string }        // ← no bucket field. At all.
```

The bucket is **derived** from visibility via a total map:

```ts
BUCKET_FOR_VISIBILITY = {
  internal: 'media-assets-private',   // public = false
  public:   'media-assets',           // public = true
}
```

A caller cannot pair a draft with the public bucket, because there is no argument
that could carry the wrong answer. A test passes `{ bucket: 'media-assets' }`
through a cast and asserts the bytes still land privately.

`assertVisibilityPlacement` then enforces the pairing in **both** directions:

| | permitted | refused |
| --- | --- | --- |
| `internal` | `media-assets-private` | `media-assets` — the **leak** |
| `public` | `media-assets` | `media-assets-private` — the **silent breakage** |

The second direction is not a leak but is still wrong: a published asset filed
privately is unreachable through the delivery URL every existing reader expects,
and would fail at render time rather than at admission. One rule prevents both.

A third, independent check re-derives "is this bucket world-readable?" from
`PUBLIC_BUCKETS`. It is redundant while the map is correct — and it is exactly
what still holds if a future edit adds a public bucket to the map by mistake.

`publicDeliveryUrl` now **refuses** a non-public location. `getPublicUrl` is a
pure string builder: it would happily return an `/object/public/…` URL for a
private bucket that Supabase then serves a 400 for, putting a dead link into
`hero_image_url` to fail at render time, far from the cause.

### URL semantics for private assets

`signedAssetUrl(location, expiresInSeconds = 3600)` — a function, never a column.

A stored signed URL would be worse than a stored public one: not merely indirect,
but *wrong* after expiry, with every reader needing to know that. So nothing
persists it; `assets` keeps bucket + path, and access URLs are minted at the
moment of use. Tests assert that two signings of one asset differ, that neither
is the identity, and that no `token=` string reaches any persisted row.

It is **not** an authorization decision — it signs whatever location it is given.
A test asserts it contains no `auth.uid`/`getUser`/`session`/`owner_id` check,
because a half-authorization callers might trust is worse than none.

### Access model

| Question | Answer |
| --- | --- |
| Who can **write** draft assets? | `service_role` only, via `createAdminClient()` — the same path as every existing media write |
| Who can **read** them? | `service_role`, and whoever holds a signed URL Omnira minted. Anonymous and authenticated clients get **nothing** |
| How is project ownership enforced? | On `assets`/`asset_provenance` via owner-scoped RLS, and at admission (`project_id` required, no default). **Not** at the storage layer — the path contains `projectId` for organisation, never as enforcement |
| Does service-role bypass RLS? | **Yes** — documented in `lib/supabase/admin.ts` and relied on by `20260613_media_rls_hardening.sql`. The asset RLS protects the anon/authenticated clients, not the server |
| Future authenticated temporary access? | `signedAssetUrl` behind a route that checks the `assets` row's `project_id`. **Not built** — a user-facing draft view is publication-adjacent and out of scope |
| Can project A read project B's draft? | Not through storage: no reader exists besides service_role. Through the table, RLS scopes to `projects.owner_id`. **Honest caveat:** every project currently shares one owner, so cross-project isolation for reads rests on the application layer, not on RLS |
| Can a guessed storage path reveal a draft? | **No — this is the whole point.** In the public bucket, paths built from ids are guessable and every object is world-readable. In `media-assets-private` there is no public route to guess |

**No `storage.objects` policies were created**, deliberately. With none, the
reachable set is already the most fail-closed one available. Writing policies for
a role that has no read path would invent an access model nobody uses and nobody
has tested against a real requirement. When a user-facing draft view exists, it
brings its own policy.

### Applying the migration locally found a real defect

The amendment is proven by `lib/qa/media-asset-foundation-sql.test.ts`, which
applies the actual migration file to a **throwaway local database** (created,
then dropped; no remote contact, no credentials read, skipped entirely where no
local postgres exists). It immediately earned its place:

> **The append-only trigger blocked the cascade.** `asset_provenance.asset_id` is
> `on delete cascade`, so deleting an asset fired the flat no-delete trigger and
> the delete failed. Every asset with provenance would have been permanently
> undeletable — and because `assets.project_id` cascades from `projects`, **any
> project owning one asset would have been undeletable too.**

`workflow_evidence` never hits this because it references its parent with
`on delete restrict` — it forbids the parent delete rather than cascading into an
append-only child.

The fix narrows the rule to what is actually worth protecting: provenance must
never be **rewritten**, and must never disappear **while the asset it explains
survives**. It vanishing *together with* its asset is the whole record retiring
at once, which project deletion and erasure both legitimately need. The check is
exact, not heuristic — in a cascade Postgres deletes the parent first, so the
asset row is already gone when the child's `BEFORE DELETE` fires, while a direct
delete finds it present.

Both directions are now asserted, plus "a project with assets can still be
deleted" — a defect no mocked test could have seen.

### Tests (Task F)

| # | Requirement | Result |
| --- | --- | --- |
| 1 | draft cannot select public storage | internal → `media-assets-private`; caller-supplied bucket ignored |
| 2 | public cannot use private placement | refused — the silent-breakage direction |
| 3 | private identity independent of access URL | id stable; two signings differ |
| 4 | signed URL is not canonical identity | no `token=` in any persisted row |
| 5 | provider URL cannot determine visibility | same URL admitted twice, different buckets |
| 6 | path is Omnira-built and validated | traversal refused; provider filename never in the path |
| 7 | project identity survives private admission | preserved; cross-project reference still refused |
| 8 | article-hero proof remains green | 26/26 |
| 9 | no live Supabase credentials needed | none present in the test environment |
| 10 | no remote mutation during validation | local throwaway DB only; dropped after; none left behind |

### Migration state and deployment prerequisite

**Unchanged and unresolved:** the migration is authored, proven to apply against
a local database, and **applied to no remote database**. It remains ONE migration,
edited in place. Its ledger slot is now **59 → 60** (74 files − 14 grandfathered),
having been renumbered from 58 → 59 during the rebase — see §Refresh Against
Current Main.

The deployment prerequisite is in §Schema / Migration and is now slightly larger:
applying it also creates the private bucket.

---

## Provenance Model

**Placement decision: a dedicated linked record, not columns on `assets`, and not
`workflow_evidence`.**

- *Not on `assets`* — provenance must be append-only while the asset must stay
  mutable. One table cannot be both.
- *Not `workflow_evidence`* — it is `instance_id`-bound by foreign key to a
  workflow instance. Assets are produced outside workflows too. Its
  *construction* is reused (append-only triggers, the automated/attested style of
  honesty about how a fact was established); its table is not.
- *Not `cost_events`* — that is a ledger, and it has no asset reference.

**Brief and request are stored as hashes, never payloads.** A brief carries
editorial text drawn from retrieved articles and a prompt may carry arbitrary
third-party content. Hashing keeps "was this the same request?" answerable
without the provenance table becoming a second content store — or becoming text
that some later feature re-reads as an instruction. `canonicalHash` sorts keys
recursively so property order cannot change the answer.

**Provenance records, it does not authorize.** `provider: 'ideogram'` is a fact
about the past. A test asserts the asset modules export no
`generate|dispatch|invoke|execute` verb, so the asset layer cannot become a
second door to a provider that `lib/media/providers/gate.ts` does not guard.

**`simulated`** is carried on the record, not merely in config, because a
persisted asset outlives the environment that produced it. It maps directly onto
`MediaJobResult.simulated` in the existing provider contract.

---

## Project Ownership

`assets.project_id` is `NOT NULL` with an FK to `projects` — the existing
convention, reusing the existing project identity. No second ownership model.

**Exactly one project per asset.** Project Isolation is an official Omnira
architecture principle (agents are instantiated per project, not filtered;
cross-project shared agent memory is forbidden). A many-to-many usage table would
be speculation about cross-project asset libraries, which canon does not
currently require. `admitAssetBytes` refuses an empty project id — there is no
default owner, which is the same failure mode `governed-spend.ts` was built to
close after every voiceover was silently billed to one hardcoded slug.

---

## Reference Asset Semantics

`asset_provenance.reference_asset_ids uuid[]` — canonical references **by
identity, never by URL**.

`assertReferencesUsable` requires every referenced asset to (a) exist and (b)
belong to the **same project**. A cross-project reference is **refused, not
filtered**: silently dropping it would produce an asset whose provenance claims
fewer references than were requested — the §6.254 hidden-feature-loss failure one
layer down, which is precisely the defect Phase 0 found in
`generateWithReference`.

An unverifiable reference (a lookup that errored) also refuses. Fail closed.

This is foundation only. No character-consistency generation is implemented, and
none is implied.

*Array rather than a join table:* narrowest shape that meets the requirement.
Referential integrity is enforced at the admission boundary instead of by FK. If
references later need their own attributes (role, weight, strength), that becomes
a table — a change this shape does not obstruct.

---

## Proof Generation Path

**Chosen: the article hero image** (`lib/article/hero-image.ts`).

| Criterion | Article hero | Scene images (`uploadSceneImage`) |
| --- | --- | --- |
| Call sites | **1** | 8 across routes and crons |
| Existing test coverage | yes, 21 tests | partial |
| Deterministic in tests | yes | yes |
| Governance + spend already wired | yes | yes |
| Needs a live paid API in tests | no | no |

One call site versus eight. Phase 0 had provisionally named the scene-image
route; this is a *reduction* in blast radius, and the reason is recorded here
rather than made silently.

**The change:**

```
before:  ideogramUrl → uploadArticleHeroImage(...) → publicUrl → hero_image_url
after:   ideogramUrl → admitAssetFromUrl(...)      → asset     → hero_asset_id
                                                   → publicDeliveryUrl(asset.storage)
                                                               → hero_image_url
```

`website_content` now carries **both**, and both are meaningful:

- `hero_image_url` — LEGACY delivery URL. Still written, because the publish sync
  and every existing reader depend on it.
- `hero_asset_id` — CANONICAL identity. NULL on every pre-existing row.

**Failure semantics are unchanged.** Admission refuses by throwing, exactly as
the upload did, so a refusal lands in the same `catch`, yields
`hero_image_status='failed'`, and sends the same alert. No new class of failure
was introduced — proven by test 26.

---

## Spend / Governance Compatibility

**Nothing was built. Everything was reused.**

| Concern | Where it stays |
| --- | --- |
| Stop authority | `resolveExecutionEligibility()` — untouched |
| Execution contract | `projectScope(...)` — untouched |
| Spend reservation/settlement | `withGovernedSpend` in `lib/cost/governed-spend.ts` — untouched |
| Cost ledger | `cost_events` via `logImageCost` — untouched |
| Failure alerting | `sendPipelineAlert` — untouched |

**`lib/cost/track.ts` was NOT modified.** Phase 0 expected to change it; it turned
out `CostContext.metadata` already accepts arbitrary fields, so `assetId` rides
there and the cost event links to the asset with zero change to the cost module.

Tests assert this by shape, so a future refactor that *drops* one is caught rather
than merely reviewed: the asset modules import nothing from `lib/cost/`, call no
spend function, and carry no amount-shaped column.

**The asset is not a second ledger.** `cost_event_id` is a link, and deliberately
*not* a foreign key: cost logging is fire-and-forget (`void logImageCost(...)`)
and must never be able to block or roll back an admission that already succeeded.

---

## Security Boundary

Fail-closed at the new boundary, in canon §21.5 order. Every refusal is a typed
`AssetRejectionCode`.

| Control | Status |
| --- | --- |
| MIME allowlist (per kind) | enforced — **SVG deliberately excluded** (scriptable in a public bucket) |
| Magic-number verification | enforced — a `Content-Type` is a claim, not a fact |
| Size bounds | enforced, per kind |
| Path traversal | enforced — `..`, `.`, absolute, empty segment, backslash, NUL |
| Trusted bucket allowlist | enforced |
| Visibility/placement | enforced — the draft guarantee |
| Project ownership | enforced |
| Reference integrity | enforced, same-project |
| Retrieval scheme | enforced — https only |
| SSRF | enforced structurally — see below |
| Retrieval timeout | 30 s |
| Atomic unwind | bytes and row removed if any later step fails |

### The SSRF allowlist: a design I wrote, then removed

I first implemented `TRUSTED_SOURCE_HOSTS` as a provider-hostname allowlist.
**I removed it, because it was wrong twice over, and the second reason is the
one that matters:**

1. **The hostnames were guessed.** Ideogram returns `data.data[0].url`
   (`lib/media/image-client.ts:103`) and nothing in this repository records which
   host serves it. An allowlist of guessed hosts is worse than none: it fails
   closed against the *real, working* path in production while looking like a
   security control in review. And `api.openai.com` was outright fiction —
   `gpt-image-1` returns `b64_json` (`lib/ai/runner.ts:736`), so there is no URL
   to fetch at all.
2. **It breached the provider boundary.**
   `lib/qa/governance-provider-boundary.test.ts` fails the build when a runtime
   module outside four sanctioned adapters names a provider hostname, *and*
   asserts that allowlist is exactly those four. Adding the asset layer to it
   would have weakened a deliberately locked G1 invariant to satisfy a control
   that could not be verified anyway. The guard caught this; I treated it as
   correct rather than as an obstacle.

**What is enforced instead** needs no vendor knowledge and is stronger in
practice:

- https only — kills `file:`, `gopher:`, `http:` to an internal service
- no IP literals — dotted-quad, IPv6, **and the decimal / hex integer forms**
  `169.254.169.254` is usually disguised as
- no non-public hostname shapes — `localhost`, single-label hosts, `.local`,
  `.internal`, `.home.arpa`
- optional `allowedHosts` pinning supplied by the *caller*, which is the layer
  that has the knowledge — defence in depth without freezing a guess

Fourteen refusal cases are tested, all asserting **the network was never
touched**.

**Known gaps, named rather than assumed:** DNS rebinding and redirect-to-internal
(both need resolve-then-connect control `fetch` does not expose); EXIF stripping,
decompression-bomb detection, and dimension extraction (all need an image library
Omnira does not depend on). Content moderation is excluded by design — a
generator must never judge whether its own output is publishable.

---

## Legacy Compatibility

**Forward-only. No backfill. No existing row rewritten.** The migration contains
no `UPDATE` or `INSERT` against any pre-existing table.

The legacy boundary is visible in three places at once:

1. **Schema** — `hero_image_url` (legacy) beside `hero_asset_id` (canonical),
   NULL on every pre-existing row. That null means "predates the asset system",
   not "broken", and the column comment says so.
2. **Types** — `LegacyMediaRef { kind: 'legacy-url', url }` is a distinct shape.
   A URL cannot be widened into an `AssetId`; converting one requires actually
   admitting the bytes.
3. **Code** — `lib/media/storage.ts` is **untouched** and still serves all eight
   `uploadSceneImage` call sites. A test asserts both legacy exports still exist,
   so a future change cannot quietly delete the legacy path and assume migration.

A test also asserts no function named `urlTo*` / `adopt*` / `backfill*` /
`migrate*` exists in the asset layer — the shape a silent conversion would take.
`admitAssetFromUrl` is the deliberate exception and it *retrieves and validates*
rather than blessing an existing URL.

---

## Tests / Validation

`tsc --noEmit`: clean. `vitest run`: **216 files, 6467 tests, all passing** — re-run in full after the rebase, not carried over.

New: `lib/qa/media-asset-admission.test.ts` (54), `lib/qa/media-asset-foundation-sql.test.ts`
(21, against a real local database), + 5 added to `lib/qa/article-hero-image.test.ts`.

| # | Requirement | Where |
| --- | --- | --- |
| 1 | Identity stable and independent of URL | "asset identity is independent of any URL" (4 tests) |
| 2 | URL is not the identifier | provider URL discarded; delivery URL derived; no url-shaped column persisted |
| 3 | Belongs to expected project | ownership tests; empty project refused before any byte written |
| 4 | Validation fails closed | 8 tests — MIME, magic number, size, traversal, bucket, SSRF, extension |
| 5 | Provenance without provider authority | provider/model recorded; no generate/dispatch verb exported |
| 6 | Optional metadata may be absent | upload admits with every provider field null |
| 7 | References by asset ID | recorded; non-existent refused; cross-project refused; URL-as-reference refused |
| 8 | Draft cannot silently become public | 5 tests, incl. omitted `visibility` refusing |
| 9 | Proof path keeps spend/governance | asserts stop authority, cost, scope, alerting all still present |
| 10 | No live image API | `fetch` stubbed; byte admission performs zero network calls |
| 11 | Legacy stays legacy | distinct type; no conversion helper; `storage.ts` intact |
| 12 | No mandatory provider field | same as 6, plus arbitrary vendor metadata accepted non-canonically |

Plus atomicity: bytes removed if the row fails, row *and* bytes removed if
provenance fails (§21.5 — an asset nobody can explain must not exist).

### Two existing governance guards caught this change

Both were treated as correct and updated deliberately, not bypassed:

1. **`governance-provider-boundary.test.ts`** — caught the guessed hostname
   allowlist. Resolved by removing the hostnames, **not** by widening the
   sanctioned-file list. The guard is untouched.
2. **`executive-intelligence-schema-activation.test.ts`** — enforces an exact
   migration count with a documented reason per increment. Entry added in the
   same form; now **59 → 60** after the rebase (it was 58 → 59 when written).

---

## Schema / Migration

`apps/web/supabase/migrations/20260902_media_asset_foundation.sql` (330 lines).

**NOT APPLIED to any database.** No Supabase mutation was performed.

### The deploy ordering constraint — please read

`scripts/check-migrations.mjs` is wired into `apps/web` `build`. It is
post-baseline, so this migration is **enforced**:

- **Local** builds, typecheck and tests: unaffected (`VERCEL !== '1'` skips it) —
  which is why the full suite passes now.
- **Vercel** deploy: **will fail** until the migration is applied to the database.

That is the guard working as designed (schema before code). Concretely: this
branch must not be deployed or merged until you apply the migration via the
Supabase migration flow, as `apply_migration(name='media_asset_foundation')` so
the derived ledger name matches. After applying, regenerate
`database.types.ts` and the `(db as any)` casts in `lib/media/asset/store.ts` can
be deleted.

The migration is additive and behaviour-neutral: two new tables, one new private
bucket, one nullable column, no data change, no existing bucket altered. Applying
it alone changes nothing that runs today.

**It is no longer unproven.** `lib/qa/media-asset-foundation-sql.test.ts` applies
this exact file to a throwaway local database on every test run and asserts the
schema it produces — which is how the cascade defect in §Private Draft Storage
Hardening was found. What that proof does NOT cover: Supabase-specific storage
behaviour, since the harness stubs `storage.buckets`. Only a real apply shows
that.

---

## Refresh Against Current Main

Phase 1 was written against a base that has since moved three merges. This
section records the integration; nothing about the reviewed design changed.

| | |
| --- | --- |
| Previous base | `9bb9f118cd7553ec295ab4bd9138169152b4a85f` |
| Intermediate base | `9e0c81b` (PR #164 + G3C-2A) |
| New base (current `origin/main`) | `ef48afbde948065900cf5dfd492116fa3c8411e2` |
| Branch HEAD after refresh | `9b925eb83f3a67282043821bc7ecc2265e150d8a` |
| Position | 1 ahead, **0 behind** |
| Integration method | commit, then `git rebase origin/main` (twice — see below) |

**Main moved twice during the refresh.** After the first rebase onto `9e0c81b`,
PR #165 (trading session calendar) landed. The branch was rebased again onto
`ef48afb`; that second rebase was **conflict-free** — #165 adds no migration, does
not touch the ledger guard, and overlaps no Phase 1 file — and the migration count
was unaffected (still 74 files → 60 enforced). Full validation was re-run on the
final base rather than carried forward.

### Why a rebase, and why a commit first

The branch was **0 ahead / 8 behind**: all of Phase 1 was uncommitted working-tree
state, so there was nothing to rebase yet. It was committed as one focused commit
first, which makes the integration a real three-way merge with an inspectable
conflict rather than a stash/pop that would have surfaced the same collision as
raw markers in an untracked file. It also leaves the branch PR-ready, matching the
repository's convention (branch off main → PR → merge commit).

### What arrived from main

Eight commits, including PR #164 (the required-reference fail-closed fix) and
G3C-2A. Only one file overlapped Phase 1's changes:

| Phase 1 file | Touched by main? |
| --- | --- |
| `lib/article/hero-image.ts` | no |
| `lib/qa/article-hero-image.test.ts` | no |
| `lib/qa/executive-intelligence-schema-activation.test.ts` | **yes** — `c168f12` |
| `docs/architecture/muapi-media-provider.md` | no |

`docs/architecture/media-runtime/` now also holds main's
`REFERENCE_FAIL_CLOSED_FIX.md`; different filename, no collision.

### Conflicts — one, resolved by meaning

**`lib/qa/executive-intelligence-schema-activation.test.ts`.** Both sides added a
changelog entry claiming slot **58 → 59**, and both raised the count assertion to
59. Main's belongs to `stop_atomic_execution_admission` (G3C-2A), which is already
merged and therefore owns the slot.

Resolved by keeping **both** entries, neither discarded:

- main's `58 → 59: stop_atomic_execution_admission` — **verbatim, unchanged**
- Phase 1's entry renumbered to `59 → 60: media_asset_foundation`
- count assertion `toBe(59)` → `toBe(60)`

Phase 1's entry also carried a sentence explaining the private-storage hardening
was folded in "rather than a 60th" migration. Left as-is that would have read as
nonsense beside an entry numbered 60, so it was reworded to say the same thing
accurately: hardening is folded into the same file, *and* the entry was renumbered
on rebase — both permitted by the same doctrine, because the migration has never
been applied anywhere.

No other conflict occurred, and no main behaviour was modified.

### Migration reconciliation — verified, not assumed

The prediction was "59 → 60". That turned out correct, but it was re-derived from
the repository rather than taken on trust:

| Check | Value |
| --- | --- |
| `.sql` files in `apps/web/supabase/migrations` after rebase | **74** |
| `GRANDFATHERED_COUNT` in `check-migrations.mjs` | 14 |
| Enforced = 74 − 14 | **60** |
| Latest migration on main | `20260902081500_stop_atomic_execution_admission.sql` |
| Ledger name uniqueness | no duplicates |

**The file was NOT renamed, and did not need to be.** Both the guard and the test
derive the ledger name as `file.replace(/^\d+_/, '').replace(/\.sql$/, '')`, so
`20260902_media_asset_foundation.sql` already yields the unique name
`media_asset_foundation`. There is no filename-format requirement, and the only
ordering assertion in the guard concerns the Executive Intelligence bundle, not
general order. The file also already sorts **last** (`'0' < '_'`, so
`20260902081500_…` precedes `20260902_media…`), which is the correct position for
the newest migration.

So the reconciliation was a **changelog and count change only** — the smallest
change that makes the ledger true. Renaming would have been churn.

### Post-refresh validation

Everything was re-run against the integrated branch, not carried over:

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| Migration ledger guard | 19/19 |
| Governance provider boundary | 25/25 |
| Asset admission | 54/54 |
| SQL migration proof (real local Postgres) | 21/21 |
| Article hero (proof path) | 26/26 |
| MuAPI provider guards | 65/65 |
| **PR #164 reference fail-closed** | **24/24** |
| **Full repository suite** | **216 files, 6467 tests, all passing** |

All 17 locked Phase 1 invariants were re-verified from source after integration,
plus the private-storage checks (§Private Draft Storage Hardening): private bucket
still `public = false`, `media-assets` unaltered, placement still derived from
visibility, `publicDeliveryUrl` still refuses a private location, and no URL column
exists in either new table.

### PR #164 behaviour remains intact

Phase 1 does not touch `lib/ai/runner.ts` at all — `git diff origin/main -- lib/ai/runner.ts` is empty — so it cannot weaken the fix. Verified on the refreshed
branch anyway:

- `utan ref` absent from code
- no `?? generateWithRetry` anywhere
- `await generateWithRetry(` at exactly **one** call site (the cover branch)
- the 24-test regression suite passes

Phase 1's own proof path (`lib/article/hero-image.ts`) is a different module and a
different provider path; the two changes are orthogonal.

---

## Files Changed

**New (7):**

```
apps/web/supabase/migrations/20260902_media_asset_foundation.sql   330
apps/web/lib/media/asset/types.ts                                  196
apps/web/lib/media/asset/validate.ts                               442
apps/web/lib/media/asset/store.ts                                  318
apps/web/lib/media/asset/admission.ts                              356
apps/web/lib/qa/media-asset-admission.test.ts                      ~900
apps/web/lib/qa/media-asset-foundation-sql.test.ts                 ~350   ← hardening: real-DB proof
docs/architecture/media-runtime/PHASE1_RESULT.md                   (this file)
```

The hardening amendment edited three of the files above in place
(`20260902_media_asset_foundation.sql`, `validate.ts`, `admission.ts`,
`store.ts`) and added one new test file. No second migration was created — see
§Private Draft Storage Hardening for why editing the unapplied one is permitted.

**Modified (4) — 246 insertions, 20 deletions:**

```
apps/web/lib/article/hero-image.ts                        +88   the ONE proof call site
apps/web/lib/qa/article-hero-image.test.ts               +118   mock updated + 5 new tests
apps/web/lib/qa/executive-intelligence-schema-activation.test.ts        migration ledger 59→60
docs/architecture/muapi-media-provider.md                 +47   corrected the stale claim
```

**Versus the Phase 0 estimate — smaller, not larger:**

| Phase 0 expected | Actual |
| --- | --- |
| `lib/cost/track.ts` | **not modified** — `CostContext.metadata` sufficed |
| `lib/media/storage.ts` | **not modified** — kept as the legacy boundary |
| `app/api/media/images/generate/route.ts` | **not modified** — proof path moved to the 1-call-site hero |
| — | +2 test files, not foreseen: two governance guards required deliberate updates |

Untouched, as required: `lib/media/providers/*`, `lib/atlas/capability/media-generation.ts`,
`lib/cost/governed-spend.ts`, `lib/governance/*`, `lib/qa/muapi-media-provider.test.ts`
(invariants 5 and 6 still green), all n8n work, production Supabase.

---

## Explicitly Deferred

- Media Orchestrator, provider ranking, Atlas routing
- Model Registry / provider–model–deployment separation
- Fooocus, ComfyUI, FLUX, Qwen-Image, any local GPU execution
- Video and audio generation runtimes
- n8n integration
- Broad legacy backfill of existing URL-string media
- Public publishing workflows; customer-facing asset library UI
- Character-consistency implementation
- The `generateWithReference` fail-open defect (below)
- ~~Private bucket provisioning~~ — **done** (§Private Draft Storage Hardening)
- A signed-URL DELIVERY ROUTE with an authorization decision (the helper exists; no route consumes it)
- `storage.objects` RLS policies (none needed until a non-service-role reader exists)
- Bucket-level `file_size_limit` / `allowed_mime_types` (enforced in code today)
- EXIF stripping, decompression-bomb detection, dimension extraction
- Asset Representations / Renditions (canon §21.23–21.35)

---

## generateWithReference Defect — CLOSED, merged separately

Phase 1 found that `generateWithReference` (`lib/ai/runner.ts`) fell back to
unreferenced generation when a required character reference failed, and recorded
it here as a defect for its own branch.

**That is now fixed and merged to main** — PR
[#164](https://github.com/Bumbi190/ai-operating-platform/pull/164), commit
`e131baa`, merge `9e0c81b`, documented in
`docs/architecture/media-runtime/REFERENCE_FAIL_CLOSED_FIX.md`.

The locked contract there — *a required reference must never degrade to
unreferenced generation* — is canonical main behaviour and is arrived at
independently of Phase 1. Phase 1 changes no file it touches. See §Refresh
Against Current Main for the verification that this branch preserves it.

The forward-looking connection stands: Phase 1's
`asset_provenance.reference_asset_ids` is what will eventually let a reference be
addressed **by asset identity** rather than by the convention-based filename
(`saga-N.png`) that fix still relies on. That is Phase 2 work, not this branch.

## Remaining Risks

| # | Item | Type | Impact |
| --- | --- | --- | --- |
| R1 | Migration must be applied before deploy or the Vercel build fails | FACT | Blocks merge/deploy. Intended guard behaviour. Slot is now **59 → 60** after the rebase |
| R15 | A further migration landing on main before this merges would re-collide | INFERENCE | The same one-line reconciliation (count + changelog entry) would repeat. Cheap, but it is why this branch should merge promptly rather than sit |
| R2 | ~~No private bucket exists~~ | **RESOLVED** | `media-assets-private` is created by the migration; drafts are admitted privately |
| R2b | The private bucket does not exist until the migration is applied | FACT | Until then, admitting an `internal` asset would fail at the storage call — the same prerequisite as R1, not a separate one |
| R2c | No `storage.objects` RLS exists, so a signed URL is bearer access for its lifetime | FACT | 1-hour default, minted only by service-role code; acceptable while no user-facing draft route exists. Revisit when one is built |
| R3 | `(db as any)` casts in `store.ts` until types regenerate | FACT | Contained to one file and two table names; deletion after regen |
| R4 | Disk pressure on the dev host | FACT | Was 547 MB free at Phase 1; 13 GB free at the refresh. Still blocks local model work, but no longer blocks tooling |
| R5 | Provider CDN hostnames still unknown | UNKNOWN | Host pinning stays optional until real hosts are observed |
| R6 | Redirect and DNS-rebinding SSRF not defended | FACT | Needs per-hop control `fetch` does not expose |
| R7 | EXIF not stripped | FACT | An admitted image may carry vendor metadata into a public bucket |
| R8 | ~~`generateWithReference` fails open~~ | **RESOLVED** | Fixed and merged as PR #164 (`e131baa`). Verified intact on this branch |
| R9 | `media-assets` bucket is public | FACT | Fine for published heroes; the reason R2 exists |
| R10 | Seven other image call sites still write URL strings | FACT | Deliberate (forward-only). They are legacy until migrated. |
| R11 | Checksums are recorded but never re-verified | INFERENCE | Bit-rot or replacement would go unnoticed; a verification pass is Phase 2+ |
| R12 | `outputs` and `run-images` buckets exist in no migration | FACT | Pre-existing drift, outside this boundary. Both are excluded from `TRUSTED_BUCKETS` so the asset layer cannot write to them |
| R13 | Cross-project read isolation rests on the app layer, not RLS | FACT | Every project shares one `owner_id` today, so the owner-scoped policy does not separate them. Matters when a second owner exists |
| R14 | The local SQL proof stubs `storage.buckets` and `auth.uid()` | FACT | It proves the migration's SQL applies and its constraints work; it does not prove Supabase-specific storage behaviour, which only a real apply can |

---

## Phase 2 Recommendation

**The Media Orchestrator — now genuinely unblocked.**

Phase 0 argued the orchestrator could not be built first because §21.5 makes
provenance capture and integrity validation preconditions of admission, and there
was no asset for an Output to become. That is now resolved: an orchestrator can
dispatch, receive an Output, and hand it to `admitAssetFromUrl` without inventing
storage or a spend concept.

Suggested Phase 2 scope, smallest first:

1. **Model Registry** (canon ch7) — `Provider → Model → capability flags`, so
   `consistencyRequirement: 'required'` can *refuse* a model that cannot honour
   references rather than silently degrade (§6.254). This is the smallest piece
   with real product value, and it is what the reference-defect fix needs.
2. **Eligibility layer** — the deterministic allowed-set: capability license,
   execution stop, provider gate, budget headroom, model feature support. All
   five inputs already exist; this composes them.
3. **MuAPI as the second *eligible* provider, in test mode only.** Its
   `MediaJobResult.simulated` already maps onto `asset_provenance.simulated`, so
   a sandbox image can never be mistaken for a paid one.
4. **Ranking — last, and only once two providers are genuinely eligible.**
   `router.ts` argues persuasively that a heuristic tuned against one candidate
   encodes that candidate's quirks as general rules.

**Not Phase 2:** local runtimes. R4 (547 MB free disk) makes that unchanged from
Phase 0 — the hardware question is still open and still yours.

**Two small items worth folding in early:** private bucket + signed delivery (R2),
which unblocks draft assets; and migrating the seven remaining image call sites
(R10) once the hero path has run in production long enough to trust.

---

## Stop Gate

**Phase 1 ends here.** Nothing was merged, deployed, or applied to any database.
No image runtime was installed, no model downloaded, no image generated, no
credential added, no Docker or Supabase change made, and Phase 2 has not begun.
The work is now one commit on `feat/omnira-media-runtime`, rebased onto current
`origin/main` — see §Refresh Against Current Main for the integration record.
