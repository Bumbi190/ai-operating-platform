// Local diagnostic replay only. Does not alter the production ledger or migration guard.
const mediaDependencies = {
  "20260520_media_tables.sql":
    "ec1a18ef576352e99d2b38b54da6d2c8db6cb5b409b38e4ece3921135200e07c",
  "20260520_media_images.sql":
    "e1d544a46214f72d09588b66725989c5caf9ef4ce6bb8e53c34c34850264ca58",
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
