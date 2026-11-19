# The Prompt – Theprompt.nu daily article recovery (2026-11-20)

## Incident evidence

- Site responds and RSS is live, but the most recent verified public RSS article is
  dated **11 August 2026**.
- Omnira System A website_content contains 16 published records and 6 historical
  pending_review drafts; the last new draft was created **27 August 2026**.
- System B video/social cron recovered on 19 November; it is NOT the website lane.
- News Hunter continues saving new media_news_items daily, but there was **no
  pg_cron job** targeting the existing System A article-generator endpoint.
- Do **not** automatically approve or regenerate the six historical drafts.
  One pending_review row already has a destination URL and old published_at:
  publication reconciliation is required.

## Scoped repair

New CRON_SECRET-protected route:
GET /api/content/articles/cron/daily

- Daily, one project only: slug ai-media-automation; never Family-Stunden,
  GainPilot, Handlarbörsen or another tenant.
- Select only fresh (up to 36 hours), unscripted official-source news items with
  a public HTTPS URL. Never backfill historical news.
- Require Hermes to retrieve full primary-source text of >=150 words before
  paying any AI provider. No weak-summary article is published.
- Insert a unique non-reviewable reservation into website_content BEFORE
  Sonnet generation; external_id deterministically keys off source news ID.
- Use existing Article Writer, structural/copyright/slop QA and System A
  persistence. New independent Haiku factual reviewer checks headline,
  numbers, events, names and source attribution against the original text.
- Source ambiguity, bad model output, low QA confidence or failure => the
  item stays in Atlas review; no automatic publishing.
- Optional production gate THE_PROMPT_ARTICLE_AUTOPUBLISH_ENABLED=true allows
  a full independent-fact-checked article to publish through the EXISTING
  the-prompt destination RPC, with a verified URL receipt. The default is OFF.
- Prevents duplicate spend from simultaneous cron requests for the same
  article by a unique external_id reservation, and avoids more than one
  new article attempt per UTC day.
- No fallback to writing news as a social video; V3 PR #558 is separate.

## Validation and release

1. Run unit tests for daily editorial selection, factual verdict parsing,
   release gating and destination URLs.
2. Run TypeScript typecheck and full CI. Fix every failure on this branch.
3. Deploy the route but **do not yet schedule** it until production is READY.
4. Authorised manual dry run:
   GET /api/content/articles/cron/daily?dry_run=1
   with server-side Authorization: Bearer CRON_SECRET.
   The response must say eligible_for_editorial_attempt, a narrowly scoped
   refusal, or article_already_attempted_today; dry run neither spends
   credits nor creates content.
5. After the dry run, add ONE pg_cron task (daily AFTER News Hunter):

       select cron.schedule(
         'omnira_theprompt_website_daily',
         '45 7 * * *',
         $$select omnira_cron.call_vercel('/api/content/articles/cron/daily');$$
       );

   Time is UTC. 07:45 UTC corresponds to 08:45 Swedish winter time.
   Do NOT also create an overlapping Vercel cron.
6. First actual execution is limited to generating one NEW article and
   holding it in Atlas; independent factual verdict and costs are inspected.
7. Verify destination credentials remain configured. Enable the explicit
   auto-publish feature flag only once first end-to-end release with
   independent review, direct receipt AND RSS/site visibility is confirmed.
8. Subsequent daily runs require both an authenticated destination response
   and a public RSS/website reconciliation check; stop on discrepancy.

## Rollback / controls

- Disable pg_cron: select cron.unschedule('omnira_theprompt_website_daily');
- Set THE_PROMPT_ARTICLE_AUTOPUBLISH_ENABLED=false in production Vercel env.
- Never retry a possibly published external RPC blindly. The destination
  publish_article RPC is idempotent on external_id, but reconciliation is
  still required before retrying an ambiguous operation.
- Preserve all six old pending drafts and any preexisting published content.
- Review the one stale pending row with an old destination URL separately.

## Other task: The Prompt V3 voice continuity

The user's approved existing narrator is **ElevenLabs Victoria**:
voice id qSeXEcewz7tA0Q0qk9fH, eleven_turbo_v2_5.
V3 must reuse the existing governed voiceover-with-timestamps function.
No paid narration or V3 publication is part of this website cron change.
