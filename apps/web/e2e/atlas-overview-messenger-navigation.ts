import { useSyncExternalStore } from 'react'
const subscribe = (f: () => void) => {
  window.addEventListener('popstate', f)
  return () => window.removeEventListener('popstate', f)
}
export function usePathname() {
  return useSyncExternalStore(
    subscribe,
    () => location.pathname,
    () => '/dashboard'
  )
}
export function useSearchParams() {
  return new URLSearchParams(location.search)
}
export function useRouter() {
  const push = (url: string) => {
    history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  return { push, replace: push, refresh: () => {} }
}
