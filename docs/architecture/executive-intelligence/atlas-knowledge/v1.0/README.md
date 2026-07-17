# Atlas Knowledge Edition v1.0

Versioned, hash-verified **knowledge source** for Omnira Executive Intelligence. This is
documentation, not runtime. It grants no execution authority.

- **Package status:** ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2 CLEAN
- **Integration branch:** `docs/executive-intelligence-atlas-knowledge-v1`
- **Runtime state:** NOT runtime-ingested — see [`RUNTIME_INGESTION_STATUS.md`](RUNTIME_INGESTION_STATUS.md)

## Directory layout

```
atlas-knowledge/v1.0/
├── README.md                        (this file)
├── RUNTIME_INGESTION_STATUS.md      authoritative runtime-status statement
├── SOURCE_PROVENANCE.md             upstream hashes, package origin, integration scope
├── INTEGRATION_NOTES.md             why integrated / what is not done / future steps
├── REPO_INTEGRATION_MANIFEST.md     integration record, checks, checksums, test results
└── package/                         controlled byte-identical copy of the approved package
    ├── 01_Canonical_Knowledge/      32 chapter .md + section/block/front-matter .jsonl
    ├── 02_Indexes/                  authority, autonomy, chapter, concept, diagram, ... indexes
    ├── 03_Relationships/            chapter dependencies, explicit + section-link relationships
    ├── 04_Governance/               authority / approval / scope / retrieval rule docs
    ├── 05_Retrieval/                deterministic router schema, routing rules, term lexicon
    ├── 06_Source_References/        canonical + professional-edition references, source map
    ├── 07_Validation/               validation reports + retrieval-test results
    ├── Build/                       build_atlas.py, query_atlas.py, run_retrieval_tests.py, fixtures
    ├── README.md                    the package's own README
    └── ATLAS_KNOWLEDGE_EDITION_MANIFEST.md   canonical file list + SHA-256 table
```

## Package facts (from the package manifest)

- 32 chapter files · 6,705 section records · 55,840 block records · 4 front-matter sections
- 17 active diagrams · D14 actively absent
- 73 manifest-listed files (74 files total including the manifest) — all checksums match
- Deterministic token/phrase router — **no embeddings, no vector database, no model**
- 56/56 retrieval tests pass (verified again from this repo copy)
- `implementation_status = unknown_not_verified_in_this_package` for all records

## Verifying integrity from the repo copy

```
# checksums
python3 - <<'PY'
import re,hashlib,os
d="package"
man=open(os.path.join(d,"ATLAS_KNOWLEDGE_EDITION_MANIFEST.md")).read()
for rel,exp in re.findall(r'^\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{64})`\s*\|',man,re.M):
    got=hashlib.sha256(open(os.path.join(d,rel),'rb').read()).hexdigest()
    assert got==exp, rel
print("all checksums match")
PY

# retrieval tests (creates no __pycache__; runner sets sys.dont_write_bytecode)
python3 package/Build/run_retrieval_tests.py --package-root package
```

## Authority

This package is knowledge, not authority. The repository, schema, migrations, runtime, and
deployment remain authoritative for what is actually implemented. Retrieval grants no
execution rights; human authority, governance, approval gates, and project isolation always
apply.
