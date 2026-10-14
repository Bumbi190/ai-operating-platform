"use client";
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
}: {
  conversationModel: ChatConversationModel;
  plan?: PlanView | null;
  initialSession?: BuildSessionView | null;
  workspaceReadable?: boolean;
  brief?: string;
  asking?: boolean;
}) {
  const { controller, snapshot } = useAtlasConversation();
  const current = snapshot.id === conversationModel.id ? snapshot : null;
  const shownPlan = current?.plan ?? plan,
    session = current?.session ?? initialSession;
  const panelOpen = current?.panelOpen ?? !!initialSession;
  const [tab, setTab] = useState<"atlas" | "preview">("atlas"),
    [split, setSplit] = useState(38);
  const previousSession = useRef(initialSession?.sessionId);
  useEffect(() => {
    if (session && session.sessionId !== previousSession.current) {
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
      {session && panelOpen && (
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
      <div className={styles.split} data-has-preview={!!session && panelOpen}>
        <div
          className={styles.chatPane}
          data-mobile-hidden={panelOpen && tab !== "atlas"}
        >
          <AtlasChatConversation
            model={conversationModel}
            asking={asking}
            plan={plan}
            initialSession={initialSession}
            embedded
          >
            {!workspaceReadable && (
              <p role="alert">
                Plan och byggläge kunde inte läsas. Ladda om för att återställa
                byggvyn.
              </p>
            )}
            {shownPlan && (
              <AtlasPlanCard
                plan={shownPlan}
                onApprove={approve}
                onEdit={() =>
                  document.getElementById("atlas-chat-composer")?.focus()
                }
                pending={current?.pending}
              />
            )}
            {session && !shownPlan && brief && (
              <details className={styles.plan}>
                <summary>Byggets sparade brief</summary>
                <p>{brief}</p>
                <p>Detta historiska bygge har ingen sparad planrevision.</p>
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
        </div>
        {session && panelOpen && (
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

        {session && (
          <div
            data-mobile-hidden={panelOpen && tab !== "preview"}
            className={styles.previewHost}
            hidden={!panelOpen}
          >
            <BuildPreviewPane
              key={session.sessionId}
              initialSession={session}
              onSession={onSession}
              onRenderedRevision={onRendered}
            />
          </div>
        )}
      </div>
    </div>
  );
}
