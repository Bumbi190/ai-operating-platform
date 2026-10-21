// Local diagnostic replay only. Does not alter the production ledger or migration guard.
const mediaDependencies = {
  "20260520_media_tables.sql":
    "ec1a18ef576352e99d2b38b54da6d2c8db6cb5b409b38e4ece3921135200e07c",
  "20260520_media_images.sql":
    "e1d544a46214f72d09588b66725989c5caf9ef4ce6bb8e53c34c34850264ca58",
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
export function orderReplayMigrations(entries) {
  const names = new Set(entries.map((entry) => entry.name));
  if (names.size !== entries.length) throw Error("duplicate replay migration");
  const result = [...entries].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const dependent = result.findIndex(
    (entry) => entry.name === "20260520_media_images.sql",
  );
  if (dependent === -1) return result;
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
