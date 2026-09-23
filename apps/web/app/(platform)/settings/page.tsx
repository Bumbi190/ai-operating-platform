import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadSettings } from '@/lib/os/settings'
import { loadBrokerSettings } from '@/lib/atlas/code-broker/operator'
import { youtubeConnectOutcome, type YouTubeConnectOutcome } from '@/lib/os/settings-shared'
import { SettingsSurface, SettingsSurfaceLoading } from '@/components/platform/vnext/SettingsSurface'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { DisplayPreferences } from './DisplayPreferences'
import { SettingsLegacy } from './SettingsLegacy'

/**
 * `/settings` — Inställningar.
 *
 * vNext renders the operator's settings surface: the account, the display
 * preferences, each publishing channel's credential status with write-only
 * replacement where this session holds the authority for it, and which platform
 * configuration is present. `?ui=legacy` renders the previous body, moved
 * verbatim into `SettingsLegacy`.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use. The display
 * preferences are the existing component, handed in from here so the surface
 * does not reach into this route's folder.
 *
 * AN OPERATOR SURFACE, NOT AN AUTHORITY SOURCE. The loader reports whether this
 * session would pass the checks `POST /api/media/token` makes; the route still
 * makes them on every submission.
 */
export const dynamic = 'force-dynamic'

export default async function SettingsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <SettingsLegacy />

  // The YouTube connection callback's answer, as one of its closed codes — anything else is ignored.
  const youtubeOutcome = youtubeConnectOutcome(searchParams?.youtube)

  return (
    <Suspense fallback={<SettingsSurfaceLoading />}>
      <LoadedSettings youtubeOutcome={youtubeOutcome} />
    </Suspense>
  )
}

async function LoadedSettings({ youtubeOutcome }: { youtubeOutcome: YouTubeConnectOutcome | null }) {
  const [model, brokerModel] = await Promise.all([loadSettings(), loadBrokerSettings()])
  if (!model) redirect('/login')
  return <SettingsSurface model={model} brokerModel={brokerModel} displayPreferences={<DisplayPreferences />} youtubeOutcome={youtubeOutcome} />
}
