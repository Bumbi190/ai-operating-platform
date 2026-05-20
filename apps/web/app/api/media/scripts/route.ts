/**
 * GET  /api/media/scripts?project_id=&status=
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')
  const status = searchParams.get('status')

  const db = createAdminClient()
  let query = db
    .from('media_scripts')
    .select('*, media_news_items(title, virality_score, content_angle)')
    .order('generated_at', { ascending: false })
    .limit(50)

  if (projectId) query = query.eq('project_id', projectId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
