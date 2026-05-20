import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects').select('id').eq('slug', params.slug).single()
  if (!project) return NextResponse.json({ error: 'Inte hittad' }, { status: 404 })

  const { data, error } = await supabase
    .from('workflows').select('*').eq('project_id', project.id).order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects').select('id').eq('slug', params.slug).single()
  if (!project) return NextResponse.json({ error: 'Inte hittad' }, { status: 404 })

  const body = await req.json()
  const { name, description, steps = [], trigger = 'manual', cron_expr } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })

  const { data, error } = await supabase
    .from('workflows')
    .insert({ project_id: project.id, name: name.trim(), description, steps, trigger, cron_expr })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
