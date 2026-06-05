// Project-scoped canon loader. project_id is MANDATORY: the loader throws if it
// is missing. There is no global view — canon is resolved per project.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CharacterReference, CcaParams } from "./types";

export interface LoaderOpts {
  /** Directory that contains <projectId>/canon/*. Defaults to the repo's content/. */
  canonRoot?: string;
}

function resolveContentRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "content"))) return join(dir, "content");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, "content");
}

function canonDir(projectId: string, opts?: LoaderOpts): string {
  const root = opts?.canonRoot ?? resolveContentRoot(process.cwd());
  return join(root, projectId, "canon");
}

function requireProjectId(projectId: string): void {
  if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
    throw new Error("[CCA] project_id is mandatory — refusing to load canon without it (project isolation).");
  }
}

export function loadCharacterReference(projectId: string, opts?: LoaderOpts): CharacterReference {
  requireProjectId(projectId);
  const file = join(canonDir(projectId, opts), "character-reference.json");
  if (!existsSync(file)) throw new Error(`[CCA] character-reference.json not found for project '${projectId}' at ${file}`);
  return JSON.parse(readFileSync(file, "utf8")) as CharacterReference;
}

export function loadCcaParams(projectId: string, opts?: LoaderOpts): CcaParams {
  requireProjectId(projectId);
  const file = join(canonDir(projectId, opts), "cca-params.json");
  if (!existsSync(file)) throw new Error(`[CCA] cca-params.json not found for project '${projectId}' at ${file}`);
  const params = JSON.parse(readFileSync(file, "utf8")) as CcaParams;
  if (params.project_id !== projectId) {
    throw new Error(`[CCA] cca-params.project_id '${params.project_id}' does not match requested '${projectId}' (isolation guard).`);
  }
  return params;
}
