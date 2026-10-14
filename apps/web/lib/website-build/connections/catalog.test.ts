import { describe, it, expect } from "vitest";
import {
  deriveIntegrationNeeds,
  projectConnectionState,
} from "./readiness-contract";
import { getConnectionGuide, resolveOwnedTarget } from "./catalog";
import type { PlanContent } from "../planning/types";
const projectId = "10000000-0000-4000-8000-000000000001",
  operatorId = "20000000-0000-4000-8000-000000000001";
const scope = { projectId, operatorId };
const content: PlanContent = {
  title: "Café",
  purpose: "Visa",
  audience: "Alla",
  pages: [{ key: "index", title: "Hem", purpose: "Visa" }],
  design: { style: "Lugn", reference: null },
  features: [],
  architecture: "Statisk",
  steps: ["Bygg"],
  domain: { registrar: "strato", requestedName: "mittcafe.se" },
};
const guide = (provider: any, target: unknown = null) =>
  getConnectionGuide({
    provider,
    verifiedTarget: target,
    scope,
    os: "windows",
    need: "Publicering",
  });
describe("safe project connection guidance", () => {
  it("starts domain discovery at Strato and does not require a database for a simple site", () => {
    const needs = deriveIntegrationNeeds(content);
    expect(needs[0].provider).toBe("strato");
    expect(needs.find((n) => n.provider === "supabase")).toBeUndefined();
    expect(needs.find((n) => n.provider === "terminal")).toBeDefined();
  });
  it("requires a database only for an explicit planned feature", () =>
    expect(
      deriveIntegrationNeeds({
        ...content,
        features: [
          { name: "Medlemskonto", mode: "live_required", provider: "supabase" },
        ],
      }).find((n) => n.provider === "supabase")?.mode,
    ).toBe("live_required"));
  it("never mistakes platform environment or broker identity for a callable project adapter", () => {
    const state = projectConnectionState("terminal", {
      adapterAvailability: "not_implemented",
      connectionStatus: "connected",
      permissions: ["write"],
      checkedAt: "2026-10-14T00:00:00Z",
      broker: true,
      token: "private-marker",
    } as any);
    expect(state.adapterAvailability).toBe("not_implemented");
    expect(state.connectionStatus).toBe("unknown");
    expect(state.permissions).toEqual([]);
    expect(JSON.stringify(state)).not.toContain("private-marker");
  });
  it("reports a failed read as unknown, not missing", () =>
    expect(projectConnectionState("supabase", null).connectionStatus).toBe(
      "unknown",
    ));
  it.each(["connected", "missing", "unknown", "expired", "denied"] as const)(
    "preserves only verified adapter evidence for %s",
    (status) => {
      const s = projectConnectionState("vercel", {
        adapterAvailability: "implemented",
        connectionStatus: status,
        permissions: ["read"],
        checkedAt: "2026-10-14T00:00:00Z",
      });
      expect(s.connectionStatus).toBe(status);
      expect(s.permissions).toEqual(["read"]);
      expect(s).not.toHaveProperty("token");
    },
  );
  it("links only an explicitly verified owned provider target", () => {
    const target = resolveOwnedTarget(
      {
        provider: "supabase",
        projectId,
        operatorId,
        resourceId: "abcdefghijklmnopqrst",
        verified: true,
      },
      scope,
    );
    expect(
      guide("supabase", target).links.some(
        (l) =>
          l.href ===
          "https://supabase.com/dashboard/project/abcdefghijklmnopqrst/settings/api-keys",
      ),
    ).toBe(true);
  });
  it("rejects foreign, malformed and URL-bearing targets rather than echoing them", () => {
    for (const bad of [
      {
        provider: "supabase",
        projectId,
        operatorId: "foreign",
        resourceId: "abcdefghijklmnopqrst",
        verified: true,
      },
      {
        provider: "supabase",
        projectId,
        operatorId,
        resourceId: "../evil",
        verified: true,
      },
      {
        provider: "supabase",
        projectId,
        operatorId,
        resourceId: "abcdefghijklmnopqrst",
        verified: true,
        url: "https://evil.test/?token=private-marker",
      },
    ])
      expect(resolveOwnedTarget(bad, scope)).toBeNull();
    expect(
      JSON.stringify(
        guide("supabase", { url: "https://evil.test/?token=private-marker" }),
      ),
    ).not.toContain("private-marker");
  });
  it("uses official Strato search then the existing account, with separate verification steps", () => {
    const c = guide("strato");
    expect(c.links[0].href).toBe("https://www.strato.se/domannamn/sok-doman/");
    expect(
      c.links.some(
        (l) => l.href === "https://www.strato.se/apps/CustomerService",
      ),
    ).toBe(true);
    const text = JSON.stringify(c);
    expect(text).toContain("Domänadministration");
    expect(text).toContain("DNS");
    expect(text).toContain("HTTPS");
    expect(text).toContain("e-post");
    expect(text).not.toMatch(
      /76\.76\.|cname\.vercel|transfer|vercel\.com\/domains/,
    );
  });
  it("does not fabricate a token generator or place credentials in commands", () => {
    for (const p of [
      "terminal",
      "vercel",
      "supabase",
      "strato",
      "form_delivery",
    ] as const) {
      const c = guide(p);
      expect(JSON.stringify(c)).not.toMatch(
        /sk-proj-|sb_secret_|--token|randomBytes|openssl rand/,
      );
      for (const command of c.commands)
        expect(command.text).not.toMatch(/=|token|secret/i);
    }
  });
  it("unknown OS gets no shell command and needs stay bounded", () => {
    expect(
      getConnectionGuide({
        provider: "terminal",
        verifiedTarget: null,
        scope,
        os: "unknown",
        need: "Mapp",
      }).commands,
    ).toEqual([]);
    expect(() =>
      getConnectionGuide({
        provider: "unknown" as any,
        verifiedTarget: null,
        scope,
        os: "windows",
        need: "Mapp",
      }),
    ).toThrow();
  });
});
