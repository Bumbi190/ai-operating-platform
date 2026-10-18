# The Prompt: registered illustrated production presentation — 18 October 2026

## Scope and authority

After approving the exact smooth-camera private movie at 08:52 Stockholm, André asked to continue. This bounded step prepares the existing Remotion production presentation. It does not activate the seven-day trial or install a publishing authority.

- New registered composition: `ThePromptIllustratedNews`, creative version `the-prompt-illustrated-smooth-v1`.
- Reuses the approved frame design, actual three images, canonical Victoria narration, English word captions, continuous 1.02→1.10 camera motion and 90-frame FOLLOW THE PROMPT outro.
- Production footer uses THE PROMPT instead of PILOT REVIEW; outro keeps AI-GENERATED / EDITORIAL ILLUSTRATIONS. Both story illustration disclosures remain.
- The private wrapper forces its own presentation after caller props. It retains its existing private watermark. Shared frame extraction cannot silently turn the approved private template into a production presentation.
- Production wrapper requires the pinned version, three distinct nonempty image URLs, nonempty story/audio/source fields, a parseable source timestamp and canonical valid word timings. It derives its own shot plan from actual words and duration; old/injected looping plans are ignored.
- These are structural render checks, not proof of rights, voice identity, source freshness, project ownership, asset hashes, budget or release permission. Those remain server responsibilities.
- Actual Root registers this composition separately at 1080×1920 / 30 fps and calculates actual narration frames plus 90 outro frames. With the real 29,721ms narration this is 982 frames. Empty placeholders cannot render a production movie.
- The central legacy Lambda starter now enforces its existing two-composition TypeScript union at runtime, before database reads/imports/paid dispatch. The new composition is deliberately rejected there. Existing illustrated-marker, missing-row and DB-error holds remain; SimpleNewsReel and ShortFormVideo still work in regression tests.

## Verification

The new production/Root assertions failed before implementation (missing new module); the new unapproved-composition handoff case failed because legacy Lambda dispatched it. Both are now green. No real Lambda request was made by these tests.

- Complete Remotion Node/tsx suite: **138/138 PASS**, zero failures/skips.
- Both existing editorial/news preview isolation contracts: PASS.
- Scoped web regressions across the existing twelve budget/provider/stop/authorization/migration/reconciliation/report test files: **334/334 PASS**.
- Full web TypeScript: PASS.
- Full Remotion app typecheck with ES2023 + skipLibCheck still reports **nine existing diagnostics** in legacy Root, ThePromptNewsPreview and render.ts. A virtual compiler-host comparison against HEAD 1564765 finds the same file/error-code multiset; the private-wrapper signature changes one diagnostic's wording. No diagnostic in the new production component. Do not describe the entire Remotion app typecheck as green.
- Private presentation parity: rendered static markup for all 982 frames before/after shared-frame extraction has identical SHA-256 `132b78cdae39f7bdea394073f226e40d335f0cb6dd7ffe56177fcc56888eaa06`, using fixed deterministic story props and the same Remotion-hook stub. This is markup parity, not a second encoded video comparison.
- Production tests render actual component markup and inspect the actual Root component: AI disclosures at story/outro, private labels retained only by the private wrapper even with injected presentation props, actual audio/caption props, derived three-shot plan, rejection of old version/missing inputs/duplicate images and actual 982-frame metadata.
- Runtime handoff tests exercise the real transpiled Lambda module with external DB/Lambda stubs: unknown new composition rejected before even a DB read; both allowed legacy compositions dispatch once; illustrated/missing/error scenarios dispatch zero times.
- This step was self-reviewed; no new independent reviewer is claimed.

## Real local movie and persisted asset readback

Read-only actual runtime inspect ran twice against the existing authorized preview, with the same four asset IDs. All four private signed deliveries matched registered byte sizes/checksums. No generate call, asset write or paid provider request.

