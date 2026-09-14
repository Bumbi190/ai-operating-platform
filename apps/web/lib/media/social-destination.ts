/**
 * lib/media/social-destination.ts — whose content the platform's machine
 * publishers may post.
 *
 * CREDENTIALS BELONG TO THE CONTENT'S OWN PROJECT (project-scoped social
 * credentials, 2026-09-14). Every publisher is handed a credential resolved through
 * the script's own project's verified account binding (lib/media/social-credentials.ts:
 * Project → Platform → Verified External Account → Credential). No publisher reads an
 * environment token or falls back to a default project, so no project's content can
 * reach another project's account, whatever this constant says.
 *
 * PUBLISHING AUTHORITY IS UNCHANGED. This constant still decides whose content is
 * published at all, and posting is destination authority (9X; 9J: authorise the
 * destination, not just the source):
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
