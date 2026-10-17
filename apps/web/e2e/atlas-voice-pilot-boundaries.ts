// UI fixture only. No authenticated account or external provider is contacted.
const listeners = new Set<(event: string) => void>()
export function useOptionalAtlas() { return { deactivate() {} } }
export function createClient() { return { auth: { onAuthStateChange(callback: (event: string) => void) {
  listeners.add(callback)
  return { data: { subscription: { unsubscribe() { listeners.delete(callback) } } } }
} } } }
export function simulateSignout() { for (const callback of listeners) callback('SIGNED_OUT') }
