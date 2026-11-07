import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadHandlarborsenTraffic, parseTrafficSeries } from "@/lib/atlas/project-analytics/handlarborsen-posthog-traffic";
import { HandlarborsenPosthogTraffic } from "@/components/platform/vnext/HandlarborsenPosthogTraffic";
import { HANDLARBORSEN_PROJECT_ID, HANDLARBORSEN_PROJECT_SLUG } from "@/lib/atlas/collectors/handlarborsen-marketplace";
(globalThis as unknown as { React: typeof React }).React = React;

const project = { id: HANDLARBORSEN_PROJECT_ID, slug: HANDLARBORSEN_PROJECT_SLUG };
const scope = { allowedProjectIds: [project.id] };
const env = { HANDLARBORSEN_POSTHOG_PROJECT_ID: "245437", HANDLARBORSEN_POSTHOG_READ_TOKEN: "phx_testonly_read_0123456789" };
const now = new Date("2026-11-07T17:00:00Z");
const dates = ["2026-11-01","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06","2026-11-07"];
function rows(submissions = [0,0,0,5,0,0,0]) {
  return [
    { order: 0, days: [...dates], data: [0,0,0,2,0,0,0] },
    { order: 1, days: [...dates], data: [0,0,0,1,0,0,0] },
    { order: 2, days: [...dates], data: [0,0,0,1,0,0,0] },
    { order: 3, days: [...dates], data: submissions },
  ];
}
function read(results = rows()) {
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body)).query;
    return Response.json(query.kind === "TrendsQuery"
      ? { results }
      : { results: [{ key: "sessions", kind: "unit", value: 1 }] });
  });
  return { fetcher, result: loadHandlarborsenTraffic(project, scope, { env, now, fetcher }) };
}

describe("received consented registration submissions", () => {
  it("keeps independent submission counts even when pageview delivery is smaller", () => {
    expect(parseTrafficSeries(rows(), dates)?.[3]).toEqual({
      date: "2026-11-04", pageviews: 2, visitors: 1, registrationPageviews: 1, registrationSubmissions: 5,
    });
  });
  it("queries a fourth fixed aggregate without adding requests or identifiers", async () => {
    const f = read();
    expect(await f.result).toMatchObject({ status: "available", totalPageviews: 2, registrationPageviews: 1, registrationSubmissions: 5 });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    const init = f.fetcher.mock.calls[0][1]!;
    const body = JSON.parse(String(init.body));
    expect(body.query.series).toHaveLength(4);
    expect(body.query.series[3]).toEqual({
      kind: "EventsNode", event: "registration_submitted", math: "total",
      properties: [{ key: "$pathname", type: "event", operator: "exact", value: ["/registrera"] }],
    });
    expect(body.query.properties).toEqual([{ key: "$host", type: "event", operator: "exact", value: ["handlarborsen.se", "www.handlarborsen.se"] }]);
    expect(body.query.dateRange).toEqual({ date_from: "2026-11-01", date_to: "2026-11-07" });
    expect(body.async).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/email|organization_id|person_id|distinct_id|hogql/i);
  });
  it("preserves actual zero submissions", async () => {
    expect(await read(rows([0,0,0,0,0,0,0])).result).toMatchObject({ status: "available", registrationSubmissions: 0 });
  });
  it("does not replace an absent submission series with zero", async () => {
    const f = read(rows().slice(0, 3));
    expect(await f.result).toMatchObject({ status: "unavailable", days: [] });
  });
  it.each([-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe submission count %s", count => {
    const input = rows();
    input[3].data[3] = count;
    expect(parseTrafficSeries(input, dates)).toBeNull();
  });
  it("rejects wrong dates and duplicate submission series", () => {
    const wrong = rows();
    wrong[3].days[0] = "2026-10-31";
    expect(parseTrafficSeries(wrong, dates)).toBeNull();
    const duplicate = rows();
    duplicate[2].order = 3;
    expect(parseTrafficSeries(duplicate, dates)).toBeNull();
  });
  it("rejects a safe-per-day count whose weekly total overflows", async () => {
    const result = await read(rows([Number.MAX_SAFE_INTEGER,1,0,0,0,0,0])).result;
    expect(result).toMatchObject({ status: "unavailable" });
    expect(result).not.toHaveProperty("registrationSubmissions");
  });
  it("labels received submissions separately from interest and verified dealers", async () => {
    const traffic = await read().result;
    if (traffic?.status !== "available") throw new Error("Expected traffic");
    const html = renderToStaticMarkup(createElement(HandlarborsenPosthogTraffic, { traffic }));
    expect(html).toContain("Inskickade registreringar");
    expect(html).toContain("mottagna inskickshändelser med analyssamtycke");
    expect(html).toContain("inte alla registreringar");
    expect(html).toContain("godkända handlare");
    expect(html).toContain("Intresse för registrering");
    expect(html).toContain("Inskick (analys)");
    expect(html).toContain("overflow-x:auto");
  });
  it("does not invent a submission count for an older read model", () => {
    const html = renderToStaticMarkup(createElement(HandlarborsenPosthogTraffic, {
      traffic: { status: "available", days: dates.map(date => ({ date, pageviews: 1 })), totalPageviews: 7, checkedAt: now.toISOString(), firstDate: dates[0], lastDate: dates[6] },
    }));
    expect(html).not.toContain("Inskickade registreringar");
    expect(html).not.toContain("mottagna inskickshändelser");
  });
});


it("treats zero pageviews as measured data when independent submissions were received", async () => {
  const input = rows();
  for (const i of [0,1,2]) input[i].data = [0,0,0,0,0,0,0];
  const traffic = await read(input).result;
  expect(traffic).toMatchObject({ status: "available", totalPageviews: 0, registrationSubmissions: 5 });
  if (traffic?.status !== "available") throw new Error("Expected traffic");
  const html = renderToStaticMarkup(createElement(HandlarborsenPosthogTraffic, { traffic }));
  expect(html).toContain("<strong>5</strong>");
  expect(html).toContain("Inga sidvisningar");
  expect(html).not.toContain("Grafen fylls först med verkliga mätvärden");
});
