import { MacKeychainIdentity } from './keychain.js'
import type { BrokerSigner, PublicBrokerIdentity } from './types.js'

export class SecureMacBrokerSigner implements BrokerSigner {
  constructor(private readonly keychain = new MacKeychainIdentity()) {}
  generateIdentity(identityId: string, options: { allowKeychainFallback?: boolean } = {}): Promise<PublicBrokerIdentity> {
    return this.keychain.generate(identityId, options.allowKeychainFallback === true)
  }
  getPublicIdentity(identityId: string) { return this.keychain.publicIdentity(identityId) }
  signCanonicalPayload(identityId: string, payload: string) { return this.keychain.sign(identityId, payload) }
  verifyLocalIdentityAvailable(identityId: string) { return this.keychain.available(identityId) }
}
