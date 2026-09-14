-- Settings S0 — pin the search_path of platform_credential_events_append_only.
--
-- WHY. After 20260914090100_platform_credential_events was applied, the Supabase
-- security advisor (lint 0011, function_search_path_mutable) flagged its
-- append-only trigger function: it runs with the caller's search_path. The body
-- only raises an exception and names no object, so nothing could be redirected
-- through it — but the table's insert guard already pins search_path to '', and a
-- new object should not add to the advisor's backlog.
--
-- FUNCTION CONFIGURATION ONLY. No table, row, trigger, constraint, policy or grant
-- changes; the function's body and the triggers that call it are untouched.

alter function public.platform_credential_events_append_only() set search_path to '';
