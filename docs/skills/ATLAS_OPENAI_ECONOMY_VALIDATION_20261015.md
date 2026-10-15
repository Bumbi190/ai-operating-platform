# Atlas OpenAI economy test profile — 2026-10-15

André requested OpenAI and any genuinely available local models during testing because Anthropic API credits are insufficient. Reuse the existing configured OpenAI key. No new key, account, budget or credit purchase is requested.

## Behavior
- Set server environment ATLAS_MODEL_PROFILE=openai_economy to use GPT-5.4 mini for Atlas chat (including Studio) and website generation/feedback interpretation. Unset the variable or set standard to restore previous routing.
- Chat fails closed when the selected OpenAI key is absent or the profile is invalid; there is no automatic Claude fallback.
- The website worker chooses the effective model at execution while preserving saved agent model/config, design skills, plan approval, governance checkpoints and ownership. Other workflow types keep their configured models. This is an explicit temporary runtime override; the protected cost snapshot and Studio cost panel identify it.
- The same OpenAI adapter handles tools, images, conversation history and streamed text. Only complete tool arguments reach the existing tool executor; unknown, truncated or filtered calls fail without retry.
- GPT-5.4 mini uses max_completion_tokens and reasoning_effort=none, omitting legacy sampling parameters. Existing text models retain their request shape.
- OpenAI streams now request usage and keep the original spend meter/reservation alive until consumption ends. Real complete usage is settled exactly once; missing/interrupted usage retains the conservative ceiling. The physical-request watcher, stop authority, dispatch error classification and SDK retry policy are retained.
- Prices: standard API input USD0.75/output USD4.50 per million tokens; context400000. Pricing and ceiling use the same book. Cached input is conservatively priced as uncached.
- Local: no response at Hultgren's standard loopback Ollama endpoint and no Ollama/Codex command found on PATH. This does not prove no model is installed elsewhere. No authenticated local inference bridge is implemented in this change; localAvailable remains false.

## Sources
- https://developers.openai.com/api/docs/models/gpt-5.4-mini — model, prices,400000 context, supported none effort.
- https://developers.openai.com/api/docs/api-reference/chat/create — completion cap and streamed usage contract.
Fetched official documentation2026-10-15. Existing repo SDK predates none effort; the compatibility type extends that single field, retaining the rest of the SDK request contract.

## Validation
RED: real chat POST still required Claude and fell back to it despite an OpenAI-only profile; modern runner cap absent; cost profile absent; stream reservation settled at handle return without actual usage.
Current bounded checks:203 assertions across9 files pass, including real route bindings, stream durable metering, maximal-price ceiling, unchanged normal Atlas behavior and in-flight execution authority. Workspace TypeScript passes.
SQL worker:16 existing scenarios pass. New economy scenario initially used the wrong fixture model expectation; now compares the saved model before/after execution. Final result, browser CI, independent review and production evidence will be recorded in the PR.
No live OpenAI generation has been invoked during implementation. No schema migration, stored-agent update or budget change.
