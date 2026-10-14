/** Allow only known internal post-auth destinations. Never redirect to caller URLs. */
export function safeAuthDestination(value: string | null | undefined): string {
  if (!value) return '/atlas'
  // Explicit destinations, rather than arbitrary relative paths, prevent
  // open redirects and unreviewed privilege-sensitive navigation.
  if (value === '/atlas' || value === '/organization' || value === '/viewer/handlarborsen') return value
  return '/atlas'
}
