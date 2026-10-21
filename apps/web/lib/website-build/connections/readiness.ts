import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { BuildPrincipal } from "../types";
import type { PlanRef } from "../planning/types";
import { readWebsitePlan } from "../planning/store";
import { validatePlanContent } from "../planning/validation";
import { getConnectionGuide } from "./catalog";
import {
  deriveIntegrationNeeds,
  projectConnectionState,
} from "./readiness-contract";
import type { ReadinessView } from "./types";
/** No execution/account adapters are registered in delivery A. Environment variables,
 * platform hosting and broker enrollment are deliberately not connection evidence. */
export async function readWebsiteBuildReadiness(
  db: ReturnType<typeof createAdminClient>,
  p: BuildPrincipal,
  ref: PlanRef,
): Promise<ReadinessView> {
  const plan = await readWebsitePlan(db, p, ref),
    content = validatePlanContent(plan.currentRevision.content);
  const scope = { projectId: ref.projectId, operatorId: p.userId },
    os = plan.setting.location?.os ?? "unknown";
  const items = deriveIntegrationNeeds(content).map((need) => {
    const guide = getConnectionGuide({
      provider: need.provider,
      verifiedTarget: null,
      scope,
      os,
      need: need.why,
    });
    return {
      ...projectConnectionState(need.provider, null),
      need,
      guide,
      nextAction: guide.links[0],
    };
  });
  return {
    ref: { projectId: plan.ref.projectId, planId: plan.ref.planId },
    revisionId: plan.currentRevision.revisionId,
    metadataCheckedAt: new Date().toISOString(),
    items,
    directory: plan.setting.location,
    settingsUrl: "/settings/website-build#project-" + ref.projectId,
    domain: {
      registrar: "strato",
      requestedName: content.domain.requestedName,
      availability: "unknown",
      accountAccess: "unknown",
      ownership: "unknown",
      dns: "unknown",
      https: "unknown",
    },
  };
}
