# Real Vehicle Original Capture — isolated PostgreSQL RLS proof

**Date:** 2026-11-02. **Scope:** Test the UNAPPLIED SQL proposal
`docs/sql/atlas-studio-real-vehicle-captures-p1b-proposed.sql` without touching
Omnira, Handlarbörsen, Supabase projects or any customer images.

## Execution

`pwsh -NoProfile -File ./scripts/verification/run-vehicle-capture-rls.ps1`

The runner creates a **brand-new disposable Postgres 17 Alpine container**, with:
- `--network none`, no published ports, no volumes or host mounts
- 192 MiB hard memory limit, one CPU and an 80-process ceiling
- temporary randomly PID-suffixed container name; finally block destroys it
- synthetic Postgres users, schemas, auth.uid() and storage.allow_any_operation()
- all proposal SQL applied to this disposable DB only; SQL assertions fail on error

The runner has been executed successfully on Hultgren (Windows) using pre-existing
Docker image `postgres:17-alpine`. It prints
`PASS: isolated owner/foreign/revoked/storage-role SQL assertions` and
`PASS: isolated PostgreSQL proposal verified with synthetic A/B owners ...`
and exited 0. The first attempt on Postgres 16 reached the temporary init
server during startup; fixed final-server wait and reran successfully.
Both 16 and 17 policy assertions passed; CI now reuses postgres:17-alpine.

## What the executable SQL assertions verify

- Anonymous caller sees **zero** objects in the proposed private bucket.
- Owner A sees two self-owned listings (one active, one revoked), but only
  one active photo and one private Storage object.
- Owner B sees just B's listing, photo and object, never owner A's.
- The scoped object without a matching photo record cannot be read.
- Revoked listing hides its photo/object.
- Operation `object.list` returns zero objects; approved
  `object.get_authenticated` / `object.get_authenticated_info` can read
  the permitted owner's object only.
- `authenticated` has **no INSERT/UPDATE/DELETE privileges** on listing,
  photo or storage objects.
- A forged cross-owner photo insert is rejected by composite foreign key.
- The proposal's SQL schema, CHECK, RLS policy DDL and object-name restrictions
  compile and execute with `ON_ERROR_STOP=1` in PostgreSQL 17.

## Important limits and next release gates

This is an **isolated PostgreSQL SQL test**, **not a real Supabase Storage API
integration test**. Our synthetic `storage.allow_any_operation` is a
controlled test replacement using `current_setting('storage.operation')`.
Actual Supabase gateway op naming, JWT sessions, existing cross-bucket policies,
file decoding, MIME signatures, antivirus scans, bucket configuration, API
authorization, upload/delete behavior and owner/seller license rights remain
unverified. `SELECT` policy tests are not a substitute for a full authenticated
`storage.from(bucket).download()` E2E proof. Other existing RLS policies may
be OR-combined in production and must be audited before enabling this proposal.

The real bucket/table/Storage policies are **not installed**. No active upload
or signed-URL endpoint exists; metadata writers and reviewer controls remain
proposed. Never add a fake migration ledger entry or disable the unrelated SCB
migration-guard failure to make Vercel pass. PR #368 remains Draft.
