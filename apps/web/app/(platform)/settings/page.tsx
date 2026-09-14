import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadSettings } from '@/lib/os/settings'
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

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <SettingsLegacy />

  return (
    <Suspense fallback={<SettingsSurfaceLoading />}>
      <LoadedSettings />
    </Suspense>
  )
}

async function LoadedSettings() {
  const model = await loadSettings()
  if (!model) redirect('/login')
  return <SettingsSurface model={model} displayPreferences={<DisplayPreferences />} />
}
