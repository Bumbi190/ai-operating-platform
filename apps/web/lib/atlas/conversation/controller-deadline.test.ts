import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasConversationController } from "./controller";

const C = "50000000-0000-4000-8000-000000000001";
const D = "50000000-0000-4000-8000-000000000002";
const encode = (...frames: unknown[]) => new TextEncoder().encode(
  frames.map(frame => "data: " + JSON.stringify(frame) + "\n\n").join(""),
);
const completed = () => new Response(encode(
  {event: "text", text: "Kontrollen är klar."}, {event: "done"},
));
afterEach(() => vi.useRealTimers());

describe("bounded Atlas requests without automatic replay", () => {
  it.each(["headers", "body"] as const)("bounds stalled conversation %s and does not send its task", async stage => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const calls: string[] = [];
    const c = new AtlasConversationController(async (url, init) => {
      calls.push(String(url));
      signal = init?.signal as AbortSignal;
      return stage === "headers"
        ? new Promise<Response>(() => {})
        : new Response(new ReadableStream({start() {}}));
    });
    const turn = c.sendCompactText({text: "Lägg till ett möte", initialProjectId: null});
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await turn).toMatchObject({ok: false, notice: expect.stringContaining("Inget uppdrag skickades")});
    expect(c.snapshot()).toMatchObject({id: null, pending: false});
    expect(c.snapshot().entries.at(-1)).toMatchObject({kind: "notice", text: expect.stringContaining("inte bekräfta samtalet")});
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(calls).toEqual(["/api/conversations"]);
  });

  it("cancels conversation creation immediately and rejects a late result before a new manual turn", async () => {
    let release!: (response: Response) => void;
    const calls: string[] = [];
    let firstSignal: AbortSignal | undefined;
    const c = new AtlasConversationController(async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) {
        firstSignal = init?.signal as AbortSignal;
        return new Promise<Response>(resolve => { release = resolve; });
      }
      return String(url) === "/api/conversations" ? Response.json({id: D}) : completed();
    });
    const created: string[] = [];
    c.subscribeCreated(id => created.push(id));
    const canceled = c.sendCompactText({text: "Gammalt kalenderuppdrag", initialProjectId: null});
    expect(c.cancelActiveTurn()).toBe(true);
    expect(firstSignal?.aborted).toBe(true);
    expect(c.snapshot().pending).toBe(false);
    expect((await canceled).ok).toBe(false);
    release(Response.json({id: C}));
    await Promise.resolve();
    expect(created).toEqual([]);
    expect(c.snapshot().id).toBeNull();
    expect(calls).toEqual(["/api/conversations"]);
    expect((await c.sendCompactText({text: "Kontrollera kalendern", initialProjectId: null})).ok).toBe(true);
    expect(created).toEqual([D]);
    expect(c.snapshot().id).toBe(D);
    expect(calls).toEqual(["/api/conversations", "/api/conversations", "/api/chat"]);
  });

  it.each(["headers", "error body", "stream"] as const)("bounds stalled chat %s, clears pending, and permits a later manual check", async stage => {
    vi.useFakeTimers();
    let calls = 0;
    let firstSignal: AbortSignal | undefined;
    const c = new AtlasConversationController(async (_url, init) => {
      if (++calls > 1) return completed();
      firstSignal = init?.signal as AbortSignal;
      if (stage === "headers") return new Promise<Response>(() => {});
      return new Response(new ReadableStream({
        start(wire) {
          if (stage === "stream") wire.enqueue(encode({event: "text", text: "Jag kontrollerar."}));
        },
      }), {status: stage === "error body" ? 503 : 200});
    });
    c.activateConversation({id: C, saved: [], state: "ok"});
    const settled: unknown[] = [];
    c.subscribeSettled(event => settled.push({...event, pending: c.snapshot().pending}));
    const turn = c.sendTurn({conversationId: C, text: "Lägg till mötet", inputSource: "voice"});
    // A valid request gets the server's full 120-second budget.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(c.snapshot().pending).toBe(true);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await turn).toMatchObject({ok: false, notice: expect.stringContaining("en ändring kan redan ha sparats")});
    expect(c.snapshot().pending).toBe(false);
    expect(c.snapshot().entries.at(-1)).toMatchObject({kind: "notice", text: expect.stringContaining("resultat är inte bekräftat")});
    expect(firstSignal?.aborted).toBe(true);
    expect(settled).toEqual([{conversationId: C, generation: 1, current: true, ok: false, pending: false}]);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(calls).toBe(1);
    expect((await c.sendTurn({conversationId: C, text: "Kontrollera om mötet finns", inputSource: "text"})).ok).toBe(true);
    expect(calls).toBe(2);
    expect(c.snapshot().history.at(-1)?.content).toBe("Kontrollen är klar.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a total deadline even when a stream keeps producing incomplete progress", async () => {
    vi.useFakeTimers();
    let wire!: ReadableStreamDefaultController<Uint8Array>;
    const c = new AtlasConversationController(async () => new Response(new ReadableStream({
      start(value) { wire = value; },
    })));
    c.activateConversation({id: C, saved: [], state: "ok"});
    const turn = c.sendTurn({conversationId: C, text: "Kontrollera kalendern", inputSource: "text"});
    await vi.advanceTimersByTimeAsync(0);
    for (let n = 0; n < 4; n++) {
      await vi.advanceTimersByTimeAsync(30_000);
      wire.enqueue(encode({event: "text", text: "Fortsätter. "}));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(c.snapshot().pending).toBe(true);
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await turn).ok).toBe(false);
    expect(c.snapshot().history).toEqual([{role: "user", content: "Kontrollera kalendern"}]);
    expect(c.snapshot().pending).toBe(false);
  });

  it.each(["done", "error"] as const)("settles an open stream at %s, preserves error text, and ignores all following frames", async terminal => {
    vi.useFakeTimers();
    let canceled = 0;
    const message = "Atlas kunde inte nå modellleverantören.";
    const c = new AtlasConversationController(async () => new Response(new ReadableStream({
      start(wire) {
        wire.enqueue(encode(
          {event: "text", text: "Första svaret."},
          {event: terminal, ...(terminal === "error" ? {message} : {})},
          {event: "text", text: "FÅR INTE VISAS"},
          {event: "done"},
        ));
        // Deliberately never close, including an uncooperative cancel promise.
      },
      cancel() { canceled++; return new Promise<void>(() => {}); },
    })));
    c.activateConversation({id: C, saved: [], state: "ok"});
    const seen: string[] = [];
    const settled: unknown[] = [];
    c.subscribeSettled(event => settled.push({...event, pending: c.snapshot().pending}));
    const result = await c.sendTurn({
      conversationId: C, text: "Fråga", inputSource: "voice",
      onEvent: event => seen.push(event.event),
    });
    expect(result).toEqual(terminal === "done" ? {ok: true} : {ok: false, notice: message});
    expect(c.snapshot().pending).toBe(false);
    expect(canceled).toBe(1);
    expect(seen).toEqual(["text", terminal]);
    expect(JSON.stringify(c.snapshot())).not.toContain("FÅR INTE VISAS");
    expect(settled).toEqual([{conversationId: C, generation: 1, current: true, ok: terminal === "done", pending: false}]);
    if (terminal === "error") {
      expect(c.snapshot().entries.at(-1)).toMatchObject({kind: "notice", text: message});
      expect(c.snapshot().history).toEqual([{role: "user", content: "Fråga"}]);
    }
    await vi.advanceTimersByTimeAsync(180_000);
    expect(settled).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an unresponsive fetch without waiting for the deadline or overwriting a new reply", async () => {
    let release!: (response: Response) => void;
    let calls = 0;
    const c = new AtlasConversationController(async () => ++calls === 1
      ? new Promise<Response>(resolve => { release = resolve; })
      : completed());
    c.activateConversation({id: C, saved: [], state: "ok"});
    const old = c.sendTurn({conversationId: C, text: "Gammalt", inputSource: "voice"});
    expect(c.cancelActiveTurn()).toBe(true);
    expect((await old).ok).toBe(false);
    expect((await c.sendTurn({conversationId: C, text: "Kontrollera resultatet", inputSource: "text"})).ok).toBe(true);
    release(new Response(encode({event: "text", text: "FÖR SENT"}, {event: "done"})));
    await Promise.resolve();
    expect(JSON.stringify(c.snapshot())).not.toContain("FÖR SENT");
    expect(c.snapshot().history.at(-1)?.content).toBe("Kontrollen är klar.");
    expect(c.snapshot().pending).toBe(false);
    expect(calls).toBe(2);
  });
});

