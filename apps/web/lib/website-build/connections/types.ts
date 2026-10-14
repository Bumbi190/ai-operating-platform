import type { ProjectLocation, PlanRef } from "../planning/types";
export type ConnectionProvider =
  | "terminal"
  | "vercel"
  | "supabase"
  | "strato"
  | "form_delivery";
export type ConnectionStatus =
  | "connected"
  | "missing"
  | "unknown"
  | "expired"
  | "denied";
export type AdapterAvailability = "implemented" | "not_implemented";
export type ConnectionScope = { projectId: string; operatorId: string };
export type VerifiedTarget = {
  provider: "vercel" | "supabase";
  projectId: string;
  operatorId: string;
  resourceId: string;
  verified: true;
};
export type IntegrationNeed = {
  provider: ConnectionProvider;
  why: string;
  mode: "preview_demo" | "live_required" | "later";
};
export type ConnectionState = {
  provider: ConnectionProvider;
  adapterAvailability: AdapterAvailability;
  connectionStatus: ConnectionStatus;
  permissions: string[];
  checkedAt: string | null;
};
export type GuideCard = {
  provider: ConnectionProvider;
  title: string;
  why: string;
  steps: string[];
  links: { label: string; href: string }[];
  fields: { name: string; where: string }[];
  commands: { label: string; text: string; precondition: string }[];
  reviewedAt: string;
};
export type ConnectionItem = ConnectionState & {
  need: IntegrationNeed;
  guide: GuideCard;
  nextAction: { label: string; href: string };
};
export type ReadinessView = {
  ref: PlanRef;
  revisionId: string;
  metadataCheckedAt: string;
  items: ConnectionItem[];
  directory: ProjectLocation | null;
  settingsUrl: string;
  domain: {
    registrar: "strato";
    requestedName: string | null;
    availability: "unknown";
    accountAccess: "unknown";
    ownership: "unknown";
    dns: "unknown";
    https: "unknown";
  };
};
