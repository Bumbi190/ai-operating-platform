import { handleWebsiteBuildTool } from "../atlas-tools";
import { beforeAll, beforeEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { websiteBuildReadinessApi } from "./api";
import { readWebsiteBuildReadiness } from "./readiness";
import {
  initializeWorkerDb,
  testSql,
  TEST_PRINCIPAL,
  TEST_PROJECT,
} from "../test-db";
import { saveWebsitePlanRevision } from "../planning/store";
const state = vi.hoisted(() => ({
  db: null as unknown,
  authenticated: true,
  allowed: true,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/auth/project-access", () => ({
  resolveProjectAccess: async () =>
    state.authenticated
      ? {
          ok: true,
          ...TEST_PRINCIPAL,
          allowedProjectIds: state.allowed
            ? TEST_PRINCIPAL.allowedProjectIds
            : [],
        }
      : {
          ok: false,
          response: Response.json({ error: "Unauthorized" }, { status: 401 }),
        },
}));
let db: ReturnType<typeof initializeWorkerDb>;
beforeAll(() => {
  db = initializeWorkerDb();
  state.db = db;
});
beforeEach(() => {
  state.authenticated = true;
  state.allowed = true;
  state.db = db;
});
async function plan() {
  const conversationId = randomUUID();
  testSql(
    "insert into conversations(id,user_id,project_id) values('" +
      conversationId +
      "','" +
      TEST_PRINCIPAL.userId +
      "','" +
      TEST_PROJECT +
      "');",
  );
  return saveWebsitePlanRevision(db, TEST_PRINCIPAL, {
    projectId: TEST_PROJECT,
    conversationId,
    expectedRevisionId: null,
    idempotencyKey: randomUUID(),
    content: {
      title: "Café",
      purpose: "Visa",
      audience: "Alla",
      pages: [{ key: "index", title: "Hem", purpose: "Visa" }],
      design: { style: "Lugn", reference: null },
      features: [],
      architecture: "Statisk",
      steps: ["Bygg"],
      domain: { registrar: "strato", requestedName: "mittcafe.se" },
    },
  });
}
const request = (planId: string, extra = "") =>
  new Request(
    "http://localhost/api/website-build-readiness?projectId=" +
      TEST_PROJECT +
      "&planId=" +
      planId +
      extra,
  );
it("requires a session before reading any plan", async () => {
  state.authenticated = false;
  const r = await websiteBuildReadinessApi(request(randomUUID()));
  expect(r.status).toBe(401);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
});
it("reads real owner plan metadata and reports all unimplemented execution separately", async () => {
  const p = await plan(),
    r = await websiteBuildReadinessApi(request(p.ref.planId));
  expect(r.status).toBe(200);
  const v = await r.json();
  expect(v.ref).toEqual(p.ref);
  expect(v.revisionId).toBe(p.currentRevision.revisionId);
  expect(v.items[0].provider).toBe("strato");
  expect(
    v.items.every(
      (i: any) =>
        i.adapterAvailability === "not_implemented" &&
        i.connectionStatus === "unknown" &&
        i.permissions.length === 0,
    ),
  ).toBe(true);
  expect(v.domain).toMatchObject({
    registrar: "strato",
    requestedName: "mittcafe.se",
    availability: "unknown",
    accountAccess: "unknown",
    ownership: "unknown",
    dns: "unknown",
    https: "unknown",
  });
  expect(r.headers.get("cache-control")).toBe("private, no-store");
});
it("refuses a foreign project even when a plan id is known", async () => {
  const p = await plan();
  state.allowed = false;
  expect((await websiteBuildReadinessApi(request(p.ref.planId))).status).toBe(
    404,
  );
});
it("the SQL parent owner check still refuses another user within an allowed project list", async () => {
  const p = await plan();
  await expect(
    readWebsiteBuildReadiness(
      db,
      { ...TEST_PRINCIPAL, userId: "20000000-0000-4000-8000-000000000002" },
      p.ref,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rejects authority and secret query fields without reflecting them", async () => {
  const r = await websiteBuildReadinessApi(
    request(randomUUID(), "&token=private-marker"),
  );
  expect(r.status).toBe(400);
  expect(await r.text()).not.toContain("private-marker");
});
it("a database failure does not turn into missing or connected", async () => {
  state.db = {
    rpc: async () => ({
      data: null,
      error: { message: "database private-marker" },
    }),
  };
  const r = await websiteBuildReadinessApi(request(randomUUID()));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private-marker");
});
it("the actual chat read tool returns scoped guides and refuses another conversation", async () => {
  const p = await plan();
  const own: any = await handleWebsiteBuildTool(
    "get_website_build_readiness",
    p.ref,
    TEST_PRINCIPAL,
    p.conversationId,
    db,
  );
  expect(own.ref).toEqual(p.ref);
  expect(own.items[0].provider).toBe("strato");
  const foreign: any = await handleWebsiteBuildTool(
    "get_website_build_readiness",
    p.ref,
    TEST_PRINCIPAL,
    randomUUID(),
    db,
  );
  expect(foreign.code).toBe("NOT_FOUND");
});
