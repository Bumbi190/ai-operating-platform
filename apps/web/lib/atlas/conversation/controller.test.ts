import { describe, it, expect } from "vitest";
import { AtlasConversationController } from "./controller";
const C = "50000000-0000-4000-8000-000000000001",
  D = "50000000-0000-4000-8000-000000000002",
  P = "10000000-0000-4000-8000-000000000001",
  S = "60000000-0000-4000-8000-000000000001";
const saved = [
  { role: "assistant", content: "Hej", tool_data: null, created_at: null },
];
const events = (...frames: unknown[]) =>
  new Response(
    frames.map((f) => "data: " + JSON.stringify(f) + "\n\n").join(""),
    { status: 200 },
  );
const receipt = {
  event: "website_workspace",
  conversationId: C,
  session: {
    projectId: P,
    sessionId: S,
    conversationId: C,
    status: "queued",
    stage: "Köad",
    stateVersion: 1,
    agentId: P,
    activePreviewRevisionId: null,
    currentRunId: null,
    controlRequested: null,
    updatedAt: "2026-10-14",
    revisions: [],
    feedback: [],
    secret: "NEVER_COPY",
  },
};
describe("one Atlas conversation controller", () => {
  it("text→voice→text sends one shared text-only history and context", async () => {
    const bodies: any[] = [];
    const c = new AtlasConversationController(async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return events({ event: "text", text: "Svar" }, { event: "done" });
    });
    c.activateConversation({ id: C, saved, state: "ok", projectId: P });
    await c.sendTurn({ conversationId: C, text: "Text", inputSource: "text" });
    await c.sendTurn({ conversationId: C, text: "Röst", inputSource: "voice" });
    await c.sendTurn({ conversationId: C, text: "Igen", inputSource: "text" });
    expect(bodies[2].messages.map((m: any) => m.content)).toEqual([
      "Hej",
      "Text",
      "Svar",
      "Röst",
      "Svar",
      "Igen",
    ]);
    expect(bodies[1].voice).toBe(true);
    expect(bodies[1].conversation_id).toBe(C);
  });
  it("switching conversations during a stream ignores stale effects and callbacks", async () => {
    let wire: any;
    const c = new AtlasConversationController(
      async () =>
        new Response(
          new ReadableStream({
            start(x) {
              wire = x;
            },
          }),
        ),
    );
    c.activateConversation({ id: C, saved: [], state: "ok", projectId: P });
    let seen = 0;
    const job = c.sendTurn({
      conversationId: C,
      text: "Bygg",
      inputSource: "text",
      onEvent: () => seen++,
    });
    await Promise.resolve();
    c.activateConversation({ id: D, saved: [], state: "ok", projectId: P });
    wire.enqueue(
      new TextEncoder().encode(
        "data: " + JSON.stringify(receipt) + '\n\ndata: {"event":"done"}\n\n',
      ),
    );
    wire.close();
    await job;
    expect(c.snapshot().id).toBe(D);
    expect(c.snapshot().session).toBeNull();
    expect(seen).toBe(0);
    expect(c.snapshot().history).toEqual([]);
  });
  it("accepts a bounded real receipt once and strips arbitrary secret fields", async () => {
    const c = new AtlasConversationController(async () =>
      events(receipt, receipt, { event: "done" }),
    );
    c.activateConversation({ id: C, saved: [], state: "ok", projectId: P });
    await c.sendTurn({ conversationId: C, text: "Kör", inputSource: "text" });
    expect(c.snapshot().session?.sessionId).toBe(S);
    expect(JSON.stringify(c.snapshot().session)).not.toContain("NEVER_COPY");
    expect(c.snapshot().panelOpen).toBe(true);
  });
  it("malformed/cross-project/model URL results never open a panel", async () => {
    const c = new AtlasConversationController(async () =>
      events(
        {
          event: "tool_result",
          tool: "start_website_build",
          result: {
            workspaceUrl: "/projects/foreign/build/x",
            secret: "TOKEN",
          },
        },
        { ...receipt, session: { ...receipt.session, projectId: D } },
        { ...receipt, conversationId: D },
        { event: "website_workspace", conversationId: C, session: {} },
        { event: "done" },
      ),
    );
    c.activateConversation({ id: C, saved: [], state: "ok", projectId: P });
    await c.sendTurn({ conversationId: C, text: "Kör", inputSource: "text" });
    expect(c.snapshot().session).toBeNull();
    expect(c.snapshot().panelOpen).toBe(false);
    expect(JSON.stringify(c.snapshot().history)).not.toContain("TOKEN");
  });
  it("incomplete SSE never appends a successful assistant history", async () => {
    const c = new AtlasConversationController(async () =>
      events({ event: "text", text: "Halvt" }),
    );
    c.activateConversation({ id: C, saved: [], state: "ok" });
    const r = await c.sendTurn({
      conversationId: C,
      text: "Hej",
      inputSource: "text",
    });
    expect(r.ok).toBe(false);
    expect(c.snapshot().history).toEqual([{ role: "user", content: "Hej" }]);
    expect(c.snapshot().entries.at(-1)?.kind).toBe("notice");
  });
  it("failed hydration blocks sends rather than inventing empty history", async () => {
    let calls = 0;
    const c = new AtlasConversationController(async () => {
      calls++;
      return events({ event: "done" });
    });
    c.activateConversation({ id: C, saved: [], state: "error" });
    expect(
      (
        await c.sendTurn({
          conversationId: C,
          text: "Hej",
          inputSource: "text",
        })
      ).ok,
    ).toBe(false);
    expect(calls).toBe(0);
  });
  it("one conversation cannot have concurrent text and voice streams", async () => {
    let release: any,
      calls = 0;
    const c = new AtlasConversationController(async () => {
      calls++;
      await new Promise((r) => (release = r));
      return events({ event: "done" });
    });
    c.activateConversation({ id: C, saved: [], state: "ok" });
    const first = c.sendTurn({
      conversationId: C,
      text: "Hej",
      inputSource: "text",
    });
    expect(
      (
        await c.sendTurn({
          conversationId: C,
          text: "Röst",
          inputSource: "voice",
        })
      ).ok,
    ).toBe(false);
    release();
    await first;
    expect(calls).toBe(1);
  });
  it("speech drafts survive review and signout clears all state", () => {
    const c = new AtlasConversationController();
    c.activateConversation({ id: C, saved, state: "ok" });
    c.stageSpeechDraft("Byt färg");
    expect(c.snapshot().speechDraft).toBe("Byt färg");
    expect(c.snapshot().history).toHaveLength(1);
    c.clearOnSignout();
    expect(c.snapshot().id).toBeNull();
    expect(c.snapshot().history).toEqual([]);
  });
});
