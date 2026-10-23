# Atlas fallback allowance – approved limit, staged release (2026-10-23)

## Owner decision
The operator approved a shared **SEK 10 per Stockholm calendar day and SEK 100 per Stockholm calendar month** for additional *automatic reserve-model* work. This is a conservative allowance, not an instruction to spend it. The existing project/global budgets and all workflow stop gates remain independently binding.

## Implemented
- New append-only `public.atlas_fallback_reservations` journal, RLS enabled, no anon/authenticated table grants.
- Service-role-only `public.atlas_fallback_reserve(uuid,uuid,text,numeric)` RPC. Every request takes the same Postgres transaction-scoped advisory lock and sums reservations from ALL projects for the current Europe/Stockholm day/month. Records are unique by opaque request UUID; replays refuse. Every request is charged a rounded-up SEK allowance before an OpenAI provider call, with no refund on ambiguous outcomes.
- Explicit project validation: News Hunter, morning briefing and legacy media reserve jobs can only use The Prompt's project. Dream uses the actual project ID and its own stop authority.
- Two additive reviewed schema changes: `atlas_fallback_reservation_ceiling` and `atlas_fallback_reservation_locktime`. The second ensures that a request waiting at a midnight boundary gets its calendar instant AFTER obtaining the lock.
- When `ATLAS_TEXT_FAILOVER_ENABLED=true`, ALL `secondaryText` reserve invocations (including legacy credit fallback) take an allowance reservation first. It does not create provider credentials or change any publishing behavior. When disabled, the pre-existing legacy credit recovery behavior is preserved, but the new automatic model-selection capability stays disabled.
- Only the previously allowlisted News/CFO/Dream tasks may newly select another model. Unknown dispatch, stop, budget refusal, timeout, 429 and 5xx remain fail-closed.
- Conservative bounded plain-text envelope: max 24 KiB UTF-8 content, max 4096 output tokens, additional 8192-token protocol margin, floor USD-to-SEK and pricing at least USD 3/input-MTok and USD 15/output-MTok, with a 2x cost multiplier and round-up to 0.01 SEK. Reject an input that cannot be safely admitted. The capped amount is a **reserved estimate/allowance**, not provider invoice reconciliation; the real external bill can vary with provider changes and FX. The rate floor is substantially above the published GPT-5.4 mini price at the time of implementation.
- The existing `withGovernedSpend`/OpenAI physical request boundary independently rechecks project/global limits, run authority and the global stop switch. No paid model retries have been introduced.

## Live DB verification
Additive migrations APPLIED in `AI Operating Platform`:
- `atlas_fallback_reservation_ceiling`, ledger version `20261023100303`
- `atlas_fallback_reservation_locktime`, ledger version `20261023100514`

All verification writes occurred inside explicit transactions with `ROLLBACK`; retained reservation count = **0**. Tests returned:
- 9.90 SEK then another 0.20 SEK on same day => second call `daily_limit`
- 100 SEK reserved across earlier days of same month => next 0.01 SEK `monthly_limit`
- Reusing the exact request UUID => `replay`
- The Prompt News charged to Familje-Stunden => `wrong_project`
- anon/authenticated EXECUTE = false, SELECT on journal = false; service_role EXECUTE = true.

## Release gates and remaining work
1. Local scoped Vitest + targeted TypeScript + migration guard: 80 passing tests in the final combined run.
2. Submit a reviewed PR; clean dependency install and all GitHub/Vercel CI must pass.
3. Merge and deploy with `ATLAS_TEXT_FAILOVER_ENABLED=false`.
4. Verify `H1_SPEND_GATE=1` is effective on the NEW production deployment; confirm operator authority and OpenAI model credentials without displaying tokens.
5. Only then, with the owner's budget approval, enable the failover flag in a separate deployment; verify the next ordinary scheduled call and reservation/cost ledger, using a no-automatic-replay policy for missed runs. Turn the flag off and redeploy if there is any ambiguity.
6. An exact invoice reconciliation/status UI and a secure, attested Ollama broker remain future improvements. This change is limited to the shared conservative reservation ceiling.
