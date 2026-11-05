import "server-only";
import { assertProjectAllowed } from "@/lib/atlas/isolation";
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from "@/lib/atlas/collectors/handlarborsen-marketplace";

export type TrafficSessions = { status: "available"; count: number } | { status: "unavailable" | "missing_permission" };
export type TrafficDay = { date: string; pageviews: number; visitors?: number; registrationPageviews?: number };
export type HandlarborsenTraffic =
  | { status: "not_connected" | "unavailable" | "missing_permission"; days: []; checkedAt: null }
  | { status: "waiting_for_events"; days: []; checkedAt: string }
  | { status: "available"; days: TrafficDay[]; totalPageviews: number; visitorsToday?: number; registrationPageviews?: number;
      checkedAt: string; firstDate: string; lastDate: string; sessions?: TrafficSessions };
type TrafficEnv = {
  HANDLARBORSEN_POSTHOG_PROJECT_ID?: string; HANDLARBORSEN_POSTHOG_READ_TOKEN?: string;
  POSTHOG_PROJECT_ID?: string; POSTHOG_PERSONAL_API_KEY?: string;
  POSTHOG_OMNIRA_PROJECT_ID?: string; POSTHOG_APP_HOST?: string;
};
export type TrafficOptions = { fetcher?: typeof fetch; now?: Date; env?: TrafficEnv };
export function lastSevenUtcDates(now: Date): string[] {
  if (!Number.isFinite(now.getTime())) return [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, i) => new Date(today - (6-i)*86400000).toISOString().slice(0,10));
}
function safeConfig(env: TrafficEnv) {
  const mapped = env.POSTHOG_OMNIRA_PROJECT_ID === HANDLARBORSEN_PROJECT_ID &&
    env.POSTHOG_APP_HOST === "https://eu.posthog.com";
  const legacy = env.HANDLARBORSEN_POSTHOG_PROJECT_ID !== undefined || env.HANDLARBORSEN_POSTHOG_READ_TOKEN !== undefined;
  const id = (legacy ? env.HANDLARBORSEN_POSTHOG_PROJECT_ID : mapped ? env.POSTHOG_PROJECT_ID : undefined)?.trim() ?? "";
  const token = (legacy ? env.HANDLARBORSEN_POSTHOG_READ_TOKEN : mapped ? env.POSTHOG_PERSONAL_API_KEY : undefined)?.trim() ?? "";
  return /^[1-9][0-9]{0,11}$/.test(id) && /^phx_[a-zA-Z0-9_-]{12,}$/.test(token) ? { id, token } : null;
}
/** Legacy two-column parser retained for callers; live reporting uses typed series below. */
export function parsePageviewRows(input: unknown, dates: string[]): TrafficDay[] | null {
  if (!Array.isArray(input) || input.length > 7) return null;
  const rows = new Map<string,number>();
  for (const entry of input) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [date,count] = entry;
    if (typeof date !== "string" || !dates.includes(date) || rows.has(date) ||
      typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return null;
    rows.set(date,count);
  }
  return dates.map(date => ({ date, pageviews: rows.get(date) ?? 0 }));
}
/** Never sum daily uniques into a claimed unique visitor total for the period. */
export function parseTrafficSeries(input: unknown, dates: string[]): TrafficDay[] | null {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const series = [0,1,2].map(order => input.find(row => row && typeof row === "object" && row.order === order));
  for (const row of series) {
    if (!row || !Array.isArray(row.days) || !Array.isArray(row.data) ||
      row.days.length !== 7 || row.data.length !== 7 ||
      row.days.some((date: unknown,i: number) => date !== dates[i]) ||
      row.data.some((n: unknown) => typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)) return null;
  }
  if (series[1].data.some((n: number,i: number) => n > series[0].data[i]) ||
      series[2].data.some((n: number,i: number) => n > series[0].data[i])) return null;
  return dates.map((date,i) => ({date,pageviews:series[0].data[i],visitors:series[1].data[i],registrationPageviews:series[2].data[i]}));
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > 32768) { void response.body?.cancel().catch(()=>{}); throw Error(); }
  if (!response.body) throw Error();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, finished = false;
  const cancel = () => { void reader.cancel().catch(()=>{}); };
  signal.addEventListener("abort",cancel,{once:true});
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) { finished = true; break; }
      size += part.value.byteLength;
      if (size > 32768) throw Error();
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  } finally {
    signal.removeEventListener("abort",cancel);
    if (!finished) cancel();
    reader.releaseLock();
  }
}

/** Native PostHog session aggregation for the whole period, never a sum of daily counts.
 * This query returns aggregate metrics only; no session or visitor IDs leave the server.
 */
