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
    "dist",
    "dist/assets/images",
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
  const imagePattern =
    /src="data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})"/g;
  const images = new Map<
    string,
    { extension: "png" | "jpeg" | "webp"; bytes: Buffer }
  >();
  for (const file of data.artifact.files)
    for (const match of file.content.matchAll(imagePattern)) {
      const bytes = Buffer.from(match[2], "base64"),
        hash = createHash("sha256").update(bytes).digest("hex"),
        extension = match[1] as "png" | "jpeg" | "webp";
      const previous = images.get(hash);
      if (
        previous &&
        (previous.extension !== extension ||
          !previous.bytes.equals(bytes))
      )
        throw new WebsiteBuildError("INVALID_ARTIFACT_PATH");
      if (!previous) images.set(hash, { extension, bytes });
    }
  const deployContent = (content: string) => {
    const rewritten = content.replace(
      imagePattern,
      (_full, extension: string, encoded: string) => {
        const bytes = Buffer.from(encoded, "base64"),
          hash = createHash("sha256").update(bytes).digest("hex"),
          registered = images.get(hash);
        if (!registered || registered.extension !== extension)
          throw new WebsiteBuildError("INVALID_ARTIFACT_PATH");
        return `src="assets/images/${hash}.${extension}"`;
      },
    );
    return images.size
      ? rewritten.replace(
          "img-src data:;",
          "img-src &#39;self&#39;;",
        )
      : rewritten;
  };
  for (const file of data.artifact.files) {
    const type = file.path.endsWith(".html")
      ? "text/html"
      : "application/javascript";
    add("src/" + file.path, file.content, type);
    add(
      "previews/v" + data.revisionNumber + "/" + file.path,
      file.content,
      type,
    );
    add(
      "dist/" + file.path,
      file.path.endsWith(".html") ? deployContent(file.content) : file.content,
      type,
    );
  }
  for (const [hash, image] of images) {
    const name = hash + "." + image.extension;
    add("assets/images/" + name, image.bytes, "image/" + image.extension);
    add("dist/assets/images/" + name, image.bytes, "image/" + image.extension);
  }
  add(
    "previews/v" + data.revisionNumber + "/artifact.json",
    JSON.stringify(data.artifact, null, 2),
    "application/json",
  );
  add("plans/brief.md", data.brief, "text/markdown");
  if (data.planRevision)
    add(
      "plans/v" + data.planRevision.number + ".json",
      JSON.stringify(data.planRevision, null, 2),
      "application/json",
    );
  add(
    "vercel.json",
    JSON.stringify(
      {
        $schema: "https://openapi.vercel.sh/vercel.json",
        outputDirectory: "dist",
      },
      null,
      2,
    ),
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
        deployable: {
          directory: "dist",
          entry: "index.html",
          assets: "assets/images",
          revisionId: data.revisionId,
          revisionNumber: data.revisionNumber,
          artifactSha256: data.artifact.sha256,
        },
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
