/** User-directed, same-origin navigation without an AI round trip.
 *
 * This is deliberately a tiny, exact allowlist. It cannot open external URLs,
 * interpret instructions in page content, send messages, schedule anything, or
 * mutate state. Requests with extra clauses fail closed to Atlas's normal
 * authenticated conversation and existing approval/tool pathway.
 */
export type DirectVoiceNavigation = Readonly<{ href: string; reply: string }>

const KNOWN_ROUTES: Readonly<Record<string, DirectVoiceNavigation>> = Object.freeze({
  kalender: { href: '/calendar', reply: 'Öppnar kalendern.' },
  kalendern: { href: '/calendar', reply: 'Öppnar kalendern.' },
  'omniras kalender': { href: '/calendar', reply: 'Öppnar kalendern.' },
  'kalendern i omnira': { href: '/calendar', reply: 'Öppnar kalendern.' },
  'kalendern i om era': { href: '/calendar', reply: 'Öppnar kalendern.' },
  'kalendern i omira': { href: '/calendar', reply: 'Öppnar kalendern.' },
  atlas: { href: '/atlas', reply: 'Öppnar Atlas.' },
  omnira: { href: '/atlas', reply: 'Öppnar Atlas.' },
  'atlas i omnira': { href: '/atlas', reply: 'Öppnar Atlas.' },
  planering: { href: '/planning', reply: 'Öppnar planeringsöversikten.' },
  planeringen: { href: '/planning', reply: 'Öppnar planeringsöversikten.' },
  projekt: { href: '/projects', reply: 'Öppnar projekten.' },
  projekten: { href: '/projects', reply: 'Öppnar projekten.' },
  marknadsgranskning: { href: '/atlas/marketing', reply: 'Öppnar marknadsgranskningen.' },
})

export function directVoiceNavigation(text: string): DirectVoiceNavigation | null {
  if (typeof text !== 'string' || text.length > 170) return null
  const cleaned = text.toLocaleLowerCase('sv-SE').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const match = cleaned.match(
    /^(?:(?:hej|halla)\s+)?(?:nova[,:]?\s+)?(?:(?:kan|skulle|vill)\s+du\s+)?(?:oppna|visa|ga\s+till|ta\s+mig\s+till|navigera(?:\s+mig)?(?:\s+till)?)\s+(.+)$/,
  )
  if (!match) return null
  return KNOWN_ROUTES[match[1].trim()] ?? null
}
