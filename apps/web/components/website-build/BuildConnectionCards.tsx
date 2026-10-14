"use client";
import { useCallback, useEffect, useState } from "react";
import type { PlanRef } from "@/lib/website-build/planning/types";
import type {
  ReadinessView,
  ConnectionStatus,
} from "@/lib/website-build/connections/types";
import styles from "./BuildWorkspace.module.css";
const labels: Record<ConnectionStatus, string> = {
  connected: "Ansluten",
  missing: "Saknas",
  unknown: "Ej verifierad",
  expired: "Inloggningen har gått ut",
  denied: "Åtkomst nekad",
};
export function BuildConnectionCards({
  planRef,
  revisionId,
}: {
  planRef: PlanRef;
  revisionId: string;
}) {
  const [view, setView] = useState<ReadinessView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { projectId, planId } = planRef;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(
          "/api/website-build-readiness?projectId=" +
            projectId +
            "&planId=" +
            planId,
          { cache: "no-store", signal },
        );
        if (!response.ok)
          throw Error(
            "Kopplingarna kunde inte kontrolleras. Deras status är okänd.",
          );
        const next = (await response.json()) as ReadinessView;
        if (
          next.ref?.projectId !== projectId ||
          next.ref?.planId !== planId ||
          next.revisionId !== revisionId ||
          !Array.isArray(next.items)
        )
          throw Error(
            "Planen har ändrats. Ladda om för att läsa rätt kopplingar.",
          );
        if (!signal?.aborted) setView(next);
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [projectId, planId, revisionId],
  );
  useEffect(() => {
    const abort = new AbortController();
    setView(null);
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);
  return (
    <details className={styles.connections}>
      <summary>Kopplingar och projektmapp</summary>
      <section aria-label="Projektets kopplingar">
        <p>
          Du kan bygga statisk preview nu. Kopplingarna nedan behövs för
          datorfiler, publicering eller de livefunktioner planen beskriver.
        </p>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {busy ? "Kontrollerar…" : "Kontrollera igen"}
        </button>
        {error && (
          <p role="alert">
            {error}
            {view ? " Senast visade uppgifter finns kvar." : ""}
          </p>
        )}
        {view && (
          <>
            <p>
              Projektmapp:{" "}
              {view.directory
                ? view.directory.root +
                  (view.directory.os === "windows" ? "\\" : "/") +
                  view.directory.folderName
                : "Välj en standardmapp i bygginställningarna."}
            </p>
            <p>
              Platsen är sparad när en mapp visas. En ansluten filrunner behövs
              innan den skapas på datorn.
            </p>
            <a href={view.settingsUrl}>Öppna projektets bygginställningar</a>
            {view.domain.requestedName && (
              <p>
                Önskat domännamn: {view.domain.requestedName}. Tillgänglighet,
                kontoåtkomst, ägande, DNS och HTTPS är ännu inte verifierade.
              </p>
            )}
            {view.items.map((item) => (
              <article key={item.provider} className={styles.connectionCard}>
                <h3>{item.guide.title}</h3>
                <p>{item.need.why}</p>
                <p>
                  <strong>
                    {item.adapterAvailability === "not_implemented"
                      ? "Körkoppling saknas"
                      : "Körkoppling finns"}
                  </strong>{" "}
                  · <span>{labels[item.connectionStatus]}</span>
                </p>
                {item.checkedAt && (
                  <p className={styles.version}>
                    Anslutningen kontrollerad{" "}
                    {new Date(item.checkedAt).toLocaleString("sv-SE")}.
                  </p>
                )}
                <p>
                  {item.need.mode === "preview_demo"
                    ? "Funktionen är en demo i preview."
                    : item.need.mode === "live_required"
                      ? "Den här kopplingen krävs för funktionen live."
                      : "Behövs när du går vidare från preview."}
                </p>
                <ol>
                  {item.guide.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <div className={styles.connectionLinks}>
                  {item.guide.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target={
                        link.href.startsWith("https:") ? "_blank" : undefined
                      }
                      rel={
                        link.href.startsWith("https:")
                          ? "noopener noreferrer"
                          : undefined
                      }
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                {item.guide.fields.map((field) => (
                  <p key={field.name}>
                    <strong>{field.name}:</strong> {field.where}
                  </p>
                ))}
                {item.guide.commands.map((command) => (
                  <div key={command.text}>
                    <p>{command.precondition}</p>
                    <code>{command.text}</code>{" "}
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard?.writeText(command.text)
                      }
                    >
                      Kopiera kommando
                    </button>
                  </div>
                ))}
                <small>
                  Guide granskad {item.guide.reviewedAt}. Nyckelvärden läggs hos
                  leverantören, aldrig i chatten.
                </small>
              </article>
            ))}
          </>
        )}
      </section>
    </details>
  );
}
