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
  it("binds explicit studio turns to their project and removes the hint in ordinary chat", async () => {
    const bodies:any[]=[];
    const c=new AtlasConversationController(async(_url,init)=>{bodies.push(JSON.parse(init!.body as string));return events({event:'text',text:'Svar'},{event:'done'})});
    c.activateConversation({id:C,saved:[],state:'ok',projectId:P,studio:true});
    await c.sendTurn({conversationId:C,text:'Min hemsida',inputSource:'text'});
    expect(bodies[0].studioContext).toEqual({projectId:P,conversationId:C});
    c.activateConversation({id:C,saved:[],state:'ok',projectId:P});
    await c.sendTurn({conversationId:C,text:'Vanlig fråga',inputSource:'text'});
    expect(bodies[1]).not.toHaveProperty('studioContext');
  });
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
  it.each(["activation", "stream"] as const)("clears the rendered revision before feedback on a replacement build via %s", async (path) => {
    const nextId = "60000000-0000-4000-8000-000000000002";
    const revisionId = "70000000-0000-4000-8000-000000000001";
    const bodies: any[] = [];
    const nextPlan = {
      ref: { projectId: P, planId: D }, conversationId: C,
      currentRevision: { projectId: P, planId: D, revisionId: D, sha256: "a".repeat(64),
        content: { title: "Ny plan", pages: [], features: [], steps: [], design: {}, domain: { registrar: "strato" } } },
      setting: {}, budget: {}, activeSessionId: nextId
    };
    const oldSession = { ...receipt.session, revisions: [{ id: revisionId, sha256: "a".repeat(64), pages: [] }] } as any;
    const nextSession = { ...receipt.session, sessionId: nextId } as any;
    const c = new AtlasConversationController(async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return path === "stream" && bodies.length === 1
        ? events({ event: "website_plan", conversationId: C, plan: nextPlan }, { ...receipt, session: nextSession }, { event: "done" })
        : events({ event: "done" });
    });
    c.activateConversation({ id: C, saved: [], state: "ok", projectId: P, session: oldSession });
    c.setRenderedRevision(revisionId);
    if (path === "activation") c.activateConversation({ id: C, saved: [], state: "ok", session: nextSession });
    else await c.sendTurn({ conversationId: C, text: "jag godkänner", inputSource: "text" });
    expect(c.snapshot().session?.sessionId).toBe(nextId);
    expect(c.snapshot().viewedRevisionId).toBeNull();
    c.setRenderedRevision(revisionId);
    expect(c.snapshot().viewedRevisionId).toBeNull();
    await c.sendTurn({ conversationId: C, text: "Lägg till kontakt", inputSource: "text" });
    expect(bodies.at(-1).buildContext).toEqual({ projectId: P, sessionId: nextId, viewedRevisionId: null });
  });
  it("rehydrates successful history recovery before allowing the next send", async () => {
    const bodies: any[] = [];
    const c = new AtlasConversationController(async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return events({ event: "done" });
    });
    c.activateConversation({ id: C, saved: [], state: "error" });
    c.activateConversation({ id: C, saved, state: "ok" });
    expect(c.snapshot().entries).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Hej" })]));
    await c.sendTurn({ conversationId: C, text: "Fortsätt", inputSource: "text" });
    expect(bodies[0].messages.map((m: any) => m.content)).toEqual(["Hej", "Fortsätt"]);
  });
  it("reconciles saved extensions without dropping newer local turns on a stale refresh", async () => {
    const c = new AtlasConversationController(async () => events({ event: "text", text: "Svar" }, { event: "done" }));
    c.activateConversation({ id: C, saved, state: "ok" });
    await c.sendTurn({ conversationId: C, text: "Lokalt", inputSource: "text" });
    c.activateConversation({ id: C, saved, state: "ok" });
    expect(c.snapshot().history.map(m => m.content)).toEqual(["Hej", "Lokalt", "Svar"]);
    const extended = [...saved, { role: "user", content: "Lokalt", tool_data: null, created_at: null },
      { role: "assistant", content: "Svar", tool_data: null, created_at: null },
      { role: "user", content: "Från annan flik", tool_data: null, created_at: null }];
    c.activateConversation({ id: C, saved: extended, state: "ok" });
    expect(c.snapshot().history.map(m => m.content)).toEqual(extended.map(m => m.content));
    expect(c.snapshot().entries.at(-1)).toMatchObject({ kind: "user", text: "Från annan flik" });
  });

});