- Preview: `194592d0-57b0-5980-a01c-dc9fad5e39eb`.
- Existing three images: `54e2680b-e770-4488-ab14-11df6f3eaa49`, `740be12c-5cbf-42ea-a050-578bf8ac8166`, `81d4263b-6d7d-46bf-b184-5e959be89c05`.
- Existing Victoria audio: `b7bb7717-3478-4408-a972-a7fc54d92f3b`.
- Actual 73 words; narration 29,721ms; image boundaries 0 / 9,555 / 19,296ms.
- This is authorized operator CLI readback, not authenticated browser/HTTP verification.

Rendered **through actual `src/index.ts` / Root registration**, selecting `ThePromptIllustratedNews` with freshly signed actual persisted props:

```
remotion render src/index.ts ThePromptIllustratedNews <local-output.mp4>
  --props=<ignored-actual-props.json> --codec=h264 --crf=24
  --scale=0.6666666667 --concurrency=2 --timeout=30000 --log=error
```

Result: **The-Prompt-Anthropic-produktionsmall.mp4**, H.264/AAC, 720×1280, 30fps, 982 frames, video 32.733333s / container 32.746667s, **6,630,037 bytes**, SHA-256 **`9f2fa29912da43efa731453796c417c3a26d661189a85641c4603f0be50a9fab`**. Saved as a distinct production-presentation artifact, `libfile_3996771a7e908191952fe7a77b6e1e9d`, version 0. The approved private file identity/version was preserved.

Full A/V decode PASS. Encoded opening, frames around both real image changes, captions, disclosure/footer and outro inspected. Encoded AAC payload SHA-256 **`2c365218bd7976f6a59dceb8b36919335c57bc6c654f1ba539f91f93204b749b`** exactly matches the approved private movie; no regenerated/replaced voice.

The private owner's approval remains bound to private version 1 SHA `92a035817577e969ec54b2dd76292ef48d1c60829b18bba32608ae1c1d79d25a`. The new production presentation has different bytes because its review labels change. This export is technical production preparation, not a fabricated approval receipt or public release.

## Remaining integration

Keep PR #377 draft. Step3 and the central starter continue holding illustrated rows. Next work must bind reviewed output and trusted source/usage/voice provenance to the existing project/budget/stop/idempotency/release/rollback boundaries before controlled cloud rendering or publishing.

DST-safe 10:00/20:00 Stockholm schedule (#378) and prospective equal-age 24h/72h platform observations (#383) remain separate open prerequisites. No scheduler, SQL migration, schema, social account or live trial flag changed here. Original article expires at 18 October 16:26 UTC / 18:26 Stockholm, before the evening slot; this saved technical sample cannot be silently reused as fresh news later.

No main merge, production deployment, AWS render/site deployment, public media release or social posting. Media, signed props and credentials stay outside Git.

## Automatic web preview blocker after push

Source commit `de9f0eabf1a5be00fc461a263a546df66d1fdcda` was pushed to draft PR #377. Its automatic Vercel preview `dpl_GRc6CRhAXrfNgDuA3HDybBATWSPn` failed **before Next compilation**, at the existing read-only migration guard: production ledger contains unknown migration name `sales_reply_preparation`.

A fresh `git fetch origin main` still resolves canonical main to `f0a52321361b7f1a03d5336cbd7a5c8c4d769ac5`; it contains no such migration. A candidate source exists only on separate `codex/atlas-harvey-sales-20261017`, commit `7c857f7fb210247d0c54eff28e1d6dd6d155b437`, file `20261018040242_sales_reply_preparation.sql`. Merely matching its name does not prove that its SQL equals the already-applied DB statements. No source from that unrelated, unmerged feature was copied into this branch.

The guard, migration policy and ledger were not bypassed or changed; no migration was applied/reapplied. Canonical reconciliation of the already-applied sales migration is a separate shared-repository dependency. The new code is pushed and the actual local movie verified, but **the current web preview is not READY**. The prior READY branch deployment remains at `1564765`; do not present that older web code as the newly pushed version. No authenticated HTTP retest of the new code is claimed.

Issues #378 and #383 were re-read during this follow-up and remain open.
