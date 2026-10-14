import "server-only";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { assertWebsiteArtifact } from "./artifact";
import { readBuildSession, WebsiteBuildError } from "./store";
import type { BuildPrincipal, BuildRef, WebsiteArtifact } from "./types";
import { readProjectWebsiteBuilder } from "./planning/store";
import type { PlanRevision, ProjectLocation } from "./planning/types";
import { validatePlanContent, hashPlanContent } from "./planning/validation";
type ProjectExport = {
  projectId: string;
  projectName: string;
  folderName: string;
  sessionId: string;
  revisionId: string;
  revisionNumber: number;
  brief: string;
  location: ProjectLocation | null;
  planRevision: Pick<PlanRevision, "number" | "sha256" | "content"> | null;
  artifact: WebsiteArtifact;
};
export async function assembleProjectExport(
  data: ProjectExport,
): Promise<Uint8Array> {
  assertWebsiteArtifact(data.artifact);
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(data.folderName))
    throw new WebsiteBuildError("INVALID_ARTIFACT_PATH");
  const zip = new JSZip(),
    root = zip.folder(data.folderName)!,
    date = new Date("2000-01-01T00:00:00Z");
  const files: { path: string; type: string; sha256: string; bytes: number }[] =
    [];
  for (const folder of [
    "src",
    "assets/images",
    "assets/media",
    "plans",
    "previews",
  ])
    root.folder(folder);
  function add(path: string, content: string | Uint8Array, type: string) {
    if (
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw new WebsiteBuildError("INVALID_ARTIFACT_PATH");
    const bytes =
      typeof content === "string" ? Buffer.from(content, "utf8") : content;
    root.file(path, bytes, { date });
    files.push({
      path,
      type,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    });
  }
  for (const file of data.artifact.files) {
    add(
      "src/" + file.path,
      file.content,
      file.path.endsWith(".html") ? "text/html" : "application/javascript",
    );
    add(
      "previews/v" + data.revisionNumber + "/" + file.path,
      file.content,
      file.path.endsWith(".html") ? "text/html" : "application/javascript",
    );
  }
  add(
    "previews/v" + data.revisionNumber + "/artifact.json",
    JSON.stringify(data.artifact, null, 2),
    "application/json",
  );
  const images = new Set<string>();
  for (const file of data.artifact.files)
    for (const match of file.content.matchAll(
      /src="data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})"/g,
    )) {
      const bytes = Buffer.from(match[2], "base64"),
        hash = createHash("sha256").update(bytes).digest("hex");
      if (!images.has(hash)) {
        images.add(hash);
        add(
          "assets/images/" + hash + "." + match[1],
          bytes,
          "image/" + match[1],
        );
      }
    }
  add("plans/brief.md", data.brief, "text/markdown");
  if (data.planRevision)
    add(
      "plans/v" + data.planRevision.number + ".json",
      JSON.stringify(data.planRevision, null, 2),
      "application/json",
    );
  root.file(
    "project.json",
    JSON.stringify(
      {
        format: "atlas-project.v1",
        projectId: data.projectId,
        name: data.projectName,
        folderName: data.folderName,
        sessionId: data.sessionId,
        preview: {
          revisionId: data.revisionId,
          number: data.revisionNumber,
          artifactSha256: data.artifact.sha256,
        },
        plan: data.planRevision
          ? {
              number: data.planRevision.number,
              sha256: data.planRevision.sha256,
            }
          : null,
        location: data.location,
        physicalDirectoryCreated: false,
        manifestExcludes: "project.json",
        files,
      },
      null,
      2,
    ),
    { date },
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
export async function exportWebsiteProject(
  db: ReturnType<typeof createAdminClient>,
  p: BuildPrincipal,
  ref: BuildRef,
  revisionId: string,
  artifact: WebsiteArtifact,
): Promise<Uint8Array> {
  const session = await readBuildSession(db, p, ref),
    revision = session.revisions.find((r) => r.id === revisionId);
  if (!revision || revision.sha256 !== artifact.sha256)
    throw new WebsiteBuildError("NOT_FOUND", 404);
  const query = db as unknown as { from(name: string): any };
  const [
    { data: row, error },
    { data: project, error: projectError },
    setting,
  ] = await Promise.all([
    query
      .from("website_build_sessions")
      .select("brief,plan_revision_id")
      .eq("id", ref.sessionId)
      .eq("project_id", ref.projectId)
      .eq("created_by", p.userId)
      .maybeSingle(),
    db
      .from("projects")
      .select("id,name")
      .eq("id", ref.projectId)
      .eq("owner_id", p.userId)
      .maybeSingle(),
    readProjectWebsiteBuilder(db, p, ref.projectId),
  ]);
  if (error || projectError || !row || !project)
    throw new WebsiteBuildError("BUILD_UNAVAILABLE", 503);
  let planRevision: ProjectExport["planRevision"] = null;
  if (row.plan_revision_id) {
    const { data: saved, error: planError } = await query
      .from("website_build_plan_revisions")
      .select("number,sha256,content")
      .eq("id", row.plan_revision_id)
      .eq("project_id", ref.projectId)
      .maybeSingle();
    if (planError || !saved)
      throw new WebsiteBuildError("BUILD_UNAVAILABLE", 503);
    const content = validatePlanContent(saved.content);
    if (hashPlanContent(content) !== saved.sha256)
      throw new WebsiteBuildError("BUILD_UNAVAILABLE", 503);
    planRevision = { number: saved.number, sha256: saved.sha256, content };
  }
  return assembleProjectExport({
    projectId: ref.projectId,
    projectName: project.name,
    folderName: setting.location?.folderName ?? "projekt-" + ref.projectId,
    sessionId: ref.sessionId,
    revisionId,
    revisionNumber: revision.number,
    brief: row.brief,
    location: setting.location,
    planRevision,
    artifact,
  });
}
