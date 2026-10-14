import "server-only";
import { resolveProjectAccess } from "@/lib/auth/project-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildErrorResponse } from "../api";
import { WebsiteBuildError } from "../store";
import { readWebsiteBuildReadiness } from "./readiness";
export async function websiteBuildReadinessApi(
  request: Request,
): Promise<Response> {
  const headers = { "cache-control": "private, no-store" },
    access = await resolveProjectAccess();
  if (!access.ok) {
    access.response.headers.set("cache-control", headers["cache-control"]);
    return access.response;
  }
  try {
    const query = new URL(request.url).searchParams;
    for (const key of query.keys())
      if (
        !["projectId", "planId"].includes(key) ||
        query.getAll(key).length !== 1
      )
        throw new WebsiteBuildError("INVALID_BODY");
    return Response.json(
      await readWebsiteBuildReadiness(createAdminClient(), access, {
        projectId: query.get("projectId") ?? "",
        planId: query.get("planId") ?? "",
      }),
      { headers },
    );
  } catch (error) {
    return buildErrorResponse(error);
  }
}
