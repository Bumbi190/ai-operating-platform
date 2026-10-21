"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildFetch } from "@/lib/website-build/use-build-session";
import styles from "./BuildWorkspace.module.css";
export function BuildStart({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
  agents?: { id: string; name: string }[];
}) {
  const router = useRouter(),
    pending = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function launch() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!pending.current)
        pending.current = (
          await buildFetch<{ id: string }>("/api/conversations", {
            project_id: projectId,
            title: "Ny hemsida med Atlas",
          })
        ).id;
      router.push("/chat/" + pending.current + "?build=1");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section className={styles.workspace}>
      <div className={styles.header}>
        <a href={"/projects/" + encodeURIComponent(projectSlug)}>← Projektet</a>
        <h1>Bygg med Atlas</h1>
      </div>
      <div className={styles.conversation}>
        <p>
          Beskriv din idé i Atlas-chatten eller med rösten. Ni planerar syfte,
          sidor och arkitektur tillsammans. När du godkänner planen öppnas
          previewn och du kan ge feedback medan Atlas bygger.
        </p>
        <button type="button" onClick={() => void launch()} disabled={busy}>
          {busy ? "Öppnar Atlas…" : "Starta Atlas-chatt"}
        </button>
        <a href={"/settings/website-build#project-" + projectId}>
          Projektets byggagent och standardmapp
        </a>
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
