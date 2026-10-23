// Local diagnostic replay only. Does not alter the production ledger or migration guard.
const mediaDependencies = {
  "20260520_media_tables.sql":
    "ec1a18ef576352e99d2b38b54da6d2c8db6cb5b409b38e4ece3921135200e07c",
  "20260520_media_images.sql":
    "e1d544a46214f72d09588b66725989c5caf9ef4ce6bb8e53c34c34850264ca58",
};
const workflowDependencies = {
  "20260829_workflow_instance_core.sql":
    "4354b9e168a974d726d7c5867494fdf49713a48d4535359d76cdfbac096c398a",
  "20260829_workflow_attested_evidence.sql":
    "325eecc30e7f69430201d4384259b8404165301b3bc461be5f1fa0529b12e5e6",
};
const actionDependencies = {
  "20260830_workflow_action_binding.sql":
    "aae8807b3f1f5c289a9c5e09fb1ffaf436bbb36e676bc46e3070de102ab3fb25",
  "20260830_action_failure_model.sql":
    "be1e90f6e47fb39328a21853a26c87e9f6b1bcd42338edf5847f8c376ff3b183",
};
const legacyMediaInsights = {
  name: "20260601_media_insights.sql",
  sha256: "b3cad2590764175d104db1f6f62a48b2b63915e95fc3f0ee4020233e2ee941dd",
};
const legacyCronSetup = {
  name: "20260528_pg_cron_setup.sql",
  sha256: "22569e22cd61cef171ad3be914a02d3e7d013a787304ce6904f09a24218d0967",
};
const legacyDreamLedger = {
  name: "20260609_dream_issues_ledger.sql",
  sha256: "efc2b09e75c60fb8d14bcafdf4bcf2712e7d28e2107336634487d18fb9510089",
};
const crossTreeDependencies = [
  {
    name: "20260528_pass_a_safeguards.sql",
    sha256: "4665ac611487c0d833914c2b2e40de11b2e0433e9ed89d172b9b0e463e4c0c04",
    consumer: "20260831_budget_scopes.sql",
  },
  {
    name: "20260602_atlas_growth_account_snapshots.sql",
    sha256: "f035e5ff0e1b03d85a61463da8f1f0398445545544abf748d07beeee55617bb9",
    consumer: "20260914120400_social_account_bindings_the_prompt_evidence.sql",
  },
  {
    name: "20260602_stripe_intelligence_revenue_snapshots.sql",
    sha256: "941d578548f895e5087c201502bcc34c8cf9e8b90f422d7b35dbcffc764e833e",
    consumer: "20261002190000_survival_input_epoch.sql",
  },
  {
    name: "20260602_g1_multitenant_platform_tokens.sql",
    sha256: "88a3f8e1f95cf3334dbedc11edb924a316d630ea52f7d47458665766db712d98",
    consumer: "20260914120300_platform_tokens_project_binding.sql",
  },
  {
    name: "20260603_cron_heartbeat.sql",
    sha256: "f3c28dcd9bd031098bed10f86817f7e4bb55d5b03193199e102ffeae9bcbd831",
    consumer: "20260623_150300_atlas_collector_cron.sql",
  },
  {
    name: "20260603_durable_runs.sql",
    sha256: "a189659945447189022e96bb8a26a5cb4e0e26fb321c9f56a02d0b6e44da7ee4",
    consumer: "20260830_workflow_action_binding.sql",
  },
  {
    name: "20260609_manager_task_dream_link.sql",
    sha256: "c1fb7723f386343e61f9f81297f6e0eb2622dde1d703d348298e7c57b22a767a",
    consumer: "20260820_manager_tasks_work_packages.sql",
  },
];
export function orderReplayMigrations(entries) {
  const names = new Set(entries.map((entry) => entry.name));
  if (names.size !== entries.length) throw Error("duplicate replay migration");
  const result = [...entries].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const dependent = result.findIndex(
    (entry) => entry.name === "20260520_media_images.sql",
  );
  if (dependent !== -1) {
    const prerequisite = result.findIndex(
      (entry) => entry.name === "20260520_media_tables.sql",
    );
    if (prerequisite === -1)
      throw Error("missing replay dependency: media_tables");
    for (const name of Object.keys(mediaDependencies)) {
      if (
        result.find((entry) => entry.name === name).sha256 !==
        mediaDependencies[name]
      )
        throw Error("unreviewed replay dependency: " + name);
    }
    if (prerequisite > dependent) {
      const [entry] = result.splice(prerequisite, 1);
      result.splice(dependent, 0, entry);
    }
  }
  const workflowDependent = result.findIndex((entry) => entry.name === "20260829_workflow_attested_evidence.sql");
  if (workflowDependent !== -1) {
    const workflowCore = result.findIndex((entry) => entry.name === "20260829_workflow_instance_core.sql");
    if (workflowCore === -1) throw Error("missing replay dependency: workflow_instance_core");
    for (const name of Object.keys(workflowDependencies)) {
      if (result.find((entry) => entry.name === name).sha256 !== workflowDependencies[name])
        throw Error("unreviewed replay dependency: " + name);
    }
    if (workflowCore > workflowDependent) {
      const [entry] = result.splice(workflowCore, 1);
      result.splice(workflowDependent, 0, entry);
    }
  }
  const actionDependent = result.findIndex((entry) => entry.name === "20260830_action_failure_model.sql");
  if (actionDependent !== -1) {
    const binding = result.findIndex((entry) => entry.name === "20260830_workflow_action_binding.sql");
    if (binding === -1) throw Error("missing replay dependency: workflow_action_binding");
    for (const name of Object.keys(actionDependencies)) {
      if (result.find((entry) => entry.name === name).sha256 !== actionDependencies[name])
        throw Error("unreviewed replay dependency: " + name);
    }
    if (binding > actionDependent) {
      const [entry] = result.splice(binding, 1);
      result.splice(actionDependent, 0, entry);
    }
  }
  return result;
}

