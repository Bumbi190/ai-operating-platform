# Atlas / Nova voice: complete Claude prompts, bounded speech and faster handoff — 2026-10-28

## Bug and root cause
- Owner reported that a spoken request to plan workflows and receive a prompt for Claude produced **truncated written output**. That is unacceptable: copied prompts must be complete.
- The real `POST /api/chat` route previously always used `max_tokens: 150` for every voice turn and appended `VOICE_DIRECTIVE` forcing at most two sentences, regardless of whether the request was an executable work plan, a long Markdown deliverable or routine small talk.
- The client streamed all assistant text to the PCM speech player, which would also read Markdown/code if the response were simply lengthened.

## Implemented fix
1. Pure `needsCompleteVoiceDocument(text)` classifier (shared server and client) flags **explicit** requests for Claude prompts, written workflow plans, specifications and copyable implementation instructions; it does not flag ordinary questions, read operations or workflow starts.
2. For those **writing-only** voice turns the server uses a distinct directive: one complete short sentence, blank line, then the full Markdown/code/prompt for chat, with a bounded 3,200-output-token maximum. Ordinary speech keeps the original two-sentence directive and 150-token budget.
3. All long voice-document turns have a narrow **read-only** tool allowlist, instead of treating the word "workflow" as authorization to execute. No workflow creation, sending mail, publication, code edits or other state-changing action may happen because the operator asked for a Claude prompt.
4. `completeVoiceDocumentOpening` queues only one short spoken first sentence to ElevenLabs. All other streamed content is written to the chat and saved; code fences/Markdown are never narrated. If the model starts with Markdown or fails to give a complete opening sentence, Nova speaks a fixed short statement saying the full underlay is in the chat.
5. Expanded Atlas call chat gains **"Kopiera hela svaret"** on each completed assistant message. It copies the full written response, not the one-sentence TTS summary. The compact call dock still has only three buttons.
6. The route recognizes `stop_reason: 'max_tokens'` and marks the result **incomplete** with an explicit warning rather than making the user trust a clipped Claude prompt. The next owner voice turn `Fortsätt` qualifies as a document continuation only when the immediately preceding assistant text contains that precise warning.
7. Complete document replies await the existing owner-bound DB message insert before `done`. If saving fails, the streamed response tells the owner to copy before leaving. Normal quick voice replies retain the previous nonblocking persistence path.
8. Existing live speech end-of-turn silence reduced from **1,400 ms to 1,200 ms**, a potential 200-ms improvement in listening→transcription handoff. Does **not** change Silero thresholds, echo cancellation, microphone selection, interruption rules, Eleven v4 model, TTS pricing or security. Isolated voice trials retain the previous 1,400-ms default.

## Related but separate scope
- True remote web visual inspection, per-project GitHub code access and guarded small source edits are tracked in **GitHub issue #576**. Existing broker trusts only Omnira's repository; it must not be broadened without per-repo verification and owner-scoped approvals. ChatGPT plugin connections do not automatically authorize Nova's deployed backend.
- Runtime logs before this patch showed ElevenLabs speech headers typically arriving after about 0.9–1.1s. The 200ms local silence reduction is a modest safe change, not a claimed measured end-to-end improvement. The production end-to-first-audio metric should be compared before/after in a real browser call.

## Verification contract
- Tests cover explicit vs ordinary document intent, bounded budgets, only a complete spoken opening, Markdown/code refusal in TTS, incomplete warnings + safe continuation, copy action in expanded panel, no new dock controls, and real `POST /api/chat` prompt/tool routing.
- No automated test can guarantee the model will always finish a requested large prompt within a finite output cap; a length-stop must always be labelled incomplete and the continuation path remains available.
- Owner should test 1) an ordinary two-way voice question; 2) `Nova, skriv en komplett Claude-prompt för ett Handlarbörsen-workflow`; 3) short spoken sentence + full text, 4) copy the resulting prompt, 5) `Fortsätt` when warned, 6) headset interruption and navigation still work.
