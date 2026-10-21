export function usePathname() { return '/atlas' }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function useRouter() { return { push: (url: string) => location.assign(url), replace: (url: string) => location.replace(url) } }
