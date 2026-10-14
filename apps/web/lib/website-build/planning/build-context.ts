import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { BuildPrincipal } from "../types";
import type { BuildContext } from "@/lib/atlas/conversation/stream-effects";
import {
  readBuildSession,
  validateBuildUuid,
  WebsiteBuildError,
} from "../store";
export async function resolveConversationBuildContext(
  db: ReturnType<typeof createAdminClient>,
  principal: BuildPrincipal,
  conversationId: string | null,
  value: unknown,
): Promise<BuildContext | null> {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WebsiteBuildError("INVALID_BODY");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["projectId", "sessionId", "viewedRevisionId"].includes(k),
    )
  )
    throw new WebsiteBuildError("INVALID_BODY");
  validateBuildUuid(v.projectId);
  validateBuildUuid(v.sessionId);
  if (v.viewedRevisionId !== null) validateBuildUuid(v.viewedRevisionId);
  if (!conversationId) throw new WebsiteBuildError("NOT_FOUND", 404);
  const ref = {
    projectId: v.projectId as string,
    sessionId: v.sessionId as string,
  };
  const session = await readBuildSession(db, principal, ref);
  if (
    session.conversationId !== conversationId ||
    (v.viewedRevisionId !== null &&
      !session.revisions.some((r) => r.id === v.viewedRevisionId))
  )
    throw new WebsiteBuildError("NOT_FOUND", 404);
  return { ...ref, viewedRevisionId: v.viewedRevisionId as string | null };
}
