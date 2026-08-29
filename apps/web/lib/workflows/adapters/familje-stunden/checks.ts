/**
 * The Familje-Stunden check catalogue: what may be verified, where, and by whom.
 *
 * Every entry states its allowed PROVENANCE, and that is the point of the file.
 * Two rules, applied per check rather than globally:
 *
 *   attested-only   the artefacts are not reachable from a serverless runtime.
 *                   ffprobe on a hero video, PDF geometry, nineteen files on
 *                   disk, `node --test`, `tsc`, a production build. Omnira can
 *                   never observe these, so it accepts a producer's statement.
 *
 *   automated-only  Omnira observes it directly over the network. Accepting an
 *                   attestation for the anonymous-denial probe would replace a
 *                   fact we can check with a claim we cannot — a downgrade
 *                   wearing the same colour.
 *
 * No check allows BOTH today. If one ever should, that is a deliberate decision
 * to write down here, not a default to fall into.
 *
 * OMNIRA DOES NOT IMPLEMENT ANY OF THIS QA. The runbook owns the logic —
 * speech-rate bands calibrated on the previous month, MediaBox geometry, the
 * completeness proof comparing full-MP3 speech time against the sum of the page
 * clips. Omnira receives the RESULT and verifies its binding and provenance.
 * A `description` here is a label for a human, never a specification.
 */

import type { AttestableCheck } from '@/lib/workflows/attestation'

/** Claims about built files. Rebuilding must invalidate them, so they bind the manifest. */
const artifactCheck = (
  check_key: string, state: string, description: string,
): AttestableCheck => ({
  check_key, state, description,
  allowed_provenance: ['attested'],
  binds_artifacts: true,
})

/** Claims about the repository at a commit rather than about artefacts. */
const repoCheck = (
  check_key: string, state: string, description: string,
): AttestableCheck => ({
  check_key, state, description,
  allowed_provenance: ['attested'],
  binds_artifacts: false,
})

/** Something Omnira observes itself. An attestation is not accepted. */
const observedCheck = (
  check_key: string, state: string, description: string,
): AttestableCheck => ({
  check_key, state, description,
  allowed_provenance: ['automated'],
  binds_artifacts: false,
})

export const FAMILJE_STUNDEN_CHECKS: readonly AttestableCheck[] = [
  // ── Content and artefacts ────────────────────────────────────────────────
  artifactCheck('story_page_count', 'content_generation',
    'The storyboard yields exactly the canonical number of page texts'),
  artifactCheck('hero_video_spec_ok', 'visual_generation',
    'Hero video matches the declared codec, dimensions, frame rate and duration'),
  artifactCheck('hero_audio_stream_count_zero', 'visual_generation',
    'Hero video carries no audio stream'),
  artifactCheck('pdf_page_count', 'pdf_build',
    'Each built PDF has the expected page count and page geometry'),
  artifactCheck('ebook_page_count', 'ebook_build',
    'Ebook page images match the canonical count with no letterboxing'),

  // ── Local audio QA ───────────────────────────────────────────────────────
  artifactCheck('audio_file_count', 'local_qa',
    'All expected audio files are present, correctly named and ordered'),
  artifactCheck('audio_decode_ok', 'local_qa',
    'Every audio file decodes without truncation'),
  artifactCheck('audio_page_mapping_ok', 'local_qa',
    'Full recording and page clips carry the same speech content'),

  // ── Upload preflight ─────────────────────────────────────────────────────
  artifactCheck('artifact_manifest_complete', 'protected_upload',
    'Local artefact path set matches the manifest in both directions'),
  artifactCheck('protected_upload_preflight_passed', 'protected_upload',
    'Offline upload preflight passed with no network call'),

  // ── Repository gate ──────────────────────────────────────────────────────
  repoCheck('static_tests_passed', 'frontend_deploy', 'Static test suite passed'),
  repoCheck('typecheck_passed', 'frontend_deploy', 'Typecheck passed with no errors'),
  repoCheck('production_build_passed', 'frontend_deploy', 'Production build completed'),
  repoCheck('local_diff_scope_passed', 'frontend_deploy',
    'The change touches only the intended scope'),

  // ── Observed by Omnira, never attested ───────────────────────────────────
  observedCheck('anonymous_protected_access_denied', 'approval_release',
    'Unauthenticated callers are refused by every protected endpoint'),
  observedCheck('release_instant_computed', 'planning',
    'The requested release instant, computed from the calendar and the zone'),
]

const BY_KEY = new Map(FAMILJE_STUNDEN_CHECKS.map(c => [`${c.state}:${c.check_key}`, c]))

/** The declared check for a (state, check_key), or null when undeclared. */
export function findCheck(state: string, checkKey: string): AttestableCheck | null {
  return BY_KEY.get(`${state}:${checkKey}`) ?? null
}

/** Which states gain local evidence coverage at all. */
export function attestableStates(): string[] {
  return [...new Set(
    FAMILJE_STUNDEN_CHECKS
      .filter(c => c.allowed_provenance.includes('attested'))
      .map(c => c.state),
  )].sort()
}
