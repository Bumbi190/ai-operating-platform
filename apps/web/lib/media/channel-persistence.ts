import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type MediaScriptUpdate = Database['public']['Tables']['media_scripts']['Update']

export type ChannelSuccessUpdate = Pick<
  MediaScriptUpdate,
  | 'instagram_media_id'
  | 'instagram_url'
  | 'facebook_post_id'
  | 'facebook_url'
  | 'youtube_video_id'
  | 'youtube_url'
>

/**
 * Persists one successful channel and stamps the first publication time.
 *
 * The conditional update is evaluated atomically by Postgres. If it matches
 * no row, we verify that the script still exists and that another channel has
 * actually set published_at before persisting only this channel's id/url.
 */
export async function persistChannelSuccess(
  db: SupabaseClient<Database>,
  scriptId: string,
  channelUpdate: ChannelSuccessUpdate,
  publishedAt: string,
): Promise<{ publishedAtSet: boolean }> {
  const { data, error } = await db
    .from('media_scripts')
    .update({ ...channelUpdate, published_at: publishedAt })
    .eq('id', scriptId)
    .is('published_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`Kunde inte spara kanalresultat: ${error.message}`)
  }

  if (data) return { publishedAtSet: true }

  const { data: existingScript, error: lookupError } = await db
    .from('media_scripts')
    .select('published_at')
    .eq('id', scriptId)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Kunde inte verifiera kanalresultatets race: ${lookupError.message}`)
  }

  if (!existingScript) {
    throw new Error(`Media-script ${scriptId} saknas efter kanalpubliceringen`)
  }

  if (!existingScript.published_at) {
    throw new Error(
      `Media-script ${scriptId} finns men published_at är fortfarande null efter villkorad uppdatering`,
    )
  }

  const { data: fallbackData, error: fallbackError } = await db
    .from('media_scripts')
    .update(channelUpdate)
    .eq('id', scriptId)
    .eq('published_at', existingScript.published_at)
    .select('id')
    .maybeSingle()

  if (fallbackError) {
    throw new Error(`Kunde inte spara kanalresultat: ${fallbackError.message}`)
  }

  if (!fallbackData) {
    throw new Error(`Media-script ${scriptId} ändrades under kanalresultatets race-verifiering`)
  }

  return { publishedAtSet: false }
}
