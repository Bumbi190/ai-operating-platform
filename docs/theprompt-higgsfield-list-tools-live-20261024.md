# Higgsfield read-only MCP tools/list pagination repair — 2026-10-24

Scope: The Prompt + Familje-Stunden, existing verified/encrypted Higgsfield project connections. **No paid generation, upload, automatic publication, OAuth reconnection, new permission, database migration, or production secret change.**

## Evidence

The operator's real Omnira Settings screen on `app.omniraos.se` showed `provider_unavailable/list_tools` on 24 October. Vercel function logs at `2026-10-24T07:43:43.224Z` independently confirmed `[higgsfield-inspect] read_failed { code: 'provider_unavailable', stage: 'list_tools' }`. The error happens before balance/model/price. Supabase catalog and permissions were checked as healthy; the production database has both verified, encrypted provider connections, and the exact two-table/nine-RPC RLS/ACL contract passes. A separate Higgsfield ChatGPT plugin's balance/model/quote succeeded, but **does not prove Omnira's own live connection can read them**.

## Specific code issue and minimized fix

The installed `@modelcontextprotocol/client@2.3.1` SDK's `Client.listTools(undefined)` **automatically aggregates all paginated `tools/list` pages**, before returning. In the existing client our manual loop called this with undefined cursor for its first iteration; consequently the intended 64-page manual bound did not bound the first SDK auto-scan, and the entire 143-tool provider catalog could consume our absolute 20-second inspection deadline. This was identified from the actual installed SDK implementation, not inferred from generic MCP documentation.

The new `ReadOnlyMcpClient.listTools()` directly calls the SDK's typed `client.request({method:'tools/list',params:{}})`, fetching exactly one page. It walks subsequent explicit cursor pages only until it has found the **three needed read-only tool declarations**: `balance`, `models_get`, `estimate_video_cost`. It does not enumerate unrelated generation, upload or purchase tools. The existing strict schema gate for those three tools remains; no direct-call fallback that bypasses the gate was introduced. The transport origin, OAuth grant, absolute 20s deadline, 1 MiB per-response limit, max 64 pages, fixed model/quote parameters, and whitelist of callable read-only tools all remain. Repeated, empty and excessive cursors fail closed.

On tool-list failure only, the server logs a **locally enumerated reason category** and numeric page count, never the raw provider SDK error, body, URL, tokens, or OAuth metadata. This enables an operator to distinguish a still-failing request timeout/remote protocol/unknown failure after release without leaking secrets.

## Failing-first regression and local verification

A synthetic live SDK/HTTP fixture exposes the three permitted tools on the first three catalog pages and advertises further catalog pages thereafter. **Before the fix** the test showed **five** list requests because the SDK walked outside the minimal list. **After the fix**, the same test passed with **three** requests, then verified the fixed `balance → models_get → estimate_video_cost` sequence and **zero** generation calls.

Two additional fixtures prove an untrusted MCP exception never leaks an embedded synthetic bearer token in logs, and a repeated pagination cursor fails closed **before any tool call**. Together, all nine focused Higgsfield/OAuth/settings/migration/RLS suites reported **205/205 PASS**. TypeScript `npm run typecheck` PASS in the new isolated Windows worktree created from origin/main `0579832e4972979d0d51d0a225b9e1eb5e2920e6`. The original The Prompt image-reel route and social cron files were not touched.

## Release and acceptance

Keep this change in its own PR, not on an unrelated worktree. Confirm the PR head GitHub checks and Vercel preview are green, then release only the reviewed commit using ordinary branch/CI protections. Do not change Supabase or Higgsfield secrets; both real connections already exist. On production, the operator must **click `Läs saldo och testpris` once** from the existing connected project. Accept only a live Omnira result showing both numeric balance and quote with no 503, verified against the server's sanitized trace. This is non-billable. If it still fails at `list_tools`, inspect the newly logged safe page/category and fix that concrete cause rather than guessing or bypassing tool-schema validation. No automated video generation until later independent approval and cost caps.
