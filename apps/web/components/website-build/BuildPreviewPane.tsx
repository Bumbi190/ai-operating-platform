"use client";
import { useEffect, useRef, useState } from "react";
import {
  buildFetch,
  useBuildSession,
} from "@/lib/website-build/use-build-session";
import type {
  BuildSessionView,
  PreviewRevision,
  WebsiteArtifact,
} from "@/lib/website-build/types";
import { BuildControls } from "./BuildControls";
import { BuildPreview } from "./BuildPreview";
import styles from "./BuildWorkspace.module.css";
export const BUILD_STATUS_LABELS = {
  queued: "I kö",
  interpreting: "Tolkar feedback",
  building: "Bygger",
  validating: "Kontrollerar",
  ready: "Preview klar",
  awaiting_decision: "Behöver besked",
  pausing: "Pausar",
  paused: "Pausad",
  cancelling: "Avbryter",
  cancelled: "Avbruten",
  failed: "Bygget misslyckades",
};
export function BuildPreviewPane({
  initialSession,
  onRenderedRevision,
  onSession,
  hidden = false,
  readOnly = false,
  embedded = false,
}: {
  initialSession: BuildSessionView;
  onRenderedRevision: (id: string | null) => void;
  onSession: (session: BuildSessionView) => void;
  hidden?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const { session, connection, requestControl } = useBuildSession(
    initialSession,
    initialSession,
  );
  const [selected, setSelected] = useState(session.activePreviewRevisionId),
    [loaded, setLoaded] = useState<{
      artifact: WebsiteArtifact;
      revision: PreviewRevision;
    } | null>(null);
  const [error, setError] = useState(""),
    [pageKey, setPageKey] = useState("index"),
    [mobile, setMobile] = useState(false);
  const active = useRef(session.activePreviewRevisionId),
    cache = useRef(new Map<string, WebsiteArtifact>());
  useEffect(() => onSession(session), [session, onSession]);
  useEffect(() => {
    const previous = active.current;
    setSelected((current) =>
      !current || current === previous
        ? session.activePreviewRevisionId
        : current,
    );
    active.current = session.activePreviewRevisionId;
  }, [session.activePreviewRevisionId]);
  useEffect(() => {
    const revision = session.revisions.find((r) => r.id === selected);
    if (!revision) return;
    const abort = new AbortController();
    setError("");
    void (async () => {
      try {
        const artifact =
          cache.current.get(revision.id) ??
          (await buildFetch<WebsiteArtifact>(
            "/api/website-builds/" +
              session.sessionId +
              "/revisions/" +
              revision.id +
              "?projectId=" +
              session.projectId,
            undefined,
            abort.signal,
          ));
        if (abort.signal.aborted) return;
        if (artifact.sha256 !== revision.sha256)
          throw Error("Previewn kunde inte verifieras.");
        cache.current.set(revision.id, artifact);
        setLoaded({ artifact, revision });
        setPageKey((key) =>
          artifact.pages.some((p) => p.key === key)
            ? key
            : artifact.pages[0].key,
        );
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => abort.abort();
  }, [selected, session.revisions, session.sessionId, session.projectId]);
  return (
    <section
      className={[styles.previewPane,embedded?styles.studioPreview:''].join(' ')}
      aria-label="Preview"
      hidden={hidden}
    >
      <p role="status">
        <strong>{BUILD_STATUS_LABELS[session.status]}</strong> · {session.stage}
      </p>
      {!readOnly && (embedded?<details className={styles.previewControls}><summary>Byggkontroller</summary><BuildControls session={session} requestControl={requestControl}/></details>:<BuildControls session={session} requestControl={requestControl}/>)}
      {connection === "reconnecting" && (
        <p role="alert">
          Anslutningen återställs. Senast sparade preview finns kvar.
        </p>
      )}
      <div className={styles.toolbar}>
        <label>
          Version{" "}
          <select
            aria-label="Version"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="" disabled>
              Ingen ännu
            </option>
            {session.revisions.map((r) => (
              <option key={r.id} value={r.id}>
                Version {r.number}
              </option>
            ))}
          </select>
        </label>
        {loaded && (
          <>
            <label>
              Sida{" "}
              <select
                aria-label="Sida"
                value={pageKey}
                onChange={(e) => setPageKey(e.target.value)}
              >
                {loaded.artifact.pages.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setMobile((v) => !v)}>
              {mobile ? "Desktopbredd" : "Mobilbredd"}
            </button>
            <a
              href={
                "/api/website-builds/" +
                session.sessionId +
                "/revisions/" +
                loaded.revision.id +
                "/export?projectId=" +
                session.projectId
              }
            >
              Ladda ner ZIP
            </a>
          </>
        )}
      </div>
      <p className={[styles.version,styles.versionMetadata].join(' ')}>
        {loaded
          ? "Visar version " +
            loaded.revision.number +
            " · " +
            new Date(loaded.revision.createdAt).toLocaleString("sv-SE")
          : "Första previewn visas när en version är validerad."}
        {loaded && selected !== loaded.revision.id
          ? " · Hämtar vald version…"
          : ""}
      </p>
      {error && <p role="alert">{error} Senast fungerande preview visas.</p>}
      <div className={styles.canvas}>
        {loaded ? (
          <BuildPreview
            artifact={loaded.artifact}
            revision={loaded.revision}
            pageKey={pageKey}
            onPageChange={setPageKey}
            mobile={mobile}
            onRenderedRevision={onRenderedRevision}
          />
        ) : (
          <div className={styles.empty}>
            Din idé blir en hemsida här.
            <br />
            Du kan fortsätta prata med Atlas under tiden.
          </div>
        )}
      </div>
      {loaded?.artifact.integrationNeeds.map((need, i) => (
        <p key={i} className={styles.version}>
          {need === "form_delivery"
            ? "Formuläret behöver en ansluten mottagare innan meddelanden kan skickas."
            : need}
        </p>
      ))}
    </section>
  );
}
