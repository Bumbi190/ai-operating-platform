/** Pure navigation adaptation. The same Sidebar renders for both roles.
 * Destinations are routes, never an authority grant. Middleware and endpoint
 * gates independently authorize every read and write. */
export function collaboratorNavHref(original: string): string {
  if (original === '/atlas' || original.startsWith('/atlas?')
    || original === '/chat' || original.startsWith('/chat/')) return '/organization/atlas'
  if (original === '/projects' || original.startsWith('/projects/')) return '/organization'
  if (original === '/approvals') return '/organization/reviews'
  return '/organization'
}
