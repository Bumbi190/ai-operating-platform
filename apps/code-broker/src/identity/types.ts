export interface BrokerPublicJwk {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

export interface PublicBrokerIdentity {
  identityId: string
  publicJwk: BrokerPublicJwk
  keyThumbprint: string
  storage: 'secure_enclave' | 'keychain'
}

export interface BrokerSigner {
  generateIdentity(identityId: string, options?: { allowKeychainFallback?: boolean }): Promise<PublicBrokerIdentity>
  getPublicIdentity(identityId: string): Promise<PublicBrokerIdentity>
  signCanonicalPayload(identityId: string, payload: string): Promise<string>
  verifyLocalIdentityAvailable(identityId: string): Promise<boolean>
}
