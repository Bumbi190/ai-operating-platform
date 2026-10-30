import { isPlatformOperatorEmail } from '@/lib/auth/platform-operator'
import { atlasVoiceConversationEnabled } from './deployment'

/** Navigation availability only. Supply email from the server-verified session.
 * The destination and provider routes still authorize each request independently. */
export function atlasVoiceConversationEntryEnabled(
  verifiedEmail: string | null | undefined,
  readOnly = false,
): boolean {
  return !readOnly && atlasVoiceConversationEnabled() && isPlatformOperatorEmail(verifiedEmail)
}
