import "server-only";

import { assertProjectAllowed } from "@/lib/atlas/isolation";
import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
} from "@/lib/atlas/collectors/handlarborsen-marketplace";

/** Read-only, server-side, project-scoped PostHog traffic (not user/session identity). */
export type TrafficDay = { date: string; pageviews: number };
export type HandlarborsenTraffic =
  | { status: "not_connected"; days: []; checkedAt: null }
  | { status: "unavailable"; days: []; checkedAt: null }
  | { status: "waiting_for_events"; days: []; checkedAt: string }
  | {
      status: "available";
      days: TrafficDay[];
      totalPageviews: number;
      checkedAt: string;
      firstDate: string;
      lastDate: string;
    };

const API_ORIGIN = "https://eu.posthog.com";
const RESPONSE_LIMIT = 32768;

type Fetcher = typeof fetch;
export type TrafficOptions = {
  period?: 7 | 30;
  fetcher?: Fetcher;
  now?: Date;
  env?: {
    HANDLARBORSEN_POSTHOG_PROJECT_ID?: string;
    HANDLARBORSEN_POSTHOG_READ_TOKEN?: string;
  };
};

export function lastSevenUtcDates(now: Date): string[] {
  return utcDates(now, 7);
}

function utcDates(now: Date, days: 7 | 30): string[] {
  if (!Number.isFinite(now.getTime())) return [];
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(today.getTime() - (days - 1 - i) * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

function safeConfig(env: NonNullable<TrafficOptions["env"]>) {
  const id = env.HANDLARBORSEN_POSTHOG_PROJECT_ID?.trim() ?? "";
  const token = env.HANDLARBORSEN_POSTHOG_READ_TOKEN?.trim() ?? "";
  if (!/^[1-9][0-9]{0,11}$/.test(id) || !/^phx_[a-zA-Z0-9_-]{12,}$/.test(token))
    return null;
  return { id, token };
}

export function parsePageviewRows(
  input: unknown,
  expectedDates: string[],
): TrafficDay[] | null {
  if (!Array.isArray(input) || ![7, 30].includes(expectedDates.length) || input.length > expectedDates.length) return null;
  const allowed = new Set(expectedDates);
  const seen = new Set<string>();
  const rows = new Map<string, number>();
  for (const entry of input) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [date, count] = entry;
    if (
      typeof date !== "string" ||
      !allowed.has(date) ||
      seen.has(date) ||
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      return null;
    seen.add(date);
    rows.set(date, count);
  }
  return expectedDates.map((date) => ({
    date,
    pageviews: rows.get(date) ?? 0,
  }));
}

export async function loadHandlarborsenTraffic(
  project: { id: string; slug: string },
  scope: { allowedProjectIds: string[] },
  options: TrafficOptions = {},
): Promise<HandlarborsenTraffic | null> {
  if (
    !assertProjectAllowed(project.id, scope.allowedProjectIds) ||
    project.id !== HANDLARBORSEN_PROJECT_ID ||
    project.slug !== HANDLARBORSEN_PROJECT_SLUG
  )
    return null;

  const config = safeConfig(
    options.env ?? {
      HANDLARBORSEN_POSTHOG_PROJECT_ID:
        process.env.HANDLARBORSEN_POSTHOG_PROJECT_ID,
      HANDLARBORSEN_POSTHOG_READ_TOKEN:
        process.env.HANDLARBORSEN_POSTHOG_READ_TOKEN,
    },
  );
  if (!config) return { status: "not_connected", days: [], checkedAt: null };
  const now = options.now ?? new Date();
  const period = options.period === 30 ? 30 : 7;
  const dates = utcDates(now, period);
  if (dates.length !== period)
    return { status: "unavailable", days: [], checkedAt: null };

  const until = new Date(
    Date.parse(dates[period - 1] + "T00:00:00.000Z") + 86400000,
  )
    .toISOString()
    .slice(0, 10);
  // All dates are generated locally from Date.UTC; there is no input SQL.
  const query = [
    "SELECT toString(toDate(toTimeZone(timestamp, 'UTC'))) AS day, count() AS views",
    "FROM events",
    "WHERE event = '$pageview'",
    "AND timestamp >= toDateTime('" + dates[0] + " 00:00:00', 'UTC')",
    "AND timestamp < toDateTime('" + until + " 00:00:00', 'UTC')",
    "GROUP BY day ORDER BY day ASC LIMIT " + period,
  ].join("\n");

  try {
    const response = await (options.fetcher ?? fetch)(
      API_ORIGIN + "/api/projects/" + config.id + "/query/",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: { kind: "HogQLQuery", query },
          name: "omnira_handlarborsen_daily_pageviews_last_" + period + "_utc_days",
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(7000),
      },
    );
    if (!response.ok)
      return { status: "unavailable", days: [], checkedAt: null };
    const raw = await response.text();
    if (raw.length > RESPONSE_LIMIT)
      return { status: "unavailable", days: [], checkedAt: null };
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      return { status: "unavailable", days: [], checkedAt: null };
    }
    const parsed = payload as { results?: unknown; result?: unknown };
    const rawRows = parsed.results ?? parsed.result;
    const days = parsePageviewRows(rawRows, dates);
    if (!days) return { status: "unavailable", days: [], checkedAt: null };
    const checkedAt = now.toISOString();
    if (Array.isArray(rawRows) && rawRows.length === 0)
      return { status: "waiting_for_events", days: [], checkedAt };
    return {
      status: "available",
      days,
      totalPageviews: days.reduce((sum, day) => sum + day.pageviews, 0),
      checkedAt,
      firstDate: dates[0],
      lastDate: dates[period - 1],
    };
  } catch {
    // Never log credentials, endpoints, queries or raw PostHog response payloads.
    return { status: "unavailable", days: [], checkedAt: null };
  }
}
