import type { PlanContent } from "../planning/types";
import type {
  ConnectionProvider,
  ConnectionState,
  IntegrationNeed,
  ConnectionStatus,
} from "./types";
const reasons: Record<ConnectionProvider, string> = {
  strato: "För att hitta och koppla projektets domän via ditt Strato-konto.",
  terminal:
    "För att skapa den sparade projektmappen och köra projektet på din dator.",
  vercel: "För att publicera webbplatsen på en riktig webbadress.",
  supabase: "För planerade funktioner som behöver databas eller inloggning.",
  form_delivery: "För att kontaktformuläret ska kunna skicka meddelanden live.",
};
export function deriveIntegrationNeeds(
  content: PlanContent,
): IntegrationNeed[] {
  const needed = new Map<ConnectionProvider, IntegrationNeed>();
  for (const provider of ["strato", "terminal", "vercel"] as const)
    needed.set(provider, { provider, why: reasons[provider], mode: "later" });
  for (const feature of content.features) {
    if (!feature.provider) continue;
    const provider = feature.provider;
    const existing = needed.get(provider);
    if (!existing || feature.mode === "live_required")
      needed.set(provider, {
        provider,
        why: reasons[provider],
        mode: feature.mode,
      });
  }
  return [...needed.values()];
}
export function projectConnectionState(
  provider: ConnectionProvider,
  evidence: Omit<ConnectionState, "provider"> | null,
): ConnectionState {
  if (!evidence || evidence.adapterAvailability !== "implemented")
    return {
      provider,
      adapterAvailability: "not_implemented",
      connectionStatus: "unknown",
      permissions: [],
      checkedAt: null,
    };
  const statuses: ConnectionStatus[] = [
    "connected",
    "missing",
    "unknown",
    "expired",
    "denied",
  ];
  const checkedAt =
    typeof evidence.checkedAt === "string" &&
    Number.isFinite(Date.parse(evidence.checkedAt))
      ? evidence.checkedAt
      : null;
  const connectionStatus =
    checkedAt && statuses.includes(evidence.connectionStatus)
      ? evidence.connectionStatus
      : "unknown";
  const permissions = Array.isArray(evidence.permissions)
    ? evidence.permissions.filter((p) =>
        ["read", "write", "deploy", "database", "dns"].includes(p),
      )
    : [];
  return {
    provider,
    adapterAvailability: "implemented",
    connectionStatus,
    permissions,
    checkedAt,
  };
}
