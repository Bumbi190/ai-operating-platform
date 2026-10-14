"use client";
import type { PlanView } from "@/lib/website-build/planning/types";
import styles from "@/components/website-build/BuildWorkspace.module.css";
export function AtlasPlanCard({
  plan,
  onApprove,
  onEdit,
  pending = false,
}: {
  plan: PlanView;
  onApprove: () => void;
  onEdit: () => void;
  pending?: boolean;
}) {
  const r = plan.currentRevision,
    c = r.content,
    started = !!plan.approvedDecision?.sessionId;
  return (
    <section
      className={styles.plan}
      aria-label="Arkitekturplan"
      data-revision={r.revisionId}
    >
      <details open={!started}>
        <summary>
          Planversion {r.number} ·{" "}
          {started ? "Godkänd · visa planen" : "Granska förslaget"}
        </summary>
        <header>
          <p>Planversion {r.number}</p>
          <h2>{c.title}</h2>
        </header>
        <p>{c.purpose}</p>
        <p>
          <strong>Målgrupp:</strong> {c.audience}
        </p>
        <p>
          <strong>Design:</strong> {c.design.style}
        </p>
        {c.design.reference && <p>Referens: {c.design.reference}</p>}
        <h3>Sidor</h3>
        <ul>
          {c.pages.map((p) => (
            <li key={p.key}>
              {p.title} — {p.purpose}
            </li>
          ))}
        </ul>
        <h3>Arkitektur</h3>
        <p>{c.architecture}</p>
        {c.features.length > 0 && (
          <>
            <h3>Funktioner</h3>
            <ul>
              {c.features.map((f, i) => (
                <li key={i}>
                  {f.name} —{" "}
                  {f.mode === "live_required"
                    ? "Kräver anslutning för att fungera live"
                    : "Demo i preview"}
                </li>
              ))}
            </ul>
          </>
        )}
        <ol>
          {c.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p>
          Domän: {c.domain.requestedName ?? "Väljs tillsammans"} · söks och köps
          via ditt Strato-konto.
        </p>
        <p>
          {plan.budget.state === "configured"
            ? "Projektbudget: " + plan.budget.monthlySek + " kr/månad"
            : plan.budget.state === "missing"
              ? "Projektbudget saknas. Befintliga kostnadskontroller avgör om bygget får köras."
              : "Projektbudgeten kunde inte läsas."}
        </p>
        <p>
          Projektmapp: {plan.setting.location?.root ?? "Ingen plats vald ännu"}
        </p>
        <p className={styles.version}>
          Mappens plats är sparad. Skapandet på datorn väntar på en ansluten
          filrunner.
        </p>
        {!plan.setting.builderAgentId && (
          <p role="alert">
            Välj projektets byggagent i{" "}
            <a href={"/settings/website-build#project-" + plan.ref.projectId}>
              bygginställningarna
            </a>
            .
          </p>
        )}
        <div className={styles.composerActions}>
          <button type="button" onClick={onEdit} disabled={pending}>
            Ändra planen i chatten
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={pending || !plan.setting.builderAgentId || started}
          >
            {started
              ? "Planen används av bygget"
              : pending
                ? "Inväntar kvitto…"
                : "Godkänn och bygg"}
          </button>
        </div>
        <p className={styles.version}>
          Godkännandet gäller denna version och en statisk preview. Publicering
          och externa kopplingar visas när de behövs.
        </p>
      </details>
    </section>
  );
}
