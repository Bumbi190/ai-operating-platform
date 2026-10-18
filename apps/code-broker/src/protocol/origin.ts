/** Shared broker origin policy. No signed request may follow a redirect. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function assertBrokerOrigin(origin: string): URL {
  let url: URL
  try { url = new URL(origin) } catch { throw new Error('invalid operational origin') }
  const loopback = LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('operational origin must be https (http is allowed only for loopback development)')
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('operational origin must be a bare origin')
  }
  return url
}
