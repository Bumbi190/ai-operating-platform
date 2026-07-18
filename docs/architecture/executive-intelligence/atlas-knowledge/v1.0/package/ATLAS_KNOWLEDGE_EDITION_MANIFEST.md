# Atlas Knowledge Edition — Manifest (Validation Candidate 2)

- package_status: ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN
- build_date: 2026-07-17

## Inputs (read-only)
- canonical_book_sha256: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8` (verified before & after: UNCHANGED)
- final_pdf_sha256: `b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2` (verified before & after: UNCHANGED)

## Hash schema
Hash schema (one meaning per field, identical for chapters and front matter):
- `canonical_book_sha256` — ALWAYS the compiled canonical book: `ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8`.
- `canonical_source_file_sha256` — the chapter's separate canonical source-file SHA-256; `null` for front matter
  (front matter has no separate source file).
- `record_text_sha256` — SHA-256 of this record's exact canonical text.
- `section_text_sha256` (sections) / `block_text_sha256` (blocks) — documented aliases of `record_text_sha256`.
The ambiguous field `canonical_sha256` from Candidate 1 is removed.

## Counts
- chapters: 32 · sections: 6705 · blocks: 55840 · front_matter_sections: 4
- active_diagrams: 17 · parts: 10 · relationship_records: 73
- retrieval_tests: 56 · passed: 56 · failed: 0

## Router implementation
- Build/query_atlas.py — deterministic token/phrase scoring, term lexicon 05_Retrieval/term-lexicon.json
- embeddings: false · vector_database: false · model: false
- router_sha256: `59693314e1668d3862eebd37e47c16bda97f84381df451474459bf3281f00747`
- test_fixtures_sha256: `5ebffc881a33985bfc5abaa2ed9fb74aa22a85afc4765e5a7c82a29206cf2727`

## Build commands (no hardcoded session paths)
```
python3 Build/build_atlas.py --workspace-root "<path>/executive-intelligence" --output-dir "<path>/executive-intelligence"
python3 Build/run_retrieval_tests.py --package-root "<path>/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2 Clean"
```

## Tool versions
- python: 3.10.12 · pdftotext version 22.02.0

## Validation results
- PASS — chapter_files_32
- PASS — section_records_6705
- PASS — block_records_55840
- PASS — front_matter_sections_4
- PASS — canonical_order_preserved
- PASS — no_duplicate_section_ids
- PASS — no_missing_section_ids
- PASS — no_candidate_build_markings
- PASS — no_D14_in_active_edition
- PASS — active_diagram_count_17
- PASS — hash_book_sha_constant
- PASS — hash_frontmatter_sourcefile_null
- PASS — hash_chapter_sourcefile_correct
- PASS — hash_record_text_correct
- PASS — diagrams_have_real_visible_labels
- PASS — diagram_relations_structured_supported
- PASS — all_navigational_aids_labelled_NCA
- PASS — no_speculative_relationships
- PASS — retrieval_router_actually_run
- PASS — retrieval_tests_min_50
- PASS — retrieval_tests_all_pass
- PASS — canonical_sha_unchanged
- PASS — final_pdf_sha_unchanged

Overall: ALL CHECKS PASS

## Diagram labels/relations
17 active diagrams; each has a real `visible_labels` array and structured `explicit_visual_relations`
(subject/predicate/object/relation_type/supporting_section_ids/provenance/confidence), transcribed from
`diagrams_final.py` + cited canonical sections. Withdrawn integration diagram excluded.

## Package hygiene
- No transient test files (no `Build/__deltest.txt`). No `__pycache__/` and no `*.pyc` in the package.
- Every `Build/*.py` sets `sys.dont_write_bytecode = True`, so running the runner/router creates no bytecode cache.
- Every deliverable file except this manifest is in the checksum table below; there are no unlisted files.

## Known limitations
- Per-section page ranges derived from Final Professional Edition header positions.
- `implementation_status` is `unknown_not_verified_in_this_package` for all records (repo/runtime not inspected).
- Canonical prose has no §/"Section N.M" cross-references; section→section links limited to explicit textual chapter references.
- No embeddings, no vector database (out of scope this phase).

## Authority disclaimer
This package is knowledge, not authority. Retrieval grants no execution rights. Human authority, governance,
approval gates, and project isolation always apply. Canonical target architecture is not implemented runtime;
repository, schema, runtime, and deployment remain authoritative.

## File checksums (SHA-256)
| File | SHA-256 |
|---|---|
| `01_Canonical_Knowledge/Chapters/chapter-01-executive-intelligence-manifesto.md` | `6104943948d145fea95186e29612bc8e36dbdb54f5be2cffb6dabd93d00fd7b2` |
| `01_Canonical_Knowledge/Chapters/chapter-02-the-role-of-executive-intelligence-in-omnira.md` | `f00042482786d4caf056fbc0c1317fa6689ae222e9f4f7a4539929556aad6795` |
| `01_Canonical_Knowledge/Chapters/chapter-03-executive-vs-workforce-vs-manager.md` | `4273513567e5d12e6622afbd6df1268f1eac66e28f005b86edda5985c8b00724` |
| `01_Canonical_Knowledge/Chapters/chapter-04-portfolio-executive-architecture.md` | `0cb3f654785fbbf4be89edd548e68333edf20ce9b984836c86a3c619061a49cf` |
| `01_Canonical_Knowledge/Chapters/chapter-05-project-executive-architecture.md` | `1ca5362e7632008f7e375e3ee98d55c63f505191230de362319d02a0a088aee3` |
| `01_Canonical_Knowledge/Chapters/chapter-06-project-isolation-and-executive-boundaries.md` | `8bc6b624d68148b58e5ae8325e1b75b7976bbfb7b97fded1f950d9e5cf8dfdb9` |
| `01_Canonical_Knowledge/Chapters/chapter-07-executive-operating-cadence.md` | `c8b0997e940ce69586596d537d7e2193adf30a4683f5286225a9c9188ccd5009` |
| `01_Canonical_Knowledge/Chapters/chapter-08-daily-executive-brief.md` | `3fcc0c8424add7ab42fe90f0ae1325f908794a70e0f7ae2af48361ea67ae7a79` |
| `01_Canonical_Knowledge/Chapters/chapter-09-founder-capacity-and-calendar-aware-planning.md` | `524a5f69f1127f644a90738a466f8def5da3dc1418ef86497d6f5db7209f7eae` |
| `01_Canonical_Knowledge/Chapters/chapter-10-decision-intelligence.md` | `d919ca0ca8809bc2c8dfac9d6d80a3124cb8dc94c9e73a16bc750eddf2583070` |
| `01_Canonical_Knowledge/Chapters/chapter-11-decision-ledger.md` | `81d92340cfc63cfd696768236cee48336eb904cd19a815ff966b823262597321` |
| `01_Canonical_Knowledge/Chapters/chapter-12-review-dates-and-decision-decay.md` | `773dfb3138dd66dbd8153deaf736b8f5b9e432acd9b761c6d909e1ea176c7ff0` |
| `01_Canonical_Knowledge/Chapters/chapter-13-strategic-planning-and-roadmap-intelligence.md` | `f3e49cd0ddc9aace02d96ad9a9431a197f35dd88ead68d7a0b6b901646cd1f7b` |
| `01_Canonical_Knowledge/Chapters/chapter-14-prioritization-system.md` | `dee3a04302f00edd5e618c30443736c0147d4a8471ae636e049bb7c8f6db60da` |
| `01_Canonical_Knowledge/Chapters/chapter-15-opportunity-cost-intelligence.md` | `79956e784fa32a53e80b5672acc4888fcc21983fa1a3e9411820bdf1d789e7bd` |
| `01_Canonical_Knowledge/Chapters/chapter-16-governance-and-policy-engine.md` | `f50b2c2759f00c3c09d22df5960374698f1b032ad737fc63f801594682917576` |
| `01_Canonical_Knowledge/Chapters/chapter-17-damage-boundary.md` | `47e0a1f424f58dea26ce2730d228309f36b349f92bc9efb90b0c468aac5e526c` |
| `01_Canonical_Knowledge/Chapters/chapter-18-autonomy-licensing-model.md` | `1db235c04eb8e5aed0c1b2f4607c1a994865e3f91c76ed12bdb89b2ba02c7813` |
| `01_Canonical_Knowledge/Chapters/chapter-19-trust-score-and-autonomy-progression.md` | `0c2c303ba15fd8805537a6cec83fc1d80c84ce61388f2659d28c350a8d424466` |
| `01_Canonical_Knowledge/Chapters/chapter-20-executive-mission-briefs.md` | `4f38b24b9b79dad8e6670814f63f792b1fccaae077f2477d547adad8bb044e58` |
| `01_Canonical_Knowledge/Chapters/chapter-21-workforce-delegation-and-intervention.md` | `a6dad475c4f0ebc337c5ee0f481096ceac877499932d541ab78124c64c7fa980` |
| `01_Canonical_Knowledge/Chapters/chapter-22-executive-memory-integration.md` | `8cca3338ac09b11e025ad95aa42d92372f0e3acc1b8dd2931127017692172610` |
| `01_Canonical_Knowledge/Chapters/chapter-23-executive-knowledge-integration.md` | `c882e60db50260bf2445a66011c2dcf77c3d89f065d2c9509be2f456f059c591` |
| `01_Canonical_Knowledge/Chapters/chapter-24-executive-ai-intelligence-integration.md` | `b90c62d9b1b522cd648b89d81ddedb7bf073a2b1f5ef1e8a2aa159cddaf1803e` |
| `01_Canonical_Knowledge/Chapters/chapter-25-executive-performance-intelligence-integration.md` | `c6ccd9157b0166118940249fdd75fa11dd8826cf7475bc93ef5b594ce8086cd5` |
| `01_Canonical_Knowledge/Chapters/chapter-26-executive-graphs-and-transparency.md` | `e7fde521eadee1d92e71a9b3467407053088d3e93babaf2580d8b42423dba507` |
| `01_Canonical_Knowledge/Chapters/chapter-27-approval-inbox.md` | `005e33f730dddcff26a3b0f306b68e47f0cdc8c3aaee16e2348c155faaf5dc27` |
| `01_Canonical_Knowledge/Chapters/chapter-28-crisis-mode-and-emergency-brake.md` | `8d6a28a00192160dce7ea2493720a871937978ec2de3b41d35aeaa11151f29f0` |
| `01_Canonical_Knowledge/Chapters/chapter-29-policy-violations-and-severity-levels.md` | `a8af71b4ef7587bef0058cf5ca9421ff965e9c75161af26b13238affa58e55b7` |
| `01_Canonical_Knowledge/Chapters/chapter-30-the-prompt-as-first-autonomy-proving-ground.md` | `8f5a821dd9d2590173dd37e1159a7490ef3da02df66410f409b677ae94739ca7` |
| `01_Canonical_Knowledge/Chapters/chapter-31-future-full-autonomy.md` | `ecd2bc91b7d4cf01dcc3547d5f8df4a166151b9e8b20c6f67c27a3a5e43194a4` |
| `01_Canonical_Knowledge/Chapters/chapter-32-final-executive-manifest.md` | `fc9662536f8a5cbf8b4e9d084fe95d129176b44bed03dcb415484358e926ef70` |
| `01_Canonical_Knowledge/executive-intelligence-blocks.jsonl` | `f16383744de85c44ab50f12cb9296e93fbddd1b6a4c082f75d8f911f50e9f751` |
| `01_Canonical_Knowledge/executive-intelligence-sections.jsonl` | `6b2a0af02496bf4137781009a8df6a2eba513d3ec491852dcfc860a65dd0ec8e` |
| `01_Canonical_Knowledge/front-matter.jsonl` | `e104c26fdbf4e69019cfa37167820882e90f61bd5bb679c51c4213dc304581d0` |
| `02_Indexes/authority-index.json` | `7e61a459964dea28a468bce2d8b911c1b89dd91b09eb581338b9707992972f52` |
| `02_Indexes/autonomy-index.json` | `570e0d0ad6dec1909e5c9384d98a574b5f6f188353740fd1a11fe701bb416db5` |
| `02_Indexes/chapter-index.json` | `0c8eb2ef09c872e867ce84a2d7a55bf1c0a0c97a5d8556530214870561eec9a0` |
| `02_Indexes/concept-index.json` | `bea349b02323cfe1350f2941d8c0de5f86ef17037238302c716305707129f4df` |
| `02_Indexes/decision-and-approval-index.json` | `5d0d5af8de350cc6558466a42f2852563a929ab1953460e93f9c7421b9e2db90` |
| `02_Indexes/diagram-index.json` | `ab8b86a41652e14b946ec3cce3b815a61b992d52201aae4503664e1c673ae60e` |
| `02_Indexes/governance-index.json` | `6552c3f3dc34a7fb8bb279120f1e6c8d3a678f48c33f477b8f96cbfc97316c89` |
| `02_Indexes/lifecycle-and-operating-modes-index.json` | `b57d23d7dcef6b73d9ba1b25f4be05d82103929ce7664faf874a85a44ff8e288` |
| `02_Indexes/project-index.json` | `3c983b31a1935ef479f44100e1e86c1f67ea513bce05b27c174dc8b266123bfa` |
| `02_Indexes/section-index.json` | `c265defc4884e9dedb32fce638ba97ccf481775d5dca6d73f282bc6310114f30` |
| `02_Indexes/stage-1-index.json` | `0aadebda7d7e37a2475a0c5d87f7d40eee29d63f97b6f93725dd384d5723c261` |
| `03_Relationships/chapter-dependencies.json` | `3b71e4be6562d636c412dfcd80517e45959cfcec6eb326e763b72778f194a430` |
| `03_Relationships/explicit-relationships.jsonl` | `51fb747e5a3e3d7cf0d46743af61c7eeb2bfbcc1e191138f9075cbcafaf4f9ff` |
| `03_Relationships/section-links.jsonl` | `5074b3a1eb9b9990a0f00c7d0ea5d07fe2f33f7fbb03469348063d6918c79117` |
| `04_Governance/ATLAS_RETRIEVAL_RULES.md` | `0852a934699b9a942781576fb03411dccce2f654233276881b6b6d6a6be918d6` |
| `04_Governance/CANONICAL_VS_RUNTIME.md` | `6de5294b57eb1da0ca1f607775bee03fb664d3606bca9e480dd0b11f7fc546d3` |
| `04_Governance/HUMAN_AUTHORITY_AND_APPROVAL.md` | `de97bb3026f57a6b764f650143d06b7b9358771dd7a43759971a171ee929a1b3` |
| `04_Governance/KNOWLEDGE_AUTHORITY_RULES.md` | `c2db1f87a7566dfffb7ef1c7e5d20794aa8b4b4f557cba033c9922f079473ac1` |
| `04_Governance/PROJECT_SCOPE_AND_ISOLATION.md` | `dfdc11359427b0b45447abfd6098cdb45ae655ec19170f9fc565f9d3eca83fdc` |
| `05_Retrieval/citation-format.md` | `96c42de0de7af96fa524fe75a51ded234860c6da6eaa29ade55f9443a432e16c` |
| `05_Retrieval/query-routing-rules.md` | `85742ac9bea800b575cdeda47365d142b59310a7212e4358f04477c777c6427d` |
| `05_Retrieval/retrieval-schema.json` | `288cc9fbb991890877f9fc086dc11f416a3f94ebdbd3007f17119a597c6eaccd` |
| `05_Retrieval/term-lexicon.json` | `f2db8cddef208215807a27c4549fae66bf5851758ced24aef71b90df69de0416` |
| `06_Source_References/canonical-source-reference.md` | `ffb902bae7a07453f8d611919333227236692b8145e76151030d0720c2dee31a` |
| `06_Source_References/professional-edition-reference.md` | `0582fd4712cff199c023499799767a7e5977cc4cb6bedd3ddfc7d6674e670bf1` |
| `06_Source_References/source-map.json` | `9155fe0b1394a00e29fa1ec8b9254fefd47d57991db9c19f2854281895607ed8` |
| `07_Validation/ATLAS_KNOWLEDGE_VALIDATION_REPORT.md` | `6634707fb52cdb05d6427f5643f5c64d1ca52e3e839ec2d6e8c6c55bc0a0c012` |
| `07_Validation/BUILD_REPRODUCIBILITY_REPORT.md` | `ee66a3aebd462cd7f6a6e462c8cd115ceed3e73ff5dd3993762ddb822beaeb5d` |
| `07_Validation/CONTENT_COMPLETENESS_REPORT.md` | `6fccbbe09ddbbdecd76db8e7201aca4d221eec11b904db1b3f97f9ca07d289e9` |
| `07_Validation/DIAGRAM_INDEX_COMPLETENESS_REPORT.md` | `7677ae28003dffc487f06cf196f81184731ba1858ab7d72ed62c5f309b2cd165` |
| `07_Validation/HASH_SCHEMA_INTEGRITY_REPORT.md` | `8605c2faf1fc8c25172197641617c36f3dd3b38c5b988e4e5a1a7079407169f9` |
| `07_Validation/RETRIEVAL_ROUTER_VALIDATION_REPORT.md` | `a6e1c701741e8be73dfeef338bddf8aaaa04139c928def603abda0cddce337be` |
| `07_Validation/retrieval-test-results.jsonl` | `ac6ea3683aac0329638c9860cdf9178f9143b4f6b195af7cba34f5cdd0768bd6` |
| `Build/build_atlas.py` | `e95b2abca6daeef2dad0cb0d315f268c104a76f31f88a2a7020bc4b2a4db8111` |
| `Build/query_atlas.py` | `59693314e1668d3862eebd37e47c16bda97f84381df451474459bf3281f00747` |
| `Build/run_retrieval_tests.py` | `5302700d2f0f7da6dfa4f2af12aed09f406108b3531e5a83267f2769fca32431` |
| `Build/test_fixtures.jsonl` | `5ebffc881a33985bfc5abaa2ed9fb74aa22a85afc4765e5a7c82a29206cf2727` |
| `README.md` | `ef0c97e5b29ea78dac0f6a6cdf4c304788d1ebdf7e2359d10d126c5fbca38512` |
