import { it, expect } from "vitest";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { compileWebsiteArtifact } from "./artifact";
import { assembleProjectExport } from "./project-export";
const artifact = compileWebsiteArtifact({
  format: "static-website.v1",
  title: "Webb",
  pages: [
    {
      key: "index",
      title: "Hem",
      bodyHtml:
        '<h1>Webb</h1><img src="data:image/png;base64,aGVsbG8=" alt="Bild">',
      css: "",
      behaviors: [],
    },
  ],
});
it("collects source, images, pinned plan and immutable preview under one safe project root", async () => {
  const data = {
    projectId: "10000000-0000-4000-8000-000000000001",
    projectName: "Test",
    folderName: "test-10000000-0000-4000-8000-000000000001",
    sessionId: "60000000-0000-4000-8000-000000000001",
    revisionId: "70000000-0000-4000-8000-000000000001",
    revisionNumber: 1,
    brief: "Faktisk brief",
    location: null,
    planRevision: {
      number: 1,
      sha256: "a".repeat(64),
      content: { title: "Godkänd originalplan" },
    },
    artifact,
  };
  const zip = await JSZip.loadAsync(await assembleProjectExport(data as any)),
    base = data.folderName + "/";
  expect(zip.file(base + "src/index.html")).toBeTruthy();
  expect(zip.folder(base + "assets/images")).toBeTruthy();
  expect(zip.file(base + "plans/v1.json")).toBeTruthy();
  expect(await zip.file(base + "previews/v1/index.html")!.async("string")).toBe(
    artifact.files[0].content,
  );
  const manifest = JSON.parse(
    await zip.file(base + "project.json")!.async("string"),
  );
  expect(manifest.physicalDirectoryCreated).toBe(false);
  for (const file of manifest.files) {
    expect(file.path).not.toMatch(/\.\.|^\/|\\/);
    const bytes = await zip.file(base + file.path)!.async("nodebuffer");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    expect(bytes.length).toBe(file.bytes);
  }
  expect(manifest.files.some((f: any) => f.type === "image/png")).toBe(true);
});
it("refuses path traversal in project root names", async () => {
  await expect(
    assembleProjectExport({ artifact, folderName: "../other" } as any),
  ).rejects.toThrow();
});
