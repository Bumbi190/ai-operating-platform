import type { BrokerSigner } from './types.js'
import { SecureMacBrokerSigner } from './signer.js'
import { WindowsCngBrokerSigner } from './windows-cng.js'

export function createPlatformBrokerSigner(platform: NodeJS.Platform = process.platform): BrokerSigner {
  if (platform === 'win32') return new WindowsCngBrokerSigner()
  if (platform === 'darwin') return new SecureMacBrokerSigner()
  throw new Error('unsupported broker platform')
}
