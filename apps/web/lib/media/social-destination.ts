/**
 * lib/media/social-destination.ts — which project the platform's social
 * channels belong to.
 *
 * The media publishers post with the PLATFORM's credentials, not the script's:
 * instagram.ts and facebook.ts read INSTAGRAM_ACCESS_TOKEN and
 * FACEBOOK_PAGE_ACCESS_TOKEN (which cron/publish refreshes from the default
 * social project's platform_tokens rows), and youtube.ts uses the platform's
 * YouTube OAuth client. token-store.ts binds those credentials to exactly one
 * project, The Prompt, and /api/media/token lets only that project's owner
 * replace them.
 *
 * So a post's destination is not "wherever the script lives". It is this one
 * project's accounts, and posting there is platform destination authority
 * (9X; 9J: authorise the destination, not just the source):
 *
 *   • a person needs platform operator authority (publish/instagram, breaking);
 *   • a machine principal — the schedule, pipeline-retry, a bounded breaking hop —
 *     may post only THIS project's content (Phase 9AC, closure audit #6 A6-3).
 *     Another tenant's approved video is theirs, not the platform's to post.
 *
 * Deliberately NOT derived from MEDIA_PIPELINE_PROJECT_SLUG or
 * PLATFORM_COMPAT_PROJECT_SLUG. Those are BILLING attribution and happen to be
 * the same slug today; authority is never derived from billing.
 */

/** The platform social project: owner of the Instagram, Facebook and YouTube channels the publishers post to. */
export const PLATFORM_SOCIAL_PROJECT_SLUG = 'ai-media-automation'
