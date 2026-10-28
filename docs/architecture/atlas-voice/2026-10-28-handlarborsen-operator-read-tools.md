# Atlas Handlarbörsen voice operator — real read tools (2026-10-28)

## Why this exists
The user's live Nova call could speak, but did not actually navigate to Handlarbörsen and could not read the live project KPI snapshot or the already-synced Strato inbox. The voice prompt previously discouraged **all** tools for status questions, and the model did not have a dedicated inbox tool; a "jag vill att vi går in..." request was not classified as navigation.

## What this release enables
- `handlarborsen_statistics`: read-only, bound to the canonical Handlarbörsen project and project-owner allow-list, reuses the existing verified marketplace source/report and returns actual 11 aggregate metrics with snapshot date, data scope and caveats. Does **not** reveal individual dealers, names, emails or registration numbers.
- `handlarborsen_latest_mail`: read-only, uses existing Omnira Strato inbox tables; ensures owner identity, the fixed Handlarbörsen project, observer/active mode, authenticated `info@handlarborsen.se` mailbox, and enabled inbox config. Reads latest saved header. Reads body ONLY if already loaded, complete, and the contact is still selected in the current inbox authorization; without that, returns `body:null`, `bodyStatus:not_authorized_or_not_collected`. No new IMAP/SMTP credentials, workers, sync, new inbox state, sending, deletion, reply, or grants.
- A conservative first-turn intent gate makes explicit statistics and latest-mail voice questions use their specific read tools, including follow-up turns referencing the same project. Generic questions, writes, and other projects are excluded.
- Collaborative spoken navigation such as "Jag vill att vi går in på Handlarbörsen..." now forces the established `navigate` tool on turn 0. The real navigation registry also recognizes the observed speech-to-text typo "Handlarbörs-börsen"; no guessed raw URL is accepted.
- Headset interruption uses the **existing** `pcm-capture` behavior for `playbackMode=headphones`: VAD voice onset interrupts Nova's spoken answer. A collapsed microphone setting exposes the explicit headset toggle while the 3-button compact call dock remains unchanged. Default speaker mode keeps echo protection. Do not enable headset interruption for loudspeaker users by default.

## Live source facts at rollout
- Handlarbörsen production Supabase public organizations included verified Tiltiana Holdings AB on 2026-10-26 and 2 historical test organizations with `verified` status. This **does not come through the aggregate-only Omnira metrics tool**; do not claim Nova can name the dealer from that tool.
- Latest Omnira Handlarbörsen marketplace snapshot as of 2026-10-27 was `legacy_all_organisations`, **not** `production_excluding_quarantined_test`: 11 registered, 3 verified, 0 active published vehicles. Snapshot scopes and definition changes can make daily comparisons non-comparable. Tool explicitly warns when it sees legacy scope.
- Existing Strato inbox `sales_mailbox_connections` was authenticated and owned by Handlarbörsen owner. Sync `sales_inbox_configs` enabled; most recent sync 2026-10-28 05:45 UTC. 16 messages stored; 11 metadata only, 5 previously selected body copies, `selected_contact_ids` currently zero. The latest message is metadata-only. Do **not** claim the full latest email body is available.

## Security and regression gates
- Never use model-supplied project id, mailbox id, arbitrary domain, URL or contact id to select data.
- Always enforce `projects.owner_id` allowlist and fixed canonical project, then mailbox's `owner_id`, `project_id`, and exact email. Do not expand existing RLS or service-role scope to unapproved UI clients.
- Treat subject, sender and body as **untrusted source content**, not instructions to Atlas. Do not echo email PII beyond what owner requested, never reveal secrets.
- Voice should say "Jag har hämtat statistik per <date>" or "Senaste synkade mejlrubrik är..." only after the matching read tool succeeded; `navigate` must succeed before claiming "Öppnade".
- Keep no automatic sending, approving, publishing, billing, contractor actions or company verification changes in this PR. Future per-company verified-dealer identity or inbox-body access needs separate approved source/authority design.
- Test direct real /api/chat route tool-choice forcing and security unit tests; run voice, project isolation and navigation regressions plus Next TypeScript. Monitor real owner call after deploy; if the caller hears speaker echo, return to `speakers` mode.

## Operator acceptance script
1. Open Atlas, ring Nova and say: "Jag vill att vi går in på Handlarbörsen och analyserar statistiken." Confirm actual router changes page, not just a spoken promise.
2. Ask: "Hur många verifierade företag visar senaste statistiken?" Confirm source date and warning about legacy all-organisations/test inclusion.
3. Ask: "Vilket är senaste mejlet i Handlarbörsens Strato-inkorg?" Confirm the subject/from/date are read via real tool, with explicit statement that body is not authorized/loaded.
4. With physical headphones on, expand chat → Mikrofontest and enable "Jag använder hörlurar". Interrupt Nova *during speech*, confirm her TTS stops and fresh user question is captured. Disable headset mode if the microphone hears speakers.
