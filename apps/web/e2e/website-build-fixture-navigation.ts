import { useSyncExternalStore } from 'react'
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback) }
export function usePathname() { return useSyncExternalStore(subscribe, () => '/projects/test-project/build/' + new URL(location.href).searchParams.get('session'), () => '/') }
export function useRouter() { return { push: (url: string) => location.assign(url), replace: (url: string) => location.replace(url) } }
