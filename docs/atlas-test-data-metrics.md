# Atlas test-data metrics: versioned rollout

Implementation candidate only. No production migration, collector-version switch or cleanup is performed by these changes.

Handlarbörsen preserves the default v1 API and adds explicit `?schema_version=2`. V2 counts all unquarantined organisations, including unknown/unclassified and closed historical organisations, under the original eleven metric definitions. Both vehicle owners and every transaction counterparty are checked against active quarantine markers. This is aggregate-only access; no direct row-read permission is added.

Omnira defaults to the original v1 collector. Enable `HANDLARBORSEN_METRICS_SCHEMA_VERSION=2` only after a separately authorised producer-first rollout and the Omnira schema migration. The migration guard deliberately rejects an unapplied definition migration. Do not bypass or grandfather it.

Snapshots retain `definition_id`, `data_scope` and nullable `excluded_test_organisations`. Existing rows receive legacy metadata defaults without rewriting their metric values. Same-day v1 and v2 snapshots occupy separate definition-bound rows; quality and observation-time guards operate within each definition. Earlier UTC days remain immutable.

The report and chart models stop comparisons at definition boundaries or when exclusion counts differ or are unavailable. Swedish history notes explain those boundaries. `history.growthDelta` is the registered-company delta only for comparable observations; otherwise it is null. The aggregate exclusion count cannot prove identical excluded membership when two different sets have the same cardinality.

The existing signed analysis-draft source protocol is immutable v1. The reader strips only exact verified legacy metadata before constructing that original envelope. V2 reports and Atlas fact blocks are readable, while v2 analysis-draft sources return unavailable until a separate versioned analysis protocol exists; v2 must never be relabelled v1.

Local evidence uses the owned Handlarbörsen test project and a separate tagged Omnira projection database inside its PostgreSQL container. The Omnira fixture replays the canonical snapshot and guarded-store migrations with a minimal projects dependency. It is a focused projection-schema check, not a replay of the entire production migration history.
