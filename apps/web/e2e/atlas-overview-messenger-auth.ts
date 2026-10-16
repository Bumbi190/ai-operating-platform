export function createClient() {
  return {
    auth: {
      onAuthStateChange(callback: (event: string) => void) {
        const fn = () => callback('SIGNED_OUT')
        window.addEventListener('fixture:signout', fn)
        return {
          data: {
            subscription: {
              unsubscribe: () =>
                window.removeEventListener('fixture:signout', fn)
            }
          }
        }
      }
    }
  }
}
