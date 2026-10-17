// UI fixture only. No authenticated account or external provider is contacted.
let signout: (() => void) | undefined
export function useOptionalAtlas() { return { deactivate() {} } }
export function createClient() { return { auth: { onAuthStateChange(callback: (event: string) => void) {
  signout = () => callback('SIGNED_OUT')
  return { data: { subscription: { unsubscribe() { signout = undefined } } } }
} } } }
export function simulateSignout() { signout?.() }
