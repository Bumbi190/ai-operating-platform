# Company website evidence — 2026-11-04

Owner continued after successful live company-search debugging. Build website evidence first; persistent lead saving is later. Same PR386/base7d9ebc0. Owner autonomous standard explicitly delegates routine design/implementation without micro approvals; these technical choices are the implementer's, not newly claimed user selections.

## Approaches and decision

1. Reuse existing Tavily basic search + one optional basic extract, per explicitly selected company. Chosen: existing fixed-origin transport, response caps, name/orgnr matching, directory rejection and privacy filters; generic query rather than car-only search. No new direct website crawler or provider.
2. Direct server HTTP website verification: avoids search credits but introduces DNS/IP pinning/redirect/SSRF surface and does not discover websites. Rejected for this increment.
3. Search links/manual attestation only: cheapest but does not fulfill automated discovery/evidence collection. Rejected as the primary feature; existing website links remain useful.

## Scope and behavior

Each company card with legal orgnr has a collapsed Website evidence panel. One explicit click investigates that company only. No page-open, expansion, pagination, category/project change, automatic retry, scheduler, save or send causes research. Show current-source URL, checked time and short sanitized evidence; distinguish matching company name+orgnr found on extracted page, no linked website found, and source failure. No claim of legal site ownership, business suitability, mobile/local branch ownership, email verification or permission to contact.

Server refreshes legal JE identity before any Tavily query; never sends user-supplied company name/email/history to search. Exact supported legal orgnr and legal forms49/31/96 remain. CFAR is an output binding, not proof that the website belongs to that particular branch. Search snippets and name-like domains alone cannot produce a linked-site state. Existing plausible-own-host and nonofficial-domain filters retain conservative coverage. Do not expose extracted contact fields or raw provider text.

## Access, cost and transport

Owner/project access, same origin, strict JSON body and unpaused owner project checked before source work. New COMPANY_WEBSITE_RESEARCH_ENABLED must be exactly true, COMPANY_WEBSITE_RESEARCH_OWNER_ID must be a valid UUID matching the current session owner at admission/readiness, VERCEL_ENV exactly preview, valid dedicated server-only COMPANY_WEBSITE_TAVILY_API_KEY and existing SCB Preview key/gate. Default disabled; no environment changes or provider calls by this implementation run. New flag is separate from older fixed89-company billable pilot; no broadening through old flags. Activation/live spending is a concrete later owner decision.

At most one SCB JE lookup, one fixed Tavily BASIC search and one optional BASIC extract of one plausible candidate per explicit request; 25s whole timeout, no retries/redirects/direct result-site requests, max150kB each provider response. Existing transport assertions keep each credential on its own fixed host. Official docs checked: search basic1credit; basic extraction1credit per5successful URLs. Rough provider accounting1.2credits per fully successful check, not proof of available user balance. No durable/global monthly quota is implemented or claimed; activation must state budget/account limits. No model/Crawl/Map calls.

Input: projectId, legal orgnr, optional numeric CFAR, exact confirmation string. Legal name from JE only. Output repeats project/orgnr/CFAR, state, checkedAt, optional safe website/source URL and short excerpt, provider-call count, outreachReady:false. Wrong-scope client responses are rejected. Error responses are sanitized/private/no-store. Project pause read fails closed.

UI state stays card-scoped and clears on project/identity change. Unmount aborts the client wait; backend deadline still enforces its own bound. Parent directory search remains independently usable. Disabled state explains unavailable activation without asking for API keys in the UI. Existing historical website links stay labelled as saved evidence rather than newly verified.

## Acceptance

Provider tests: fixed URLs/headers, no key/content leakage, generic category-neutral query, exact legal refresh/name/orgnr identity, unsafe/social/directory candidates, response URL mismatch, source timeout/oversize/invalid JSON, snippet-only/no match, no contacts, exactly bounded calls.
API: auth/origin/JSON/body/identity/project/pause/flag/production gates before research, output scope and no-store, sanitized errors. UI desktop/mobile: explicit-only click, pending and disabled state, successful source evidence, failed/empty/wrong-project response, no auto retry, no horizontal overflow or save/send controls. Run affected company and old Tavily/Lead Finder regression suites and tsc. Independent review before normal fast-forward push/Preview; live disabled-state check separate from unactivated paid-source proof.

## Preflight resolution

Read-only receipt HARVEY-COMPANY-WEBSITES-20261104 returned review_required due keyword candidate PR605. Its actual19 paths are owner GitHub catalog/SQL/security docs and have no overlap with company/Tavily/Sales UI files. PR386 owns existing company directory and relevant lead research; its remote and owned clean worktree both7d9ebc0. Reuse386, no new branch/worktree/PR, leave605 and all other worktrees untouched.

## Independent plan review carried into implementation

Plan reviewer approved reuse subject to: sanitized extract failure callback (old adapter swallowed failures); output only extracted exact name+orgnr evidence, no automotive qualification reuse; shared deadline checked between stages; explicit unpaused owner read before JE; internal query override with exact old default; conservative first-plausible-of-three discovery limitations. These are implemented and covered by source/API tests. Author added owner-id pinning and a raw-text-limit error signal after additional RED cases; no global spending quota is claimed.

## Final review and rulings

Independent code reviewer found one P2: non-object/missing/null extracted page text was misreported as no_match. Added failure signalling and regression cases; old callers keep their snippet fallback. Additional author ruling: use separate COMPANY_WEBSITE_TAVILY_API_KEY, never old TAVILY_API_KEY, so activation cannot silently broaden the earlier pilot account usage; scoped key/account credit limit is a separate activation prerequisite. This costs one extra server-side configuration value at activation and does not create a key in this run.
