import { notFound, redirect } from 'next/navigation'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { atlasVoiceConversationEnabled } from '@/lib/atlas/voice-pilot/deployment'
import { AtlasVoiceTrial } from '../rosttest/voice-trial'
export const dynamic = 'force-dynamic'
export default async function AtlasVoiceConversation() {
  if (!atlasVoiceConversationEnabled()) notFound()
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    if (operator.reason === 'unauthenticated') redirect('/login')
    notFound()
  }
  return <AtlasVoiceTrial live streamingAvailable />
}
