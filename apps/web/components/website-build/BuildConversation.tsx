"use client";
import type { BuildSessionView } from "@/lib/website-build/types";
import styles from "./BuildWorkspace.module.css";
const labels = {
  received: "Mottagen",
  acknowledged: "Förstådd",
  applied: "Införd",
  rejected: "Avvisad",
  superseded: "Ersatt",
};
/** Durable receipts beside the shared Atlas transcript; this has no separate composer. */
export function BuildConversation({
  session,
  historyTexts = [],
}: {
  session: BuildSessionView;
  historyTexts?: string[];
}) {
  return session.feedback.length ? (
    <ol className={styles.messages} aria-label="Byggkvitton">
      {session.feedback.map((f) => (
        <li key={f.id} className={styles.message} data-feedback-id={f.id}>
          {!historyTexts.includes(f.text) && <p>{f.text}</p>}
          <p className={styles.receipt}>
            {labels[f.status]}
            {f.appliedRevisionId
              ? " · version " +
                (session.revisions.find((r) => r.id === f.appliedRevisionId)
                  ?.number ?? "sparad")
              : ""}
          </p>
          {f.interpretation && <p>{f.interpretation}</p>}
        </li>
      ))}
    </ol>
  ) : null;
}
