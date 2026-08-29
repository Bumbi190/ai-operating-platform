# Evidence bundle — `release-evidence.json`

A machine-readable statement of local QA results, produced where the artefacts
actually are and submitted to Omnira as **attested** evidence.

Omnira does not re-run these checks and cannot. The producer owns the QA logic —
speech-rate bands calibrated on the previous month, PDF geometry, the
completeness proof comparing full-recording speech time against the sum of the
page clips. Omnira verifies the **binding and provenance** of the result and
records it as *a statement by that producer*, never as something it observed.

## Schema (v1)

```jsonc
{
  "schema": "omnira.workflow.evidence-bundle/v1",
  "def_key": "familje-stunden.monthly-release",   // must match the instance
  "instance_key": "2026-11",                      // the month
  "producer": {
    "type": "local_agent",                        // local_agent | ci | human
    "tool": "familje-stunden/scripts",            // optional
    "tool_version": "2026.11.0"                   // optional
  },
  "source_commit": "a1b2c3d…",                    // optional, ≤64 chars
  "artifact_manifest_hash": "<sha256 hex>",       // REQUIRED for artefact checks
  "checks": [
    {
      "state": "local_qa",                        // must be declared by the definition
      "check_key": "audio_file_count",            // must be declared for that state
      "result": "pass",                           // pass | fail | blocked | error
      "observed_at": "2026-10-20T09:14:03.000Z",  // when the PRODUCER observed it
      "payload": { "expected": 19, "found": 19 }  // safe metadata only
    }
  ]
}
```

### Rules the server enforces on ingest

| Rule | Effect when violated |
|---|---|
| Credential holds `workflow.evidence.write` | 401 / 403 |
| Instance belongs to the credential's project | 404 (indistinguishable from unknown) |
| `(state, check_key)` is declared by the pinned definition | 422 |
| The check accepts **attested** provenance | 422 |
| An artefact check supplies `artifact_manifest_hash` | 422 |
| `payload` contains no credential-shaped key | 400 |
| Identical statement already recorded | 200, `recorded: false` (idempotent) |

`target_hash` and `payload_hash` are computed **server-side** from the instance,
the pinned definition version, the state, the check and the producer's declared
provenance. They are never accepted from the bundle.

### What makes evidence go stale

Anything material moving: a definition version bump (`def_hash`), a different
state, different declared inputs, a different `source_commit`, or a different
`artifact_manifest_hash`. Rebuild the artefacts and prior attestations stop
applying — they are reported as **stale**, not silently reused.

## Validating offline

```bash
node apps/web/scripts/validate-evidence-bundle.mjs path/to/release-evidence.json
```

Structural validation only: shape, vocabularies, hash formats and payload safety.
It deliberately does **not** know which checks a definition declares — that is
the server's decision, made against the pinned definition, and duplicating the
catalogue in a script is how the two drift apart.

## Example

See `release-evidence.example.json` in this directory. It is an **example, not
production evidence**: its commit and manifest hashes are obvious placeholders.
