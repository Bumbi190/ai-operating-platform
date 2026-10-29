import { describe, expect, it } from "vitest";
import {
  CREATIVE_TOOLS,
  canExecuteCreativeTool,
  resolveCreativeTool,
} from "../media/creative-tools";

describe("Atlas creative tools — deny-by-default discovery", () => {
  it("keeps all external tools disabled for production", () => {
    expect(CREATIVE_TOOLS).toHaveLength(6);
    for (const tool of CREATIVE_TOOLS) {
      expect(tool.enabledByDefault).toBe(false);
      expect(tool.productionAllowed).toBe(false);
      expect(tool.execution).toBe("local-isolated");
      expect(canExecuteCreativeTool(tool)).toBe(false);
    }
  });

  it("only discovers an explicitly allowlisted matching capability", () => {
    expect(resolveCreativeTool("image-edit")).toBeNull();
    expect(resolveCreativeTool("video-edit", ["photocraft"])).toBeNull();
    expect(resolveCreativeTool("image-edit", ["photocraft"])?.id).toBe("photocraft");
    expect(resolveCreativeTool("video-edit", ["filmcraft"])?.id).toBe("filmcraft");
  });
});
