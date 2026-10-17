import { buildChatRequestBody } from "@/lib/atlas/view-client";
import {
  applyStreamEvent,
  hydrateTranscript,
  textHistory,
  startReply,
  parseStreamLine,
  splitStreamBuffer,
  failedResponseNotice,
  CONNECTION_FAILED_NOTICE,
  INCOMPLETE_NOTICE,
  INTERRUPTED_NOTICE,
  type SavedMessage,
  type TranscriptEntry,
  type HistoryMessage,
  type StreamEvent,
} from "@/lib/os/chat-shared";
import type {
  PlanView,
  PlanRevisionRef,
} from "@/lib/website-build/planning/types";
import type { BuildSessionView } from "@/lib/website-build/types";
import { decodeWebsiteEffect, type BuildContext } from "./stream-effects";
import {decodeCleanupEffect,decodeReviewView,type CleanupReviewView} from "@/lib/atlas/handlarborsen-test-data/stream-effect";
export type ConversationSnapshot = {
  testDataReviews: CleanupReviewView[];
  studio: boolean;
  id: string | null;
  projectId: string | null;
  state: "ok" | "error";
  history: HistoryMessage[];
  entries: TranscriptEntry[];
  pending: boolean;
  plan: PlanView | null;
  session: BuildSessionView | null;
  viewedRevisionId: string | null;
  panelOpen: boolean;
  speechDraft: string | null;
};
const empty = (): ConversationSnapshot => ({
  testDataReviews: [],
  studio: false,
  id: null,
  projectId: null,
  state: "ok",
  history: [],
  entries: [],
  pending: false,
  plan: null,
  session: null,
  viewedRevisionId: null,
  panelOpen: false,
  speechDraft: null,
});
type Activate = {
  studio?: boolean;
  id: string;
  saved: SavedMessage[];
  state: "ok" | "error";
  projectId?: string | null;
  plan?: PlanView | null;
  session?: BuildSessionView | null;
};
export type TurnResult = { ok: boolean; notice?: string };
export type AtlasTurnSettlement = { conversationId: string; generation: number; current: boolean; ok: boolean };
type Turn = {
  conversationId: string;
  text: string;
  inputSource: "text" | "voice";
  visiblePlan?: PlanRevisionRef | null;
  buildContext?: BuildContext | null;
  onEvent?: (event: StreamEvent) => void;
};
export class AtlasConversationController {
  private conversations = new Map<string, ConversationSnapshot>();
  private active = empty();
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private request: typeof fetch = (...args) => fetch(...args)) {}
  private creating: {generation: number; promise: Promise<string | null>} | null = null;
  private compactPending: symbol | null = null;
  private settledListeners = new Set<(event: AtlasTurnSettlement) => void>();
  subscribeSettled = (listener: (event: AtlasTurnSettlement) => void) => {
    this.settledListeners.add(listener);
    return () => { this.settledListeners.delete(listener); };
  };
  private createdListeners = new Set<(id: string) => void>();
  subscribeCreated = (listener: (id: string) => void) => {
    this.createdListeners.add(listener);
    return () => { this.createdListeners.delete(listener); };
  };

  async ensureConversation(input: {firstText: string; inputSource: "text" | "voice"; projectId: string | null}): Promise<string | null> {
    if (this.active.id) return this.active.state === "ok" ? this.active.id : null;
    const generation = this.generation;
    if (this.creating?.generation === generation) return this.creating.promise;
    this.active = {...this.active, pending: true};
    this.listeners.forEach(listener => listener());
    const promise = (async () => {
      try {
        const response = await this.request("/api/conversations", {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            title: input.firstText.slice(0, 56),
            ...(input.projectId ? {project_id: input.projectId} : {}),
          }),
        });
        const row = await response.json();
        if (!response.ok || typeof row?.id !== "string" || !row.id.trim() || generation !== this.generation) return null;
        // This event preserves logical new-thread drafts without transferring
        // them when an existing conversation is explicitly selected.
        this.createdListeners.forEach(listener => listener(row.id));
        this.activateSnapshot({id: row.id, saved: [], state: "ok", projectId: input.projectId}, true);
        return row.id as string;
      } catch { return null; }
    })();
    this.creating = {generation, promise};
    try { return await promise; }
    finally {
      if (this.creating?.promise === promise) this.creating = null;
      if (this.generation === generation && !this.active.id && this.active.pending) {
        this.active = {...this.active, pending: false};
        this.listeners.forEach(listener => listener());
      }
    }
  }

  async sendCompactText(input: {text: string; initialProjectId: string | null}): Promise<TurnResult> {
    const text = input.text.trim();
    if (!text || this.compactPending || this.active.pending) return {ok: false};
    const token = Symbol();
    this.compactPending = token;
    try {
      const id = await this.ensureConversation({firstText: text, inputSource: "text", projectId: input.initialProjectId});
      if (this.compactPending !== token) return {ok: false};
      if (!id) return {ok: false, notice: "Konversationen kunde inte sparas. Försök igen."};
      return await this.sendTurn({conversationId: id, text, inputSource: "text", visiblePlan: null, buildContext: null});
    } finally {
      if (this.compactPending === token) this.compactPending = null;
    }
  }

  snapshot = () => this.active;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(id: string, patch: Partial<ConversationSnapshot>) {
    const old = this.conversations.get(id);
    if (!old) return;
    const next = { ...old, ...patch };
    this.conversations.set(id, next);
    if (this.active.id === id) {
      this.active = next;
      this.listeners.forEach((f) => f());
    }
  }
  private savedTestDataReviews(saved:SavedMessage[],id:string):CleanupReviewView[]{
    const views=new Map<string,CleanupReviewView>();
    for(const row of saved){
      if(row.role!=='assistant'||!row.tool_data||typeof row.tool_data!=='object')continue;
      const td=row.tool_data as Record<string,unknown>;
      if(td.kind!=='handlarborsen_test_data_review')continue;
      const view=decodeCleanupEffect({event:td.kind,conversationId:td.conversationId,review:td.review},id);
      if(view)views.set(view.packageView.packageId,view);
    }
    return [...views.values()];
  }
  private mergeSavedTestDataReviews(current:CleanupReviewView[],saved:SavedMessage[],id:string):CleanupReviewView[]{
    const views=new Map(current.map(view=>[view.packageView.packageId,view]));
    const rank=(view:CleanupReviewView)=>view.receipt||view.rejectionStatus?2:view.decisionState==='pending'?0:1;
    for(const view of this.savedTestDataReviews(saved,id)){
      const prior=views.get(view.packageView.packageId);
      if(!prior||(prior.reviewRef===view.reviewRef&&rank(view)>rank(prior)))views.set(view.packageView.packageId,view);
    }
    return [...views.values()];
  }
  activateConversation(input: Activate) {
    this.activateSnapshot(input, false);
  }
  private activateSnapshot(input: Activate, preserveCompact: boolean) {
    if (this.active.id !== input.id) {
      this.generation++;
      if (!preserveCompact) this.compactPending = null;
    }
    let s = this.conversations.get(input.id);
    if (!s)
      s = {
        ...empty(),
        testDataReviews:this.savedTestDataReviews(input.saved,input.id),
        studio: input.studio===true,
        id: input.id,
        projectId: input.projectId ?? null,
        state: input.state,
        history: textHistory(input.saved),
        entries: hydrateTranscript(input.saved),
        plan: input.plan ?? null,
        session: input.session ?? null,
        panelOpen: !!input.session,
      };
    else {
      const incomingHistory = textHistory(input.saved);
      const savedIsPrefix = incomingHistory.every(
        (message, index) =>
          s!.history[index]?.role === message.role &&
          s!.history[index]?.content === message.content,
      );
      // A stale server refresh may precede locally completed turns. An error
      // recovery or newer authoritative history must rehydrate the transcript.
      const rehydrate = !s.pending && input.state === "ok" &&
        (s.state === "error" || !savedIsPrefix || incomingHistory.length > s.history.length);
      const sessionChanged = !s.pending && !!input.session &&
        input.session.sessionId !== s.session?.sessionId;
      s = {
        ...s,
        studio: input.studio===true,
        testDataReviews: this.mergeSavedTestDataReviews(s.testDataReviews,input.saved,input.id),
        state: input.state,
        projectId: s.projectId ?? input.projectId ?? null,
        ...(rehydrate ? {
          history: incomingHistory, entries: hydrateTranscript(input.saved),
        } : {}),
        ...(!s.pending
          ? { plan: input.plan ?? s.plan, session: input.session ?? s.session }
          : {}),
        ...(sessionChanged ? { viewedRevisionId: null, panelOpen: true } : {}),
      };
    }
    this.conversations.set(input.id, s);
    this.active = s;
    this.listeners.forEach((f) => f());
  }
  updateTestDataReview(conversationId:string,value:unknown) {
    const view=decodeReviewView(value),current=this.conversations.get(conversationId);
    if(!view||!current||this.active.id!==conversationId||view.packageView.conversationId!==conversationId)return;
    const prior=current.testDataReviews.find(r=>r.packageView.packageId===view.packageView.packageId);
    if(prior&&prior.reviewRef!==view.reviewRef)return;
    this.update(conversationId,{testDataReviews:[...current.testDataReviews.filter(r=>r.packageView.packageId!==view.packageView.packageId),view]});
  }
  clearOnSignout() {
    this.creating = null;
    this.compactPending = null;
    this.generation++;
    this.conversations.clear();
    this.active = empty();
    this.listeners.forEach((f) => f());
  }
  deactivateConversation() {
    this.creating = null;
    this.compactPending = null;
    this.generation++;
    this.active=empty();
    this.listeners.forEach(f=>f());
  }
  stageSpeechDraft(text: string) {
    if (this.active.id) this.update(this.active.id, { speechDraft: text });
  }
  clearSpeechDraft() {
    if (this.active.id) this.update(this.active.id, { speechDraft: null });
  }
  setPanelOpen(panelOpen: boolean) {
    if (this.active.id) this.update(this.active.id, { panelOpen });
  }
  applySessionSnapshot(session:BuildSessionView) {
    const current=this.active
    if(!current.id||!current.session||session.sessionId!==current.session.sessionId||session.stateVersion<current.session.stateVersion)return
    const effect=decodeWebsiteEffect({event:"website_workspace",conversationId:current.id,session},{conversationId:current.id,projectId:current.projectId,sessionId:current.session.sessionId})
    if(effect?.session)this.update(current.id,{session:effect.session})
  }
  applyPlanReview(plan:PlanView):boolean {
    const current=this.active,shown=current.plan
    if(!current.id||current.pending||!shown||plan.conversationId!==current.id||plan.ref.projectId!==current.projectId||plan.ref.planId!==shown.ref.planId||plan.currentRevision.revisionId!==shown.currentRevision.revisionId||plan.currentRevision.sha256!==shown.currentRevision.sha256)return false
    const effect=decodeWebsiteEffect({event:'website_plan',conversationId:current.id,plan},{conversationId:current.id,projectId:current.projectId,sessionId:current.session?.sessionId??null})
    if(!effect?.plan)return false
    this.update(current.id,{plan:effect.plan});return true
  }
  setRenderedRevision(id: string | null) {
    const s = this.active;
    if(id===s.viewedRevisionId)return
    if (s.id && (!id || s.session?.revisions.some((r) => r.id === id)))
      this.update(s.id, { viewedRevisionId: id });
  }
  async sendTurn(turn: Turn): Promise<TurnResult> {
    const start = this.conversations.get(turn.conversationId);
    if (
      !start ||
      start.pending ||
      start.state === "error" ||
      this.active.id !== turn.conversationId
    )
      return { ok: false };
    const generation = this.generation,
      id = turn.conversationId;
    const isCurrent = () =>
      this.active.id === id && this.generation === generation;
    const text = turn.text.trim();
    if (!text) return { ok: false };
    if(start.studio&&!start.projectId)return {ok:false,notice:'Välj ett projekt innan Atlas fortsätter.'};
    const visible =
      turn.visiblePlan === undefined
        ? start.plan
          ? {
              ...start.plan.ref,
              revisionId: start.plan.currentRevision.revisionId,
              sha256: start.plan.currentRevision.sha256,
              mockupDecisionId:start.plan.designReview?.approved?.id??null,
            }
          : null
        : turn.visiblePlan;
    const buildContext =
      turn.buildContext === undefined
        ? start.session
          ? {
              projectId: start.session.projectId,
              sessionId: start.session.sessionId,
              viewedRevisionId: start.viewedRevisionId,
            }
          : null
        : turn.buildContext;
    const history = [
      ...start.history,
      { role: "user" as const, content: text },
    ];
    let reply = startReply([...start.entries, { kind: "user", text }]),
      settled = false,
      completed = false,
      streaming = false;
    this.update(id, {
      history,
      entries: reply.entries,
      pending: true,
      speechDraft: null,
    });
    let result: TurnResult = {ok: false};
    const fail = (notice: string) => {
      this.update(id, {
        entries: [
          ...reply.entries,
          { kind: "notice", tone: "error", text: notice },
        ],
      });
      return result = { ok: false, notice };
    };
    try {
      const response = await this.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildChatRequestBody({
            messages: history,
            conversation_id: id,
            ...(turn.inputSource === "voice" ? { voice: true } : {}),
            inputSource: turn.inputSource,
            ...(start.studio&&start.projectId?{studioContext:{projectId:start.projectId,conversationId:id}}:{}),
            ...(visible ? { websitePlanRef: visible } : {}),
            ...(buildContext ? { buildContext } : {}),
          }),
        ),
      });
      if (!response.ok || !response.body)
        return fail(
          response.ok
            ? CONNECTION_FAILED_NOTICE
            : failedResponseNotice(
                response.status,
                await response.json().catch(() => null),
              ),
        );
      streaming = true;
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const split = splitStreamBuffer(buffer);
        buffer = split.rest;
        for (const line of split.lines) {
          const event = parseStreamLine(line);
          if (!event) continue;
          const step = applyStreamEvent(
            reply,
            event,
            typeof window === "undefined" ? "" : window.location.pathname,
          );
          reply = step.state;
          if (event.event === "done") {
            settled = true;
            completed = true;
            if (step.effect.type === "done" && step.effect.fullText)
              this.update(id, {
                history: [
                  ...history,
                  { role: "assistant", content: step.effect.fullText },
                ],
              });
          }
          if (event.event === "error") settled = true;
          if (isCurrent()) {
            const cleanup=decodeCleanupEffect(event,id);
            if(cleanup)this.updateTestDataReview(id,cleanup);
            const now = this.snapshot(),
              effect = decodeWebsiteEffect(event, {
                conversationId: id,
                projectId: start.projectId ?? now.projectId,
                sessionId:
                  now.plan?.activeSessionId ?? start.session?.sessionId ?? null,
              });
            if (effect?.plan)
              this.update(id, {
                plan: effect.plan,
                projectId: effect.plan.ref.projectId,
              });
            if (effect?.session)
              this.update(id, {
                session: effect.session,
                projectId: effect.session.projectId,
                viewedRevisionId: now.session?.sessionId === effect.session.sessionId
                  ? now.viewedRevisionId : null,
                panelOpen:
                  now.session?.sessionId === effect.session.sessionId
                    ? now.panelOpen
                    : true,
              });
            turn.onEvent?.(event);
          }
        }
        this.update(id, { entries: reply.entries });
      }
      if (!settled) return fail(INCOMPLETE_NOTICE);
      return result = { ok: completed };
    } catch {
      return fail(streaming ? INTERRUPTED_NOTICE : CONNECTION_FAILED_NOTICE);
    } finally {
      this.update(id, { pending: false });
      const event = {conversationId: id, generation, current: isCurrent(), ok: result.ok};
      this.settledListeners.forEach(listener => listener(event));
    }
  }
}
