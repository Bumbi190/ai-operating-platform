"use client";
import type {StudioProject} from '@/lib/website-build/studio/types'
import {StudioLayout} from '@/components/website-build/StudioLayout'
import {StudioEmptyPreview} from '@/components/website-build/StudioEmptyPreview'
import {StudioFilesPane} from '@/components/website-build/StudioFilesPane'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { ChatConversationModel } from "@/lib/os/chat-shared";
import type { PlanView } from "@/lib/website-build/planning/types";
import type { BuildSessionView } from "@/lib/website-build/types";
import { useAtlasConversation } from "@/lib/atlas/conversation/provider";
import { AtlasChatConversation } from "./AtlasChatConversation";
import { BuildConnectionCards } from "@/components/website-build/BuildConnectionCards";
import {WebsiteMockupReview} from "@/components/website-build/WebsiteMockupReview";
import { AtlasPlanCard } from "./AtlasPlanCard";
import { BuildPreviewPane } from "@/components/website-build/BuildPreviewPane";
import { BuildConversation } from "@/components/website-build/BuildConversation";
import styles from "@/components/website-build/BuildWorkspace.module.css";
export function AtlasBuildSurface({
  conversationModel,
  plan = null,
  initialSession = null,
  workspaceReadable = true,
  brief,
  asking = false,
  mode='conversation',
  studioProject=null,
  readOnly=false,
  canSend=true,
  initialTurn=null,
}: {
  mode?:'conversation'|'studio';
  studioProject?:StudioProject|null;
  readOnly?:boolean;
  canSend?:boolean;
  initialTurn?:{token:string;text:string;inputSource:'text'|'voice'}|null;
  conversationModel: ChatConversationModel;
  plan?: PlanView | null;
  initialSession?: BuildSessionView | null;
  workspaceReadable?: boolean;
  brief?: string;
  asking?: boolean;
}) {
  const { controller, snapshot } = useAtlasConversation();
  const [refreshFailed,setRefreshFailed]=useState(false);
  const [designOpen,setDesignOpen]=useState(false),[previewRequest,setPreviewRequest]=useState(0);
  const current = snapshot.id === conversationModel.id ? snapshot : null;
  const shownPlan = current?.plan ?? plan,
    session = current?.session ?? initialSession;
  const panelOpen = current?.panelOpen ?? !!initialSession;
  const differentPlan = !!shownPlan && !!session &&
    shownPlan.approvedDecision?.sessionId !== session.sessionId;
  const [tab, setTab] = useState<"atlas" | "preview">("atlas"),
    [split, setSplit] = useState(38);
  const previousSession = useRef(initialSession?.sessionId);
  useEffect(() => {
    if (mode!=='studio' && session && session.sessionId !== previousSession.current) {
      previousSession.current = session.sessionId;
      setTab("preview");
    }
  }, [session?.sessionId]);
  const root = useRef<HTMLDivElement>(null);
  const onSession = useCallback(
    (s: BuildSessionView) => controller.applySessionSnapshot(s),
    [controller],
  );
  const onRendered = useCallback(
    (id: string | null) => controller.setRenderedRevision(id),
    [controller],
  );
  const showMockups=!!shownPlan?.designReview?.required&&!shownPlan.approvedDecision?.sessionId&&(!session||designOpen);
  const reviewDesign=()=>{setDesignOpen(true);setPreviewRequest(value=>value+1);setTab('preview');controller.setRenderedRevision(null)};
  const designPane=shownPlan?<WebsiteMockupReview key={shownPlan.currentRevision.revisionId} plan={shownPlan} onPlan={value=>controller.applyPlanReview(value)} disabled={readOnly||!canSend||!!current?.pending} embedded={mode==='studio'} onClose={session?()=>setDesignOpen(false):undefined}/>:null;
  const approve = () => {
    if (shownPlan)
      void controller.sendTurn({
        conversationId: conversationModel.id,
        text: "jag godkänner",
        inputSource: "text",
        visiblePlan: {
          ...shownPlan.ref,
          revisionId: shownPlan.currentRevision.revisionId,
          sha256: shownPlan.currentRevision.sha256,
        },
      });
  };
  const resizeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setSplit((value) =>
      event.key === "Home"
        ? 25
        : event.key === "End"
          ? 70
          : Math.max(
              25,
              Math.min(70, value + (event.key === "ArrowRight" ? 2 : -2)),
            ),
    );
  };
  const resizePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !event.currentTarget.hasPointerCapture(event.pointerId) ||
      !root.current
    )
      return;
    const bounds = root.current.getBoundingClientRect();
    setSplit(
      Math.max(
        25,
        Math.min(70, (100 * (event.clientX - bounds.left)) / bounds.width),
      ),
    );
  };
  useEffect(()=>{
    if(mode!=='studio'||!session||!['queued','interpreting','building','validating','pausing','cancelling'].includes(session.status)){setRefreshFailed(false);return;}
    let current=true;const abort=new AbortController();
    const refresh=async()=>{try{const r=await fetch('/api/website-builds/'+session.sessionId+'?projectId='+session.projectId,{cache:'no-store',signal:abort.signal});if(!r.ok)throw Error();const value=await r.json();if(current){controller.applySessionSnapshot(value);setRefreshFailed(false)}}catch{if(current)setRefreshFailed(true)}};
    void refresh();const timer=setInterval(()=>void refresh(),4000);return()=>{current=false;clearInterval(timer);abort.abort()};
  },[mode,session?.sessionId,session?.status,controller]);
  const chat=(
          <AtlasChatConversation
            key={conversationModel.id}
            model={conversationModel}
            asking={asking}
            plan={plan}
            initialSession={initialSession}
            embedded
            mode={mode}
            initialTurn={initialTurn}
            readOnly={readOnly}
            canSend={canSend}
          >
            {!workspaceReadable && (
              <p role="alert">
                Plan och byggläge kunde inte läsas. Ladda om för att återställa
                byggvyn.
              </p>
            )}
            {differentPlan && (
              <p>
                Du visar ett äldre bygge. Planen och kopplingsguiderna nedan gäller
                samtalets senaste plan.
              </p>
            )}
            {shownPlan && (
              <AtlasPlanCard
                plan={shownPlan}
                approvalDisabled={readOnly||!canSend}
                displayedSessionId={session?.sessionId ?? null}
                onApprove={approve}
                onReview={reviewDesign}
                onEdit={() =>
                  document.getElementById("atlas-chat-composer")?.focus()
                }
                pending={current?.pending}
              />
            )}
            {shownPlan && (
              <BuildConnectionCards
                planRef={shownPlan.ref}
                revisionId={shownPlan.currentRevision.revisionId}
              />
            )}
            {session && (!shownPlan || differentPlan) && brief && (
              <details className={styles.plan}>
                <summary>Byggets sparade brief</summary>
                <p>{brief}</p>
                <p>{shownPlan
                  ? "Denna brief sparades när det visade bygget startade."
                  : "Detta historiska bygge har ingen sparad planrevision."}</p>
              </details>
            )}
            {session && (
              <BuildConversation
                session={session}
                historyTexts={current?.history
                  .filter((m) => m.role === "user")
                  .map((m) => m.content)}
              />
            )}
          </AtlasChatConversation>
  );
  if(mode==='studio')return <StudioLayout previewRequest={previewRequest} chat={chat} website={showMockups?designPane:session?<BuildPreviewPane embedded readOnly={readOnly} key={session.sessionId} initialSession={session} onSession={onSession} onRenderedRevision={onRendered}/>:<StudioEmptyPreview/>} desktop={<section><h2>Atlas skrivbord</h2><p>Skrivbordet är ännu inte tillgängligt. Här visas Atlas dator när anslutningen är klar.</p><a href={'/settings/website-build'+(studioProject?'#project-'+studioProject.id:'')}>Visa projektets mappinställningar</a></section>} files={<StudioFilesPane session={session} revisionId={current?.viewedRevisionId??null}/>} tasks={<section><h2>Atlas arbetssteg</h2>{refreshFailed&&<p role="alert">Byggläget kunde inte uppdateras. Kontrollera anslutningen.</p>}{session?<><p>{session.stage}</p><p>Senast uppdaterat: {new Date(session.updatedAt).toLocaleTimeString('sv-SE')}</p></>:<p>Arbetet börjar med en plan i chatten.</p>}{shownPlan&&<><h3>Planerade steg</h3><ol>{shownPlan.currentRevision.content.steps.map((step,i)=><li key={i}>{step}</li>)}</ol></>}</section>}/>;
  return (
    <div
      className={styles.workspace}
      ref={root}
      style={{ "--atlas-split": split + "%" } as CSSProperties}
    >
      {session && (
        <div className={styles.header}>
          <h1>Bygg med Atlas</h1>
          <button
            type="button"
            onClick={() => {
              controller.setPanelOpen(!panelOpen);
              if (!panelOpen) setTab("preview");
            }}
          >
            {panelOpen ? "Dölj preview" : "Visa preview"}
          </button>
        </div>
      )}
      {((session && panelOpen)||showMockups) && (
        <div className={styles.tabs} role="tablist" aria-label="Byggvy">
          <button
            role="tab"
            aria-selected={tab === "atlas"}
            onClick={() => setTab("atlas")}
          >
            Atlas
          </button>
          <button
            role="tab"
            aria-selected={tab === "preview"}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
        </div>
      )}
      <div className={styles.split} data-has-preview={(!!session && panelOpen)||showMockups}>
        <div
          className={styles.chatPane}
          data-mobile-hidden={(panelOpen||showMockups) && tab !== "atlas"}
        >
{chat}
        </div>
        {((session && panelOpen)||showMockups) && (
          <div
            className={styles.divider}
            role="separator"
            aria-label="Bredd på Atlas-panelen"
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={70}
            aria-valuenow={split}
            tabIndex={0}
            onKeyDown={resizeKey}
            onPointerDown={(event) =>
              event.currentTarget.setPointerCapture(event.pointerId)
            }
            onPointerMove={resizePointer}
            onPointerUp={(event) =>
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          />
        )}

        {(session||showMockups) && (
          <div
            data-mobile-hidden={(panelOpen||showMockups) && tab !== "preview"}
            className={styles.previewHost}
            hidden={!panelOpen&&!showMockups}
          >
            {showMockups?designPane:session?<BuildPreviewPane
              key={session.sessionId}
              initialSession={session}
              onSession={onSession}
              onRenderedRevision={onRendered}
            />:null}
          </div>
        )}
      </div>
    </div>
  );
}
