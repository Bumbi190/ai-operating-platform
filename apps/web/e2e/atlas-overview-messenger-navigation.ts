import { useSyncExternalStore } from 'react'
let refreshVersion=0
export function useFixtureRefreshVersion(){return useSyncExternalStore(subscribe,()=>refreshVersion,()=>0)}
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
  const query = useSyncExternalStore(
    subscribe,
    () => location.search,
    () => ''
  )
  return new URLSearchParams(query)
}
export function useRouter() {
  const push = (url: string) => {
    history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
  return { push, replace: push, refresh: () => { refreshVersion++; (window as any).fixtureRefreshes=refreshVersion; window.dispatchEvent(new PopStateEvent('popstate')) } }
}