it("preserves a saved calendar receipt when the provider fails afterwards, without replaying the mutation", async () => {
  vi.useFakeTimers();
  const effect = {
    event: "calendar_changed", conversationId: C, mutationId: D, eventId: D,
    version: 1, calendarHref: "/calendar?week=2026-11-09",
  };
  const message = "Atlas kunde inte svara på grund av ett fel hos modellleverantören.";
  let calls = 0;
  const c = new AtlasConversationController(async () => {
    calls++;
    return new Response(encode(
      {event: "tool_call", tool: "create_calendar_event", input: {eventId: D}},
      {event: "tool_result", tool: "create_calendar_event", result: {ok: true, event: {id: D, version: 1}, mutationId: D}},
      effect,
      {event: "error", message},
      {...effect, version: 2},
      {event: "done"},
    ));
  });
  c.activateConversation({id: C, saved: [], state: "ok"});
  const changed: unknown[] = [];
  c.subscribeCalendarChanged(value => changed.push(value));
  expect(await c.sendTurn({conversationId: C, text: "Lägg till mötet", inputSource: "voice"})).toEqual({ok: false, notice: message});
  expect(changed).toEqual([effect]);
  expect(c.snapshot().entries.at(-1)).toMatchObject({kind: "notice", text: message});
  expect(c.snapshot().pending).toBe(false);
  await vi.advanceTimersByTimeAsync(180_000);
  expect(calls).toBe(1);
});

