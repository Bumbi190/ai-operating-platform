// Offline bootstrap plan. Reads files only: no SQL execution, Docker, network or secrets.
// Composes existing, unmodified SQL (one untracked baseline candidate plus the legacy creators the
// provenance report names) into an ordered fixture sequence for a disposable local replay of every
// canonical migration. A plan is never replay evidence: ok, replayReady and executionValidated stay false.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { orderReplayMigrations } from "./analysis-replay-order.mjs";
import {
  createdRelations,
  inspectBaselineProvenance,
  readProvenanceInputs,
  relationRefs,
} from "./migration-baseline-provenance.mjs";
import { LEGACY_DIR, sha256 } from "./migration-replay-preflight.mjs";

// Same baseline the historical ledger replay (verify-calendar-full-ledger-local.mjs) applies.
export const BASELINE_FIXTURE = "packages/db/full_schema_run_in_supabase.sql";
const DISCLAIMER =
  "Static offline bootstrap plan only. No SQL was executed; fixtures are untracked test inputs, so this is not clean-bootstrap or production readiness evidence.";

const uniqueSorted = (values) => [...new Set(values)].sort();

export function planCanonicalBootstrap({ canonical, legacy = [], candidates, baselinePath = BASELINE_FIXTURE, grandfatheredNames }) {
  const blockers = [];
  const plan = {
    schema: "omnira.migration-bootstrap-plan.v1",
    ok: false,
    replayReady: false,
    executionValidated: false,
    disclaimer: DISCLAIMER,
    baseline: baselinePath,
    fixtures: [],
    sequence: [],
    blockers,
  };
  const provenance = inspectBaselineProvenance({ canonical, legacy, candidates, grandfatheredNames });
  const candidate = provenance.candidates.find((c) => c.path === baselinePath);
  const baselineSql = candidates.find((c) => c.path === baselinePath)?.sql ?? null;
  if (!provenance.earlyWindow) {
    blockers.push({ code: "provenance_incomplete", detail: provenance.blockers.map((b) => b.code).join(", ") });
    return plan;
  }
  if (!candidate?.present || baselineSql === null) {
    blockers.push({ code: "baseline_candidate_missing", detail: baselinePath });
    return plan;
  }
  for (const { table, columns } of candidate.missingColumns)
    blockers.push({ code: "baseline_column_missing", detail: `${baselinePath} ${table} lacks ${columns.join(", ")}` });

  // Each relation or schema the baseline lacks must come from exactly one existing legacy file.
  const sources = new Map();
  const needs = [
    ...candidate.uncovered.map((t) => ({ provides: t, dep: provenance.dependencies.find((d) => d.table === t) })),
    ...candidate.uncoveredSchemas.map((s) => ({ provides: s, dep: provenance.schemaDependencies.find((d) => d.schema === s) })),
  ];
  for (const { provides, dep } of needs) {
    if (dep.legacyCreators.length !== 1) {
      blockers.push({
        code: dep.legacyCreators.length ? "fixture_source_ambiguous" : "fixture_source_missing",
        detail: `${provides}: ${dep.legacyCreators.join(", ") || "no legacy creator"}`,
      });
      continue;
    }
    const entry = sources.get(dep.legacyCreators[0]) ?? { provides: [], firstUsedBy: [] };
    entry.provides.push(provides);
    entry.firstUsedBy.push(dep.firstUsedBy);
    sources.set(dep.legacyCreators[0], entry);
  }

  const ordered = orderReplayMigrations(canonical.map(({ name, sql }) => ({ name, sha256: sha256(sql), sql })));
  const names = ordered.map((m) => m.name);
  const baselineRelations = createdRelations(baselineSql).map((r) => r.name);

  // Place each fixture at the earliest replay position where its DDL-time public dependencies exist,
  // and no later than the first canonical use of what it provides. Position 0 means truly preexisting.
  for (const [name, { provides, firstUsedBy }] of [...sources].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const sql = legacy.find((f) => f.name === name).sql;
    const path = `${LEGACY_DIR}/${name}`;
    const own = new Set(createdRelations(sql).map((r) => r.name));
    const requires = uniqueSorted(
      relationRefs(sql)
        .filter((r) => r.schema === "public" && !r.deferred && !own.has(r.name))
        .map((r) => r.name),
    );
    const deadline = Math.min(...firstUsedBy.map((f) => names.indexOf(f)));
    const created = new Set(baselineRelations);
    let position = -1;
    for (let i = 0; i <= deadline; i++) {
      if (requires.every((r) => created.has(r))) {
        position = i;
        break;
      }
      for (const r of createdRelations(ordered[i].sql)) created.add(r.name);
    }
    const fixture = {
      path,
      lfSha256: sha256(sql),
      provides: uniqueSorted(provides),
      requires,
      position,
      after: position > 0 ? names[position - 1] : null,
      before: position >= 0 ? names[position] : null,
      preexisting: position === 0,
    };
    plan.fixtures.push(fixture);
    if (position === -1)
      blockers.push({ code: "fixture_unplaceable", detail: `${path} requires ${requires.join(", ")} before ${names[deadline]}` });
    else if (position > 0)
      blockers.push({
        code: "fixture_interleaved",
        detail: `${path} requires ${requires.filter((r) => !baselineRelations.includes(r)).join(", ")} from canonical replay; it cannot be part of a preexisting baseline`,
      });
  }

  const fixtureStep = (f) => ({ kind: "fixture", path: f.path, lfSha256: f.lfSha256 });
  plan.sequence.push({ kind: "fixture", path: baselinePath, lfSha256: candidate.lfSha256 });
  ordered.forEach((m, i) => {
    for (const f of plan.fixtures) if (f.position === i) plan.sequence.push(fixtureStep(f));
    plan.sequence.push({ kind: "canonical", name: m.name, lfSha256: m.sha256 });
  });

  for (const path of [baselinePath, ...plan.fixtures.map((f) => f.path)])
    blockers.push({ code: "fixture_untracked", detail: `${path} has no canonical migration file or ledger row` });
  blockers.push({ code: "execution_not_run", detail: "static plan only; replay evidence requires a disposable --network none executor" });
  plan.ok = blockers.length === 0;
  return plan;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let plan;
  try {
    plan = planCanonicalBootstrap(readProvenanceInputs(resolve(dirname(fileURLToPath(import.meta.url)), "../../..")));
  } catch (error) {
    plan = {
      schema: "omnira.migration-bootstrap-plan.v1",
      ok: false,
      replayReady: false,
      executionValidated: false,
      disclaimer: DISCLAIMER,
      blockers: [{ code: "plan_error", detail: error.message }],
    };
  }
  console.log(JSON.stringify(plan, null, 2));
  process.exitCode = plan.ok ? 0 : 1;
}
