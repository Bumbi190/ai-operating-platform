/**
 * Creative-tool capability catalog. This is a declaration, NOT an executor.
 * External binaries/MCP servers remain disabled pending installation, provenance,
 * sandbox validation and explicit runtime wiring.
 */
export type CreativeToolId =
  | "photocraft"
  | "filmcraft"
  | "effectcraft"
  | "vectorcraft"
  | "designcraft"
  | "pdfcraft";

export type CreativeCapability =
  | "image-edit"
  | "video-edit"
  | "motion-effects"
  | "vector-edit"
  | "page-layout"
  | "pdf-edit";

export type CreativeTool = Readonly<{
  id: CreativeToolId;
  capability: CreativeCapability;
  repository: string;
  transport: "mcp-or-cli";
  enabledByDefault: false;
  execution: "local-isolated";
  productionAllowed: false;
}>;

export const CREATIVE_TOOLS: readonly CreativeTool[] = Object.freeze([
  { id: "photocraft", capability: "image-edit", repository: "https://github.com/storytold/photocraft", transport: "mcp-or-cli", enabledByDefault: false, execution: "local-isolated", productionAllowed: false },
  { id: "filmcraft", capability: "video-edit", repository: "https://github.com/storytold/filmcraft", transport: "mcp-or-cli", enabledByDefault: false, execution: "local-isolated", productionAllowed: false },
  { id: "effectcraft", capability: "motion-effects", repository: "https://github.com/storytold/effectcraft", transport: "mcp-or-cli", enabledByDefault: false, execution: "local-isolated", productionAllowed: false },
  { id: "vectorcraft", capability: "vector-edit", repository: "https://github.com/storytold/vectorcraft", transport: "mcp-or-cli", enabledByDefault: false, execution: "local-isolated", productionAllowed: false },
  { id: "designcraft", capability: "page-layout", repository: "https://github.com/storytold/designcraft", transport: "mcp-or-cli", enabledByDefault: false, execution: "local-isolated", productionAllowed: false },
  { id: "pdfcraft", capability: "pdf-edit", repository: "https://github.com/storytold/pdfcraft", transport: "mcp-or-cli", enabledByDefault: false, execution: "local-isolated", productionAllowed: false },
]);

export function resolveCreativeTool(
  capability: CreativeCapability,
  enabledTools: readonly CreativeToolId[] = [],
): CreativeTool | null {
  // Explicit allowlisting is only a discovery gate. It never grants execution.
  return CREATIVE_TOOLS.find(
    (tool) => tool.capability === capability && enabledTools.includes(tool.id),
  ) ?? null;
}

export function canExecuteCreativeTool(_tool: CreativeTool): false {
  // Fail closed until the sandbox runner + approvals have been implemented.
  return false;
}