// Diagnostic path for the older root migration that the canonical web tree
// omitted. It must never be treated as a production migration-ledger repair.
export function orderLegacyMediaReplayMigrations(canonicalEntries, legacyEntry, cronEntry, dreamEntry) {
  if (legacyEntry.name !== legacyMediaInsights.name ||
      legacyEntry.sha256 !== legacyMediaInsights.sha256)
    throw Error("unreviewed legacy media dependency");
  if (canonicalEntries.some((entry) => entry.name === legacyEntry.name))
    throw Error("duplicate legacy media dependency");
  const ordered = orderReplayMigrations(canonicalEntries);
  const dependent = ordered.findIndex((entry) => entry.name === "20260602_atlas_bi_foundation.sql");
  if (dependent === -1) throw Error("missing replay dependency: atlas_bi_foundation");
  if (cronEntry) {
    if (cronEntry.name !== legacyCronSetup.name || cronEntry.sha256 !== legacyCronSetup.sha256)
      throw Error("unreviewed legacy cron dependency");
    if (canonicalEntries.some((entry) => entry.name === cronEntry.name))
      throw Error("duplicate legacy cron dependency");
    const cronInsertion = ordered.findIndex((entry) => entry.name > cronEntry.name);
    ordered.splice(cronInsertion === -1 ? ordered.length : cronInsertion, 0, cronEntry);
  }
  const insertion = ordered.findIndex((entry) => entry.name > legacyEntry.name);
  ordered.splice(insertion === -1 ? ordered.length : insertion, 0, legacyEntry);
  if (dreamEntry) {
    if (dreamEntry.name !== legacyDreamLedger.name || dreamEntry.sha256 !== legacyDreamLedger.sha256)
      throw Error("unreviewed legacy dream dependency");
    if (!cronEntry) throw Error("legacy dream dependency requires cron fixture");
    if (canonicalEntries.some((entry) => entry.name === dreamEntry.name))
      throw Error("duplicate legacy dream dependency");
    const backfill = ordered.findIndex((entry) => entry.name === "20260617160200_backfill_dream_issues.sql");
    if (backfill === -1) throw Error("missing replay dependency: dream backfill");
    const dreamInsertion = ordered.findIndex((entry) => entry.name > dreamEntry.name);
    ordered.splice(dreamInsertion === -1 ? ordered.length : dreamInsertion, 0, dreamEntry);
    if (ordered.indexOf(dreamEntry) >= ordered.findIndex((entry) => entry.name === "20260617160200_backfill_dream_issues.sql"))
      throw Error("legacy dream dependency must precede dream backfill");
  }
  if (ordered.indexOf(legacyEntry) >= ordered.findIndex((entry) => entry.name === "20260602_atlas_bi_foundation.sql"))
    throw Error("legacy media dependency must precede atlas_bi_foundation");
  return ordered;
}

// The larger offline experiment has a reviewed, closed list. This is not an
// instruction to apply the root migration tree to any hosted database.
export function orderCrossTreeReplayMigrations(canonicalEntries, legacyEntry, cronEntry, dreamEntry, extraEntries) {
  const ordered = orderLegacyMediaReplayMigrations(canonicalEntries, legacyEntry, cronEntry, dreamEntry);
  if (!dreamEntry || extraEntries.length !== crossTreeDependencies.length)
    throw Error("incomplete cross-tree replay manifest");
  const names = new Set(extraEntries.map((entry) => entry.name));
  if (names.size !== extraEntries.length) throw Error("duplicate cross-tree replay dependency");
  for (const dependency of crossTreeDependencies) {
    const entry = extraEntries.find((item) => item.name === dependency.name);
    if (!entry || entry.sha256 !== dependency.sha256)
      throw Error("unreviewed cross-tree replay dependency: " + dependency.name);
    if (ordered.some((item) => item.name === entry.name))
      throw Error("duplicate cross-tree replay dependency: " + entry.name);
    const consumer = ordered.findIndex((item) => item.name === dependency.consumer);
    if (consumer === -1) throw Error("missing cross-tree replay consumer: " + dependency.consumer);
    const insertion = ordered.findIndex((item) => item.name > entry.name);
    ordered.splice(insertion === -1 ? ordered.length : insertion, 0, entry);
    if (ordered.indexOf(entry) >= ordered.findIndex((item) => item.name === dependency.consumer))
      throw Error("cross-tree replay dependency must precede " + dependency.consumer);
  }
  return ordered;
}