describe("compact text entry", () => {
  it("is quiet and excludes an unseen plan and build context", async () => {
    const bodies: any[] = [];
    const c = new AtlasConversationController(async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return events({event:"text",text:"Svar"},{event:"done"});
    });
    c.activateConversation({id:C,saved,projectId:P,state:"ok",plan:{ref:{projectId:P,planId:P},currentRevision:{revisionId:P,sha256:"a".repeat(64)}} as any});
    await c.sendCompactText({text:"jag godkänner",initialProjectId:D});
    expect(bodies).toHaveLength(1);
    expect(bodies[0].inputSource).toBe("text");
    expect(bodies[0]).not.toHaveProperty("voice");
    expect(bodies[0]).not.toHaveProperty("websitePlanRef");
    expect(bodies[0]).not.toHaveProperty("buildContext");
    expect(c.snapshot().projectId).toBe(P);
  });
  it("double send during creation creates one conversation and one turn", async () => {
    let release!: (r:Response)=>void;
    const calls: string[]=[];
    const c=new AtlasConversationController(async(url)=>{
      calls.push(String(url));
      return String(url)==="/api/conversations" ? new Promise<Response>(r=>release=r) : events({event:"text",text:"Svar"},{event:"done"});
    });
    const a=c.sendCompactText({text:"Hej",initialProjectId:P});
    const b=c.sendCompactText({text:"Hej",initialProjectId:P});
    release(Response.json({id:C,project_id:P}));
    await Promise.all([a,b]);
    expect(calls.filter(x=>x==="/api/conversations")).toHaveLength(1);
    expect(calls.filter(x=>x==="/api/chat")).toHaveLength(1);
    expect(c.snapshot().history.map(m=>m.content)).toEqual(["Hej","Svar"]);
  });
  it.each(["signout","switch"] as const)("%s invalidates pending creation",async(action)=>{
    let release!: (r:Response)=>void;
    const calls: string[]=[];
    const c=new AtlasConversationController(async(url)=>{
      calls.push(String(url));return new Promise<Response>(r=>release=r);
    });
    const job=c.sendCompactText({text:"Hej",initialProjectId:P});
    if(action==="signout") c.clearOnSignout();
    else c.activateConversation({id:D,saved:[],state:"ok",projectId:P});
    release(Response.json({id:C}));
    expect((await job).ok).toBe(false);
    expect(c.snapshot().id).toBe(action==="signout"?null:D);
    expect(calls).toEqual(["/api/conversations"]);
  });
  it.each([new Response("denied",{status:403}),Response.json({}),Response.json({id:""})])("does not send when creation fails",async(response)=>{
    const calls:string[]=[];
    const c=new AtlasConversationController(async(url)=>{calls.push(String(url));return response});
    expect((await c.sendCompactText({text:"Hej",initialProjectId:null})).ok).toBe(false);
    expect(c.snapshot().id).toBeNull();expect(calls).toEqual(["/api/conversations"]);
  });
  it("does not create empty turns and keeps one text voice text history",async()=>{
    const calls:string[]=[],bodies:any[]=[];
    const c=new AtlasConversationController(async(url,init)=>{
      calls.push(String(url));bodies.push(JSON.parse(init!.body as string));
      return String(url)==="/api/conversations"?Response.json({id:C}):events({event:"text",text:"Svar"},{event:"done"});
    });
    await c.sendCompactText({text:"  ",initialProjectId:P});
    expect(calls).toEqual([]);
    await c.sendCompactText({text:"Text",initialProjectId:P});
    await c.sendTurn({conversationId:C,text:"Röst",inputSource:"voice"});
    await c.sendCompactText({text:"Igen",initialProjectId:D});
    expect(bodies.at(-1).messages.map((m:any)=>m.content)).toEqual(["Text","Svar","Röst","Svar","Igen"]);
    expect(c.snapshot().projectId).toBe(P);
  });
});
