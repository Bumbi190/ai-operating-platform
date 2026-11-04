import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as unknown as { React: typeof React }).React = React;
vi.mock("server-only", () => ({}));

import {
  HANDLARBORSEN_PROJECT_ID,
  HANDLARBORSEN_PROJECT_SLUG,
} from "@/lib/atlas/collectors/handlarborsen-marketplace";
import {
  lastSevenUtcDates,
  parsePageviewRows,
  parseTrafficSeries,
  loadHandlarborsenTraffic,
} from "@/lib/atlas/project-analytics/handlarborsen-posthog-traffic";
import { HandlarborsenPosthogTraffic } from "@/components/platform/vnext/HandlarborsenPosthogTraffic";

const project = {
  id: HANDLARBORSEN_PROJECT_ID,
  slug: HANDLARBORSEN_PROJECT_SLUG,
};
const scope = { allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] };
const env = {
  HANDLARBORSEN_POSTHOG_PROJECT_ID: "123456",
  HANDLARBORSEN_POSTHOG_READ_TOKEN: "phx_readonly_0123456789",
};
const now = new Date("2026-10-12T14:20:00Z");
const dates = [
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
  "2026-10-09",
  "2026-10-10",
  "2026-10-11",
  "2026-10-12",
];
const response = (obj: unknown, ok = true) => Response.json(obj,{status:ok?200:500});
const series = (views: number[], visitors: number[]) => ({results:[
 {order:0,days:dates,data:views},{order:1,days:dates,data:visitors},
]});

