import { useSyncExternalStore } from 'react'
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback) }
export function usePathname() { return useSyncExternalStore(subscribe, () => { const q=new URL(location.href).searchParams;return q.has('conversation')?'/chat/'+q.get('conversation'):'/projects/test-project/build/'+q.get('session') }, () => '/') }
export function useRouter() { return { refresh: () => {}, push: (url: string) => location.assign(url), replace: (url: string) => location.replace(url) } }

export function redirect(href:string):never{throw Object.assign(Error('Fixture Next redirect'),{fixtureRedirect:href})}
export function notFound():never{throw Object.assign(Error('Fixture Next not found'),{fixtureStatus:404})}
