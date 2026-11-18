# Company website evidence — 2026-11-04

## Delivery and exact scope

Same Draft PR386, owned detached worktree Temp/hb-sales-slim-20261029, base7d9ebc06cbb6fc54c5e89132ed7f50b615159ede. New collapsed website-evidence panel on company cards, one explicit legal-company investigation per click. The backend refreshes legal JE identity then uses the existing fixed Tavily basic search plus at most one basic extraction. Queries are industry-neutral and based on fresh SCB legal name/orgnr, never a client-supplied name, contact or history. Output contains only safe source URL, checked time, short sanitized excerpt and exact scope binding. Matching name/orgnr on a page is evidence, not legal ownership, branch identity, current business suitability or outreach permission. No match means this bounded check found no linked evidence; a company may still have a website.

## Safety/cost gates and chosen limits

New COMPANY_WEBSITE_RESEARCH_ENABLED=true, matching UUID COMPANY_WEBSITE_RESEARCH_OWNER_ID and dedicated COMPANY_WEBSITE_TAVILY_API_KEY are required. The old TAVILY_API_KEY/pilot flags cannot enable the new source. VERCEL_ENV must be preview, existing SCB key/gate valid, current user own the exact project and project.execution_paused be false. Origin/JSON/body/identity checks precede external work. Readiness is per session owner/project. No environment values, keys, account settings or provider calls were activated by this implementation run.

At most1JE+1Tavily basic Search+1optional basic Extract,25s shared deadline and no next stage after cancellation, no retries, no direct result-site fetch, no redirect following. Provider responses150000bytes and extracted text65000characters. Server credentials stay on their respective fixed destinations. Source failure stays distinct from successful no-evidence, including malformed/null/oversized extract bodies. Old callers retain old fallback behavior when the new failure observer is absent.

No durable global/repeated-request/monthly quota is implemented or claimed. Activation needs a separate scoped provider key with an owner-approved credit limit, verification of actual key/account allowance and explicit Preview activation. Current official pricing: basic Search1credit/request; basic Extract1credit per5successful URLs, about1.2credits per full successful check; PAYG USD0.008/credit. Actual balance/plan were not accessed. Primary sources checked https://docs.tavily.com/documentation/api-credits, https://docs.tavily.com/documentation/api-reference/endpoint/search, https://docs.tavily.com/documentation/api-reference/endpoint/extract. Vendor dashboard supports separate keys with monthly credit limits: https://help.tavily.com/articles/9170796666-how-can-i-create-an-api-key. A proposed10credit pilot would be an activation decision, not something authorized or applied by this report.

## Verification and review

- Source/API initial RED:missing modules, then31 behavioral failures against minimal signatures. Core GREEN95 across new31+old Tavily64. Additional owner-pin/raw-text-limit RED3failures then GREEN97 (new33+old64, including added post-search-deadline coverage).
- Independent plan review approved adapter reuse with explicit stage failures, fresh identity-only evidence, between-stage deadline, pause check and conservative discovery wording. All requirements incorporated.
- Independent fresh code reviewer found one P2:malformed extraction entries looked like no_match. Missing/null/nonobject page regressions plus dedicated-key isolation were observed RED3failures/20passes, then GREEN97. Author fixed the finding in one pass; no second reviewer or independently run tests claimed.
- Final affected regression:379/379 across20 company/Discovery/SCB/Lead Finder/research/Sales suites; exit0.
- Full company Playwright:30/30 desktop/mobile cases; exit0. Disabled readiness case observed RED before UI implementation. Tests cover explicit click/pending/zero automatic calls, source evidence, honest source error/no-match, scope rejection/unsafe links and overflow. Public synthetic mobile evidence screenshot visually inspected.
- Final TypeScript noEmit exit0. Whitespace check before commit. No new dependency or migration. Synthetic provider HTTP fixtures only; no keyed Tavily or new paid-source live check.
- Earlier broad Windows-suite failures remain separately documented in the previous company-view report. Entire repository suite was not rerun or claimed green. New source activation and real extraction remain unverified until approved configuration.

## Preflight resolution and rulings

Read-only receipt HARVEY-COMPANY-WEBSITES-20261104 returned review_required due keyword candidatePR605. Actual19paths in605 cover owner GitHub catalog/SQL/security docs; no company/Tavily/Sales UI overlap. Continue owned existing386; no new branch/worktree/PR or other-worktree modification.

Owner autonomous standard delegates routine implementation and continuous qualification. Author choices:reuse existing provider transport, add industry-neutral internal query only, split source and API/UI types, pin owner and isolate new key. Cost if wrong:conservative domain/name matching can miss legitimate brand/group sites; separate key requires extra activation configuration. These do not grant site ownership or sending authority. No deferred reviewer minors.

Evidence logs:Temp/harvey-resume-20261101/company-website-{red,behavior-red,boundary-red,boundary-green,review-red,review-green,regression,tsc-final,playwright}.log and company-website-browser. Source/API33new cases, old Tavily64 preserved. Current Preview readiness/CI status is recorded in the PR and canonical Notion handoff after push. Persistent lead saving, shared owner stop aggregation, real Webbuilder project binding and outreach remain later work; none implemented or activated here.
