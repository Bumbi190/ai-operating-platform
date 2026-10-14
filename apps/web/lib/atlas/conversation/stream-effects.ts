import type { PlanView } from "@/lib/website-build/planning/types";
import type { BuildSessionView } from "@/lib/website-build/types";
import type { StreamEvent } from "@/lib/os/chat-shared";
export type BuildContext = {
  projectId: string;
  sessionId: string;
  viewedRevisionId: string | null;
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const statuses = new Set([
  "queued",
  "interpreting",
  "building",
  "validating",
  "ready",
  "awaiting_decision",
  "pausing",
  "paused",
  "cancelling",
  "cancelled",
  "failed",
]);
// Only contract fields survive. Tool-result payloads and model URLs are never effects.
function fields(value: Record<string, any>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((k) => k in value).map((k) => [k, value[k]]),
  );
}
function ref(v: Record<string, any>) {
  return fields(v, ["projectId", "planId", "revisionId", "sha256"]);
}
export function decodeWebsiteEffect(
  event: StreamEvent,
  context: {
    conversationId: string;
    projectId: string | null;
    sessionId: string | null;
  },
): { plan?: PlanView; session?: BuildSessionView } | null {
  if (event.conversationId !== context.conversationId) return null;
  if (event.event === "website_workspace") {
    const s = event.session;
    if (
      !record(s) ||
      !uuid(s.projectId) ||
      !uuid(s.sessionId) ||
      s.conversationId !== context.conversationId ||
      !statuses.has(s.status) ||
      !Number.isSafeInteger(s.stateVersion) ||
      !Array.isArray(s.revisions) ||
      !Array.isArray(s.feedback)
    )
      return null;
    if (
      (context.projectId && s.projectId !== context.projectId) ||
      (context.sessionId && s.sessionId !== context.sessionId)
    )
      return null;
    return {
      session: {
        ...fields(s, [
          "projectId",
          "sessionId",
          "conversationId",
          "stateVersion",
          "status",
          "stage",
          "agentId",
          "activePreviewRevisionId",
          "currentRunId",
          "controlRequested",
          "updatedAt",
        ]),
        revisions: s.revisions
          .filter(
            (r: any) =>
              record(r) &&
              uuid(r.id) &&
              typeof r.sha256 === "string" &&
              Array.isArray(r.pages),
          )
          .map((r: any) => ({
            ...fields(r, [
              "id",
              "number",
              "generation",
              "feedbackSequence",
              "sha256",
              "createdAt",
            ]),
            pages: r.pages
              .filter(record)
              .map((p: any) => fields(p, ["key", "title"])),
          })),
        feedback: s.feedback
          .filter(
            (f: any) => record(f) && uuid(f.id) && typeof f.text === "string",
          )
          .map((f: any) =>
            fields(f, [
              "id",
              "sequence",
              "authorId",
              "text",
              "inputSource",
              "viewedRevisionId",
              "status",
              "interpretation",
              "appliedRevisionId",
              "createdAt",
            ]),
          ),
      } as BuildSessionView,
    };
  }
  if (event.event === "website_plan") {
    const p = event.plan;
    if (
      !record(p) ||
      !record(p.ref) ||
      !uuid(p.ref.projectId) ||
      !uuid(p.ref.planId) ||
      p.conversationId !== context.conversationId ||
      !record(p.currentRevision) ||
      !uuid(p.currentRevision.revisionId) ||
      p.currentRevision.planId !== p.ref.planId ||
      p.currentRevision.projectId !== p.ref.projectId ||
      typeof p.currentRevision.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(p.currentRevision.sha256)
    )
      return null;
    if (context.projectId && p.ref.projectId !== context.projectId) return null;
    const c = p.currentRevision.content;
    if (
      !record(c) ||
      typeof c.title !== "string" ||
      !Array.isArray(c.pages) ||
      !Array.isArray(c.features) ||
      !Array.isArray(c.steps) ||
      !record(c.design) ||
      !record(c.domain) ||
      c.domain.registrar !== "strato" ||
      !record(p.setting) ||
      !record(p.budget)
    )
      return null;
    const decision =
      record(p.approvedDecision) && record(p.approvedDecision.revisionRef)
        ? {
            ...fields(p.approvedDecision, [
              "id",
              "approvedBy",
              "scope",
              "builderAgentId",
              "startIntentId",
              "sessionId",
            ]),
            revisionRef: ref(p.approvedDecision.revisionRef),
          }
        : null;
    return {
      plan: {
        ref: fields(p.ref, ["projectId", "planId"]),
        conversationId: p.conversationId,
        currentRevision: {
          ...ref(p.currentRevision),
          ...fields(p.currentRevision, ["number", "brief", "createdAt"]),
          content: {
            ...fields(c, ["title", "purpose", "audience", "architecture"]),
            pages: c.pages
              .filter(record)
              .map((a: any) => fields(a, ["key", "title", "purpose"])),
            features: c.features
              .filter(record)
              .map((a: any) => fields(a, ["name", "mode", "provider"])),
            design: fields(c.design, ["style", "reference"]),
            domain: fields(c.domain, ["registrar", "requestedName"]),
            steps: c.steps.filter((a: any) => typeof a === "string"),
          },
        },
        approvedDecision: decision,
        activeSessionId: p.activeSessionId ?? null,
        budget: fields(p.budget, ["state", "monthlySek"]),
        setting: {
          ...fields(p.setting, [
            "projectId",
            "builderAgentId",
            "domainRegistrar",
          ]),
          location: record(p.setting.location)
            ? fields(p.setting.location, [
                "os",
                "root",
                "targetId",
                "projectId",
                "folderName",
                "status",
              ])
            : null,
        },
      } as PlanView,
    };
  }
  return null;
}