it("signout aborts every old turn and fences late writes from a newly activated conversation with the same ID", async () => {
  vi.useFakeTimers();
  let releaseOld!: (response: Response) => void;
  let newWire!: ReadableStreamDefaultController<Uint8Array>;
  let oldStreamCanceled = false;
  const signals: AbortSignal[] = [];
  const c = new AtlasConversationController(async (_url, init) => {
    signals.push(init?.signal as AbortSignal);
    if (signals.length === 1) return new Promise<Response>(resolve => { releaseOld = resolve; });
    if (signals.length === 2) return new Response(new ReadableStream({
      start() {},
      cancel() { oldStreamCanceled = true; },
    }));
    return new Response(new ReadableStream({start(wire) { newWire = wire; }}));
  });
  c.activateConversation({id: C, saved: [], state: "ok"});
  const oldC = c.sendTurn({conversationId: C, text: "Gammalt C", inputSource: "text"});
  c.activateConversation({id: D, saved: [], state: "ok"});
  const oldD = c.sendTurn({conversationId: D, text: "Gammalt D", inputSource: "voice"});
  await vi.advanceTimersByTimeAsync(10_000);
  c.clearOnSignout();
  c.activateConversation({
    id: C, state: "ok",
    saved: [{role: "assistant", content: "Ny inloggning", tool_data: null, created_at: null}],
  });
  const fresh = c.sendTurn({conversationId: C, text: "Ny kontroll", inputSource: "text"});
  expect((await oldC).ok).toBe(false);
  expect((await oldD).ok).toBe(false);
  expect(signals.slice(0, 2).every(signal => signal.aborted)).toBe(true);
  expect(signals[2].aborted).toBe(false);
  expect(oldStreamCanceled).toBe(true);
  expect(c.snapshot().pending).toBe(true);
  expect(c.snapshot().history.map(message => message.content)).toEqual(["Ny inloggning", "Ny kontroll"]);

  releaseOld(new Response(encode({event: "text", text: "GAMMALT SVAR"}, {event: "done"})));
  // Advance beyond both old deadlines but within the new turn's server budget.
  await vi.advanceTimersByTimeAsync(120_001);
  expect(c.snapshot().pending).toBe(true);
  expect(JSON.stringify(c.snapshot())).not.toContain("GAMMALT SVAR");
  expect(c.snapshot().entries.some(entry => entry.kind === "notice")).toBe(false);
  newWire.enqueue(encode({event: "text", text: "Det nya svaret"}, {event: "done"}));
  newWire.close();
  expect((await fresh).ok).toBe(true);
  expect(c.snapshot().pending).toBe(false);
  expect(c.snapshot().history.map(message => message.content)).toEqual(["Ny inloggning", "Ny kontroll", "Det nya svaret"]);
  expect(vi.getTimerCount()).toBe(0);
});
