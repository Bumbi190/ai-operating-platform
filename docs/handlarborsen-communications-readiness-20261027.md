# Atlas communications readiness — Handlarbörsen + The Prompt + Familje-Stunden
Date: 2026-10-27 (Europe/Stockholm). Evidence from read-only Supabase/Vercel metadata and local Desktop Commander checks. No private message bodies, credentials, provider tokens or real customer lists included.

## Scope
Owner goal: Atlas should **read and triage** Strato replies, keep The Prompt/Family existing content pipelines available, and prepare Handlarbörsen LinkedIn materials for **manual** operator posting while the Page API connection is pending. Customer acquisition from SCB belongs to the separate SCB worktree; this branch cannot authorise outreach.

## Verified production facts (read-only)
### Strato / Atlas Sales — NOT operationally verified for live reading
- `sales_mailbox_connections`: Handlarbörsen status `authenticated`; SMTP and IMAP last authenticated 2026-10-17 UTC.
- `sales_inbox_configs`: state `enabled`, last successful sync 2026-10-19 14:18 UTC; nine stored message records. A stored inbox is NOT evidence that today's incoming mail is being read.
- `sales_worker_registrations`: last reported worker expired 2026-10-20, last seen 2026-10-19. `sales_host_events`: no event in last 24 hours.
- Windows Scheduled Task `Omnira-Sales-49d30271-cf0b-47c9-a70d-2bce5b9b09ba`: `Ready` (not Running), last run 2026-10-18. No verified worker process running at audit time.
- Vercel `ai-operating-platform-web`: `ATLAS_SALES_ENABLED` and `ATLAS_SALES_PROJECT_ID` are listed only for Preview branch `codex/atlas-harvey-sales-20261017`, **not production**. Presence of production Sales tables does not imply the Sales API is active on the live site.
- Existing Sales branch `atlas-harvey-sales-20261017` already contains scoped IMAP inbox, mailbox connection, reading, reply review, worker APIs and audited send protocol. Reuse these; do not create a competing mail client.
- `sales_send_jobs` has one historical `smtp_accepted` record (not proof of final delivery) and `sales_reply_jobs` has one `awaiting_review` record. There are no draft preparation jobs in the queried `sales_jobs` table.
- **Do NOT simply start the scheduled task.** First audit its current configuration and potentially queued work. Restarting an old worker may attempt side-effecting actions. A safe preflight needs to verify valid nonexpired registration, exact project scope, matching build/deployment, IMAP-only dry-read capability and disabled send execution.

### Social accounts — credential bindings verified, outcomes tracked separately
- The Prompt `ai-media-automation`: FB `The Prompt`, IG `theprompt.news`, YT `The Prompt`; account credential health `ok`, identities verified by provider at 2026-10-27 ~06:15 UTC. The Prompt uses its own `media_scripts` publishing pipeline: 300 historical published video records, 11 in last 7 days, latest 2026-10-26 ~18:00 UTC. This pipeline MUST NOT be replaced by the generic social-content publisher.
- Familje-Stunden: Facebook and Instagram credential health `ok`, identities verified 2026-10-27 ~06:15 UTC. Eighteen jobs queued per channel starting November; independent `social_publications` journal contains one Instagram `uncertain` from 2026-10-23. Preserve its original intent and reconcile read-only; never auto-retry an uncertain provider POST.
- FS Pinterest: planning/OAuth adapter exists in Omnira but no verified Pinterest binding or deployed Vercel `PINTEREST_CLIENT_ID`/`PINTEREST_CLIENT_SECRET` metadata was seen. **Do not claim Pinterest access.** A separate app configuration + owner OAuth/board approval step is needed.
- Handlarbörsen LinkedIn: no provider account binding or LinkedIn app environment config yet. Existing `social_content_posts` contains 2 post records, `social_content_revisions` 6 versions with `draft.channel='linkedin'`. There are 0 editorial `social_content_decisions` for the project. Nothing was published on LinkedIn by this branch.
- All channel connections are project-scoped; a healthy The Prompt credential cannot be used for Family or Handlarbörsen.

## Work added in parallel distribution branch
Git branch: `feat/hb-distribution-20261027` (separate from SCB and Atlas Sales worktrees).
- Existing `apps/web/lib/social-launch/content/atlas-tools.ts` already exposes `get_social_content` and `propose_social_content` to the Atlas chat. Extended its guide with the **Handlarbörsen LinkedIn manual-mode policy** and with explicit Strato-freshness and SCB-outreach cautions. No new paid model or publication tool.
- `apps/web/lib/handlarborsen/distribution/manual-linkedin.ts` creates approved-copy material from the exact immutable reviewed revision; rejects missing/changed editorial approval, wrong channel and unsafe URL. A copy is never recorded as published. Media filenames are safe, MIME-approved and separate.
- `apps/web/components/social-launch/SocialContentPanel.tsx`: LinkedIn section with one-click approved text copy and links for download of the previously stored authorised media (when approved). UI never performs a LinkedIn or third-party POST. The existing Facebook/Instagram publication panel is not displayed on LinkedIn (or other unsupported channel) drafts, preventing an incorrect Facebook destination from appearing.
- Existing pure `apps/web/lib/handlarborsen/distribution/funnel.ts` remains offline: verified/partial/unavailable evidence is distinct, and conversion metrics never derive from missing evidence.

## Safe work sequence after code review
1. **Manual LinkedIn:** merge/release this separate change after review, exact-head CI and relevant preview checks. Open `/projects/handlarborsen/social#content`. Ask Atlas to draft specific factual content with `propose_social_content` and reuse project media. Approve actual revision, copy, download media, then post manually. Store or send the actual live post URL for later manual receipt verification; do not claim the clipboard click was a send.
2. **Strato recovery:** finish independent Atlas Sales branch release review; verify Preview and owner access; read-only inspection of configured service, active workers, credentials and any pending send/reply jobs; repair/re-enrol the worker if needed, with **send disabled initially**; run an IMAP read-only probe and verify a newer `last_synced_at`; only then consider production Sales activation and human-reviewed reply drafts. The old test statuses do not demonstrate current access.
3. **The Prompt:** keep existing publishing machine and project credentials; monitor fresh media publish records, channel-specific failures and unexpected provider disconnects. Do not move the media pipeline into Sales/Lead Finder.
4. **Familje-Stunden:** leave its already-approved social batches untouched. Reconcile uncertain Instagram receipt before any retry; connect Pinterest later through explicit owner-authenticated OAuth and verified board. Preparation is not publication.
5. **SCB Handlarbörsen:** wait for the SCB workstream's contract/relevance/suppression checks, full old-outreach exclusion list, legal review and manual approval. Only reviewed legal entities enter Sales for draft consideration; never automatic cold emailing from the SCB CSV.
6. **Future real conversion metrics:** resolve Handlarbörsen source-of-truth dealer registrations, approval and first listing; match scoped company cohorts to reviewed contact and reply evidence. Keep missing/partial counts distinct from verified zero. Never treat SMTP accepted as delivered or registered as active dealer.

## Security and operational notes
- No secrets, person numbers, private messages or raw SCB exports were copied or committed.
- No API outbound sends, automatic posting, DB writes, migrations, environment variable changes, worker restarts, feature activation or production deployment were performed by this workstream.
- This status snapshot **ages**. Live readiness must be re-read before claiming Strato is operational or publishing is ready.
