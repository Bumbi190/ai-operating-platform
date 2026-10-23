/**
 * A voice orphan may incur ElevenLabs/Ideogram costs and must never be
 * backfilled just because its opt-in flag was switched on.
 *
 * The activation requires a separate absolute UTC lower bound. This makes the
 * paid scope explicit and prevents old missed publishing slots from silently
 * entering a new provider-spending queue. Missing/malformed/future bounds
 * refuse recovery; harmless candidate observation may still run.
 */
export function validatedVoiceOrphanRecoveryStartAt(
  value: string | undefined,
  now: Date,
  minimumAgeMs = 10 * 60_000,
): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return null
  }
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  const canonical = new Date(ms).toISOString()
  const expected = value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')
  if (canonical !== expected) return null
  // A lower bound that is too new cannot yet contain an eligible orphan.
  if (ms >= now.getTime() - minimumAgeMs) return null
  return canonical
}
