# Fresh final review — c23dd670251d65ee5e9e794a11b9c783cc2b1ebd

Reviewer: fresh gpt-6-astra, read-only, one whole-branch review. Verdict: With fixes. No Critical issues.

Important findings accepted by executor:

1. Studio removes only ask_manager from the tool schema; global run_media_step remains available and dispatches provider/media cron work without the selected project. Add an explicit Studio capability set and enforce it in dispatch, preserving ordinary operator chat.
2. Studio first-create clears its original draft and relies on session storage, while useComposerDraft refuses >8000 characters. New projects missing a budget get no initialTurn, so long briefs or storage-write failures lose the original idea. Carry the brief in memory; prove 8001 characters and unavailable storage without paid replay.
3. StudioBudgetForm hides its form after configuration and always submits expectedMonthlySek:null. Accepted zero/insufficient limits cannot be corrected. Add explicit editing, prefill and CAS from the captured current amount; prove zero-to-usable and stale-edit refusal.

Minor deferred: selecting an older Preview revision/page, opening Files/Desktop and returning remounts the pane at active/default. Rendered-revision acknowledgement remains authoritative. Continuity can be improved later.

Reviewer set aside actual runner/folders/junction verification/desktop/native maintenance; image input/generation/fullstack relay/workforce; domains/payments/permanent deletion; physical microphone and signed-in production proof; unrelated baseline/incoming PR344; and production apply/merge/deployment. Executor rules on each in the authoritative ledger and validation report. Normal protected release remains authorized and must be verified.

All five requested focus areas had substantive coverage. Existing owner/linkage checks, project-first archive/write serialization, canonical admission checks, actual claim comparison and honest test limitations were noted as strengths. No extra tests or production changes were claimed by the reviewer.
