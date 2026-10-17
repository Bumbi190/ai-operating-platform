# Global voice entry correction — 2026-10-17

The operator's 11:27 phone screenshot shows repeated transcript fragments in the floating Atlas chat on Overview. The initial production release connected only the two Atlas home entries to /atlas/rost. The persistent runtime's activate() still started continuous browser SpeechRecognition, so the floating panel and Alt+Space bypassed the accepted ElevenLabs conversation. This was a rollout wiring omission. The new PCM/Scribe conversation does not use browser SpeechRecognition.

The authenticated shell now passes its server-owned conversation release gate into the persistent runtime. Its common activation closes old capture/output and opens /atlas/rost before any legacy recognizer starts. Known collaborator read-only state prevents both activation paths. Endpoint identity, operator, membership, Origin and cost checks are unchanged and remain authoritative. No URL, local storage or client role claim enables the server gate.

The floating panel hides on the voice page while its text draft stays mounted for return navigation. Typed chat and explicit utterance-to-draft capture are unchanged. The legacy fallback is retained only when conversation availability is absent; this is covered separately.

Regression: the real runtime unit reproduction failed four cases before implementation (one legacy fallback passed). The corrected native fixture failed all five cases before implementation: panel and Alt+Space at 390/1280 widths, plus read-only activation. Native cases await a mounted/focused panel before firing the shortcut, so early events cannot pass vacuously. An initial fixture edit did not apply because of CRLF and is not the final native RED evidence.

Verification, independent review, exact commit and production receipt are recorded in the fixing PR and continuation ledger. No provider probe or paid call is required for this routing correction. The preceding release's 29/29 actual Web Audio/worklet/Silero tests remain its voice-engine evidence; this delta tests global entry, draft preservation, messenger and home interactions.
