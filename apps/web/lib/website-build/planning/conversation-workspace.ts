import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { BuildPrincipal, BuildSessionView } from "../types";
import {
  WebsiteBuildError,
  validateBuildUuid,
  readBuildSession,
} from "../store";
import { readWebsitePlan } from "./store";
import type { PlanView } from "./types";
export type ConversationWorkspace = {
  state: "ok" | "error";
  plan: PlanView | null;
  session: BuildSessionView | null;
  brief: string | null;
};
export async function readConversationWorkspace(
  db: ReturnType<typeof createAdminClient>,
  p: BuildPrincipal,
  conversationId: string,
  preferredSessionId?: string,
): Promise<ConversationWorkspace> {
  validateBuildUuid(conversationId);
  validateBuildUuid(p.userId);
  if (preferredSessionId) validateBuildUuid(preferredSessionId);
  const { data: conversation, error } = await db
    .from("conversations")
    .select("id,project_id")
    .eq("id", conversationId)
    .eq("user_id", p.userId)
    .maybeSingle();
  if (error) throw new WebsiteBuildError("BUILD_UNAVAILABLE", 503);
  if (!conversation) throw new WebsiteBuildError("NOT_FOUND", 404);
  // JSONB planning tables are adapted only at this server boundary until canonical types are regenerated.
  const query = db as unknown as { from(name: string): any };
  const { data: planRow, error: planError } = await query
    .from("website_build_plans")
    .select("id,project_id")
    .eq("conversation_id", conversationId)
    .eq("created_by", p.userId)
    .maybeSingle();
  let sessions = query
    .from("website_build_sessions")
    .select("id,project_id,brief")
    .eq("conversation_id", conversationId)
    .eq("created_by", p.userId);
  if (preferredSessionId) sessions = sessions.eq("id", preferredSessionId);
  const { data: sessionRow, error: sessionError } = await sessions
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError || sessionError)
    throw new WebsiteBuildError("BUILD_UNAVAILABLE", 503);
  if (preferredSessionId && !sessionRow)
    throw new WebsiteBuildError("NOT_FOUND", 404);
  const plan = planRow
    ? await readWebsitePlan(db, p, {
        projectId: planRow.project_id,
        planId: planRow.id,
      })
    : null;
  const session = sessionRow
    ? await readBuildSession(db, p, {
        projectId: sessionRow.project_id,
        sessionId: sessionRow.id,
      })
    : null;
  return { state: "ok", plan, session, brief: sessionRow?.brief ?? null };
}
