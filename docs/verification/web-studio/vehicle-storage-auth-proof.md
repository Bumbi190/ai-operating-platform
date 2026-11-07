# Vehicle photo Auth + Storage proof — isolated runtime integration

**Date:** 2026-11-02. **Status:** executable CI experiment, not approved live Storage or real vehicle photo upload.

## Invocation and isolation

CI reuses the already-existing, owner-labeled `startReferenceStack()` infrastructure in
`apps/web/scripts/reference-local-stack.mjs`.

Run only on Linux with `ATLAS_REFERENCE_TEST_MODE=isolated-local`:

`node apps/web/scripts/vehicle-capture-storage-auth-proof.mjs`

The helper explicitly refuses non-Linux or missing opt-in, requires at least 2 GiB free memory,
creates a uniquely named internal Docker network, short-lived real Postgres, GoTrue,
PostgREST and Supabase Storage services, ephemeral synthetic credentials, and a loopback
gateway. Containers have isolated temporary storage, memory and process limits.
The `finally` block cleans up only its own labeled resources. No production DB,
customer identity, storage bucket, image, real model, paid provider or deploy is touched.

The script applies unchanged SQL proposal `docs/sql/atlas-studio-real-vehicle-captures-p1b-proposed.sql`
to the **ephemeral** database and uses the genuine Storage API to create a private
`vehicle-originals-private` bucket with MIME/size restrictions. Service-role is used
**only** for fixture seeding (two synthetic users plus original files); owner checks run
using separate authenticated user JWT clients.

## Assertions

- Owner A downloads own image from private bucket; returned bytes SHA-256 match source.
- Owner B cannot download owner A's image, and vice versa.
- Owner A cannot download a revoked listing image.
- Anonymous caller cannot download owner A's image.
- Authenticated listing of the bucket does not return protected paths.
- Authenticated upload, overwrite and delete are denied; the original object remains intact.
- No production table or public bucket is installed in Omnira or Handlarbörsen.

**Important distinction:** the prior RLS fixture replaced `storage.allow_any_operation()`
with a test implementation. This one is intended to use the real Supabase Storage and
GoTrue services and their live operation mapping—but only inside a disposable, synthetic
CI environment. It is not proof of production's existing policies, customer session,
or a genuine vehicle's identity. A passing result must be confirmed at the exact CI SHA
before claiming end-to-end success.

## Remaining product gates

The separate `owner-scoped-storage.ts` adapter is still not on a customer route and
the proposed schema remains unapplied. Before first actual vehicle photo:
original image byte decoding and dimensions; rights/source verification; authenticated
human review and approval; complete database migration review and rollout; image lifecycle,
retention and revocation; signed proof of the exact GLB/car visual match; owner release.
