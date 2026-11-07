// Local diagnostic replay only. Does not alter the production ledger or migration guard.
// Each rule moves one hash-pinned prerequisite directly before its earliest dependent;
// every other migration keeps lexical order. Pins are LF (git blob) SHA-256.
const dependencyRules = [
  {
    label: "media_tables",
    prerequisite: "20260520_media_tables.sql",
    dependents: ["20260520_media_images.sql"],
    pins: {
      "20260520_media_tables.sql":
        "ec1a18ef576352e99d2b38b54da6d2c8db6cb5b409b38e4ece3921135200e07c",
      "20260520_media_images.sql":
        "e1d544a46214f72d09588b66725989c5caf9ef4ce6bb8e53c34c34850264ca58",
    },
  },
  {
    // instance_core creates workflow_defs/instances/transitions/evidence.
    // attested_evidence alters workflow_evidence; gate_authorization replaces
    // workflow_append_transition (returns workflow_transitions) and must not be
    // overwritten by instance_core's original definition.
    label: "workflow_instance_core",
    prerequisite: "20260829_workflow_instance_core.sql",
    dependents: [
      "20260829_workflow_attested_evidence.sql",
      "20260829_workflow_gate_authorization.sql",
    ],
    pins: {
      "20260829_workflow_instance_core.sql":
        "4354b9e168a974d726d7c5867494fdf49713a48d4535359d76cdfbac096c398a",
      "20260829_workflow_attested_evidence.sql":
        "325eecc30e7f69430201d4384259b8404165301b3bc461be5f1fa0529b12e5e6",
      "20260829_workflow_gate_authorization.sql":
        "387c4e8e87f147f2f4435136c1f2300c96131c3e9056a7489f0400354fd40024",
    },
  },
  {
    // workflow_action_binding adds runs.workflow_instance_id and the other binding
    // columns. action_failure_model indexes/reads runs.workflow_instance_id;
    // readonly_action_authorization replaces runs_action_binding_complete and must
    // not be overwritten by the binding migration's original CHECK.
    label: "workflow_action_binding",
    prerequisite: "20260830_workflow_action_binding.sql",
    dependents: [
      "20260830_action_failure_model.sql",
      "20260830_readonly_action_authorization.sql",
    ],
    pins: {
      "20260830_workflow_action_binding.sql":
        "aae8807b3f1f5c289a9c5e09fb1ffaf436bbb36e676bc46e3070de102ab3fb25",
      "20260830_action_failure_model.sql":
        "be1e90f6e47fb39328a21853a26c87e9f6b1bcd42338edf5847f8c376ff3b183",
      "20260830_readonly_action_authorization.sql":
        "85fb5f972e6631322ef24b813112c753e71595fe6b339b9925380e242bf594a3",
    },
  },
  {
    // Must follow workflow_action_binding's rule. Both redefine claim_runs and the
    // binding body (lease default 320) supersedes stop_safety's (default 280);
    // hoisting the binding alone would let stop_safety overwrite it.
    label: "execution_stop_safety",
    prerequisite: "20260830_execution_stop_safety.sql",
    dependents: ["20260830_workflow_action_binding.sql"],
    pins: {
      "20260830_execution_stop_safety.sql":
        "df3e7141383f3534c93a927737b4cbab901cb89a9c5680f201801b87ced0f279",
      "20260830_workflow_action_binding.sql":
        "aae8807b3f1f5c289a9c5e09fb1ffaf436bbb36e676bc46e3070de102ab3fb25",
    },
  },
];
export function orderReplayMigrations(entries) {
  const names = new Set(entries.map((entry) => entry.name));
  if (names.size !== entries.length) throw Error("duplicate replay migration");
  const result = [...entries].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const rule of dependencyRules) {
    const dependents = result.filter((entry) =>
      rule.dependents.includes(entry.name),
    );
    if (dependents.length === 0) continue;
    if (!names.has(rule.prerequisite))
      throw Error("missing replay dependency: " + rule.label);
    for (const entry of result) {
      if (entry.name in rule.pins && entry.sha256 !== rule.pins[entry.name])
        throw Error("unreviewed replay dependency: " + entry.name);
    }
    const dependent = result.indexOf(dependents[0]);
    const prerequisite = result.findIndex(
      (entry) => entry.name === rule.prerequisite,
    );
    if (prerequisite > dependent) {
      const [entry] = result.splice(prerequisite, 1);
      result.splice(dependent, 0, entry);
    }
  }
  return result;
}
