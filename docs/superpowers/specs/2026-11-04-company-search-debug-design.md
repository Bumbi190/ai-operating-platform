# Current company-search debug pass

Owner explicitly requests debugging this step before further features. Stop website/lead-save work. Same PR386 clean base b30a6b3.

Confirmed code defect: optional AE `ben`/mapped name is required before legal review; valid legal company/workplace identities with blank name disappear. Dated legal-only SCB exports contain blank workplace names, including local records, but do not establish current live totals. Preserve CFAR/orgnr identity; permit missing/unsafe optional branch text as empty and rely on independently verified safe JE company name. Do not fall back to an unverified AE name or relax legal/person/marketing/owner/project checks.

Bilhandlare currently only matches retail47.811. Include official wholesale46.711 as well; both describe car/light-vehicle trade (SCB https://snisok.scb.se/47811 and /46711). No repair or generic fuzzy category. Municipal fetching and two-page/10k/five-review caps remain unchanged; no extra source fetch per click.

Add aggregate-only accounting for municipality rows, matching industry rows, unsupported identity rows, missing CFAR, duplicate rows, conflicting workplaces, unnamed eligible workplaces, eligible identities, reviewed/returned/skipped current page. No rejected raw identities/names. Show transparent counts and explicit zero-result/query-not-run states. Category change clears prior results and still requires explicit submit. Keep source errors and stale-result warnings explicit.

Live browser content observation remains blocked by browser policy; no alternative browser, CDP, sessions or authentication bypass. Existing connector/code/history reads are separate safer diagnostics. Do not claim an independent live current SCB total. No production data/SQL/env/worker/send changes or new source/key/cost.

Acceptance: raw-HTTP missing/null/unsafe `ben` survives only with verified legal identity; retail+wholesale included and repair excluded; exact filter accounting and personal IDs omitted; paginated source, error, owner scope and browser desktop/mobile regressions pass, typecheck and independent review. Record blocked live proof separately; do not call entire feature live-verified.
