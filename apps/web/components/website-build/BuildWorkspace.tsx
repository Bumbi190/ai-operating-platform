"use client";
import type { BuildSessionView } from "@/lib/website-build/types";
import type { ChatConversationModel } from "@/lib/os/chat-shared";
import type { PlanView } from "@/lib/website-build/planning/types";
import { AtlasBuildSurface } from "@/components/platform/vnext/AtlasBuildSurface";
export function BuildWorkspace({
  initialSession,
  conversationModel,
  plan = null,
  brief,
  workspaceReadable = true,
}: {
  initialSession: BuildSessionView;
  conversationModel: ChatConversationModel;
  plan?: PlanView | null;
  brief?: string;
  workspaceReadable?: boolean;
  projectSlug?: string;
  userId?: string;
}) {
  return (
    <AtlasBuildSurface
      conversationModel={conversationModel}
      plan={plan}
      initialSession={initialSession}
      brief={brief}
      workspaceReadable={workspaceReadable}
    />
  );
}
