"use client";
import { useRef, useState } from "react";
import styles from "./BuildWorkspace.module.css";
import type { BuildSessionView } from "@/lib/website-build/types";
export function BuildControls({
  session,
  requestControl,
}: {
  session: BuildSessionView;
  requestControl: (
    action: "pause" | "resume" | "cancel",
    key: string,
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{
    action: "pause" | "resume" | "cancel";
    key: string;
  } | null>(null);
  const control = async (action: "pause" | "resume" | "cancel") => {
    if (busy) return;
    const intent =
      pending.current?.action === action
        ? pending.current
        : { action, key: crypto.randomUUID() };
    pending.current = intent;
    setBusy(true);
    setError("");
    try {
      await requestControl(action, intent.key);
      pending.current = null;
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const terminal = session.status === "cancelled";
  const canResume =
    session.status === "paused" ||
    session.status === "failed" ||
    (session.status === "awaiting_decision" && !session.currentRunId);
  return (
    <div className={styles.composerActions}>
      {canResume ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void control("resume")}
        >
          Fortsätt bygget
        </button>
      ) : (
        <button
          type="button"
          disabled={
            busy ||
            terminal ||
            ["pausing", "cancelling", "awaiting_decision"].includes(
              session.status,
            )
          }
          onClick={() => void control("pause")}
        >
          Pausa bygget
        </button>
      )}{" "}
      <button
        type="button"
        disabled={busy || terminal || session.status === "cancelling"}
        onClick={() => void control("cancel")}
      >
        Avbryt bygget
      </button>
      {busy && <span role="status"> Skickar begäran…</span>}
      {error && (
        <p role="alert">
          {error} Försök med samma kontroll igen för att hämta kvittot.
        </p>
      )}
    </div>
  );
}
