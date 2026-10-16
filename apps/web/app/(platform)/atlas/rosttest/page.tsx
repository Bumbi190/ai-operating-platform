import { notFound, redirect } from 'next/navigation'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { AtlasVoiceTrial } from './voice-trial'

export const dynamic = 'force-dynamic'
export default async function AtlasSwedishVoiceTrial() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') notFound()
  const operator = await resolvePlatformOperator()
  if (!operator.ok) {
    if (operator.reason === 'unauthenticated') redirect('/login')
    notFound()
  }
  return <AtlasVoiceTrial />
}
