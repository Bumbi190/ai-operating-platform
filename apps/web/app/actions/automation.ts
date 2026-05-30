'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { setAutomationPaused } from '@/lib/media/safeguards'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function toggleAutomationPause(paused: boolean, reason?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  await setAutomationPaused(db, paused, reason)

  revalidatePath('/dashboard')
}