async function readSessions(
  config: { id: string; token: string }, dates: string[], fetcher: typeof fetch, signal: AbortSignal,
): Promise<TrafficSessions> {
  const unavailable = { status: "unavailable" } as const;
  try {
    const response = await fetcher("https://eu.posthog.com/api/projects/"+config.id+"/query/", {
      method: "POST",
      headers: { Authorization: "Bearer "+config.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          kind: "WebOverviewQuery",
          dateRange: { date_from: dates[0], date_to: dates[6] },
          filterTestAccounts: false,
          properties: [{ key: "$host", type: "event", operator: "exact", value: ["handlarborsen.se","www.handlarborsen.se"] }],
        },
        name: "omnira_handlarborsen_sessions_7_utc_days", async: false,
      }),
      cache: "no-store", redirect: "error", signal,
    });
    if (response.status !== 200) {
      void response.body?.cancel().catch(()=>{});
      return { status: response.status === 403 ? "missing_permission" : "unavailable" };
    }
    const payload = await boundedJson(response, signal);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return unavailable;
    const rows = (payload as { results?: unknown }).results;
    if (!Array.isArray(rows) || rows.length > 10 ||
      rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) return unavailable;
    const matches = rows.filter(row => row.key === "sessions");
    if (matches.length !== 1 || matches[0].kind !== "unit") return unavailable;
    const count: unknown = matches[0].value;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return unavailable;
    return { status: "available", count };
  } catch { return unavailable; }
}

export async function loadHandlarborsenTraffic(
  project: {id:string;slug:string}, scope: {allowedProjectIds:string[]}, options: TrafficOptions = {},
): Promise<HandlarborsenTraffic | null> {
  if (!assertProjectAllowed(project.id,scope.allowedProjectIds) ||
    project.id !== HANDLARBORSEN_PROJECT_ID || project.slug !== HANDLARBORSEN_PROJECT_SLUG) return null;
  const config = safeConfig(options.env ?? {
    HANDLARBORSEN_POSTHOG_PROJECT_ID: process.env.HANDLARBORSEN_POSTHOG_PROJECT_ID,
    HANDLARBORSEN_POSTHOG_READ_TOKEN: process.env.HANDLARBORSEN_POSTHOG_READ_TOKEN,
    POSTHOG_PROJECT_ID: process.env.POSTHOG_PROJECT_ID,
    POSTHOG_PERSONAL_API_KEY: process.env.POSTHOG_PERSONAL_API_KEY,
    POSTHOG_OMNIRA_PROJECT_ID: process.env.POSTHOG_OMNIRA_PROJECT_ID,
    POSTHOG_APP_HOST: process.env.POSTHOG_APP_HOST,
  });
  if (!config) return {status:"not_connected",days:[],checkedAt:null};
  const now = options.now ?? new Date();
  const dates = lastSevenUtcDates(now);
  if (dates.length !== 7) return {status:"unavailable",days:[],checkedAt:null};
  const signal = AbortSignal.timeout(7000);
  const fetcher = options.fetcher ?? fetch;
  const trafficPromise = (async (): Promise<HandlarborsenTraffic> => {
  try {
    const response = await fetcher("https://eu.posthog.com/api/projects/"+config.id+"/query/",{
      method:"POST",headers:{Authorization:"Bearer "+config.token,"Content-Type":"application/json"},
      body:JSON.stringify({
        query:{kind:"TrendsQuery",filterTestAccounts:false,series:[
          {kind:"EventsNode",event:"$pageview",math:"total"},
          {kind:"EventsNode",event:"$pageview",math:"dau"},
          {kind:"EventsNode",event:"$pageview",math:"total",properties:[{key:"$pathname",type:"event",operator:"exact",value:["/registrera"]}]},
        ],dateRange:{date_from:dates[0],date_to:dates[6]},interval:"day",
        properties:[{key:"$host",type:"event",operator:"exact",value:["handlarborsen.se","www.handlarborsen.se"]}]},
        name:"omnira_handlarborsen_pageviews_daily_visitors_7_utc_days",
        async:false,
      }),cache:"no-store",redirect:"error",signal,
    });
    if (response.status === 403) { void response.body?.cancel().catch(()=>{}); return {status:"missing_permission",days:[],checkedAt:null}; }
    if (response.status !== 200) { void response.body?.cancel().catch(()=>{}); return {status:"unavailable",days:[],checkedAt:null}; }
    const payload = await boundedJson(response,signal);
    const days = parseTrafficSeries(payload && typeof payload === "object" ? (payload as {results?:unknown}).results : null,dates);
    if (!days) return {status:"unavailable",days:[],checkedAt:null};
    const totalPageviews = days.reduce((sum,row) => sum + row.pageviews,0);
    if (!Number.isSafeInteger(totalPageviews)) return {status:"unavailable",days:[],checkedAt:null};
    const registrationPageviews = days.reduce((sum,row) => sum + (row.registrationPageviews ?? 0),0);
    if (!Number.isSafeInteger(registrationPageviews)) return {status:"unavailable",days:[],checkedAt:null};
    return {status:"available",days,totalPageviews,registrationPageviews,visitorsToday:days[6].visitors,
      checkedAt:now.toISOString(),firstDate:dates[0],lastDate:dates[6]};
  } catch { return {status:"unavailable",days:[],checkedAt:null}; }
  })();
  // Parse each response under the deadline independently. A sessions timeout
  // must not discard an already validated daily traffic response.
  const [traffic, sessions] = await Promise.all([trafficPromise, readSessions(config, dates, fetcher, signal)]);
  return traffic.status === "available" ? { ...traffic, sessions } : traffic;
}
