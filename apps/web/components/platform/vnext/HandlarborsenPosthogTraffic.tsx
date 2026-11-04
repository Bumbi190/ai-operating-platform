import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Eye,
  LockKeyhole,
  Users,
} from "lucide-react";
import type { HandlarborsenTraffic } from "@/lib/atlas/project-analytics/handlarborsen-posthog-traffic";
import styles from "./HandlarborsenPosthogTraffic.module.css";

function number(value: number) {
  return value.toLocaleString("sv-SE");
}
function day(date: string) {
  return date.slice(8, 10) + "/" + date.slice(5, 7);
}

export function HandlarborsenPosthogTraffic({
  traffic,
}: {
  traffic: HandlarborsenTraffic;
}) {
  const connected = traffic.status === "available";
  const hasData = connected && traffic.totalPageviews > 0;
  const peak = connected
    ? Math.max(1, ...traffic.days.map((row) => row.pageviews))
    : 1;

  const details = {
    not_connected: {
      headline: "Inväntar anslutning",
      text: "Datakällan är förberedd, men Omnira har ännu ingen godkänd, läsbehörig anslutning till Handlarbörsens PostHog-projekt.",
      status: "Ej ansluten",
    },
    missing_permission: {
      headline: "Läsbehörighet för trafik saknas",
      text: "Kontrollera nyckelns projektåtkomst och läsbehörigheten query:read i PostHog. Dashboardanslutningen är separat.",
      status: "Behörighet krävs",
    },
    unavailable: {
      headline: "Trafikdata kunde inte hämtas",
      text: "PostHog svarade inte med verifierbar statistik. Inga gamla siffror eller gissningar visas som aktuella.",
      status: "Tillfälligt otillgänglig",
    },
    waiting_for_events: {
      headline: "Väntar på första sidvisningen",
      text: "PostHog är kontaktat, men inga sidvisningar har ännu returnerats för de senaste sju UTC-dagarna.",
      status: "Inga händelser",
    },
    available: {
      headline: "Verifierad händelsedata",
      text: "De här siffrorna visar mottagna sidvisningshändelser, inte registrerade bilhandlare eller ett exakt antal personer online.",
      status: "Data mottagen",
    },
  }[traffic.status];

  return (
    <section
      className={styles.section}
      aria-labelledby="hb-posthog-traffic-title"
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>HANDLARBÖRSEN / WEBBTRAFIK</p>
          <h2 id="hb-posthog-traffic-title">Besök och trafik</h2>
          <p className={styles.subtitle}>
            PostHog · separat från marknadsplatsens affärsstatistik
          </p>
        </div>
        <span
          className={styles.status}
          data-ready={connected ? "yes" : undefined}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          {details.status}
        </span>
      </header>
      <div className={styles.metricGrid}>
        <div
          className={styles.metric}
          data-ready={connected ? "yes" : undefined}
        >
          <span className={styles.metricLabel}>
            <Eye size={16} aria-hidden="true" /> Sidvisningar
          </span>
          <strong className={styles.metricValue}>
            {connected ? number(traffic.totalPageviews) : "—"}
          </strong>
          <span className={styles.metricNote}>Senaste 7 UTC-dagarna</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>
            <Users size={16} aria-hidden="true" /> Unika besökare idag
          </span>
          <strong className={styles.metricValue}>{connected && traffic.visitorsToday !== undefined ? number(traffic.visitorsToday) : "—"}</strong>
          <span className={styles.metricNote}>
            {connected && traffic.visitorsToday !== undefined ? "PostHog dagliga unika · UTC · inte antal bilhandlare" : "Inväntar verifierad identitetsmetod"}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>
            <Activity size={16} aria-hidden="true" /> Sessioner
          </span>
          <strong className={styles.metricValue}>—</strong>
          <span className={styles.metricNote}>
            Inväntar verifierad sessionsmätning
          </span>
        </div>
      </div>
      {connected && traffic.registrationPageviews !== undefined && (
        <div className={styles.chartSurface}>
          <h3>Intresse för registrering</h3>
          <p><strong>{number(traffic.registrationPageviews)}</strong> sidvisningar på /registrera under de senaste sju UTC-dagarna.</p>
          <p>Detta är visningar av registreringssidan, inte påbörjade eller slutförda registreringar. En besökare kan öppna sidan flera gånger.</p>
        </div>
      )}
      <div className={styles.chartSurface}>
        <div className={styles.chartHeading}>
          <div>
            <h3>Sidvisningar per dag</h3>
            <p>
              {hasData
                ? traffic.firstDate + "–" + traffic.lastDate + " · UTC"
                : "Grafen fylls först med verkliga mätvärden"}
            </p>
          </div>
          <BarChart3
            size={22}
            aria-hidden="true"
            className={styles.chartIcon}
          />
        </div>
        {hasData ? (
          <div
            className={styles.chart}
            role="img"
            aria-label={
              "Antal sidvisningar per dag: " +
              traffic.days
                .map((row) => row.date + ": " + row.pageviews)
                .join(", ")
            }
          >
            {traffic.days.map((row) => (
              <div key={row.date} className={styles.dayColumn}>
                <span className={styles.barValue}>{number(row.pageviews)}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      height:
                        String(Math.round((row.pageviews / peak) * 100)) + "%",
                    }}
                  />
                </div>
                <time className={styles.dayLabel} dateTime={row.date}>
                  {day(row.date)}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty} role="status">
            <span className={styles.emptyIcon}>
              <LockKeyhole size={24} aria-hidden="true" />
            </span>
            <strong>{details.headline}</strong>
            <p>{details.text}</p>
          </div>
        )}
      </div>

      {connected && traffic.days.some(row => row.visitors !== undefined) && (
        <div className={styles.chartSurface}>
          <h3>Daglig trafik · UTC</h3>
          <table style={{width:"100%",textAlign:"left"}}>
            <thead><tr><th>Datum</th><th>Sidvisningar</th><th>Dagliga unika besökare</th><th>Visningar /registrera</th></tr></thead>
            <tbody>{traffic.days.map(row => <tr key={row.date}><td>{row.date}</td><td>{number(row.pageviews)}</td><td>{row.visitors === undefined ? "—" : number(row.visitors)}</td><td>{row.registrationPageviews === undefined ? "—" : number(row.registrationPageviews)}</td></tr>)}</tbody>
          </table>
          <p>Dagliga unika besökare summeras inte till ett unikt antal för hela veckan. Dagens siffror är ännu ofullständiga. Endast handlarborsen.se och www.handlarborsen.se ingår.</p>
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          {connected
            ? "Senast hämtad " +
              traffic.checkedAt.slice(0, 16).replace("T", " ") +
              " UTC"
            : "Inga uppskattade eller simulerade trafikvärden används"}
        </span>
        <a
          href="https://eu.posthog.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Öppna PostHog <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </footer>
    </section>
  );
}