describe("Omnira project-scoped PostHog traffic", () => {
  it("builds exactly seven real UTC calendar dates, including across months", () => {
    expect(lastSevenUtcDates(now)).toEqual(dates);
    expect(lastSevenUtcDates(new Date("2026-11-02T00:30:00Z"))).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("rejects cross-project and missing authorization before any network or env configuration", async () => {
    const fetcher = vi.fn();
    expect(
      await loadHandlarborsenTraffic(
        project,
        { allowedProjectIds: [] },
        { env, fetcher },
      ),
    ).toBeNull();
    expect(
      await loadHandlarborsenTraffic({ ...project, slug: "another" }, scope, {
        env,
        fetcher,
      }),
    ).toBeNull();
    expect(
      await loadHandlarborsenTraffic({ ...project, id: "wrong" }, scope, {
        env,
        fetcher,
      }),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed with missing or invalid endpoint credentials", async () => {
    const fetcher = vi.fn();
    expect(
      await loadHandlarborsenTraffic(project, scope, { env: {}, fetcher }),
    ).toMatchObject({ status: "not_connected" });
    expect(
      await loadHandlarborsenTraffic(project, scope, {
        env: { ...env, HANDLARBORSEN_POSTHOG_READ_TOKEN: "phc_public" },
        fetcher,
      }),
    ).toMatchObject({ status: "not_connected" });
    expect(
      await loadHandlarborsenTraffic(project, scope, {
        env: { ...env, HANDLARBORSEN_POSTHOG_PROJECT_ID: "../x" },
        fetcher,
      }),
    ).toMatchObject({ status: "not_connected" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requests only fixed EU PostHog query with a server-only bearer and bounded native trends", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response(series([0,0,0,0,6,0,4],[0,0,0,0,3,0,2])),
    );
    const traffic = await loadHandlarborsenTraffic(project, scope, {
      env,
      fetcher,
      now,
    });
    expect(traffic).toMatchObject({
      status: "available",
      totalPageviews: 10,
      firstDate: "2026-10-06",
      lastDate: "2026-10-12",
    });
    if (traffic?.status === "available")
      expect(traffic.days.map((x) => x.pageviews)).toEqual([
        0, 0, 0, 0, 6, 0, 4,
      ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu.posthog.com/api/projects/123456/query/");
    expect(options.method).toBe("POST");
    expect(options.cache).toBe("no-store");
    expect(options.redirect).toBe("error");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer " + env.HANDLARBORSEN_POSTHOG_READ_TOKEN,
    });
    const query = JSON.parse(options.body as string).query;
    expect(query.kind).toBe("TrendsQuery");
    expect(query.dateRange).toEqual({date_from:"2026-10-06",date_to:"2026-10-12"});
    expect(query.series).toEqual([{kind:"EventsNode",event:"$pageview",math:"total"},{kind:"EventsNode",event:"$pageview",math:"dau"}]);
    expect(query.properties).toEqual([{key:"$host",type:"event",operator:"exact",value:["handlarborsen.se","www.handlarborsen.se"]}]);
    expect(traffic).toMatchObject({visitorsToday:2});
  });

  it("does not treat no events, server errors or malformed data as fabricated zero values", async () => {
    const read = async (x: Response) =>
      loadHandlarborsenTraffic(project, scope, {
        env,
        now,
        fetcher: vi.fn().mockResolvedValue(x),
      });
    expect(await read(response(series([0,0,0,0,0,0,0],[0,0,0,0,0,0,0])))).toMatchObject({
      status: "available",
      totalPageviews: 0,
    });
    expect(await read(response({}, false))).toMatchObject({
      status: "unavailable",
      days: [],
    });
    expect(
      await read(response({ results: [["2026-10-12", -1]] })),
    ).toMatchObject({ status: "unavailable", days: [] });
    expect(
      await read(response({ results: [["2026-10-12", "4"]] })),
    ).toMatchObject({ status: "unavailable", days: [] });
    expect(
      await read(
        response({
          results: [
            ["2026-10-12", 4],
            ["2026-10-12", 7],
          ],
        }),
      ),
    ).toMatchObject({ status: "unavailable", days: [] });
  });

  it("allows real zeros and only expected dates in a returned query result", () => {
    expect(parsePageviewRows([["2026-10-12", 0]], dates)?.at(-1)).toEqual({
      date: "2026-10-12",
      pageviews: 0,
    });
    expect(parsePageviewRows([["2026-09-12", 3]], dates)).toBeNull();
    expect(parsePageviewRows([["2026-10-12", Infinity]], dates)).toBeNull();
  });

  it("renders an honest waiting panel and charts only actual accepted daily numbers", () => {
    const empty = renderToStaticMarkup(
      createElement(HandlarborsenPosthogTraffic, {
        traffic: { status: "not_connected", days: [], checkedAt: null },
      }),
    );
    expect(empty).toContain("Besök och trafik");
    expect(empty).toContain("Inväntar anslutning");
    expect(empty).not.toContain("Mottagna 0");
    expect(empty).not.toContain('data-ready="yes"');
    expect(empty).not.toContain('role="img"');
    const real = renderToStaticMarkup(
      createElement(HandlarborsenPosthogTraffic, {
        traffic: {
          status: "available",
          days: dates.map((date, i) => ({ date, pageviews: i })),
          totalPageviews: 21,
          checkedAt: now.toISOString(),
          firstDate: dates[0],
          lastDate: dates[6],
        },
      }),
    );
    expect(real).toContain("Sidvisningar per dag");
    expect(real).toContain("21");
    expect(real).toContain('role="img"');
    expect(real).toContain("height:100%");
    expect(real).toContain("Unika besökare");
    expect(real).toContain("Inväntar verifierad identitetsmetod");
    expect(real).not.toContain("Antal online");
  });
});

it("distinguishes denied query scope and rejects partial, oversized and async results",async()=>{
 const read=(r:Response)=>loadHandlarborsenTraffic(project,scope,{env,now,fetcher:vi.fn().mockResolvedValue(r)});
 expect(await read(Response.json({}, {status:403}))).toMatchObject({status:"missing_permission",days:[]});
 expect(await read(Response.json({results:[]},{status:202}))).toMatchObject({status:"unavailable"});
 expect(await read(new Response("x".repeat(32769)))).toMatchObject({status:"unavailable"});
 expect(parseTrafficSeries([{order:0,days:dates,data:[1]}],dates)).toBeNull();
 expect(parseTrafficSeries(series([1,1,1,1,1,1,1],[1,1,1,1,1,1,-1]).results,dates)).toBeNull();
});
it("reuses only an explicitly mapped EU Handlarbörsen server credential",async()=>{
 const mapped={POSTHOG_OMNIRA_PROJECT_ID:project.id,POSTHOG_PROJECT_ID:"245437",POSTHOG_APP_HOST:"https://eu.posthog.com",POSTHOG_PERSONAL_API_KEY:env.HANDLARBORSEN_POSTHOG_READ_TOKEN};
 const fetcher=vi.fn().mockResolvedValue(response(series([1,1,1,1,1,1,1],[1,1,1,1,1,1,1])));
 expect(await loadHandlarborsenTraffic(project,scope,{env:mapped,now,fetcher})).toMatchObject({status:"available",totalPageviews:7,visitorsToday:1});
 fetcher.mockClear();
 expect(await loadHandlarborsenTraffic(project,scope,{env:{...mapped,POSTHOG_OMNIRA_PROJECT_ID:"foreign"},now,fetcher})).toMatchObject({status:"not_connected"});
 expect(fetcher).not.toHaveBeenCalled();
});
it("renders verified daily uniques without inventing a period total",()=>{
 const html=renderToStaticMarkup(createElement(HandlarborsenPosthogTraffic,{traffic:{status:"available",days:dates.map(date=>({date,pageviews:4,visitors:2})),totalPageviews:28,visitorsToday:2,checkedAt:now.toISOString(),firstDate:dates[0],lastDate:dates[6]}}));
 expect(html).toContain("Daglig trafik");
 expect(html).toContain("Unika besökare idag");
 expect(html).toContain("summeras inte");
});
